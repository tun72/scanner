import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

export function useMotionAllowed() {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let live = true;
    let changed = false;
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', reduced => {
      changed = true;
      setAllowed(!reduced);
    });
    void AccessibilityInfo.isReduceMotionEnabled().then(reduced => {
      if (live && !changed) setAllowed(!reduced);
    }).catch(() => undefined);
    return () => { live = false; subscription.remove(); };
  }, []);
  return allowed;
}
