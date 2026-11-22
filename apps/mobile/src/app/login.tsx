import { Link } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Image,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ImageStyle,
  type TextInputInstance,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AccountRequestError, signIn } from '../account/session.ts';
import { PrivacyPolicyLink } from '../profile/privacy-policy-link.tsx';
import { colors, shared } from '../theme.ts';
import { GlassBackground, GlassCard } from '../ui/glass.tsx';
import { MascotScene } from '../ui/mascot-scene.tsx';

export default function LoginScreen() {
  const safeArea = useSafeAreaInsets();
  const rollNumberInput = useRef<TextInputInstance>(null);
  const passwordInput = useRef<TextInputInstance>(null);
  const [rollNumber, setRollNumber] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const disabled = submitting || !rollNumber.trim() || !password;

  const submit = async () => {
    if (disabled) return;
    Keyboard.dismiss();
    setError(undefined);
    setSubmitting(true);
    try {
      await signIn(rollNumber.trim().toUpperCase(), password);
      setPassword('');
    } catch (failure) {
      const status = failure instanceof AccountRequestError ? failure.status : 0;
      setError(
        status === 401 || status === 400
          ? 'ခုံအမှတ်နှင့် စကားဝှက်ကို ပြန်စစ်ပါ။'
          : status === 429
            ? 'ခဏစောင့်ပြီး ပြန်ကြိုးစားပါ။'
            : 'အကောင့်ဝင်၍ မရပါ။ ပြန်ကြိုးစားပါ။'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <GlassBackground>
      {Platform.OS !== 'web' && (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={Keyboard.dismiss}
          accessible={false}
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        />
      )}
      <View
        testID="sign-in-layout"
        style={[
          styles.content,
          {
            paddingTop: safeArea.top + 8,
            paddingBottom: Math.max(safeArea.bottom, 12),
          },
        ]}
      >
        <View style={styles.formStack}>
          <View style={styles.hero}>
            <View testID="sign-in-mascot" pointerEvents="none" style={styles.mascot}>
              <MascotScene style={styles.mascot} />
            </View>
          </View>
          <GlassCard testID="sign-in-card" style={styles.card}>
            <View style={styles.formRow}>
              <Text style={styles.label}>Student ID</Text>
              <View style={styles.field}>
                <Image
                  source={require('../../assets/login/student.png')}
                  style={styles.inputIcon as ImageStyle}
                  resizeMode="contain"
                />
                <TextInput
                  ref={rollNumberInput}
                  value={rollNumber}
                  onChangeText={text => setRollNumber(text.toUpperCase())}
                  autoCapitalize="characters"
                  autoCorrect={false}
                  autoComplete="username"
                  accessibilityLabel="ခုံအမှတ်"
                  maxLength={50}
                  style={styles.input}
                  placeholder="UCSKT-22028"
                  placeholderTextColor="#A0ADA6"
                  returnKeyType="next"
                  submitBehavior="submit"
                  onSubmitEditing={() => passwordInput.current?.focus()}
                />
              </View>
            </View>

            <View style={styles.formRow}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.field}>
                <Image
                  source={require('../../assets/login/lock.png')}
                  style={styles.inputIcon as ImageStyle}
                  resizeMode="contain"
                />
                <TextInput
                  ref={passwordInput}
                  value={password}
                  onChangeText={setPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  secureTextEntry={!visible}
                  autoComplete="current-password"
                  accessibilityLabel="စကားဝှက်"
                  maxLength={128}
                  style={styles.input}
                  placeholder="စကားဝှက်ထည့်ပါ"
                  placeholderTextColor="#A0ADA6"
                  returnKeyType="go"
                  submitBehavior="submit"
                  onSubmitEditing={() => void submit()}
                />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={visible ? 'စကားဝှက် ဖျောက်ရန်' : 'စကားဝှက် ပြရန်'}
                  onPress={() => setVisible(current => !current)}
                  style={({ pressed }) => [styles.reveal, pressed && styles.revealPressed]}
                  hitSlop={8}
                >
                  <Image
                    source={
                      visible
                        ? require('../../assets/login/eye.png')
                        : require('../../assets/login/eye-off.png')
                    }
                    style={[styles.eyeIcon as ImageStyle, { tintColor: visible ? colors.primary : '#789083' }]}
                    resizeMode="contain"
                  />
                </Pressable>
              </View>
            </View>

            {error && (
              <Text accessibilityRole="alert" style={styles.error}>
                {error}
              </Text>
            )}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel="အကောင့်ဝင်ရန်"
              disabled={disabled}
              onPress={() => void submit()}
              style={({ pressed }) => [
                styles.submitButton,
                disabled && styles.submitButtonDisabled,
                pressed && !disabled && styles.submitButtonPressed,
              ]}
            >
              <Text style={styles.submitButtonText}>
                {submitting ? 'အကောင့်ဝင်နေသည်…' : 'အကောင့်ဝင်ရန် →'}
              </Text>
            </Pressable>
          </GlassCard>
        </View>

        <View style={styles.footer}>
          <PrivacyPolicyLink inline />
          <Text style={[shared.muted, styles.credit]}>
            <Link href="https://rive.app/marketplace/28761-54484-sobo/">Sobo by Patgrivet</Link>
            {' · '}
            <Link href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</Link>
          </Text>
        </View>
      </View>
    </GlassBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    width: '100%',
    maxWidth: 460,
    alignSelf: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 22,
  },
  formStack: { flexShrink: 1, minHeight: 0, gap: 12 },
  hero: { flexShrink: 1, minHeight: 0 },
  mascot: { flexShrink: 1, minHeight: 0 },
  card: { padding: 20, gap: 18, borderRadius: 20 },
  formRow: { gap: 8 },
  label: { color: '#294B3D', fontSize: 15, fontWeight: '700' },
  field: {
    height: 52,
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.2,
    borderColor: '#E2E8E4',
    backgroundColor: '#FBFCFA',
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  inputIcon: { width: 20, height: 20, tintColor: '#789083' },
  input: {
    flex: 1,
    minWidth: 0,
    height: '100%',
    paddingHorizontal: 10,
    color: colors.text,
    fontSize: 16,
    ...Platform.select({
      web: {
        outlineWidth: 0,
        outlineColor: 'transparent',
        outlineStyle: 'none' as any,
      },
    }),
  },
  reveal: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
  },
  revealPressed: { opacity: 0.7 },
  eyeIcon: { width: 22, height: 22 },
  submitButton: {
    height: 52,
    minHeight: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1D684D',
    marginTop: 6,
  },
  submitButtonDisabled: { backgroundColor: colors.disabled, opacity: 0.8 },
  submitButtonPressed: { backgroundColor: '#16533D', opacity: 0.9 },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
    textAlign: 'center',
  },
  error: { color: colors.problem, fontSize: 14, textAlign: 'center' },
  footer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 14,
  },
  credit: { textAlign: 'center', fontSize: 12 },
});
