import { CONDITION_IDS, CONDITION_LABELS, type ConditionId } from './conditions.ts';
import type { VerdictResponse } from './verdict-response.ts';

export const BURMESE_CONDITIONS: Record<ConditionId, string> = {
  gerd: 'အစာအိမ်အက်စစ် ပြန်တက်ခြင်း',
  gastritis: 'အစာအိမ်ရောင်ခြင်း',
  'peptic-ulcer': 'အစာအိမ် သို့မဟုတ် အူသိမ်ဦးပိုင်း အနာ',
  ibs: 'အူလမ်းကြောင်း လှုပ်ရှားမှု မမှန်ခြင်း (IBS)',
  'lactose-intolerance': 'နို့သကြား မချေဖျက်နိုင်ခြင်း',
  'celiac-gluten': 'စီလီယက်ရောဂါ သို့မဟုတ် ဂလူတင် မတည့်ခြင်း',
  gallbladder: 'သည်းခြေအိတ် ပြဿနာ',
  ibd: 'ကရုန်းရောဂါ သို့မဟုတ် အူမကြီးရောင် အနာဖြစ်ခြင်း',
};

const features: Record<string, string> = {
  'High-fat or fried food': 'အဆီများသော သို့မဟုတ် ကြော်ထားသော အစားအစာ',
  'Spicy ingredients': 'အစပ်ပါဝင်ပစ္စည်းများ',
  'Acidic ingredients': 'အချဉ်ဓာတ်များသော ပါဝင်ပစ္စည်းများ',
  Caffeine: 'ကဖိန်းဓာတ်', Alcohol: 'အရက်', Carbonation: 'ဓာတ်ငွေ့ပါဝင်မှု',
  'Potentially high-FODMAP ingredients': 'အူထဲတွင် အချဉ်ပေါက်လွယ်သော ကာဗိုဟိုက်ဒရိတ်များ',
  'Lactose-containing dairy': 'နို့သကြားပါသော နို့ထွက်ပစ္စည်းများ',
  'Gluten-containing ingredients': 'ဂလူတင်ပါသော ပစ္စည်းများ',
  'Coarse or raw high-fibre ingredients': 'အမျှင်ကြမ်းများ သို့မဟုတ် အမျှင်ဓာတ်များသော အစိမ်းစားပစ္စည်းများ',
  'Chocolate or mint': 'ချောကလက် သို့မဟုတ် ပူဒီနာ',
  'Very salty or pickled ingredients': 'ဆားများသော သို့မဟုတ် အချဉ်စိမ်ထားသော ပစ္စည်းများ',
};

// Translate known application copy, including verdicts saved before Burmese was introduced.
// Preserve free-form history, user notes and product label data as originally recorded.
const copy = new Map<string, string>([
  ...CONDITION_IDS.map(id => [CONDITION_LABELS[id], BURMESE_CONDITIONS[id]] as const),
  ...Object.entries(features).map(([source, label]) => [source, label] as const),
  ['Your notes', 'သင့်မှတ်စု'], ['Unknown food', 'အမျိုးအမည် မသိရသေးပါ'],
  ['Unverified ingredients', 'အတည်မပြုနိုင်သော ပါဝင်ပစ္စည်းများ'],
  ['Personal triggers', 'သင်နှင့် မတည့်သော အစားအစာများ'],
  ['The food appears to contain a source of gluten. Check the ingredient label or recipe.', 'ဂလူတင်ပါဝင်ပုံ ရသည်။ ပါဝင်ပစ္စည်းအညွှန်း သို့မဟုတ် ချက်နည်းကို စစ်ပါ။'],
  ['This scan cannot verify all ingredients or preparation. Check the label or recipe.', 'ပါဝင်ပစ္စည်းအားလုံးနှင့် ပြင်ဆင်ပုံကို အတည်မပြုနိုင်ပါ။ အညွှန်း သို့မဟုတ် ချက်နည်းကို စစ်ပါ။'],
  ['Compare the ingredients with your own notes. This scan does not evaluate free-text notes.', 'ဤစစ်ဆေးချက်တွင် သင့်မှတ်စုကို အကဲမဖြတ်ပါ။ ပါဝင်ပစ္စည်းများကို သင့်မှတ်စုနှင့် တိုက်ဆိုင်စစ်ဆေးပါ။'],
  ['A photo can miss ingredients. Check the recipe or label if you are unsure.', 'ပုံတွင် ပါဝင်ပစ္စည်းအချို့ကို မမြင်ရနိုင်ပါ။ မသေချာလျှင် အညွှန်း သို့မဟုတ် ချက်နည်းကို စစ်ပါ။'],
  ["We couldn't tell what this food is. Try a closer, sharper photo in good light.", 'အစားအစာကို မခွဲခြားနိုင်ပါ။ အလင်းကောင်းသည့်နေရာတွင် အနီးကပ် ပြန်ရိုက်ပါ။'],
  ["Food Scanner is a guide, not medical advice. If you're unsure, ask your doctor or dietitian.", 'ဤရလဒ်သည် ယေဘုယျလမ်းညွှန်သာ ဖြစ်သည်။ ဆေးဘက်ဆိုင်ရာ အကြံဉာဏ်အတွက် ဆရာဝန် သို့မဟုတ် အာဟာရပညာရှင်နှင့် တိုင်ပင်ပါ။'],
]);
for (const [source, label] of Object.entries(features)) {
  for (const [prefix, ending] of [['The food appears to include', 'ပါဝင်ပုံ ရသည်'], ['The food might include', 'ပါဝင်နိုင်သည်']] as const) {
    copy.set(`${prefix} ${source.toLowerCase()}. Check the ingredients and consider your usual tolerance.`,
      `${label} ${ending}။ ပါဝင်ပစ္စည်းများကို စစ်ပြီး သင်စားနေကျ ခံနိုင်သည့်ပမာဏကို ထည့်သွင်းစဉ်းစားပါ။`);
  }
}
export const burmeseText = (text: string) => copy.get(text) ?? text;

export function burmeseVerdict(verdict: VerdictResponse): VerdictResponse {
  return {
    ...verdict,
    foodName: burmeseText(verdict.foodName),
    flaggedIngredients: verdict.flaggedIngredients.map(burmeseText),
    reasons: verdict.reasons.map(reason => ({ ...reason, condition: burmeseText(reason.condition), explanation: burmeseText(reason.explanation) })),
    notice: burmeseText(verdict.notice),
    ...(verdict.tip && { tip: burmeseText(verdict.tip) }),
    ...(verdict.retakeHint && { retakeHint: burmeseText(verdict.retakeHint) }),
  };
}
