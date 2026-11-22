import { useRouter } from 'expo-router';
import { Pressable, ScrollView, Text } from 'react-native';
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
        <GlassCard>
          <Text style={shared.heading} accessibilityRole="header">အစားအစာ စစ်ဆေးပုံ</Text>
          <Text style={shared.body}>
            ဗိုက်မအီမသာ ဖြစ်စေနိုင်တဲ့ ပါဝင်ပစ္စည်းတွေကို စစ်ပြီး စားမယ်ဆိုရင် ဘာကို သတိထားရမလဲ အကြံပေးပါတယ်။
          </Text>
          <Text style={shared.muted}>
            ရလဒ်က ယေဘုယျ လမ်းညွှန်ချက်ပါ။ ပုံထဲမှာ မမြင်ရတဲ့ ပါဝင်ပစ္စည်းတွေ ရှိနိုင်လို့ မသေချာရင် အညွှန်းကို စစ်ပါ။
          </Text>
        </GlassCard>
        <GlassCard>
          <Text style={shared.heading} accessibilityRole="header">အချက်အလက် အသုံးပြုပုံ</Text>
          <Text style={shared.body}>
            စစ်ဆေးဖို့ အစားအစာပုံ ဒါမှမဟုတ် ကုန်ပစ္စည်းအချက်အလက်ကို ပေးပို့ပါတယ်။ ရေးထားတဲ့ မှတ်စုလည်း ပါပါတယ်။
          </Text>
          <Text style={shared.body}>စစ်ဆေးချက်နဲ့ ပုံတွေကို မှတ်တမ်းကနေ ပြန်ကြည့်နိုင်ပါတယ်။ မှတ်တမ်းအားလုံး ရှင်းလိုက်ရင် သိမ်းထားပြီးသား ပုံတွေကို ဆက်သိမ်းထားပါမယ်။</Text>
          <PrivacyPolicyLink inline />
        </GlassCard>
        <Pressable style={shared.button} onPress={accept} accessibilityRole="button">
          <Text style={shared.buttonText}>နားလည်ပါပြီ</Text>
        </Pressable>
      </ScrollView>
    </GlassBackground>
  );
}
