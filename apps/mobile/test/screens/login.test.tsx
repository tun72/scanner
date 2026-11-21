import type { AccountSession } from '@food-scanner/contracts';
import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, renderRouter, screen } from 'expo-router/testing-library';
import * as SecureStore from 'expo-secure-store';
import { Keyboard, StyleSheet, TextInput, type TextInputInstance } from 'react-native';
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
  it('keeps the same fields and mascot mounted when the keyboard opens and focus moves', async () => {
    jest.spyOn(SecureStore, 'getItemAsync').mockResolvedValue(null);
    const keyboard = jest.spyOn(Keyboard, 'addListener');
    const nativeFocus = jest.spyOn(TextInput.State, 'currentlyFocusedInput').mockReturnValue({} as TextInputInstance);
    await renderRouter(appRoutes, { initialUrl: '/login' });
    await screen.findByRole('header', { name: 'Sign in' });
    expect(screen.getByText('Sobo by Patgrivet')).toBeTruthy();
    const mascot = screen.getByTestId('sign-in-mascot');
    const roll = screen.getByLabelText('Roll number');
    const password = screen.getByLabelText('Password');
    const layout = () => StyleSheet.flatten(screen.getByTestId('sign-in-layout').props.style);
    const initialLayout = layout();
    expect(screen.container.queryAll(element => typeof element.props.onPress === 'function'
      && StyleSheet.flatten(element.props.style)?.position === 'absolute')).toHaveLength(0);

    await fireEvent(roll, 'focus');
    await fireEvent.changeText(roll, 'FIXTURE-01');
    expect(layout()).toEqual(initialLayout);

    const show = keyboard.mock.calls.findLast(([event]) => event === 'keyboardDidShow')?.[1];
    const hide = keyboard.mock.calls.findLast(([event]) => event === 'keyboardDidHide')?.[1];
    if (!show || !hide) throw new Error('Missing keyboard listeners');
    const visible = { duration: 0, easing: 'keyboard', endCoordinates: { screenX: 0, screenY: 500, width: 375, height: 300 } } as const;
    await act(() => show(visible));
    const compactLayout = layout();
    expect(compactLayout.justifyContent).toBe('flex-start');
    expect(screen.getByTestId('sign-in-mascot')).toBe(mascot);
    expect(screen.getByLabelText('Roll number')).toBe(roll);
    expect(screen.getByLabelText('Password')).toBe(password);

    const hidden = { duration: 0, easing: 'keyboard', endCoordinates: { screenX: 0, screenY: 800, width: 375, height: 0 } } as const;
    await act(() => hide(hidden));
    expect(layout()).toEqual(compactLayout);
    await fireEvent(password, 'focus');
    await fireEvent.changeText(password, 'fixture-only-password');
    await fireEvent(roll, 'focus');
    expect(layout()).toEqual(compactLayout);
    expect(screen.getByTestId('sign-in-mascot')).toBe(mascot);
    expect(screen.getByLabelText('Roll number').props.value).toBe('FIXTURE-01');
    expect(screen.getByLabelText('Password').props.value).toBe('fixture-only-password');

    nativeFocus.mockReturnValue(undefined);
    await act(() => hide(hidden));
    expect(screen.getByText('Sobo by Patgrivet')).toBeTruthy();
    expect(layout()).toEqual(initialLayout);
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
    await screen.findByRole('header', { name: 'Sign in' });
    expect(screen.container.queryAll(element => element.type.includes('ScrollView'))).toHaveLength(0);
    expect(screen.queryByText('This saved verdict is unavailable.')).toBeNull();
    await fireEvent.changeText(screen.getByLabelText('Roll number'), ' fixture-01 ');
    await fireEvent.changeText(screen.getByLabelText('Password'), 'wrong');
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(true);
    await fireEvent.press(screen.getByRole('button', { name: 'Show password' }));
    expect(screen.getByLabelText('Password').props.secureTextEntry).toBe(false);
    await fireEvent(screen.getByLabelText('Password'), 'focus');
    await fireEvent.press(screen.getByRole('button', { name: 'Hide password' }));
    expect(screen.getByLabelText('Password').props).toMatchObject({ secureTextEntry: true, value: 'wrong' });
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText('Check your roll number and password.');
    expect(stored.size).toBe(0);

    await fireEvent.changeText(screen.getByLabelText('Password'), 'fixture-only-password');
    await fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('button', { name: 'Photo scan' });
    expect(JSON.parse(stored.get('mobile-account-session') ?? '{}')).toEqual(session);
    expect(request).toHaveBeenCalledWith('https://scanner.test/v1/session', expect.objectContaining({
      method: 'POST', body: JSON.stringify({ rollNumber: session.user.rollNumber, password: 'fixture-only-password' }),
    }));
    await first.unmount();

    await renderRouter(appRoutes);
    await screen.findByRole('button', { name: 'Photo scan' });
    await fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    await screen.findByRole('header', { name: 'Sign in' });
    expect(stored.has('mobile-account-session')).toBe(false);
    expect(request).toHaveBeenCalledWith('https://scanner.test/v1/session', expect.objectContaining({ method: 'DELETE' }));
  });
});
