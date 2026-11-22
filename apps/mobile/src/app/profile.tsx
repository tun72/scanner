import { MAX_NOTES_LENGTH } from '@food-scanner/contracts';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { useNoticeAcceptance } from '../profile/notice-acceptance.tsx';
import { PROBLEM_MESSAGES, changeNotes, showProblem, startForm, type ProfileFormState } from '../profile/profile-form.ts';
import { activeSession } from '../account/session.ts';
import { legacyProfileStore, profileStore, saveProfile } from '../services.ts';
import { colors, shared } from '../theme.ts';
import { GlassBackground } from '../ui/glass.tsx';

const NOTE_LABEL = 'Optional Note';

export default function ProfileScreen() {
  const router = useRouter();
  const notice = useNoticeAcceptance();
  const [form, setForm] = useState<ProfileFormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [canReuse, setCanReuse] = useState(false);

  useEffect(() => {
    let active = true;
    void profileStore.load().then((saved) => {
      if (active) setForm(startForm(saved, notice.acceptedAt));
      if (!saved && activeSession()) void legacyProfileStore.load().then(previous => {
        if (active) setCanReuse(previous !== null);
      }).catch(() => undefined);
    }).catch(() => {
      if (active) setForm(startForm(null, notice.acceptedAt));
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
    setSaveFailed(false);
    try {
      const result = await saveProfile(form);
      if (result.ok) router.replace('/');
      else setForm(showProblem(form, result.problem));
    } catch {
      setSaveFailed(true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <GlassBackground>
      <ScrollView contentContainerStyle={shared.screen} keyboardShouldPersistTaps="handled">
        {canReuse && <Pressable style={[shared.button, shared.buttonSecondary]} accessibilityRole="button" onPress={() => {
          void legacyProfileStore.load().then(previous => {
            if (previous) setForm({ ...startForm(previous, notice.acceptedAt), noticeAcceptedAt: form.noticeAcceptedAt });
            setCanReuse(false);
          }).catch(() => setSaveFailed(true));
        }}><Text style={[shared.buttonText, shared.buttonSecondaryText]}>ယခင်အချက်အလက်ကို သုံးရန်</Text></Pressable>}

        <Text style={shared.heading}>{NOTE_LABEL}</Text>
        <TextInput
          style={styles.notes}
          value={form.notes}
          onChangeText={(notes) => setForm(changeNotes(form, notes))}
          placeholder="ဥပမာ - နို့သောက်ရင် ဗိုက်အောင့်တယ်"
          placeholderTextColor={colors.muted}
          maxLength={MAX_NOTES_LENGTH}
          multiline
          accessibilityLabel={NOTE_LABEL}
        />
        <Text style={shared.muted}>
          {form.notes.length.toLocaleString('my-MM')} / {MAX_NOTES_LENGTH.toLocaleString('my-MM')}
        </Text>

        {form.problem !== null && (
          <Text style={styles.problem} accessibilityRole="alert">
            {PROBLEM_MESSAGES[form.problem]}
          </Text>
        )}
        {saveFailed && <Text style={styles.problem} accessibilityRole="alert">အချက်အလက် သိမ်း၍ မရပါ။ ပြန်ကြိုးစားပါ။</Text>}

        <Pressable style={[shared.button, saving && shared.buttonDisabled]} onPress={save} disabled={saving} accessibilityRole="button">
          <Text style={shared.buttonText}>{saving ? 'သိမ်းနေသည်…' : 'အချက်အလက် သိမ်းရန်'}</Text>
        </Pressable>
      </ScrollView>
    </GlassBackground>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1 },
  notes: { minHeight: 96, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 20, fontSize: 16, color: colors.text, backgroundColor: colors.surface, textAlignVertical: 'top' },
  problem: { fontSize: 15, color: colors.problem },
});
