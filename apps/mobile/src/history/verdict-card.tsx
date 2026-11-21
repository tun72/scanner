import type { VerdictResponse } from '@food-scanner/contracts';
import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors, shared } from '../theme.ts';
import { GlassCard, GlassIcon } from '../ui/glass.tsx';
import { VERDICT_LOOKS } from './verdict-look.ts';

type Range = { min: number; max: number };
const number = (value: number) => Number.isInteger(value) ? String(value) : value.toFixed(1);
const rangeText = ({ min, max }: Range, unit: string) => `${number(min)}${min === max ? '' : '–' + number(max)} ${unit}`;

export function VerdictCard({ verdict, photo, onBack }: {
  verdict: VerdictResponse;
  photo?: ImageSourcePropType | undefined;
  onBack?: () => void;
}) {
  const [sheet, setSheet] = useState<'scan' | 'calories' | null>(null);
  const [imageFailed, setImageFailed] = useState(false);
  const look = VERDICT_LOOKS[verdict.level];
  const advice = verdict.level === 'unsure' ? verdict.retakeHint : verdict.tip;
  const photoDetails = verdict.details?.kind === 'photo' ? verdict.details : undefined;
  const product = verdict.details?.kind === 'product' ? verdict.details.product : undefined;
  const estimated = photoDetails?.photo;
  const reported = product?.nutrition;
  const energy = estimated?.calories ? rangeText(estimated.calories, 'kcal')
    : reported?.calories === undefined ? undefined : `${number(reported.calories)} kcal`;
  const serving = estimated?.portionGrams ? `About ${number(estimated.portionGrams)} g` : reported?.quantity;
  const ingredients = estimated?.ingredients?.map(item => ({ name: item.name, label: item.evidence === 'seen' ? 'Seen' : 'Possible' }))
    ?? product?.ingredients?.map(name => ({ name, label: 'Listed' })) ?? [];
  const nutrition = (['protein', 'fat', 'carbs'] as const).flatMap(key => {
    const estimate = estimated?.[key];
    const amount = reported?.[key];
    return estimate ? [{ key, value: rangeText(estimate, 'g') }]
      : amount === undefined ? [] : [{ key, value: `${number(amount)} g` }];
  });
  const flagged = verdict.flaggedIngredients;
  const allergen = product?.allergens?.some(name => flagged.some(flag => flag.toLowerCase() === name.toLowerCase()));
  const info = () => setSheet('scan');

  return (
    <View>
      {photo && !imageFailed && (
        <View style={styles.hero}>
          <Image source={photo} style={StyleSheet.absoluteFill} resizeMode="cover" accessibilityLabel="Scanned food photo" onError={() => setImageFailed(true)} />
          {onBack && <View style={styles.back}><GlassIcon label="Back" glyph="‹" onPress={onBack} /></View>}
        </View>
      )}
      {onBack && (!photo || imageFailed) && <View style={styles.compactHeader}>
        <GlassIcon label="Back" glyph="‹" onPress={onBack} />
        <Text style={shared.muted}>Scan result</Text>
      </View>}
      <View style={styles.body}>
        <View style={styles.titleLine}>
          <Text style={[shared.title, styles.title]} accessibilityRole="header">{verdict.foodName}</Text>
          {energy ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`${estimated ? 'Estimated ' : ''}${energy}. Show details`}
              onPress={() => setSheet('calories')} style={styles.energy}>
              <Text style={styles.energyText}>{energy}</Text>
              {reported && <Text style={styles.energyText}>{reported.quantity}</Text>}
            </Pressable>
          ) : <Text style={shared.muted}>Calories unavailable</Text>}
        </View>

        {(serving || photoDetails) && (
          <View style={styles.stats}>
            {serving && <GlassCard style={styles.stat}><Text style={shared.muted}>Portion</Text><Text style={styles.amount}>{serving}</Text></GlassCard>}
            {photoDetails && <GlassCard style={styles.stat}><Text style={shared.muted}>Food ID confidence</Text><Text style={styles.amount}>{photoDetails.confidence[0]?.toUpperCase()}{photoDetails.confidence.slice(1)}</Text></GlassCard>}
          </View>
        )}

        <GlassCard>
          <View style={styles.headingRow}>
            <Text testID="verdict-badge" style={[shared.heading, styles.title, { color: look.colour }]} accessibilityRole="header">{look.badge}</Text>
            <GlassIcon label="Scan info" glyph="ⓘ" onPress={info} />
          </View>
          {flagged.length > 0 && <>
            <Text style={shared.heading}>{allergen ? 'Allergen Caution' : 'Dietary Caution'}</Text>
            <View style={styles.tags}>
              {flagged.map(name => <Text key={name} style={styles.tag}>{name}</Text>)}
            </View>
          </>}
          {verdict.level === 'unsure' && advice && <Text style={shared.body}>{advice}</Text>}
        </GlassCard>

        {ingredients.length > 0 && (
          <GlassCard>
            <Text style={shared.heading}>Ingredients</Text>
            {ingredients.map((ingredient, index) => (
              <View key={`${ingredient.name}-${index}`} style={styles.row}>
                <Text style={shared.body}>{ingredient.name}</Text>
                <Text style={[styles.tag, ingredient.label !== 'Possible' && styles.source]}>{ingredient.label}</Text>
              </View>
            ))}
          </GlassCard>
        )}

        {(nutrition.length > 0 || estimated?.calories) && (
          <GlassCard>
            <Text style={shared.heading}>{estimated ? 'Nutrition estimate' : 'Nutrition'}</Text>
            {reported && <Text style={shared.muted}>{reported.quantity}</Text>}
            {estimated?.calories && <View accessibilityLabel={`Estimated ${energy}`}>
              <View style={styles.range} />
              <View style={styles.row}><Text style={shared.muted}>{number(estimated.calories.min)} kcal</Text><Text style={shared.muted}>{number(estimated.calories.max)} kcal</Text></View>
            </View>}
            {nutrition.map(row => <View key={row.key} style={styles.row}>
              <Text style={shared.body}>{row.key[0]?.toUpperCase()}{row.key.slice(1)}</Text><Text style={styles.amount}>{row.value}</Text>
            </View>)}
          </GlassCard>
        )}
      </View>

      <Modal visible={sheet !== null} animationType="none" presentationStyle="pageSheet" onRequestClose={() => setSheet(null)}>
        <SafeAreaView style={styles.sheet}>
          <ScrollView contentContainerStyle={shared.screen}>
            <Text style={shared.title} accessibilityRole="header">{sheet === 'calories' ? 'Calories' : 'Scan info'}</Text>
            {sheet === 'calories' ? <Text style={shared.body}>{estimated ? `Estimated ${energy} for the portion in the photo.` : `${energy} ${reported?.quantity ?? ''} · Open Food Facts`}</Text> : (
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
            <Pressable style={shared.button} accessibilityRole="button" onPress={() => setSheet(null)}><Text style={shared.buttonText}>Done</Text></Pressable>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 18, paddingTop: 13, gap: 11 },
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
