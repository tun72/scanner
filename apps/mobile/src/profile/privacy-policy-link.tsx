import { Alert, Linking, Pressable, Text } from 'react-native';
import { shared } from '../theme.ts';

export function PrivacyPolicyLink() {
  const url = process.env.EXPO_PUBLIC_PRIVACY_POLICY_URL;
  if (!url?.startsWith('https://')) return null;

  const open = () => {
    void Linking.openURL(url).catch(() => Alert.alert('Could not open the privacy policy', 'Please try again.'));
  };

  return (
    <Pressable onPress={open} accessibilityRole="link" style={[shared.button, shared.buttonSecondary]}>
      <Text style={[shared.buttonText, shared.buttonSecondaryText]}>Privacy policy</Text>
    </Pressable>
  );
}
