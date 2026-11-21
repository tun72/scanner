import { afterEach, expect, it, jest } from '@jest/globals';
import { router } from 'expo-router';
import { act, fireEvent, renderRouter } from 'expo-router/testing-library';
import { AccessibilityInfo, TurboModuleRegistry } from 'react-native';
import { MascotScene } from '../../src/ui/mascot-scene.tsx';

jest.mock('../../src/ui/sobo-player.tsx', () => ({
  SoboPlayer: ({ onPlayingChange }: { onPlayingChange: (playing: boolean) => void }) => {
    const { Pressable } = jest.requireActual<typeof import('react-native')>('react-native');
    return <Pressable testID="sobo-player" onPress={() => onPlayingChange(true)} />;
  },
}));

afterEach(() => {
  jest.restoreAllMocks();
});

it('shows the authored Sobo player only when the screen is focused and motion is allowed', async () => {
  jest.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true);
  const listen = jest.spyOn(AccessibilityInfo, 'addEventListener');
  const getModule = TurboModuleRegistry.get;
  jest.spyOn(TurboModuleRegistry, 'get').mockImplementation((name) => (
    name === 'RNCWebViewModule' ? {} : getModule(name)
  ));

  const app = await renderRouter({ index: () => <MascotScene />, next: () => null });
  expect(app.queryByTestId('sobo-player')).toBeNull();

  const changePreference = listen.mock.calls.findLast(([event]) => String(event) === 'reduceMotionChanged')?.[1] as
    | ((enabled: boolean) => void)
    | undefined;
  if (!changePreference) throw new Error('Missing Reduce Motion listener');

  await act(async () => changePreference(false));
  expect(app.getByTestId('sobo-poster', { includeHiddenElements: true })).toBeDefined();
  await fireEvent.press(app.getByTestId('sobo-player'));
  expect(app.queryByTestId('sobo-poster', { includeHiddenElements: true })).toBeNull();
  await act(async () => changePreference(true));
  expect(app.queryByTestId('sobo-player')).toBeNull();
  expect(app.getByTestId('sobo-poster', { includeHiddenElements: true })).toBeDefined();

  await act(async () => changePreference(false));
  await act(async () => router.push('/next'));
  expect(app.queryByTestId('sobo-player', { includeHiddenElements: true })).toBeNull();
});
