import { CONDITION_IDS, BURMESE_CONDITIONS, MAX_NOTES_LENGTH } from '@food-scanner/contracts';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNoticeAcceptance } from '../profile/notice-acceptance.tsx';
import { PROBLEM_MESSAGES, changeNotes, showProblem, startForm, toggleCondition, type ProfileFormState } from '../profile/profile-form.ts';
import { activeSession } from '../account/session.ts';
import { legacyProfileStore, profileStore, saveProfile } from '../services.ts';
import { colors, shared } from '../theme.ts';
import { GlassBackground, GlassCard } from '../ui/glass.tsx';

/** Steps 2 to 4 of saving a profile: pick conditions, add notes, save. Also used to edit a saved profile. */
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
        <GlassCard>
          <Text style={shared.title} accessibilityRole="header">သင့်ကျန်းမာရေး အခြေအနေ</Text>
          <Text style={shared.body}>သင်နှင့် သက်ဆိုင်သည့် အခြေအနေများကို ရွေးပါ။</Text>
        </GlassCard>
        {canReuse && <Pressable style={[shared.button, shared.buttonSecondary]} accessibilityRole="button" onPress={() => {
          void legacyProfileStore.load().then(previous => {
            if (previous) setForm({ ...startForm(previous, notice.acceptedAt), noticeAcceptedAt: form.noticeAcceptedAt });
            setCanReuse(false);
          }).catch(() => setSaveFailed(true));
        }}><Text style={[shared.buttonText, shared.buttonSecondaryText]}>ယခင်အချက်အလက်ကို သုံးရန်</Text></Pressable>}

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
                <View style={[styles.box, checked && styles.boxChecked]} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
                  {checked && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <Text style={styles.rowText}>{BURMESE_CONDITIONS[id]}</Text>
              </Pressable>
            );
          })}
        </View>

        <Text style={shared.heading}>ထပ်ဖြည့်လိုသည့် မှတ်စု <Text style={shared.muted}>(ဖြည့်လိုမှသာ)</Text></Text>
        <TextInput
          style={styles.notes}
          value={form.notes}
          onChangeText={(notes) => setForm(changeNotes(form, notes))}
          placeholder="ဥပမာ - နို့သောက်လျှင် ဗိုက်အောင့်တတ်သည်"
          placeholderTextColor={colors.muted}
          maxLength={MAX_NOTES_LENGTH}
          multiline
          accessibilityLabel="မတည့်သည့် အစားအစာ မှတ်စု"
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
  list: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 20, backgroundColor: colors.surface },
  rowChecked: { borderColor: colors.primary, backgroundColor: colors.tintLight },
  box: { width: 25, height: 25, borderWidth: 1, borderColor: colors.primary, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  boxChecked: { backgroundColor: colors.primary },
  checkmark: { color: colors.primaryText, fontSize: 14, fontWeight: '800', includeFontPadding: false },
  rowText: { flex: 1, fontSize: 16, color: colors.text },
  notes: { minHeight: 96, padding: 14, borderWidth: 1, borderColor: colors.border, borderRadius: 20, fontSize: 16, color: colors.text, backgroundColor: colors.surface, textAlignVertical: 'top' },
  problem: { fontSize: 15, color: colors.problem },
});
