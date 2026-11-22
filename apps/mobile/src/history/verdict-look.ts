import type { VerdictLevel } from '@food-scanner/contracts';

export interface VerdictLook {
  badge: string;
  colour: string;
  line: string;
}

/** How each level looks: green, amber, red or grey, always with words so colour is never the only signal. */
export const VERDICT_LOOKS: Readonly<Record<VerdictLevel, VerdictLook>> = {
  safe: { badge: 'သင့်လျော်နိုင်', colour: '#1F7A4D', line: 'သင့်အခြေအနေနှင့် သင့်လျော်ဖွယ် ရှိသည်။' },
  caution: { badge: 'သတိပြုရန်', colour: '#9A5B00', line: 'စားသုံးရာတွင် သတိပြုပါ။' },
  avoid: { badge: 'ရှောင်ရန်', colour: '#B3261E', line: 'ဤအစားအစာကို ရှောင်သင့်သည်။' },
  unsure: { badge: 'မသေချာပါ', colour: '#5B6470', line: "အစားအစာကို သေချာစွာ မခွဲခြားနိုင်ပါ။" },
};
