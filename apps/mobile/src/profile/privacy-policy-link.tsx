import { Alert, Linking, Pressable, StyleSheet, Text } from 'react-native';
import { shared } from '../theme.ts';

export function PrivacyPolicyLink({ inline = false }: { inline?: boolean }) {
  const url = process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL;
  if (!url?.startsWith('https://')) return null;

  const open = () => {
    void Linking.openURL(url).catch(() => Alert.alert('မူဝါဒကို ဖွင့်၍ မရပါ', 'ပြန်ကြိုးစားပါ။'));
  };

  return (
    <Pressable onPress={open} accessibilityRole="link" style={inline ? styles.inline : [shared.button, shared.buttonSecondary]}>
      <Text style={inline ? [shared.muted, styles.inlineLabel] : [shared.buttonText, shared.buttonSecondaryText]}>ကိုယ်ရေးအချက်အလက် မူဝါဒ</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  inline: { minHeight: 44, justifyContent: 'center' },
  inlineLabel: { fontSize: 12, textDecorationLine: 'underline' },
});
