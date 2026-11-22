import type { VerdictLevel } from '@food-scanner/contracts';

export interface VerdictLook {
  badge: string;
  colour: string;
  line: string;
}

/** How each level looks: green, amber, red or grey, always with words so colour is never the only signal. */
export const VERDICT_LOOKS: Readonly<Record<VerdictLevel, VerdictLook>> = {
  safe: { badge: 'သင့်လျော်နိုင်', colour: '#1F7A4D', line: 'ရရှိတဲ့ အချက်အလက်အရ ဗိုက်မအီစေနိုင်တဲ့ ပါဝင်ပစ္စည်း မတွေ့ပါ။' },
  caution: { badge: 'သတိပြုရန်', colour: '#9A5B00', line: 'မစားခင် ပါဝင်ပစ္စည်းအညွှန်းကို စစ်ပါ၊ ဒါမှမဟုတ် ချက်ထားပုံကို မေးပါ။' },
  avoid: { badge: 'ရှောင်ရန်', colour: '#B3261E', line: 'ပါဝင်ပစ္စည်းကို စစ်ပြီး အရင်က စားလို့ အဆင်ပြေဖူးတဲ့ ဟင်းကို ရွေးပါ။' },
  unsure: { badge: 'မသေချာပါ', colour: '#5B6470', line: 'အစားအစာပုံ ဒါမှမဟုတ် ပါဝင်ပစ္စည်းအညွှန်းကို အနီးကပ် ပြန်ရိုက်ပါ။' },
};
