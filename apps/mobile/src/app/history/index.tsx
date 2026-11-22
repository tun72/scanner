import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, AppState, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { historyIsOffline } from '../../account/history.ts';
import { useScanPhoto } from '../../account/use-scan-photo';
import { activeSession } from '../../account/session.ts';
import type { ScanSummary } from '../../history/scan-history.ts';
import { VERDICT_LOOKS } from '../../history/verdict-look.ts';
import { hasLocalScans, importLocalScans, profileStore, scanHistory } from '../../services.ts';
import { colors, shared } from '../../theme.ts';
import { confirmDelete } from '../../ui/confirm-delete.ts';
import { GlassBackground } from '../../ui/glass.tsx';

export default function HistoryScreen() {
  const router = useRouter();
  const [scans, setScans] = useState<ScanSummary[] | 'loading' | 'error'>('loading');
  const [deleteFailed, setDeleteFailed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [canImport, setCanImport] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importFailed, setImportFailed] = useState(false);
  const [offline, setOffline] = useState(false);
  const session = activeSession();

  // Reload on return from the detail screen so a deleted scan disappears from the list.
  useFocusEffect(useCallback(() => {
    let active = true;
    let loadId = 0;
    const refresh = () => {
      const id = ++loadId;
      setRefreshing(true);
      void scanHistory.listNewestFirst().then(rows => {
        if (active && id === loadId) {
          setScans(rows);
          setOffline(historyIsOffline());
        }
      }, () => {
        if (active && id === loadId) setScans('error');
      }).finally(() => { if (active && id === loadId) setRefreshing(false); });
    };
    refresh();
    if (session) void hasLocalScans().then(value => { if (active) setCanImport(value); }).catch(() => undefined);
    const listener = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => { active = false; listener.remove(); };
  }, [attempt, session]));

  const confirmImport = () => {
    Alert.alert('ယခင်မှတ်တမ်းများ ထည့်မလား။', 'သင့်မှတ်တမ်းများကိုသာ ထည့်ပါ။ သိမ်းထားသည့် ပုံငယ်များလည်း ပါဝင်မည်။', [
      { text: 'မလုပ်တော့ပါ', style: 'cancel' },
      { text: 'ထည့်ရန်', onPress: () => void (async () => {
        setImporting(true);
        setImportFailed(false);
        try {
          if (!await profileStore.load()) {
            router.push('/notice');
            return;
          }
          await importLocalScans();
          setCanImport(false);
          setAttempt(value => value + 1);
        } catch {
          setImportFailed(true);
        } finally {
          setImporting(false);
        }
      })() },
    ]);
  };

  const deleteAll = async () => {
    setDeleting(true);
    setDeleteFailed(false);
    try {
      await scanHistory.deleteAll();
      setScans('loading');
      setAttempt((current) => current + 1);
    } catch {
      setDeleteFailed(true);
    } finally {
      setDeleting(false);
    }
  };

  const confirmDeleteAll = () => confirmDelete('မှတ်တမ်းအားလုံး ဖျက်မလား။',
    session ? 'ရလဒ်နှင့် ဓာတ်ပုံအားလုံးကို သင့်အကောင့်မှ ဖျက်ပါမည်။' : 'သိမ်းထားသော မှတ်တမ်းအားလုံးကို ဤဖုန်းမှ ဖျက်ပါမည်။',
    'အားလုံး ဖျက်ရန်', () => void deleteAll());

  if (scans === 'error') {
    return (
      <View style={shared.screen}>
        <Text style={shared.body} accessibilityRole="alert">မှတ်တမ်းများ ဖွင့်၍ မရပါ။</Text>
        <Pressable style={shared.button} accessibilityRole="button" onPress={() => setAttempt((current) => current + 1)}>
          <Text style={shared.buttonText}>ပြန်ကြိုးစားရန်</Text>
        </Pressable>
      </View>
    );
  }

  if (scans === 'loading') return <ActivityIndicator color={colors.primary} style={shared.screen} accessibilityLabel="မှတ်တမ်း ဖွင့်နေသည်" />;

  return (
    <GlassBackground>
      <FlatList
        contentContainerStyle={shared.screen}
        data={scans}
        keyExtractor={(scan) => scan.id}
        refreshing={refreshing}
        onRefresh={() => setAttempt(value => value + 1)}
        ListEmptyComponent={(
          <View style={[shared.card, styles.empty]}>
            <Text style={shared.heading} accessibilityRole="header">မှတ်တမ်း မရှိသေးပါ</Text>
            <Pressable style={shared.button} accessibilityRole="button" onPress={() => router.push({ pathname: '/scan', params: { mode: 'photo' } })}><Text style={shared.buttonText}>ဓာတ်ပုံဖြင့် စစ်ရန်</Text></Pressable>
          </View>
        )}
        ListHeaderComponent={scans.length > 0 || canImport || offline ? (
          <View style={styles.actions}>
            <Text style={shared.title} accessibilityRole="header">စစ်ဆေးခဲ့သည့် အစားအစာများ</Text>
            {offline && <Text style={shared.muted}>အင်တာနက် မရှိပါ။ နောက်ဆုံးမှတ်တမ်းများကို ပြထားသည်။</Text>}
            {canImport && <Pressable style={[shared.button, shared.buttonSecondary]} disabled={importing} accessibilityRole="button" onPress={confirmImport}>
              <Text style={[shared.buttonText, shared.buttonSecondaryText]}>{importing ? 'ထည့်နေသည်…' : 'ဤဖုန်းမှ မှတ်တမ်းများ ထည့်ရန်'}</Text>
            </Pressable>}
            {importFailed && <Text style={shared.body} accessibilityRole="alert">မှတ်တမ်း ထည့်၍ မရပါ။ ပြန်ကြိုးစားပါ။</Text>}

          </View>
        ) : undefined}
        ListFooterComponent={scans.length > 0 ? (
          <View style={[styles.actions, { marginTop: 18 }]}>
            <Pressable
              style={[shared.button, shared.buttonSecondary, styles.deleteButton, deleting && shared.buttonDisabled]}
              accessibilityRole="button"
              disabled={deleting}
              onPress={confirmDeleteAll}
            >
              <Text style={[shared.buttonText, styles.deleteText]}>{deleting ? 'ဖျက်နေသည်…' : 'မှတ်တမ်းအားလုံး ဖျက်ရန်'}</Text>
            </Pressable>
            {deleteFailed && <Text style={shared.body} accessibilityRole="alert">မှတ်တမ်းများ ဖျက်၍ မရပါ။ ပြန်ကြိုးစားပါ။</Text>}
          </View>
        ) : undefined}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({ item }) => {
          const look = VERDICT_LOOKS[item.level];
          return (
            <Pressable
              style={styles.row}
              accessibilityRole="button"
              disabled={deleting}
              onPress={() => router.push({ pathname: '/history/[id]', params: { id: item.id } })}
            >
              <ScanThumbnail scan={item} />
              <View style={styles.summary}>
                <Text style={styles.foodName}>{item.foodName}</Text>
                <Text style={[styles.level, { color: look.colour }]}>{look.badge}</Text>
                <Text style={shared.muted}>{new Date(item.scannedAt).toLocaleString('my-MM', { dateStyle: 'medium', timeStyle: 'short' })}</Text>
              </View>
              <Text style={styles.chevron} importantForAccessibility="no" accessibilityElementsHidden>›</Text>
            </Pressable>
          );
        }}
      />
    </GlassBackground>
  );
}

function ScanThumbnail({ scan }: { scan: ScanSummary }) {
  const savedPhoto = useScanPhoto(scan.thumbnail === null && scan.photoState === 'ready' ? scan.id : undefined);
  const source = scan.thumbnail === null ? savedPhoto : { uri: `data:image/jpeg;base64,${scan.thumbnail}` };
  return source ? <Image style={styles.thumbnail} source={source} /> : null;
}

const styles = StyleSheet.create({
  actions: { gap: 9, marginBottom: 8 },
  empty: { backgroundColor: colors.tint },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 22, backgroundColor: colors.surface },
  separator: { height: 9 },
  thumbnail: { width: 56, height: 56, borderRadius: 14, backgroundColor: colors.tint },
  summary: { flex: 1, gap: 2 },
  foodName: { fontSize: 17, fontWeight: '700', color: colors.text },
  level: { fontSize: 15, fontWeight: '600' },
  chevron: { fontSize: 24, color: colors.primary },
  deleteButton: { borderColor: colors.problem },
  deleteText: { color: colors.problem },
});
