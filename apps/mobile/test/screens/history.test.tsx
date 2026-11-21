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
  await fireEvent.press(await screen.findByRole('button', { name: 'History' }));
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
    expect(within(rows[0]!).getByText('Avoid')).toBeTruthy();
    expect(within(rows[1]!).getByText('Plain rice')).toBeTruthy();

    await fireEvent.press(rows[0]!);
    expect(await screen.findByText('chilli')).toBeTruthy();
    await fireEvent.press(await screen.findByRole('button', { name: 'Scan info' }));
    expect(await screen.findByText(NOTICE)).toBeTruthy();
    expect(screen.getByText('Chilli and a hot, acidic broth often bring on reflux.')).toBeTruthy();
    expect(screen.getByText('Ask for a mild broth without chilli.')).toBeTruthy();
    expect(sent()).toEqual([]);
  });

  it('TC25 keeps the scan on cancel, then deletes just that scan on confirmation', async () => {
    const choose = captureConfirmation();
    await openHistory();
    await fireEvent.press(screen.getByText('Spicy noodle soup'));
    const deleteButton = await screen.findByRole('button', { name: 'Delete scan' });

    await fireEvent.press(deleteButton);
    await choose('Delete this scan?', 'Cancel');
    expect(fake.history.saved).toHaveLength(2);
    expect(screen.getByTestId('verdict-badge')).toBeTruthy();

    await fireEvent.press(deleteButton);
    await choose('Delete this scan?', 'Delete scan');
    expect(await screen.findByText('Plain rice')).toBeTruthy();
    expect(screen.queryByText('Spicy noodle soup')).toBeNull();
    expect(fake.history.saved.map(({ id }) => id)).toEqual(['oldest']);
  });

  it('TC26 keeps every scan on cancel and shows an empty list after clearing', async () => {
    const choose = captureConfirmation();
    await openHistory();
    const deleteButton = screen.getByRole('button', { name: 'Delete all scans' });

    await fireEvent.press(deleteButton);
    await choose('Delete all scans?', 'Cancel');
    expect(fake.history.saved).toHaveLength(2);

    await fireEvent.press(deleteButton);
    await choose('Delete all scans?', 'Delete all');
    expect(await screen.findByText('No saved scans yet.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Delete all scans' })).toBeNull();
    expect(fake.history.saved).toEqual([]);
  });

  it('keeps history visible when deletion fails and lets the user retry', async () => {
    const choose = captureConfirmation();
    jest.spyOn(fake.history, 'deleteAll').mockRejectedValueOnce(new Error('disk busy'));
    await openHistory();

    await fireEvent.press(screen.getByRole('button', { name: 'Delete all scans' }));
    await choose('Delete all scans?', 'Delete all');
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByText('Spicy noodle soup')).toBeTruthy();

    await fireEvent.press(screen.getByRole('button', { name: 'Delete all scans' }));
    await choose('Delete all scans?', 'Delete all');
    expect(await screen.findByText('No saved scans yet.')).toBeTruthy();
  });

  it('returns to history when a saved verdict is unavailable', async () => {
    resetFake(savedProfile());
    await renderRouter(routes, { initialUrl: '/history/missing' });

    expect(await screen.findByText('This saved verdict is unavailable.')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Back to history' }));
    expect(await screen.findByText('No saved scans yet.')).toBeTruthy();
  });
});
