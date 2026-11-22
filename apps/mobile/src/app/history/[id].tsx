import { useFocusEffect, useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { canRetryPhoto, retryCloudPhoto } from '../../account/history.ts';
import { useScanPhoto } from '../../account/use-scan-photo';
import { activeSession } from '../../account/session.ts';
import type { SavedScan } from '../../history/scan-history.ts';
import { VerdictCard } from '../../history/verdict-card.tsx';
import { scanHistory } from '../../services.ts';
import { colors, shared } from '../../theme.ts';
import { confirmDelete } from '../../ui/confirm-delete.ts';
import { GlassBackground } from '../../ui/glass.tsx';

export default function SavedVerdictScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SavedVerdict key={id} id={id} />;
}

function SavedVerdict({ id }: { id: string }) {
  const router = useRouter();
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [scan, setScan] = useState<SavedScan | null | 'loading' | 'error'>('loading');
  const [deleteFailed, setDeleteFailed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [uploadFailed, setUploadFailed] = useState(false);
  const savedPhoto = useScanPhoto(scan && typeof scan === 'object' && scan.photoState === 'ready' ? id : undefined);

  useFocusEffect(useCallback(() => {
    let active = true;
    let request = 0;
    setScan('loading');
    const refresh = () => {
      const current = ++request;
      void scanHistory.get(id).then(
        saved => { if (active && request === current) setScan(saved); },
        () => { if (active && request === current) setScan('error'); },
      );
    };
    refresh();
    const listener = AppState.addEventListener('change', state => { if (state === 'active') refresh(); });
    return () => { active = false; listener.remove(); };
  }, [id, attempt]));

  const back = () => router.dismissTo('/history');
  const deleteScan = async () => {
    setDeleting(true);
    setDeleteFailed(false);
    try {
      await scanHistory.deleteById(id);
      setScan(null);
      if (navigation.isFocused()) back();
    } catch {
      setDeleteFailed(true);
    } finally {
      setDeleting(false);
    }
  };

  const confirmDeleteScan = () => confirmDelete('ဤမှတ်တမ်းကို ဖျက်မလား။',
    activeSession() ? 'ရလဒ်နှင့် ဓာတ်ပုံကို သင့်အကောင့်မှ ဖျက်ပါမည်။' : 'ရလဒ်ကို ဤဖုန်းမှ ဖျက်ပါမည်။',
    'မှတ်တမ်း ဖျက်ရန်', () => void deleteScan());

  const upload = async () => {
    setUploading(true);
    setUploadFailed(false);
    try {
      const uploaded = await retryCloudPhoto(id);
      setScan({ ...uploaded, thumbnail: null });
      if (uploaded.photoState !== 'ready') setUploadFailed(true);
    } catch {
      setUploadFailed(true);
    } finally {
      setUploading(false);
    }
  };

  if (scan === 'loading') return <ActivityIndicator color={colors.primary} style={{ flex: 1 }} accessibilityLabel="ရလဒ် ဖွင့်နေသည်" />;

  return (
    <GlassBackground>
      <ScrollView contentContainerStyle={[styles.page, { paddingTop: insets.top, paddingBottom: insets.bottom + 14 }]}>
        {scan === 'error' ? (
          <View style={styles.actions}>
            <Text style={shared.body} accessibilityRole="alert">ရလဒ်ကို ဖွင့်၍ မရပါ။</Text>
            <Pressable style={shared.button} accessibilityRole="button" onPress={() => setAttempt(current => current + 1)}>
              <Text style={shared.buttonText}>ပြန်ကြိုးစားရန်</Text>
            </Pressable>
            <Pressable style={[shared.button, shared.buttonSecondary]} accessibilityRole="button" onPress={back}>
              <Text style={[shared.buttonText, shared.buttonSecondaryText]}>မှတ်တမ်းသို့</Text>
            </Pressable>
          </View>
        ) : scan ? (
          <>
            <VerdictCard verdict={scan.verdict} onBack={back} photo={scan.thumbnail ? { uri: `data:image/jpeg;base64,${scan.thumbnail}` }
              : savedPhoto} />
            <View style={styles.actions}>
              {scan.photoState === 'pending' && <>
                <Text style={shared.muted}>{uploadFailed ? 'ဓာတ်ပုံတင်၍ မရပါ။ ပြန်ကြိုးစားပါ။' : 'ဓာတ်ပုံတင်ရန် စောင့်နေသည်။'}</Text>
                {canRetryPhoto(id) && <Pressable style={[shared.button, shared.buttonSecondary]} accessibilityRole="button" disabled={uploading}
                  onPress={() => void upload()}>
                  <Text style={[shared.buttonText, shared.buttonSecondaryText]}>{uploading ? 'တင်နေသည်…' : 'ဓာတ်ပုံ ပြန်တင်ရန်'}</Text>
                </Pressable>}
              </>}
              <Pressable style={[shared.button, shared.buttonSecondary, styles.deleteButton, deleting && shared.buttonDisabled]}
                accessibilityRole="button" disabled={deleting} onPress={confirmDeleteScan}>
                <Text style={[shared.buttonText, styles.deleteText]}>{deleting ? 'ဖျက်နေသည်…' : 'မှတ်တမ်း ဖျက်ရန်'}</Text>
              </Pressable>
              {deleteFailed && <Text style={shared.body} accessibilityRole="alert">ဖျက်၍ မရပါ။ ပြန်ကြိုးစားပါ။</Text>}
            </View>
          </>
        ) : (
          <View style={styles.actions}>
            <Text style={shared.body}>ဤရလဒ်ကို မတွေ့ပါ။</Text>
            <Pressable style={shared.button} accessibilityRole="button" onPress={back}>
              <Text style={shared.buttonText}>မှတ်တမ်းသို့</Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </GlassBackground>
  );
}

const styles = StyleSheet.create({
  page: { paddingBottom: 24 },
  actions: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 18, gap: 10 },
  deleteButton: { borderColor: colors.problem },
  deleteText: { color: colors.problem },
});
