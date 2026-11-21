import { Link } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Keyboard, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions, type TextInputInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AccountRequestError, signIn } from '../account/session.ts';
import { PrivacyPolicyLink } from '../profile/privacy-policy-link.tsx';
import { colors, shared } from '../theme.ts';
import { GlassBackground } from '../ui/glass.tsx';
import { MascotScene } from '../ui/mascot-scene.tsx';

type LoginField = 'rollNumber' | 'password';

export default function LoginScreen() {
  const safeArea = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const passwordInput = useRef<TextInputInstance>(null);
  const [editing, setEditing] = useState(false);
  const [focusedField, setFocusedField] = useState<LoginField>();
  const [rollNumber, setRollNumber] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const desktop = width >= 820 && height >= 560 && !editing;
  const compact = editing || height - safeArea.top - safeArea.bottom < 600;
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

  const content = (
    <View testID="sign-in-layout" style={[
      styles.content,
      desktop && styles.desktopContent,
      editing && styles.editing,
      { paddingTop: safeArea.top + (compact ? 8 : 24), paddingBottom: Math.max(safeArea.bottom, 16) },
    ]}>
      <View style={[styles.panel, desktop && styles.desktopPanel]}>
        <View style={[styles.brand, desktop && styles.desktopBrand, compact && styles.compactBrand]}>
          <Text style={[styles.wordmark, desktop && styles.desktopWordmark]}>Food Scanner</Text>
          <View testID="sign-in-mascot" pointerEvents="none" style={[
            styles.mascot, desktop && styles.desktopMascot, compact && styles.compactMascot,
          ]}>
            <MascotScene style={styles.scene} />
          </View>
        </View>
        <View style={[styles.form, desktop && styles.desktopForm, compact && styles.compactForm]}>
          <View style={styles.formHeading}>
            <Text style={shared.title} accessibilityRole="header">Sign in</Text>
            {!compact && <Text style={shared.muted}>Use the roll number and password for your account.</Text>}
          </View>
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
                <Text style={styles.revealText} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  {visible ? 'Hide' : 'Show'}
                </Text>
              </Pressable>
            </View>
          </View>
          {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
          <Pressable accessibilityRole="button" accessibilityState={{ disabled, busy: submitting }} disabled={disabled}
            onPress={() => void submit()} style={({ pressed }) => [
              shared.button, styles.submit, compact && styles.compactButton, pressed && styles.submitPressed,
              disabled && shared.buttonDisabled,
            ]}>
            <Text style={shared.buttonText}>{submitting ? 'Signing in…' : 'Sign in'}</Text>
          </Pressable>
        </View>
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
  );

  return (
    <GlassBackground>
      {Platform.OS === 'web' ? (
        <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">
          {content}
        </ScrollView>
      ) : content}
    </GlassBackground>
  );
}

const styles = StyleSheet.create({
  scrollContent: { flexGrow: 1 },
  content: { flex: 1, width: '100%', maxWidth: 460, alignSelf: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 18 },
  desktopContent: { maxWidth: 980, paddingHorizontal: 24 },
  editing: { justifyContent: 'flex-start' },
  panel: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 28, overflow: 'hidden' },
  desktopPanel: { flexDirection: 'row' },
  brand: {
    paddingHorizontal: 22, minHeight: 144, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    gap: 10, backgroundColor: '#E1EAD2',
  },
  desktopBrand: {
    flex: 1, flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'space-between',
    paddingTop: 48, paddingHorizontal: 38, paddingBottom: 24,
  },
  compactBrand: { minHeight: 58, paddingHorizontal: 16 },
  wordmark: { color: colors.primaryPressed, fontSize: 25, lineHeight: 30, fontWeight: '800', letterSpacing: -0.7, flexShrink: 1 },
  desktopWordmark: { fontSize: 44, lineHeight: 48, letterSpacing: -1.6 },
  mascot: { width: 148, height: 128, flexShrink: 1 },
  desktopMascot: { width: '100%', height: 240, alignSelf: 'center' },
  compactMascot: { width: 64, height: 52 },
  scene: { height: '100%' },
  form: { padding: 24, gap: 16 },
  desktopForm: { flex: 1, paddingHorizontal: 38, paddingVertical: 48, justifyContent: 'center', gap: 20 },
  compactForm: { padding: 14, gap: 8 },
  formHeading: { gap: 4 },
  formRow: { gap: 6 },
  label: { color: colors.text, fontSize: 14, fontWeight: '700' },
  field: { minHeight: 50, flexDirection: 'row', alignItems: 'stretch', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, borderRadius: 12 },
  focusedField: { borderColor: colors.primary, backgroundColor: colors.surface },
  input: { flex: 1, minWidth: 0, minHeight: 48, paddingHorizontal: 14, paddingVertical: 8, color: colors.text, fontSize: 16 },
  reveal: { minHeight: 44, minWidth: 58, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  revealPressed: { backgroundColor: colors.tint },
  revealText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  submit: { borderRadius: 12, marginTop: 2, minHeight: 54 },
  compactButton: { minHeight: 48, paddingVertical: 9 },
  submitPressed: { backgroundColor: colors.primaryPressed },
  error: { color: colors.problem, backgroundColor: '#FFF1F2', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, lineHeight: 20 },
  footer: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', columnGap: 14 },
  credit: { textAlign: 'center', fontSize: 12 },
  dismissArea: { flex: 1 },
});
