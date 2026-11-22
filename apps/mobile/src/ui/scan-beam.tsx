import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, View } from 'react-native';

import { useMotionAllowed } from './use-motion.ts';

export function ScanBeam() {
  const progress = useRef(new Animated.Value(0)).current;
  const motion = useMotionAllowed();
  const [height, setHeight] = useState(0);

  useEffect(() => {
    if (!motion) { progress.setValue(0.5); return; }
    const timing = (toValue: number) => Animated.timing(progress, {
      toValue, duration: 1250, easing: Easing.inOut(Easing.sin), useNativeDriver: Platform.OS !== 'web', isInteraction: false,
    });
    const sweep = Animated.loop(Animated.sequence([timing(1), timing(0)]));
    sweep.start();
    return () => sweep.stop();
  }, [motion, progress]);

  return (
    <View pointerEvents="none" aria-hidden style={styles.frame} onLayout={event => setHeight(event.nativeEvent.layout.height)}>
      <Animated.View style={[styles.beam, { transform: [{ translateY: progress.interpolate({
        inputRange: [0, 1], outputRange: [0, Math.max(0, height - 6)],
      }) }] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: { position: 'absolute', top: '18%', bottom: '18%', left: '8%', right: '8%', borderColor: '#B8ECD1', borderWidth: 1.5, borderRadius: 16, overflow: 'hidden' },
  beam: { marginHorizontal: 5, height: 3, borderRadius: 3, backgroundColor: '#82F3AE' },
});
