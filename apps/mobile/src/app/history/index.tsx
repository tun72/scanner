import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import type { ScanSummary } from '../../history/scan-history.ts';
import { VERDICT_LOOKS } from '../../history/verdict-look.ts';
import { scanHistory } from '../../services.ts';
import { colors, shared } from '../../theme.ts';

export default function HistoryScreen() {
  const router = useRouter();
  const [scans, setScans] = useState<ScanSummary[] | 'loading' | 'error'>('loading');
  const [deleteFailed, setDeleteFailed] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // Reload on return from the detail screen so a deleted scan disappears from the list.
  useFocusEffect(useCallback(() => {
    let active = true;
    setScans('loading');
    void scanHistory.listNewestFirst().then(
      (rows) => { if (active) setScans(rows); },
      () => { if (active) setScans('error'); },
    );
    return () => { active = false; };
  }, [attempt]));

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

  const confirmDeleteAll = () => {
    Alert.alert('Delete all scans?', 'This removes every saved scan from this phone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete all', style: 'destructive', onPress: deleteAll },
    ]);
  };

  if (scans === 'error') {
    return (
      <View style={shared.screen}>
        <Text style={shared.body} accessibilityRole="alert">Couldn't load your scan history.</Text>
        <Pressable style={shared.button} accessibilityRole="button" onPress={() => setAttempt((current) => current + 1)}>
          <Text style={shared.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }

  if (scans === 'loading') return <ActivityIndicator style={shared.screen} accessibilityLabel="Loading scan history" />;

  return (
    <FlatList
      contentContainerStyle={shared.screen}
      data={scans}
      keyExtractor={(scan) => scan.id}
      ListEmptyComponent={<Text style={shared.body}>No saved scans yet.</Text>}
      ListHeaderComponent={scans.length > 0 ? (
        <View style={styles.actions}>
          <Pressable
            style={[shared.button, shared.buttonSecondary, styles.deleteButton, deleting && shared.buttonDisabled]}
            accessibilityRole="button"
            disabled={deleting}
            onPress={confirmDeleteAll}
          >
            <Text style={[shared.buttonText, styles.deleteText]}>{deleting ? 'Deleting…' : 'Delete all scans'}</Text>
          </Pressable>
          {deleteFailed && <Text style={shared.body} accessibilityRole="alert">Couldn't delete your scan history. Try again.</Text>}
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
            {item.thumbnail !== null && (
              <Image style={styles.thumbnail} source={{ uri: `data:image/jpeg;base64,${item.thumbnail}` }} />
            )}
            <View style={styles.summary}>
              <Text style={styles.foodName}>{item.foodName}</Text>
              <Text style={[styles.level, { color: look.colour }]}>{look.badge}</Text>
              <Text style={shared.muted}>{new Date(item.scannedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</Text>
            </View>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  actions: { gap: 8, marginBottom: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 12 },
  separator: { height: 8 },
  thumbnail: { width: 56, height: 56, borderRadius: 8, backgroundColor: colors.border },
  summary: { flex: 1, gap: 2 },
  foodName: { fontSize: 17, fontWeight: '700', color: colors.text },
  level: { fontSize: 15, fontWeight: '600' },
  deleteButton: { borderColor: colors.problem },
  deleteText: { color: colors.problem },
});
