import { burmeseVerdict, type VerdictResponse } from '@food-scanner/contracts';
import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, shared } from '../theme.ts';
import { GlassCard, GlassIcon } from '../ui/glass.tsx';
import { useMotionAllowed } from '../ui/use-motion.ts';
import { VERDICT_LOOKS } from './verdict-look.ts';

type Range = { min: number; max: number };
const number = (value: number) => value.toLocaleString('my-MM', { maximumFractionDigits: 1 });
const rangeText = ({ min, max }: Range, unit: string) => `${number(min)}${min === max ? '' : '–' + number(max)} ${unit}`;

export function VerdictCard({ verdict: savedVerdict, photo, onBack }: {
  verdict: VerdictResponse;
  photo?: ImageSourcePropType | undefined;
  onBack?: () => void;
}) {
  const [sheet, setSheet] = useState<'scan' | 'calories' | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const verdict = burmeseVerdict(savedVerdict);
  const motion = useMotionAllowed();
  const look = VERDICT_LOOKS[verdict.level];
  const advice = verdict.level === 'unsure' ? verdict.retakeHint : verdict.tip;
  const photoDetails = verdict.details?.kind === 'photo' ? verdict.details : undefined;
  const product = verdict.details?.kind === 'product' ? verdict.details.product : undefined;
  const estimated = photoDetails?.photo;
  const nutritionFacts = product?.nutrition;
  const reported = nutritionFacts && { ...nutritionFacts, quantity: nutritionFacts.quantity
    .replace('per 100 mL', '၁၀၀ မီလီလီတာလျှင်').replace('per 100 g', '၁၀၀ ဂရမ်လျှင်').replace('per serving · ', 'တစ်ပွဲလျှင် · ') };
  const energy = estimated?.calories ? rangeText(estimated.calories, 'ကီလိုကယ်လိုရီ')
    : reported?.calories === undefined ? undefined : `${number(reported.calories)} ကီလိုကယ်လိုရီ`;
  const serving = estimated?.portionGrams ? `${number(estimated.portionGrams)} ဂရမ်ခန့်` : reported?.quantity;
  const ingredients = estimated?.ingredients?.map(item => ({ name: item.name, label: item.evidence === 'seen' ? 'ပုံတွင် မြင်ရ' : 'ပါဝင်နိုင်' }))
    ?? product?.ingredients?.map(name => ({ name, label: 'အညွှန်းတွင် ပါ' })) ?? [];
  const nutrition = (['protein', 'fat', 'carbs'] as const).flatMap(key => {
    const estimate = estimated?.[key];
    const amount = reported?.[key];
    return estimate ? [{ key, value: rangeText(estimate, 'ဂရမ်') }]
      : amount === undefined ? [] : [{ key, value: `${number(amount)} ဂရမ်` }];
  });
  const flagged = verdict.flaggedIngredients;
  const allergen = product?.allergens?.some(name => flagged.some(flag => flag.toLowerCase() === name.toLowerCase()));
  const info = () => setSheet('scan');

  return (
    <View style={{ width: '100%', maxWidth: 720, alignSelf: 'center' }}>
      {photo && !imageFailed && (
        <View style={styles.hero}>
          <Image source={photo} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityLabel="စစ်ဆေးထားသော အစားအစာပုံ" onError={() => setImageFailed(true)} />
          {onBack && <View style={styles.back}><GlassIcon label="နောက်သို့" glyph="‹" onPress={onBack} /></View>}
        </View>
      )}
      {onBack && (!photo || imageFailed) && <View style={styles.compactHeader}>
        <GlassIcon label="နောက်သို့" glyph="‹" onPress={onBack} />
        <Text style={shared.muted}>စစ်ဆေးချက်</Text>
      </View>}
      <View style={styles.body}>
        <View style={styles.titleLine}>
          <Text style={[shared.title, styles.title]} accessibilityRole="header">{verdict.foodName}</Text>
          {energy ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`${estimated ? 'ခန့်မှန်း ' : ''}${energy} · အသေးစိတ်`}
              onPress={() => setSheet('calories')} style={styles.energy}>
              <Text style={styles.energyText}>{energy}</Text>
              {reported && <Text style={styles.energyText}>{reported.quantity}</Text>}
            </Pressable>
          ) : <Text style={shared.muted}>ကယ်လိုရီ မသိရသေးပါ</Text>}
        </View>

        {(serving || photoDetails) && (
          <View style={styles.stats}>
            {serving && <GlassCard style={styles.stat}><Text style={shared.muted}>ပမာဏ</Text><Text style={styles.amount}>{serving}</Text></GlassCard>}
            {photoDetails && <GlassCard style={styles.stat}><Text style={shared.muted}>အစားအစာ ခွဲခြားနိုင်မှု</Text><Text style={styles.amount}>{({ low: 'နိမ့်', medium: 'အသင့်အတင့်', high: 'မြင့်' })[photoDetails.confidence]}</Text></GlassCard>}
          </View>
        )}

        <GlassCard>
          <View style={styles.headingRow}>
            <Text testID="verdict-badge" style={[shared.heading, styles.title, { color: look.colour }]} accessibilityRole="header">{look.badge}</Text>
            <GlassIcon label="စစ်ဆေးချက် အသေးစိတ်" glyph="ⓘ" onPress={info} />
          </View>
          {flagged.length > 0 && <>
            <Text style={shared.heading}>{allergen ? 'ဓာတ်မတည့်မှု သတိပြုရန်' : 'စားသုံးရာတွင် သတိပြုရန်'}</Text>
            <View style={styles.tags}>
              {flagged.map(name => <Text key={name} style={styles.tag}>{name}</Text>)}
            </View>
          </>}
          {verdict.level === 'unsure' && advice && <Text style={shared.body}>{advice}</Text>}
        </GlassCard>

        {(product?.ingredientStatement || ingredients.length > 0) && (
          <GlassCard>
            <Text style={shared.heading}>ပါဝင်ပစ္စည်းများ</Text>
            {product?.ingredientStatement ? <Text style={shared.body}>{product.ingredientStatement}</Text> : ingredients.map((ingredient, index) => (
              <View key={`${ingredient.name}-${index}`} style={styles.row}>
                <Text style={shared.body}>{ingredient.name}</Text>
                <Text style={[styles.tag, ingredient.label !== 'ပါဝင်နိုင်' && styles.source]}>{ingredient.label}</Text>
              </View>
            ))}
          </GlassCard>
        )}

        {(nutrition.length > 0 || estimated?.calories) && (
          <GlassCard>
            <Text style={shared.heading}>{estimated ? 'အာဟာရ ခန့်မှန်းချက်' : 'အာဟာရ တန်ဖိုး'}</Text>
            {reported && <Text style={shared.muted}>{reported.quantity}</Text>}
            {estimated?.calories && <View accessibilityLabel={`ခန့်မှန်း ${energy}`}>
              <View style={styles.range} />
              <View style={styles.row}><Text style={shared.muted}>{number(estimated.calories.min)} ကီလိုကယ်လိုရီ</Text><Text style={shared.muted}>{number(estimated.calories.max)} ကီလိုကယ်လိုရီ</Text></View>
            </View>}
            {nutrition.map(row => <View key={row.key} style={styles.row}>
              <Text style={shared.body}>{({ protein: 'ပရိုတင်း', fat: 'အဆီ', carbs: 'ကာဗိုဟိုက်ဒရိတ်' })[row.key]}</Text><Text style={styles.amount}>{row.value}</Text>
            </View>)}
          </GlassCard>
        )}
      </View>

      <Modal visible={sheet !== null} animationType={motion ? 'fade' : 'none'} presentationStyle="pageSheet" onRequestClose={() => setSheet(null)}>
        <SafeAreaView style={styles.sheet}>
          <ScrollView contentContainerStyle={shared.screen}>
            <Text style={shared.title} accessibilityRole="header">{sheet === 'calories' ? 'ကယ်လိုရီ' : 'စစ်ဆေးချက် အသေးစိတ်'}</Text>
            {sheet === 'calories' ? <Text style={shared.body}>{estimated ? `ဓာတ်ပုံထဲရှိ ပမာဏအတွက် ${energy} ခန့် ရှိသည်။` : `${energy} ${reported?.quantity ?? ''} · Open Food Facts`}</Text> : (
              <>
                <Text style={shared.heading}>{look.badge}</Text>
                <Text style={shared.body}>{look.line}</Text>
                {verdict.reasons.map((reason, index) => <GlassCard key={`${reason.condition}-${index}`}>
                  <Text style={shared.heading}>{reason.condition} · {VERDICT_LOOKS[reason.severity].badge}</Text>
                  <Text style={shared.body}>{reason.explanation}</Text>
                </GlassCard>)}
                {advice && <Text style={shared.body}>{advice}</Text>}
                <Text style={shared.muted} testID="verdict-notice">{verdict.notice}</Text>
              </>
            )}
            <Pressable style={shared.button} accessibilityRole="button" onPress={() => setSheet(null)}><Text style={shared.buttonText}>ပြီးပါပြီ</Text></Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 18, paddingTop: 20, gap: 14 },
  hero: { minHeight: 210, height: 228, backgroundColor: colors.tint },
  back: { position: 'absolute', top: 12, left: 16 },
  compactHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 18, paddingTop: 8 },
  titleLine: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 },
  title: { flexShrink: 1, minWidth: 0 },
  energy: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 23, backgroundColor: colors.primary, maxWidth: '100%' },
  energyText: { color: colors.primaryText, fontWeight: '700', fontSize: 13 },
  stats: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  stat: { flexGrow: 1, flexBasis: 125, padding: 12, gap: 3 },
  amount: { fontSize: 16, fontWeight: '700', color: colors.text },
  headingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 5 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  tag: { backgroundColor: '#F4E8D3', borderRadius: 13, color: '#513D1E', paddingHorizontal: 8, paddingVertical: 4, fontSize: 13 },
  source: { backgroundColor: '#DEECDA', color: colors.primary },
  row: { flexDirection: 'row', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4, paddingVertical: 5, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  range: { height: 5, borderRadius: 8, backgroundColor: colors.primary },
  sheet: { flex: 1, backgroundColor: colors.background },
});
