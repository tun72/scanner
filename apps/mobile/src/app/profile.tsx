import { CONDITION_IDS, CONDITION_LABELS, MAX_NOTES_LENGTH } from '@food-scanner/contracts';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNoticeAcceptance } from '../profile/notice-acceptance.tsx';
import { PROBLEM_MESSAGES, changeNotes, showProblem, startForm, toggleCondition, type ProfileFormState } from '../profile/profile-form.ts';
import { profileStore, saveProfile } from '../services.ts';
import { colors, shared } from '../theme.ts';

/** Steps 2 to 4 of saving a profile: pick conditions, add notes, save. Also used to edit a saved profile. */
export default function ProfileScreen() {
  const router = useRouter();
  const notice = useNoticeAcceptance();
  const [form, setForm] = useState<ProfileFormState | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    void profileStore.load().then((saved) => {
      if (active) setForm(startForm(saved, notice.acceptedAt));
    });
    return () => {
      active = false;
    };
  }, [notice.acceptedAt]);

  if (form === null) return <ActivityIndicator style={styles.loading} />;
  // A new profile starts at the notice; only a saved profile, which already carries its acceptance, may skip it.
  if (form.noticeAcceptedAt === null) return <Redirect href="/notice" />;

  const save = async () => {
    setSaving(true);
    const result = await saveProfile(form);
    setSaving(false);
    if (result.ok) router.replace('/');
    else setForm(showProblem(form, result.problem));
  };

  return (
    <ScrollView contentContainerStyle={shared.screen} keyboardShouldPersistTaps="handled">
      <Text style={shared.body}>Pick what applies to you. Food Scanner judges every food against these.</Text>

      <View style={styles.list}>
        {CONDITION_IDS.map((id) => {
          const checked = form.conditions.includes(id);
          return (
            <Pressable
              key={id}
              style={[styles.row, checked && styles.rowChecked]}
              onPress={() => setForm(toggleCondition(form, id))}
              accessibilityRole="checkbox"
              accessibilityState={{ checked }}
            >
              <Text style={styles.box}>{checked ? '☑' : '☐'}</Text>
              <Text style={styles.rowText}>{CONDITION_LABELS[id]}</Text>
            </Pressable>
          );
        })}
      </View>

      <Text style={shared.body}>Anything else that bothers your stomach? (optional)</Text>
      <TextInput
        style={styles.notes}
        value={form.notes}
        onChangeText={(notes) => setForm(changeNotes(form, notes))}
        placeholder="For example: spicy food hurts, milk upsets me"
        placeholderTextColor={colors.muted}
        maxLength={MAX_NOTES_LENGTH}
        multiline
        accessibilityLabel="Notes about what bothers your stomach"
      />
      <Text style={shared.muted}>
        {form.notes.length} / {MAX_NOTES_LENGTH}
      </Text>

      {form.problem !== null && (
        <Text style={styles.problem} accessibilityRole="alert">
          {PROBLEM_MESSAGES[form.problem]}
        </Text>
      )}

      <Pressable style={[shared.button, saving && shared.buttonDisabled]} onPress={save} disabled={saving} accessibilityRole="button">
        <Text style={shared.buttonText}>{saving ? 'Saving…' : 'Save profile'}</Text>
      </Pressable>

      <Text style={shared.muted}>
        Your profile is stored only on this phone. When you scan a food, your conditions and notes are sent with the scan so the food can be judged
        for you. They are not kept on our server.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1 },
  list: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 12 },
  rowChecked: { borderColor: colors.primary },
  box: { fontSize: 22, color: colors.primary },
  rowText: { flex: 1, fontSize: 16, color: colors.text },
  notes: { minHeight: 96, padding: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 12, fontSize: 16, color: colors.text, textAlignVertical: 'top' },
  problem: { fontSize: 15, color: colors.problem },
});
