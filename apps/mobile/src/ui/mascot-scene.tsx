import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { AccessibilityInfo, Image, Platform, StyleSheet, TurboModuleRegistry, View, type StyleProp, type ViewStyle } from 'react-native';

const soboPoster = require('../../assets/sobo-poster.png');
const supportsPlayer = Platform.OS === 'ios' || Platform.OS === 'android';

/** Show a frame from Sobo while the player loads or when Reduce Motion is enabled. */
export function MascotScene({ style }: { style?: StyleProp<ViewStyle> }) {
  const [motionEnabled, setMotionEnabled] = useState(false);
  const [playing, setPlaying] = useState(false);

  useFocusEffect(useCallback(() => {
    if (!supportsPlayer) return;
    let active = true;
    let preferenceChanged = false;

    const listener = AccessibilityInfo.addEventListener('reduceMotionChanged', (enabled) => {
      preferenceChanged = true;
      if (active) {
        setMotionEnabled(!enabled);
        if (enabled) setPlaying(false);
      }
    });
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active && !preferenceChanged) setMotionEnabled(!enabled);
    }).catch(() => undefined);

    return () => {
      active = false;
      listener.remove();
      setMotionEnabled(false);
      setPlaying(false);
    };
  }, []));

  const SoboPlayer = supportsPlayer && motionEnabled && TurboModuleRegistry.get('RNCWebViewModule')
    ? (require('./sobo-player.tsx') as typeof import('./sobo-player.tsx')).SoboPlayer
    : null;

  return (
    <View style={[styles.scene, style]}>
      {(!SoboPlayer || !playing) && <Image source={soboPoster} style={styles.poster} testID="sobo-poster"
        resizeMode="contain" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />}
      {SoboPlayer && <SoboPlayer onPlayingChange={setPlaying} />}
    </View>
  );
}

const styles = StyleSheet.create({
  scene: { width: '100%', height: 225, overflow: 'hidden' },
  poster: { width: '100%', height: '100%' },
});
