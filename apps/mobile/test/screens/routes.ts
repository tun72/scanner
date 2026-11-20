import RootLayout from '../../src/app/_layout.tsx';
import SavedVerdictScreen from '../../src/app/history/[id].tsx';
import HistoryScreen from '../../src/app/history/index.tsx';
import HomeScreen from '../../src/app/index.tsx';
import NoticeScreen from '../../src/app/notice.tsx';
import ProfileScreen from '../../src/app/profile.tsx';
import ScanScreen from '../../src/app/scan.tsx';

/** The app's routes as Expo Router's test renderer takes them. */
export const routes = {
  _layout: RootLayout,
  index: HomeScreen,
  notice: NoticeScreen,
  profile: ProfileScreen,
  scan: ScanScreen,
  'history/index': HistoryScreen,
  'history/[id]': SavedVerdictScreen,
};
