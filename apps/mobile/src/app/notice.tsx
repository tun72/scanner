import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text } from 'react-native';
import { useNoticeAcceptance } from '../profile/notice-acceptance.tsx';
import { PrivacyPolicyLink } from '../profile/privacy-policy-link.tsx';
import { shared } from '../theme.ts';

/** Step 1 of saving a profile: the user reads and accepts that the app is a guide, not medical advice. */
export default function NoticeScreen() {
  const router = useRouter();
  const notice = useNoticeAcceptance();

  const accept = () => {
    notice.accept(new Date());
    router.replace('/profile');
  };

  return (
    <ScrollView contentContainerStyle={shared.screen}>
      <Text style={shared.title} accessibilityRole="header">
        A guide, not medical advice
      </Text>
      <Text style={shared.body}>
        Food Scanner gives general information about foods that commonly bother certain stomach conditions. It helps you decide; it does not decide
        for you.
      </Text>
      <Text style={shared.body}>
        It can be wrong. It cannot see every ingredient in a photo, and it does not know your full medical history.
      </Text>
      <Text style={shared.body}>
        Do not use it to diagnose or treat a condition. If you are unsure, or a food has caused you a serious reaction before, ask your doctor or
        dietitian.
      </Text>
      <Text style={shared.body}>
        When you scan, we send your selected conditions, optional notes, and your photo or product information to Anthropic to generate the verdict.
        Barcode numbers are sent to Open Food Facts to look up products. Your saved profile and scan history are stored on this device.
      </Text>
      <PrivacyPolicyLink />
      <Pressable style={shared.button} onPress={accept} accessibilityRole="button">
        <Text style={shared.buttonText}>I understand</Text>
      </Pressable>
    </ScrollView>
  );
}
