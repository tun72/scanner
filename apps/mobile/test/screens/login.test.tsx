import type { AccountSession } from '@food-scanner/contracts';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import { StyleSheet } from 'react-native';
import RootLayout from '../../src/app/_layout.tsx';
import LoginScreen from '../../src/app/login.tsx';
import { savedProfile } from '../helpers.ts';
import { resetFake } from './fake-services.ts';
import { routes } from './routes.ts';

jest.mock('../../src/account/session.ts', () => {
  process.env.EXPO_PUBLIC_API_URL = 'https://scanner.test';
  return jest.requireActual('../../src/account/session.ts');
});
jest.mock('../../src/services.ts', () => jest.requireActual<typeof import('./fake-services.ts')>('./fake-services.ts').services);
jest.mock('expo-camera', () => jest.requireActual('./fake-camera.tsx'));

const appRoutes = { ...routes, _layout: RootLayout, login: LoginScreen };
const session: AccountSession = {
  user: { id: '0c35d0c5-52ac-47b2-99fc-1222b6508831', name: 'Fixture User', rollNumber: 'FIXTURE-01' },
  token: 'x'.repeat(43),
  expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
};

afterEach(() => { jest.restoreAllMocks(); });

describe('mobile account routes', () => {
  it('opens directly to the sign-in fields and keeps the card stable as focus moves', async () => {
    jest.spyOn(SecureStore, 'getItemAsync').mockResolvedValue(null);
    await renderRouter(appRoutes, { initialUrl: '/login' });
    const roll = await screen.findByLabelText('ခုံအမှတ်');
    const password = screen.getByLabelText('စကားဝှက်');
    const layout = () => StyleSheet.flatten(screen.getByTestId('sign-in-card').props.style);
    const initialLayout = layout();
    expect(screen.queryByText('အစားအသောက်စစ်ဆေးရေး')).toBeNull();
    expect(screen.getByRole('button', { name: 'အကောင့်ဝင်ရန်' }).props.accessibilityState.disabled).toBe(true);

    await fireEvent(roll, 'focus');
    await fireEvent.changeText(roll, 'FIXTURE-01');
    await fireEvent(password, 'focus');
    await fireEvent.changeText(password, 'fixture-only-password');
    await fireEvent(password, 'blur');

    expect(layout()).toEqual(initialLayout);
    expect(screen.getByLabelText('ခုံအမှတ်')).toBe(roll);
    expect(screen.getByLabelText('စကားဝှက်')).toBe(password);
    expect(roll.props.value).toBe('FIXTURE-01');
    expect(password.props.value).toBe('fixture-only-password');
  });

  it('requires sign-in for a history deep link, restores the session and signs out', async () => {
    resetFake(savedProfile());
    const stored = new Map<string, string>();
    jest.spyOn(SecureStore, 'getItemAsync').mockImplementation(async key => stored.get(key) ?? null);
    jest.spyOn(SecureStore, 'setItemAsync').mockImplementation(async (key, value) => { stored.set(key, value); });
    jest.spyOn(SecureStore, 'deleteItemAsync').mockImplementation(async key => { stored.delete(key); });
    const request = jest.spyOn(global, 'fetch').mockImplementation(async (_url, init) => {
      if (init?.method !== 'POST') return { status: 204, ok: true } as Response;
      const body = JSON.parse(String(init.body));
      return body.password === 'fixture-only-password'
        ? { status: 200, ok: true, json: async () => session } as Response
        : { status: 401, ok: false } as Response;
    });

    const first = await renderRouter(appRoutes, { initialUrl: '/history/hidden' });
    await screen.findByLabelText('ခုံအမှတ်');
    expect(screen.queryByText('ဤရလဒ်ကို မတွေ့ပါ။')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('ခုံအမှတ်'), ' fixture-01 ');
    await fireEvent.changeText(screen.getByLabelText('စကားဝှက်'), 'wrong');
    expect(screen.getByLabelText('စကားဝှက်').props.secureTextEntry).toBe(true);
    await fireEvent.press(screen.getByRole('button', { name: 'စကားဝှက် ပြရန်' }));
    expect(screen.getByLabelText('စကားဝှက်').props.secureTextEntry).toBe(false);
    await fireEvent(screen.getByLabelText('စကားဝှက်'), 'focus');
    await fireEvent.press(screen.getByRole('button', { name: 'စကားဝှက် ဖျောက်ရန်' }));
    expect(screen.getByLabelText('စကားဝှက်').props).toMatchObject({ secureTextEntry: true, value: 'wrong' });
    await fireEvent.press(screen.getByRole('button', { name: 'အကောင့်ဝင်ရန်' }));
    await screen.findByText('ခုံအမှတ်နှင့် စကားဝှက်ကို ပြန်စစ်ပါ။');
    expect(stored.size).toBe(0);

    await fireEvent.changeText(screen.getByLabelText('စကားဝှက်'), 'fixture-only-password');
    await fireEvent.press(screen.getByRole('button', { name: 'အကောင့်ဝင်ရန်' }));
    await screen.findByRole('button', { name: 'ဓာတ်ပုံဖြင့် စစ်ရန်' });
    expect(JSON.parse(stored.get('mobile-account-session') ?? '{}')).toEqual(session);
    expect(request).toHaveBeenCalledWith('https://scanner.test/v1/session', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ rollNumber: session.user.rollNumber, password: 'fixture-only-password' }),
    }));
    await first.unmount();

    await renderRouter(appRoutes);
    await screen.findByRole('button', { name: 'ဓာတ်ပုံဖြင့် စစ်ရန်' });
    await fireEvent.press(screen.getByRole('button', { name: 'အကောင့်ထွက်ရန်' }));
    await screen.findByLabelText('ခုံအမှတ်');
    expect(stored.has('mobile-account-session')).toBe(false);
    expect(request).toHaveBeenCalledWith('https://scanner.test/v1/session', expect.objectContaining({ method: 'DELETE' }));
  });
});
