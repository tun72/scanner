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
          <Text style={shared.title} accessibilityRole="header">အသုံးမပြုမီ</Text>
        </View>
        <GlassCard>
          <Text style={shared.heading} accessibilityRole="header">ကျန်းမာရေး လမ်းညွှန်</Text>
          <Text style={shared.body}>
            ဤအက်ပ်က သင့်အစာခြေစနစ်နှင့် မတည့်နိုင်သော အစားအစာများကို ခန့်မှန်းပေးသည်။ ပါဝင်ပစ္စည်းအားလုံးနှင့် သင့်ကျန်းမာရေးရာဇဝင်ကို မသိနိုင်ပါ။
          </Text>
          <Text style={shared.body}>
            ရောဂါရှာဖွေခြင်း၊ ကုသခြင်းအတွက် အသုံးမပြုပါနှင့်။ မသေချာလျှင် သို့မဟုတ် ပြင်းထန်စွာ ဓာတ်မတည့်ဖူးလျှင် ဆရာဝန်နှင့် တိုင်ပင်ပါ။
          </Text>
        </GlassCard>
        <GlassCard>
          <Text style={shared.heading} accessibilityRole="header">အချက်အလက် အသုံးပြုပုံ</Text>
          <Text style={shared.body}>
            အစားအစာကို သင့်ကျန်းမာရေးအချက်အလက်နှင့် တိုက်ဆိုင်စစ်ဆေးသည်။ Anthropic ကို သုံးသည့်အခါ သင်ရွေးထားသော အခြေအနေများနှင့် မှတ်စုကို အစားအစာအချက်အလက်နှင့်အတူ ပေးပို့သည်။
            Gemini ကို သုံးသည့်အခါ Google သို့ အစားအစာအချက်အလက်ကိုသာ ပေးပို့သည်။ ဓာတ်ပုံမပို့မီ သင့်ထံမှ အတည်ပြုချက် တောင်းမည်။
          </Text>
          <Text style={shared.body}>သင့်အမည်၊ ခုံအမှတ်နှင့် ရလဒ်များကို အကောင့်တွင် သိမ်းထားသည်။ အခြားဖုန်းမှ ကြည့်နိုင်ရန် ဓာတ်ပုံများကို Cloudinary တွင် သီးသန့် သိမ်းထားသည်။</Text>
          <Text style={shared.body}>မှတ်တမ်းမှ ရလဒ်နှင့် ဓာတ်ပုံများကို ဖျက်နိုင်သည်။</Text>
          <PrivacyPolicyLink />
        </GlassCard>
        <Pressable style={shared.button} onPress={accept} accessibilityRole="button">
          <Text style={shared.buttonText}>နားလည်ပါပြီ</Text>
        </Pressable>
      </ScrollView>
    </GlassBackground>
  );
}

const styles = StyleSheet.create({ intro: { gap: 8 } });
