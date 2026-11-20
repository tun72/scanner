import { CONDITION_LABELS } from '@food-scanner/contracts';
import { Redirect, useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { StomachProfile } from '../profile/stomach-profile.ts';
import { PrivacyPolicyLink } from '../profile/privacy-policy-link.tsx';
import { profileStore } from '../services.ts';
import { shared } from '../theme.ts';

type Loaded = { profile: StomachProfile | null };

/** Home: shows the saved profile, or sends a new user to the notice and profile setup. */
export default function HomeScreen() {
  const router = useRouter();
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  // Reload whenever the screen is shown again, so an edit made on the profile screen appears here.
  useFocusEffect(
    useCallback(() => {
      let active = true;
      void profileStore.load().then((profile) => {
        if (active) setLoaded({ profile });
      });
      return () => {
        active = false;
      };
    }, []),
  );

  if (loaded === null) return <ActivityIndicator style={styles.loading} />;
  if (loaded.profile === null) return <Redirect href="/notice" />;
  const { conditions, notes } = loaded.profile;

  return (
    <ScrollView contentContainerStyle={shared.screen}>
      <Text style={shared.title} accessibilityRole="header">
        Your stomach profile
      </Text>

      <View style={styles.card}>
        {conditions.map((id) => (
          <Text key={id} style={shared.body}>
            • {CONDITION_LABELS[id]}
          </Text>
        ))}
        {notes !== undefined && <Text style={shared.body}>Notes: {notes}</Text>}
      </View>

      <Pressable style={[shared.button, shared.buttonSecondary]} onPress={() => router.push('/profile')} accessibilityRole="button">
        <Text style={[shared.buttonText, shared.buttonSecondaryText]}>Edit profile</Text>
      </Pressable>

      <Pressable style={shared.button} onPress={() => router.push('/scan')} accessibilityRole="button">
        <Text style={shared.buttonText}>Scan a food</Text>
      </Pressable>

      <Pressable style={[shared.button, shared.buttonSecondary]} onPress={() => router.push('/history')} accessibilityRole="button">
        <Text style={[shared.buttonText, shared.buttonSecondaryText]}>History</Text>
      </Pressable>

      <Text style={shared.muted}>Food Scanner is a guide, not medical advice.</Text>
      <PrivacyPolicyLink />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1 },
  card: { gap: 6, padding: 16, borderRadius: 12, backgroundColor: '#F3F6F4' },
});
