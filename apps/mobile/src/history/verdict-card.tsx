import type { VerdictResponse } from '@food-scanner/contracts';
import { StyleSheet, Text, View } from 'react-native';
import { colors, shared } from '../theme.ts';
import { VERDICT_LOOKS } from './verdict-look.ts';

/**
 * Steps 3 and 4 of "Show and keep the verdict": the level, the food, why, what to watch out for, a tip,
 * and always the not-medical-advice note. Used for both new and saved verdicts.
 */
export function VerdictCard({ verdict }: { verdict: VerdictResponse }) {
  const look = VERDICT_LOOKS[verdict.level];
  const advice = verdict.level === 'unsure' ? verdict.retakeHint : verdict.tip;

  return (
    <View style={styles.card}>
      <View
        testID="verdict-badge"
        style={[styles.badge, { backgroundColor: look.colour }]}
        accessible
        accessibilityRole="header"
        accessibilityLabel={`Verdict: ${look.badge}. ${look.line}.`}
      >
        <Text style={styles.badgeText}>{look.badge}</Text>
        <Text style={styles.badgeLine}>{look.line}</Text>
      </View>

      <Text style={shared.title}>{verdict.foodName}</Text>

      {verdict.reasons.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.heading}>Why</Text>
          {verdict.reasons.map((reason, index) => (
            <View key={`${reason.condition}-${index}`} style={styles.reason}>
              <Text style={styles.reasonCondition}>
                {reason.condition} · {VERDICT_LOOKS[reason.severity].badge}
              </Text>
              <Text style={shared.body}>{reason.explanation}</Text>
            </View>
          ))}
        </View>
      )}

      {verdict.flaggedIngredients.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.heading}>Watch out for</Text>
          <View style={styles.chips}>
            {verdict.flaggedIngredients.map((ingredient) => (
              <Text key={ingredient} style={styles.chip}>
                {ingredient}
              </Text>
            ))}
          </View>
        </View>
      )}

      {advice !== undefined && (
        <View style={styles.section}>
          <Text style={styles.heading}>{verdict.level === 'unsure' ? 'Try again' : 'Tip'}</Text>
          <Text style={shared.body}>{advice}</Text>
        </View>
      )}

      <Text style={styles.notice} testID="verdict-notice">
        {verdict.notice}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { gap: 16 },
  badge: { borderRadius: 16, paddingVertical: 16, paddingHorizontal: 20, gap: 2 },
  badgeText: { fontSize: 28, fontWeight: '800', color: '#FFFFFF' },
  badgeLine: { fontSize: 16, color: '#FFFFFF' },
  section: { gap: 8 },
  heading: { fontSize: 18, fontWeight: '700', color: colors.text },
  reason: { gap: 2, padding: 12, borderRadius: 12, backgroundColor: '#F5F6F8' },
  reasonCondition: { fontSize: 15, fontWeight: '600', color: colors.text },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { fontSize: 15, color: colors.text, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderColor: colors.border },
  notice: { fontSize: 14, lineHeight: 20, color: colors.muted, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border },
});
