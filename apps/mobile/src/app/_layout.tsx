import type { AccountSession } from '@food-scanner/contracts';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet } from 'react-native';
import { clearPendingPhotos } from '../account/history.ts';
import { accountRequest, activeSession, invalidateSession, restoreSession, subscribeSession } from '../account/session.ts';
import { NoticeAcceptanceProvider } from '../profile/notice-acceptance.tsx';
import { colors } from '../theme.ts';
import { GlassSurfaceProvider } from '../ui/glass.tsx';

export default function RootLayout() {
  const [session, setSession] = useState<AccountSession | null | undefined>(undefined);

  useEffect(() => {
    let live = true;
    let previous = activeSession();
    const unsubscribe = subscribeSession(value => {
      if (previous && previous.user.id !== value?.user.id) void clearPendingPhotos(previous.user.id).catch(() => undefined);
      previous = value;
      setSession(value);
    });
    void restoreSession().then(() => { if (live) setSession(activeSession()); });
    const listener = AppState.addEventListener('change', state => {
      const current = activeSession();
      if (state !== 'active' || !current) return;
      if (Date.parse(current.expiresAt) <= Date.now()) void invalidateSession(current).catch(() => undefined);
      else void accountRequest('/v1/session').catch(() => undefined);
    });
    return () => { live = false; unsubscribe(); listener.remove(); };
  }, []);

  useEffect(() => {
    if (!session) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const check = () => {
      const remaining = Date.parse(session.expiresAt) - Date.now();
      if (remaining <= 0) void invalidateSession(session).catch(() => undefined);
      else timer = setTimeout(check, Math.min(remaining, 2 ** 31 - 1));
    };
    check();
    return () => clearTimeout(timer);
  }, [session]);

  if (session === undefined) return <ActivityIndicator accessibilityLabel="အက်ပ်ကို ဖွင့်နေသည်" color={colors.primary} style={styles.loading} />;

  return (
    <GlassSurfaceProvider>
      <NoticeAcceptanceProvider key={session?.user.id ?? 'signed-out'}>
        <StatusBar style="dark" />
        <Stack screenOptions={{
          contentStyle: { backgroundColor: colors.background },
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text, headerTitleStyle: { fontWeight: '700' },
          headerShadowVisible: false, headerBackButtonDisplayMode: 'minimal',
        }}>
          <Stack.Protected guard={!session}>
            <Stack.Screen name="login" options={{ headerShown: false }} />
          </Stack.Protected>
          <Stack.Protected guard={session !== null}>
            <Stack.Screen name="index" options={{ headerBackVisible: false, title: 'အစားအသောက်စစ်ဆေးရေး' }} />
            <Stack.Screen name="notice" options={{ title: 'မစမီ သိထားရန်', headerBackVisible: false }} />
            <Stack.Screen name="profile" options={{ title: 'ကျန်းမာရေးအချက်အလက်' }} />
            <Stack.Screen name="scan" options={{ headerShown: false }} />
            <Stack.Screen name="history/index" options={{ title: 'မှတ်တမ်း' }} />
            <Stack.Screen name="history/[id]" options={{ headerShown: false }} />
          </Stack.Protected>
        </Stack>
      </NoticeAcceptanceProvider>
    </GlassSurfaceProvider>
  );
}

const styles = StyleSheet.create({ loading: { flex: 1, backgroundColor: colors.background } });
