import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { activeSession, signOut } from '../account/session.ts';
import type { ScanSummary } from '../history/scan-history.ts';
import { VERDICT_LOOKS } from '../history/verdict-look.ts';
import type { StomachProfile } from '../profile/stomach-profile.ts';
import { profileStore, scanHistory } from '../services.ts';
import { colors, shared } from '../theme.ts';
import { GlassBackground, GlassCard } from '../ui/glass.tsx';

export default function HomeScreen() {
  const router = useRouter();
  const session = activeSession();
  const [profile, setProfile] = useState<StomachProfile | null | undefined>(undefined);
  const [recent, setRecent] = useState<ScanSummary[]>([]);
  const [problem, setProblem] = useState(false);

  useFocusEffect(useCallback(() => {
    let active = true;
    void profileStore.load().then(profile => {
      if (active) setProfile(profile);
    }).catch(() => { if (active) setProfile(null); });
    if (session) void scanHistory.listNewestFirst().then(rows => {
      if (active) setRecent(rows.slice(0, 3));
    }).catch(() => undefined);
    return () => { active = false; };
  }, [session]));

  const exit = async () => {
    if (!session) return;
    try {
      await signOut();
    } catch {
      setProblem(true);
    }
  };

  if (profile === undefined) return <ActivityIndicator style={styles.loading} color={colors.primary} />;
  if (!session && profile === null) return <Redirect href="/notice" />;
  const scan = (mode: 'photo' | 'barcode') => router.push({ pathname: '/scan', params: { mode } });

  return (
    <GlassBackground>
      <ScrollView contentContainerStyle={shared.screen}>
        <Text style={shared.title} accessibilityRole="header">What are you eating?</Text>
        <View style={styles.actions}>
          <Pressable style={[shared.button, styles.action]} onPress={() => session ? scan('photo') : router.push('/scan')} accessibilityRole="button">
            <Text style={shared.buttonText}>{session ? 'Photo scan' : 'Scan a food'}</Text>
          </Pressable>
          {session && Platform.OS !== 'web' && <Pressable style={[shared.button, shared.buttonSecondary, styles.action]} onPress={() => scan('barcode')} accessibilityRole="button">
            <Text style={shared.buttonSecondaryText}>Barcode</Text>
          </Pressable>}
        </View>
        <GlassCard>
          <Text style={shared.heading}>Recent scans</Text>
          {recent.map(item => (
            <Pressable key={item.id} style={styles.row} accessibilityRole="button"
              onPress={() => router.push({ pathname: '/history/[id]', params: { id: item.id } })}>
              <Text style={[shared.body, styles.food]}>{item.foodName}</Text>
              <Text style={[shared.muted, { color: VERDICT_LOOKS[item.level].colour }]}>{VERDICT_LOOKS[item.level].badge}</Text>
            </Pressable>
          ))}
          <Pressable style={[shared.button, shared.buttonSecondary]} onPress={() => router.push('/history')} accessibilityRole="button">
            <Text style={[shared.buttonText, shared.buttonSecondaryText]}>History</Text>
          </Pressable>
        </GlassCard>
        <GlassCard>
          <Text style={shared.heading}>Your stomach profile</Text>
          <Pressable style={[shared.button, shared.buttonSecondary]} onPress={() => router.push(profile ? '/profile' : '/notice')} accessibilityRole="button">
            <Text style={[shared.buttonText, shared.buttonSecondaryText]}>{profile ? 'Edit profile' : 'Set up profile'}</Text>
          </Pressable>
        </GlassCard>
        {session && <Pressable style={[shared.button, shared.buttonSecondary]} onPress={() => void exit()} accessibilityRole="button">
          <Text style={[shared.buttonText, shared.buttonSecondaryText]}>Sign out</Text>
        </Pressable>}
        {problem && <Text accessibilityRole="alert" style={shared.muted}>Couldn’t finish signing out. Try again.</Text>}
      </ScrollView>
    </GlassBackground>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  action: { flexGrow: 1, flexBasis: 120 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, minHeight: 44 },
  food: { flex: 1, minWidth: 110 },
});
