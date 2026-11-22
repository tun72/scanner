import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { activeSession, signOut } from '../account/session.ts';
import type { ScanSummary } from '../history/scan-history.ts';
import { VERDICT_LOOKS } from '../history/verdict-look.ts';
import type { StomachProfile } from '../profile/stomach-profile.ts';
import { profileStore, scanHistory } from '../services.ts';
import { colors, shared } from '../theme.ts';
import { GlassBackground, GlassCard } from '../ui/glass.tsx';

export default function HomeScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const session = activeSession();
  const [profile, setProfile] = useState<StomachProfile | null | undefined>(undefined);
  const [recent, setRecent] = useState<ScanSummary[]>([]);
  const [problem, setProblem] = useState(false);

  useFocusEffect(useCallback(() => {
    let active = true;
    void profileStore.load().then(profile => {
      if (active) setProfile(profile);
    }).catch(() => { if (active) setProfile(null); });
    void scanHistory.listNewestFirst().then(rows => {
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
      <ScrollView contentContainerStyle={[shared.screen, { paddingTop: 16 + insets.top, paddingBottom: 32 + insets.bottom }]}>
        <View style={styles.actions}>
          <Pressable style={({ pressed }) => [styles.tile, styles.photoTile, pressed && styles.pressed]} accessibilityRole="button"
            onPress={() => session ? scan('photo') : router.push('/scan')}>
            <View aria-hidden style={styles.cameraIcon}><View style={styles.lens} /></View>
            <Text style={[styles.tileLabel, { color: '#FFFFFF' }]}>{session ? 'ဓာတ်ပုံဖြင့် စစ်ရန်' : 'အစားအစာ စစ်ရန်'}</Text>
          </Pressable>
          <Pressable style={({ pressed }) => [styles.tile, styles.codeTile, pressed && styles.pressed]} accessibilityRole="button" onPress={() => scan('barcode')}>
            <View aria-hidden style={styles.codeIcon}>
              {[3, 1, 4, 2, 1, 3, 2].map((width, index) => <View key={index} style={{ width, height: 20, backgroundColor: colors.primaryPressed }} />)}
            </View>
            <Text style={styles.tileLabel}>ဘားကုဒ်ဖတ်ရန်</Text>
          </Pressable>
        </View>
        <GlassCard>
          <View style={styles.sectionHead}>
            <Text style={[shared.heading, styles.food]}>နောက်ဆုံး စစ်ဆေးချက်များ</Text>
            <Pressable style={styles.link} accessibilityRole="button" onPress={() => router.push('/history')}>
              <Text style={shared.buttonSecondaryText}>မှတ်တမ်း</Text>
            </Pressable>
          </View>
          {recent.length === 0 && <Text style={shared.muted}>မှတ်တမ်း မရှိသေးပါ</Text>}
          {recent.map(item => (
            <Pressable key={item.id} style={styles.row} accessibilityRole="button"
              onPress={() => router.push({ pathname: '/history/[id]', params: { id: item.id } })}>
              <Text style={[shared.body, styles.food]}>{item.foodName}</Text>
              <Text style={[shared.muted, { color: VERDICT_LOOKS[item.level].colour }]}>{VERDICT_LOOKS[item.level].badge}</Text>
            </Pressable>
          ))}

        </GlassCard>
        <GlassCard>
          <Text style={shared.heading}>အစာခြေကျန်းမာရေး</Text>
          <Pressable style={[shared.button, shared.buttonSecondary]} onPress={() => router.push(profile ? '/profile' : '/notice')} accessibilityRole="button">
            <Text style={[shared.buttonText, shared.buttonSecondaryText]}>{profile ? 'အချက်အလက် ပြင်ရန်' : 'အချက်အလက် ဖြည့်ရန်'}</Text>
          </Pressable>
        </GlassCard>
        {session && <Pressable style={[shared.button, shared.buttonSecondary]} onPress={() => void exit()} accessibilityRole="button">
          <Text style={[shared.buttonText, shared.buttonSecondaryText]}>အကောင့်ထွက်ရန်</Text>
        </Pressable>}
        {problem && <Text accessibilityRole="alert" style={shared.muted}>အကောင့်ထွက်၍ မရပါ။ ပြန်ကြိုးစားပါ။</Text>}
      </ScrollView>
    </GlassBackground>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tile: { flexGrow: 1, flexBasis: 130, minHeight: 132, borderRadius: 20, padding: 18, gap: 18, justifyContent: 'space-between' },
  photoTile: { backgroundColor: colors.primaryPressed },
  codeTile: { backgroundColor: '#D7EBDD' },
  tileLabel: { color: colors.primaryPressed, fontWeight: '700', fontSize: 17, lineHeight: 30 },
  pressed: { opacity: 0.85 },
  cameraIcon: { marginTop: 4, width: 32, height: 23, borderWidth: 2, borderColor: '#DAF3DE', borderRadius: 6, alignItems: 'center', justifyContent: 'center' },
  lens: { width: 12, height: 12, borderWidth: 2, borderColor: '#DAF3DE', borderRadius: 6 },
  codeIcon: { flexDirection: 'row', gap: 2, paddingVertical: 4 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  link: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 10 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 6, minHeight: 44 },
  food: { flex: 1, minWidth: 110 },
});
