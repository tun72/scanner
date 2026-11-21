import { Stack } from 'expo-router';
import { createElement } from 'react';
import SavedVerdictScreen from '../../src/app/history/[id].tsx';
import HistoryScreen from '../../src/app/history/index.tsx';
import HomeScreen from '../../src/app/index.tsx';
import NoticeScreen from '../../src/app/notice.tsx';
import ProfileScreen from '../../src/app/profile.tsx';
import ScanScreen from '../../src/app/scan.tsx';
import { NoticeAcceptanceProvider } from '../../src/profile/notice-acceptance.tsx';

function ScreenTestLayout() {
  return createElement(NoticeAcceptanceProvider, null, createElement(Stack));
}

/** The app's routes as Expo Router's test renderer takes them. */
export const routes = {
  _layout: ScreenTestLayout,
  index: HomeScreen,
  notice: NoticeScreen,
  profile: ProfileScreen,
  scan: ScanScreen,
  'history/index': HistoryScreen,
  'history/[id]': SavedVerdictScreen,
};
