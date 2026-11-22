import { GlassView, isGlassEffectAPIAvailable, isLiquidGlassAvailable } from 'expo-glass-effect';
import { LinearGradient } from 'expo-linear-gradient';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useMotionAllowed } from './use-motion.ts';
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
  const motion = useMotionAllowed();
  const opacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (!motion) { opacity.setValue(1); return; }
    opacity.setValue(0.9);
    const fade = Animated.timing(opacity, {
      toValue: 1, duration: 180, easing: Easing.out(Easing.quad), isInteraction: false, useNativeDriver: Platform.OS !== 'web',
    });
    fade.start();
    return () => fade.stop();
  }, [motion, opacity]);
  return (
    <Animated.View style={[styles.page, { opacity }]}>
      {!solid && <LinearGradient colors={['#E7F1E9', '#F4F7F3', '#F8F6F0']} style={StyleSheet.absoluteFill} pointerEvents="none" />}
      {children}
    </Animated.View>
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
  card: { padding: 18, gap: 12, borderRadius: 20, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  solid: { backgroundColor: '#FCFDF7', borderColor: '#DDE4D6' },
  icon: { width: 44, height: 44, borderRadius: 22, overflow: 'hidden', backgroundColor: '#F7FFF3E8', alignItems: 'center', justifyContent: 'center' },
  nativeIcon: { backgroundColor: '#F7FFF34D' },
  glyph: { color: colors.text, fontSize: 22, fontWeight: '600' },
});
