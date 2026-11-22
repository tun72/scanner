import { LinearGradient } from 'expo-linear-gradient';
import { useEffect, useRef, useState } from 'react';
import { Image, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions, type TextInputInstance } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AccountRequestError, signIn } from '../account/session.ts';
import { PrivacyPolicyLink } from '../profile/privacy-policy-link.tsx';
import { colors, shared } from '../theme.ts';

type LoginField = 'rollNumber' | 'password';
const isWeb = Platform.OS === 'web';
const icons = {
  student: require('../../assets/login/student.png'),
  lock: require('../../assets/login/lock.png'),
  eye: require('../../assets/login/eye.png'),
};

export default function LoginScreen() {
  const safeArea = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const passwordInput = useRef<TextInputInstance>(null);
  const [focusedField, setFocusedField] = useState<LoginField>();
  const [rollNumber, setRollNumber] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>();
  const desktop = width >= 768;
  const disabled = submitting || !rollNumber.trim() || !password;

  const clearFocus = (field: LoginField) => {
    setFocusedField(current => current === field ? undefined : current);
  };

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
      setError(status === 401 || status === 400 ? 'ခုံအမှတ်နှင့် စကားဝှက်ကို ပြန်စစ်ပါ။'
        : status === 429 ? 'တစ်မိနစ်စောင့်ပြီး ပြန်ကြိုးစားပါ။' : 'အကောင့်ဝင်၍ မရသေးပါ။ ပြန်ကြိုးစားပါ။');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <LinearGradient colors={['#E5EFE7', '#F5F6EF', '#F1F2EB']} locations={[0, 0.44, 1]}
        style={StyleSheet.absoluteFill} pointerEvents="none" />
      <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
        <View testID="sign-in-layout" style={[
          styles.content, desktop && styles.desktopContent,
          { paddingTop: safeArea.top + (desktop ? 36 : 42), paddingBottom: safeArea.bottom + 24 },
        ]}>
          <View testID="sign-in-card" style={[styles.panel, desktop && styles.desktopPanel]}>
            <View style={styles.formRow}>
              <Text style={styles.label}>ခုံအမှတ်</Text>
              <View style={[styles.field, focusedField === 'rollNumber' && styles.focusedField]}>
                <Image source={icons.student} style={styles.leadingIcon} aria-hidden />
                <TextInput placeholder="ဥပမာ UCSKT-00000" placeholderTextColor={styles.placeholder.color}
                  value={rollNumber} onChangeText={setRollNumber}
                  onFocus={() => setFocusedField('rollNumber')} onBlur={() => clearFocus('rollNumber')}
                  autoCapitalize="none" autoCorrect={false}
                  autoComplete="username" accessibilityLabel="ခုံအမှတ်" maxLength={50} style={[styles.input, isWeb && styles.webInput]}
                  returnKeyType="next" submitBehavior="submit" onSubmitEditing={() => passwordInput.current?.focus()} />
              </View>
            </View>
            <View style={styles.formRow}>
              <Text style={styles.label}>စကားဝှက်</Text>
              <View style={[styles.field, focusedField === 'password' && styles.focusedField]}>
                <Image source={icons.lock} style={styles.leadingIcon} aria-hidden />
                <TextInput placeholder="စကားဝှက် ထည့်ပါ" placeholderTextColor={styles.placeholder.color}
                  ref={passwordInput} value={password} onChangeText={setPassword}
                  onFocus={() => setFocusedField('password')} onBlur={() => clearFocus('password')}
                  autoCapitalize="none" autoCorrect={false} secureTextEntry={!visible} autoComplete="current-password"
                  accessibilityLabel="စကားဝှက်" maxLength={128} style={[styles.input, isWeb && styles.webInput]}
                  returnKeyType="go" submitBehavior="submit" onSubmitEditing={() => void submit()} />
                <Pressable accessibilityRole="button" accessibilityLabel={visible ? 'စကားဝှက် ဖျောက်ရန်' : 'စကားဝှက် ပြရန်'}
                  onPress={() => setVisible(current => !current)} style={({ pressed }) => [styles.reveal, pressed && styles.revealPressed]}>
                  <Image source={icons.eye} style={styles.eyeIcon} aria-hidden />
                  {visible && <View style={styles.eyeSlash} pointerEvents="none" />}
                </Pressable>
              </View>
            </View>
            {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
            <Pressable accessibilityRole="button" accessibilityLabel={submitting ? 'ဝင်နေသည်…' : 'အကောင့်ဝင်ရန်'}
              accessibilityState={{ disabled, busy: submitting }} disabled={disabled} onPress={() => void submit()}
              style={({ pressed }) => [shared.button, styles.submit, disabled && styles.submitDisabled, pressed && styles.submitPressed]}>
              <Text style={[shared.buttonText, styles.submitText]}>{submitting ? 'ဝင်နေသည်…' : 'အကောင့်ဝင်ရန်'}</Text>
              {!submitting && <Text style={styles.arrow} aria-hidden>→</Text>}
            </Pressable>
            <View style={styles.privacy}>
              <Image source={icons.lock} style={styles.privacyIcon} aria-hidden />
              <Text style={styles.privacyText}>သင့်စစ်ဆေးချက်များကို သင့်အကောင့်တွင် သိမ်းထားပါသည်။</Text>
            </View>
          </View>
          {isWeb && <InstallApp />}
          <PrivacyPolicyLink inline />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function InstallApp() {
  const [browser, setBrowser] = useState<'chrome' | 'other'>();
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const device = window.navigator as Navigator & { standalone?: boolean };
    const appleMobile = /iPhone|iPad|iPod/.test(device.userAgent)
      || (device.platform === 'MacIntel' && device.maxTouchPoints > 1);
    if (!appleMobile || device.standalone || window.matchMedia('(display-mode: standalone)').matches) return;
    setBrowser(/CriOS/.test(device.userAgent) ? 'chrome' : 'other');
  }, []);

  if (!browser) return null;

  return (
    <View style={styles.install}>
      <Pressable
        accessibilityRole="button"
        aria-expanded={expanded}
        onPress={() => setExpanded(value => !value)}
        style={({ pressed }) => [styles.installButton, pressed && styles.revealPressed]}
      >
        <Text style={styles.revealText}>ပင်မမျက်နှာပြင်သို့ ထည့်ရန်</Text>
      </Pressable>
      {expanded && (
        <View style={styles.installHelp}>
          <Text accessibilityRole="header" style={styles.label}>ထည့်သွင်းနည်း</Text>
          <Text style={shared.muted}>{browser === 'chrome' ? '၁။ Chrome လိပ်စာဘေးရှိ မျှဝေရန် (Share) ကို နှိပ်ပါ။' : '၁။ မျှဝေရန် (Share) ကို နှိပ်ပါ။'}</Text>
          <Text style={shared.muted}>၂။ ပင်မမျက်နှာပြင်သို့ ထည့်ရန် (Add to Home Screen) ကို ရွေးပါ။</Text>
          <Text style={shared.muted}>၃။ ထည့်ရန် (Add) ကို နှိပ်ပါ။</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F3F5EE' },
  scrollContent: { flexGrow: 1 },
  content: { flexGrow: 1, width: '100%', maxWidth: 504, alignSelf: 'center', paddingHorizontal: 20, gap: 12 },
  desktopContent: { justifyContent: 'center' },
  panel: {
    backgroundColor: colors.surface, borderColor: '#CBDDD0', borderWidth: 1, borderRadius: 28,
    padding: 20, gap: 20,
    shadowColor: '#243D2C', shadowOffset: { width: 0, height: 18 }, shadowOpacity: 0.10, shadowRadius: 28, elevation: 3,
  },
  desktopPanel: { paddingHorizontal: 32, paddingTop: 24, paddingBottom: 32, gap: 21 },
  formRow: { gap: 10 },
  label: { color: '#27493B', fontSize: 15, lineHeight: 26, fontWeight: '700' },
  field: {
    minHeight: 54, flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#D6E1D9', backgroundColor: '#F7F9F6', borderRadius: 13, paddingLeft: 14,
  },
  focusedField: {
    borderColor: '#2A6C54', backgroundColor: colors.surface,
    ...Platform.select({ web: { outlineColor: '#D5E9DE', outlineStyle: 'solid' as const, outlineWidth: 3, outlineOffset: 1 } }),
  },
  leadingIcon: { width: 20, height: 20, tintColor: '#637F71' },
  placeholder: { color: '#687C71' },
  input: { flex: 1, minWidth: 0, minHeight: 52, paddingHorizontal: 10, paddingVertical: 9, color: colors.text, fontSize: 16 },
  webInput: { outlineStyle: 'solid', outlineWidth: 0 },
  reveal: { width: 44, minHeight: 48, marginRight: 4, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  revealPressed: { backgroundColor: colors.tint },
  eyeIcon: { width: 21, height: 21, tintColor: '#4F6D5F' },
  eyeSlash: { position: 'absolute', width: 23, height: 2, borderRadius: 1, backgroundColor: '#4F6D5F', transform: [{ rotate: '-44deg' }] },
  revealText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  submit: { flexDirection: 'row', gap: 10, minHeight: 54, borderRadius: 13, backgroundColor: '#1C654E' },
  submitDisabled: { backgroundColor: '#39745F' },
  submitPressed: { backgroundColor: '#144D3A' },
  submitText: { fontSize: 18, lineHeight: 29 },
  arrow: { color: colors.primaryText, fontSize: 23, lineHeight: 28 },
  privacy: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center' },
  privacyIcon: { width: 15, height: 15, tintColor: '#657C70' },
  privacyText: { flexShrink: 1, textAlign: 'center', color: '#526A5E', fontSize: 13, lineHeight: 23 },
  install: { gap: 8 },
  installButton: { minHeight: 44, padding: 8, alignItems: 'center', justifyContent: 'center', borderColor: colors.border, borderWidth: 1, borderRadius: 12 },
  installHelp: { gap: 6, padding: 12, backgroundColor: colors.tintLight, borderRadius: 12 },
  error: { color: colors.problem, backgroundColor: '#FFF1F2', paddingHorizontal: 12, paddingVertical: 9, borderRadius: 10, lineHeight: 24 },
});
