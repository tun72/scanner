import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import type { SavedScan } from '../../history/scan-history.ts';
import { VerdictCard } from '../../history/verdict-card.tsx';
import { scanHistory } from '../../services.ts';
import { colors, shared } from '../../theme.ts';

export default function SavedVerdictScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <SavedVerdict key={id} id={id} />;
}

function SavedVerdict({ id }: { id: string }) {
  const router = useRouter();
  const navigation = useNavigation();
  const [scan, setScan] = useState<SavedScan | null | 'loading' | 'error'>('loading');
  const [deleteFailed, setDeleteFailed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setScan('loading');
    void scanHistory.get(id).then(
      (saved) => { if (active) setScan(saved); },
      () => { if (active) setScan('error'); },
    );
    return () => { active = false; };
  }, [id, attempt]);

  const backToHistory = () => router.dismissTo('/history');

  const deleteScan = async () => {
    setDeleting(true);
    setDeleteFailed(false);
    try {
      await scanHistory.deleteById(id);
    } catch {
      setDeleteFailed(true);
      setDeleting(false);
      return;
    }
    setScan(null);
    setDeleting(false);
    if (navigation.isFocused()) backToHistory();
  };

  const confirmDelete = () => {
    Alert.alert('Delete this scan?', 'This removes the saved verdict from this phone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete scan', style: 'destructive', onPress: deleteScan },
    ]);
  };

  if (scan === 'loading') {
    return <ActivityIndicator style={shared.screen} accessibilityLabel="Loading saved verdict" />;
  }

  return (
    <ScrollView contentContainerStyle={shared.screen}>
      {scan === 'error' ? (
        <>
          <Text style={shared.body} accessibilityRole="alert">Couldn't load this saved verdict.</Text>
          <Pressable style={shared.button} accessibilityRole="button" onPress={() => setAttempt((current) => current + 1)}>
            <Text style={shared.buttonText}>Try again</Text>
          </Pressable>
        </>
      ) : scan ? (
        <>
          <VerdictCard verdict={scan.verdict} />
          <Pressable
            style={[shared.button, shared.buttonSecondary, styles.deleteButton, deleting && shared.buttonDisabled]}
            accessibilityRole="button"
            disabled={deleting}
            onPress={confirmDelete}
          >
            <Text style={[shared.buttonText, styles.deleteText]}>{deleting ? 'Deleting…' : 'Delete scan'}</Text>
          </Pressable>
          {deleteFailed && <Text style={shared.body} accessibilityRole="alert">Couldn't delete this scan. Try again.</Text>}
        </>
      ) : (
        <>
          <Text style={shared.body}>This saved verdict is unavailable.</Text>
          <Pressable style={shared.button} accessibilityRole="button" onPress={backToHistory}>
            <Text style={shared.buttonText}>Back to history</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  deleteButton: { borderColor: colors.problem },
  deleteText: { color: colors.problem },
});
