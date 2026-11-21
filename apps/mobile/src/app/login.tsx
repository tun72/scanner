import { Link } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, StyleSheet, Text, TextInput, View, useWindowDimensions, type TextInputInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AccountRequestError, signIn } from '../account/session.ts';
import { PrivacyPolicyLink } from '../profile/privacy-policy-link.tsx';
import { colors, shared } from '../theme.ts';
import { GlassBackground, GlassCard } from '../ui/glass.tsx';
import { MascotScene } from '../ui/mascot-scene.tsx';

type LoginField = 'rollNumber' | 'password';

export default function LoginScreen() {
  const safeArea = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const passwordInput = useRef<TextInputInstance>(null);
  const [editing, setEditing] = useState(false);
  const [focusedField, setFocusedField] = useState<LoginField>();
  const [rollNumber, setRollNumber] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const compact = editing || height - safeArea.top - safeArea.bottom < 440;
  const disabled = submitting || !rollNumber.trim() || !password;

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setEditing(true));
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      // iOS can briefly hide the keyboard while switching between the sign-in fields.
      if (Platform.OS !== 'ios' || !TextInput.State.currentlyFocusedInput()) setEditing(false);
    });
    return () => { show.remove(); hide.remove(); };
  }, []);

  const clearFocus = (field: LoginField) => {
    setFocusedField(current => current === field ? undefined : current);
  };

  const dismissKeyboard = () => {
    const wasVisible = Keyboard.isVisible();
    Keyboard.dismiss();
    if (!wasVisible) setEditing(false);
  };

  const submit = async () => {
    if (disabled) return;
    dismissKeyboard();
    setError(undefined);
    setSubmitting(true);
    try {
      await signIn(rollNumber.trim().toUpperCase(), password);
      setPassword('');
    } catch (failure) {
      const status = failure instanceof AccountRequestError ? failure.status : 0;
      setError(status === 401 || status === 400 ? 'Check your roll number and password.'
        : status === 429 ? 'Wait a minute and try again.' : 'Couldn’t sign in. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <GlassBackground>
      <View testID="sign-in-layout"
        style={[styles.content, editing && styles.editing, { paddingTop: safeArea.top + 8, paddingBottom: compact ? 8 : Math.max(safeArea.bottom, 12) }]}>
        {!compact && <Text style={styles.wordmark}>Food Scanner</Text>}
        <View style={styles.formStack}>
          <View style={[styles.hero, compact && styles.compactHero]}>
            {compact && <Text style={[shared.title, styles.compactTitle]} accessibilityRole="header">Sign in</Text>}
            <View testID="sign-in-mascot" pointerEvents="none" style={compact ? styles.compactMascot : styles.mascot}>
              <MascotScene style={compact ? styles.compactScene : styles.mascot} />
            </View>
          </View>
          <GlassCard style={compact && styles.compactCard}>
            {!compact && <Text style={shared.title} accessibilityRole="header">Sign in</Text>}
            <View style={styles.formRow}>
              <Text style={styles.label}>Roll number</Text>
              <View style={[styles.field, focusedField === 'rollNumber' && styles.focusedField]}>
                <TextInput value={rollNumber} onChangeText={setRollNumber}
                  onFocus={() => setFocusedField('rollNumber')} onBlur={() => clearFocus('rollNumber')}
                  autoCapitalize="none" autoCorrect={false}
                  autoComplete="username" accessibilityLabel="Roll number" maxLength={50} style={styles.input}
                  returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => passwordInput.current?.focus()} />
              </View>
            </View>
            <View style={styles.formRow}>
              <Text style={styles.label}>Password</Text>
              <View style={[styles.field, focusedField === 'password' && styles.focusedField]}>
                <TextInput ref={passwordInput} value={password} onChangeText={setPassword}
                  onFocus={() => setFocusedField('password')} onBlur={() => clearFocus('password')}
                  autoCapitalize="none" autoCorrect={false} secureTextEntry={!visible} autoComplete="current-password"
                  accessibilityLabel="Password" maxLength={128} style={styles.input}
                  returnKeyType="go" submitBehavior="submit" onSubmitEditing={() => void submit()} />
                <Pressable accessibilityRole="button" accessibilityLabel={visible ? 'Hide password' : 'Show password'}
                  onPress={() => setVisible(current => !current)} style={({ pressed }) => [styles.reveal, pressed && styles.revealPressed]}>
                  <View accessible={false} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.eye}>
                    <View style={styles.eyeOutline} />
                    <View style={styles.pupil} />
                    {!visible && <View style={styles.eyeSlash} />}
                  </View>
                </Pressable>
              </View>
            </View>
            {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
            <Pressable accessibilityRole="button" disabled={disabled}
              onPress={() => void submit()} style={[shared.button, compact && styles.compactButton, disabled && shared.buttonDisabled]}>
              <Text style={shared.buttonText}>{submitting ? 'Signing in…' : 'Sign in'}</Text>
            </Pressable>
          </GlassCard>
        </View>
        {!compact && <View style={styles.footer}>
          <PrivacyPolicyLink inline />
          <Text style={[shared.muted, styles.credit]}>
            <Link href="https://rive.app/marketplace/28761-54484-sobo/">Sobo by Patgrivet</Link>
            {' · '}<Link href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</Link>
          </Text>
        </View>}
        {editing && <Pressable style={styles.dismissArea} onPress={dismissKeyboard} accessible={false}
          accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />}
      </View>
    </GlassBackground>
  );
}

const styles = StyleSheet.create({
  content: { flex: 1, width: '100%', maxWidth: 460, alignSelf: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 22 },
  editing: { justifyContent: 'flex-start' },
  wordmark: { color: colors.primary, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  formStack: { flexShrink: 1, minHeight: 0, gap: 12 },
  hero: { flexShrink: 1, minHeight: 0 },
  mascot: { flexShrink: 1, minHeight: 0 },
  compactHero: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, flexShrink: 0 },
  compactMascot: { width: 64 },
  compactScene: { height: 58 },
  compactTitle: { flexShrink: 1 },
  compactCard: { padding: 12, gap: 7 },
  compactButton: { minHeight: 48, paddingVertical: 9 },
  formRow: { gap: 4 },
  label: { color: colors.text, fontSize: 14, fontWeight: '600' },
  field: { minHeight: 48, flexDirection: 'row', alignItems: 'stretch', borderWidth: 1, borderColor: colors.border, backgroundColor: '#FFF9', borderRadius: 17 },
  focusedField: { borderColor: colors.primary },
  input: { flex: 1, minWidth: 0, minHeight: 46, paddingHorizontal: 13, paddingVertical: 8, color: colors.text, fontSize: 16 },
  reveal: { minHeight: 44, width: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  revealPressed: { backgroundColor: colors.tint },
  eye: { width: 24, height: 24, alignItems: 'center', justifyContent: 'center' },
  eyeOutline: { width: 15, height: 15, borderWidth: 1.5, borderColor: colors.muted, borderTopLeftRadius: 11, borderBottomRightRadius: 11, borderTopRightRadius: 2, borderBottomLeftRadius: 2, transform: [{ rotate: '45deg' }] },
  pupil: { position: 'absolute', width: 5, height: 5, borderRadius: 3, backgroundColor: colors.muted },
  eyeSlash: { position: 'absolute', width: 24, height: 1.5, borderRadius: 1, backgroundColor: colors.muted, transform: [{ rotate: '45deg' }] },
  error: { color: colors.problem },
  footer: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: 14 },
  credit: { textAlign: 'center', fontSize: 12 },
  dismissArea: { flex: 1 },
});
