import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors } from '../theme.ts';

const SolidSurfaces = createContext(Platform.OS === 'ios');

export function GlassSurfaceProvider({ children }: { children: ReactNode }) {
  const [solid, setSolid] = useState(Platform.OS === 'ios');
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let live = true;
    let changed = false;
    const listener = AccessibilityInfo.addEventListener('reduceTransparencyChanged', enabled => {
      changed = true;
      setSolid(enabled);
    });
    void AccessibilityInfo.isReduceTransparencyEnabled().then(enabled => {
      if (live && !changed) setSolid(enabled);
    }).catch(() => undefined);
    return () => { live = false; listener.remove(); };
  }, []);
  return <SolidSurfaces.Provider value={solid}>{children}</SolidSurfaces.Provider>;
}

export function GlassBackground({ children }: { children: ReactNode }) {
  const solid = useContext(SolidSurfaces);
  return (
    <View style={styles.page}>
      {!solid && <LinearGradient colors={['#DCE8CD', '#EDF1DD', '#F0E4C7']} style={StyleSheet.absoluteFill} pointerEvents="none" />}
      {children}
    </View>
  );
}

export function GlassCard({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const solid = useContext(SolidSurfaces);
  return <View style={[styles.card, solid && styles.solid, style]}>{children}</View>;
}

export function GlassIcon({ label, glyph, onPress }: { label: string; glyph: string; onPress(): void }) {
  const solid = useContext(SolidSurfaces);
  const native = !solid && Platform.OS === 'ios' && isGlassEffectAPIAvailable() && isLiquidGlassAvailable();
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={[styles.icon, solid && styles.solid, native && styles.nativeIcon]}>
      {native && <GlassView style={StyleSheet.absoluteFill} pointerEvents="none" glassEffectStyle="regular" tintColor="#F1F8E7BB" />}
      <Text style={styles.glyph} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">{glyph}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.background },
  card: { padding: 16, gap: 8, borderRadius: 22, borderWidth: 1, borderColor: '#F9FFF0', backgroundColor: '#FAFFF094' },
  solid: { backgroundColor: '#FCFDF7', borderColor: '#DDE4D6' },
  icon: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', backgroundColor: '#F7FFF3E8', alignItems: 'center', justifyContent: 'center' },
  nativeIcon: { backgroundColor: '#F7FFF34D' },
  glyph: { color: colors.text, fontSize: 22, fontWeight: '600' },
});
