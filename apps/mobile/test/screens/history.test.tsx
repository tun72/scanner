import { afterEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, renderRouter, screen, within } from 'expo-router/testing-library';
import { Alert } from 'react-native';
import { NOTICE, NOW, THUMBNAIL_BASE64, savedProfile, verdict } from '../helpers.ts';
import { fake, resetFake, sent } from './fake-services.ts';
import { routes } from './routes.ts';

jest.mock('../../src/services.ts', () => jest.requireActual<typeof import('./fake-services.ts')>('./fake-services.ts').services);
jest.mock('expo-camera', () => jest.requireActual('./fake-camera.tsx'));

async function openHistory() {
  resetFake(savedProfile());
  await fake.history.save({ id: 'newest', scannedAt: NOW.toISOString(), verdict: verdict(), thumbnail: THUMBNAIL_BASE64 });
  await fake.history.save({
    id: 'oldest',
    scannedAt: '2026-11-15T10:00:00.000Z',
    verdict: verdict({ foodName: 'Plain rice', source: 'product', level: 'safe', reasons: [], flaggedIngredients: [] }),
    thumbnail: null,
  });
  await renderRouter(routes);
  await fireEvent.press(await screen.findByRole('button', { name: 'မှတ်တမ်း' }));
  await screen.findByText('Spicy noodle soup');
}

function captureConfirmation() {
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  return async (title: string, action: string) => {
    const latest = alert.mock.lastCall;
    expect(latest?.[0]).toBe(title);
    const button = latest?.[2]?.find(({ text }) => text === action);
    expect(button).toBeDefined();
    await act(async () => button?.onPress?.());
  };
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe('scan history', () => {
  it('TC24 lists newest first and TC17 reopens a full verdict with the notice', async () => {
    await openHistory();
    const rows = screen.getAllByRole('button').filter((button) => within(button).queryByText(/Spicy noodle soup|Plain rice/));
    expect(rows).toHaveLength(2);
    expect(within(rows[0]!).getByText('Spicy noodle soup')).toBeTruthy();
    expect(within(rows[0]!).getByText('ရှောင်ရန်')).toBeTruthy();
    expect(within(rows[1]!).getByText('Plain rice')).toBeTruthy();

    await fireEvent.press(rows[0]!);
    expect(await screen.findByText('chilli')).toBeTruthy();
    await fireEvent.press(await screen.findByRole('button', { name: 'စစ်ဆေးချက် အသေးစိတ်' }));
    expect(await screen.findByText(NOTICE)).toBeTruthy();
    expect(screen.getByText('Chilli and a hot, acidic broth often bring on reflux.')).toBeTruthy();
    expect(screen.getByText('Ask for a mild broth without chilli.')).toBeTruthy();
    expect(sent()).toEqual([]);
  });

  it('TC25 keeps the scan on cancel, then deletes just that scan on confirmation', async () => {
    const choose = captureConfirmation();
    await openHistory();
    await fireEvent.press(screen.getByText('Spicy noodle soup'));
    const deleteButton = await screen.findByRole('button', { name: 'မှတ်တမ်း ဖျက်ရန်' });

    await fireEvent.press(deleteButton);
    await choose('ဤမှတ်တမ်းကို ဖျက်မလား။', 'မလုပ်တော့ပါ');
    expect(fake.history.saved).toHaveLength(2);
    expect(screen.getByTestId('verdict-badge')).toBeTruthy();

    await fireEvent.press(deleteButton);
    await choose('ဤမှတ်တမ်းကို ဖျက်မလား။', 'မှတ်တမ်း ဖျက်ရန်');
    expect(await screen.findByText('Plain rice')).toBeTruthy();
    expect(screen.queryByText('Spicy noodle soup')).toBeNull();
    expect(fake.history.saved.map(({ id }) => id)).toEqual(['oldest']);
  });

  it('TC26 keeps every scan on cancel and shows an empty list after clearing', async () => {
    const choose = captureConfirmation();
    await openHistory();
    const deleteButton = screen.getByRole('button', { name: 'မှတ်တမ်းအားလုံး ဖျက်ရန်' });

    await fireEvent.press(deleteButton);
    await choose('မှတ်တမ်းအားလုံး ဖျက်မလား။', 'မလုပ်တော့ပါ');
    expect(fake.history.saved).toHaveLength(2);

    await fireEvent.press(deleteButton);
    await choose('မှတ်တမ်းအားလုံး ဖျက်မလား။', 'အားလုံး ဖျက်ရန်');
    expect(await screen.findByText('မှတ်တမ်း မရှိသေးပါ')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'မှတ်တမ်းအားလုံး ဖျက်ရန်' })).toBeNull();
    expect(fake.history.saved).toEqual([]);
  });

  it('keeps history visible when deletion fails and lets the user retry', async () => {
    const choose = captureConfirmation();
    jest.spyOn(fake.history, 'deleteAll').mockRejectedValueOnce(new Error('disk busy'));
    await openHistory();

    await fireEvent.press(screen.getByRole('button', { name: 'မှတ်တမ်းအားလုံး ဖျက်ရန်' }));
    await choose('မှတ်တမ်းအားလုံး ဖျက်မလား။', 'အားလုံး ဖျက်ရန်');
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('Spicy noodle soup')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'မှတ်တမ်းအားလုံး ဖျက်ရန်' }));
    await choose('မှတ်တမ်းအားလုံး ဖျက်မလား။', 'အားလုံး ဖျက်ရန်');
    expect(await screen.findByText('မှတ်တမ်း မရှိသေးပါ')).toBeTruthy();
  });

  it('returns to history when a saved verdict is unavailable', async () => {
    resetFake(savedProfile());
    await renderRouter(routes, { initialUrl: '/history/missing' });

    expect(await screen.findByText('ဤရလဒ်ကို မတွေ့ပါ။')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'မှတ်တမ်းသို့' }));
    expect(await screen.findByText('မှတ်တမ်း မရှိသေးပါ')).toBeTruthy();
  });
});
