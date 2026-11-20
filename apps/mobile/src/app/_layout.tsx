import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { NoticeAcceptanceProvider } from '../profile/notice-acceptance.tsx';

export default function RootLayout() {
  return (
    <NoticeAcceptanceProvider>
      <StatusBar style="dark" />
      <Stack>
        <Stack.Screen name="index" options={{ title: 'Food Scanner' }} />
        <Stack.Screen name="notice" options={{ title: 'Before you start', headerBackVisible: false }} />
        <Stack.Screen name="profile" options={{ title: 'My stomach profile' }} />
        <Stack.Screen name="scan" options={{ title: 'Scan a food' }} />
        <Stack.Screen name="history/index" options={{ title: 'History' }} />
        <Stack.Screen name="history/[id]" options={{ title: 'Saved verdict' }} />
      </Stack>
    </NoticeAcceptanceProvider>
  );
}
