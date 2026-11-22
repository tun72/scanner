import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { shared } from '../theme.ts';
import { ScanBeam } from '../ui/scan-beam.tsx';
import { GlassIcon } from '../ui/glass.tsx';
import { Button, styles } from './scan-controls.tsx';
import type { CapturedPhoto } from './scan-food.ts';
import { PRODUCT_BARCODE_TYPES, isProductBarcode } from './scan-request.ts';

/** Step 3 of "အစားအစာ စစ်ရန်": one camera for both a photo and a product barcode. */
export function Camera({ onPhoto, onBarcode, mode, onBack }: {
  onPhoto: (photo: CapturedPhoto) => void; onBarcode: (barcode: string) => void;
  mode?: 'photo' | 'barcode' | undefined; onBack(): void;
}) {
  const insets = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  // The camera reports a barcode many times a second; only the first one, or one photo, starts a scan.
  const started = useRef(false);

  if (permission === null) return <ActivityIndicator style={styles.fill} />;
  if (!permission.granted) {
    return (
      <ScrollView contentContainerStyle={shared.screen}>
        <Button label="နောက်သို့" onPress={onBack} secondary />
        <View style={[shared.card, styles.callout]}>
          <Text style={shared.title} accessibilityRole="header">ကင်မရာ အသုံးပြုခွင့်</Text>
          <Text style={shared.body}>အစားအစာပုံ ရိုက်ရန်နှင့် ဘားကုဒ်ဖတ်ရန် ကင်မရာ အသုံးပြုခွင့် ပေးပါ။</Text>
        </View>
        {permission.canAskAgain ? (
          <Button label="ကင်မရာ အသုံးပြုခွင့်ပေးရန်" onPress={() => void requestPermission()} />
        ) : (
          <>
            <Text style={shared.body}>ဖုန်းဆက်တင်တွင် ကင်မရာ အသုံးပြုခွင့် ပေးပါ။</Text>
            <Button label="ဆက်တင် ဖွင့်ရန်" onPress={() => void Linking.openSettings()} />
          </>
        )}
      </ScrollView>
    );
  }

  const takePhoto = async () => {
    if (camera.current === null || started.current) return;
    started.current = true;
    setProblem(null);
    try {
      const { uri, width, height } = await camera.current.takePictureAsync();
      onPhoto({ uri, width, height });
    } catch {
      started.current = false;
      setProblem("ဓာတ်ပုံ ရိုက်၍ မရပါ။ ပြန်ကြိုးစားပါ။");
    }
  };

  const barcodeRead = ({ data }: { data: string }) => {
    if (started.current || !isProductBarcode(data)) return;
    started.current = true;
    onBarcode(data);
  };

  return (
    <View style={styles.fill}>
      <CameraView
        ref={camera}
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: [...PRODUCT_BARCODE_TYPES] }}
        {...(mode !== 'photo' ? { onBarcodeScanned: barcodeRead } : {})}
        onCameraReady={() => setReady(true)}
      />
      <View style={[styles.overlay, { paddingBottom: insets.bottom + 17 }]} pointerEvents="box-none">
        <View style={{ marginTop: insets.top }}>
          <GlassIcon label="နောက်သို့" glyph="‹" onPress={onBack} />
        </View>
        <View style={styles.framing} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={styles.frame}>
            {mode === 'barcode' && <ScanBeam />}
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
          </View>
        </View>
        <View style={styles.cameraControls}>
          <Text style={styles.hint}>{mode === 'barcode' ? 'ဘားကုဒ်ကို ဘောင်အတွင်း ချိန်ပါ။' : mode === 'photo' ? 'အစားအစာကို ဘောင်အတွင်း ချိန်ပါ။' : 'အစားအစာပုံ ရိုက်ပါ သို့မဟုတ် ဘားကုဒ်ကို ချိန်ပါ။'}</Text>
          {problem !== null && <Text style={styles.hint} accessibilityRole="alert">{problem}</Text>}
          {mode !== 'barcode' && <Pressable
            style={[shared.button, !ready && shared.buttonDisabled]}
            onPress={() => void takePhoto()}
            disabled={!ready}
            accessibilityRole="button"
            accessibilityState={{ disabled: !ready }}
          >
            <Text style={shared.buttonText}>ဓာတ်ပုံ ရိုက်ရန်</Text>
          </Pressable>}
        </View>
      </View>
    </View>
  );
}
