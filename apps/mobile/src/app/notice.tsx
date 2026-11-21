import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNoticeAcceptance } from '../profile/notice-acceptance.tsx';
import { PrivacyPolicyLink } from '../profile/privacy-policy-link.tsx';
import { shared } from '../theme.ts';
import { GlassBackground, GlassCard } from '../ui/glass.tsx';

/** Step 1 of saving a profile: the user reads and accepts that the app is a guide, not medical advice. */
export default function NoticeScreen() {
  const router = useRouter();
  const notice = useNoticeAcceptance();

  const accept = () => {
    notice.accept(new Date());
    router.replace('/profile');
  };

  return (
    <GlassBackground>
      <ScrollView contentContainerStyle={shared.screen}>
        <View style={styles.intro}>
          <Text style={shared.title} accessibilityRole="header">Welcome to Food Scanner</Text>
          <Text style={shared.body}>Check meals and packaged foods against your stomach profile.</Text>
        </View>
        <GlassCard>
          <Text style={shared.heading} accessibilityRole="header">A guide, not medical advice</Text>
          <Text style={shared.body}>
            Food Scanner gives general information about foods that commonly bother certain stomach conditions. It can miss ingredients and does not know your full medical history.
          </Text>
          <Text style={shared.body}>
            Do not use it to diagnose or treat a condition. If you are unsure, or a food has caused you a serious reaction before, ask your doctor or dietitian.
          </Text>
        </GlassCard>
        <GlassCard>
          <Text style={shared.heading} accessibilityRole="header">How we use your scans</Text>
          <Text style={shared.body}>
            When you scan, we send your selected conditions, optional notes, and your photo or product information to Anthropic to generate the verdict.
            Barcode numbers are sent to Open Food Facts. Your profile settings are saved on this phone.
          </Text>
          <Text style={shared.body}>Your account stores your name, roll number and verdicts. Cloudinary stores successful scan photos privately so you can view them on another phone.</Text>
          <Text style={shared.body}>You can delete scans and their photos from History.</Text>
          <PrivacyPolicyLink />
        </GlassCard>
        <Pressable style={shared.button} onPress={accept} accessibilityRole="button">
          <Text style={shared.buttonText}>I understand</Text>
        </Pressable>
      </ScrollView>
    </GlassBackground>
  );
}

const styles = StyleSheet.create({ intro: { gap: 8 } });
