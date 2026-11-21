import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { shared } from '../theme.ts';
import { GlassIcon } from '../ui/glass.tsx';
import { Button, styles } from './scan-controls.tsx';
import type { CapturedPhoto } from './scan-food.ts';
import { PRODUCT_BARCODE_TYPES, isProductBarcode } from './scan-request.ts';

/** Step 3 of "Scan a food": one camera for both a photo and a product barcode. */
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
        <Button label="Back" onPress={onBack} secondary />
        <View style={[shared.card, styles.callout]}>
          <Text style={shared.title} accessibilityRole="header">Camera needed</Text>
          <Text style={shared.body}>Food Scanner uses the camera to photograph your food and read product barcodes.</Text>
        </View>
        {permission.canAskAgain ? (
          <Button label="Allow camera" onPress={() => void requestPermission()} />
        ) : (
          <>
            <Text style={shared.body}>Allow camera access for Food Scanner in your phone's Settings.</Text>
            <Button label="Open Settings" onPress={() => void Linking.openSettings()} />
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
      setProblem("We couldn't take that photo. Please try again.");
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
          <GlassIcon label="Back" glyph="‹" onPress={onBack} />
        </View>
        <View style={styles.framing} pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          <View style={styles.frame}>
            <View style={[styles.corner, styles.topLeft]} />
            <View style={[styles.corner, styles.topRight]} />
            <View style={[styles.corner, styles.bottomLeft]} />
            <View style={[styles.corner, styles.bottomRight]} />
          </View>
        </View>
        <View style={styles.cameraControls}>
          <Text style={styles.hint}>{mode === 'barcode' ? 'Line up the barcode.' : mode === 'photo' ? 'Fit the food in the frame.' : 'Photograph the food or point at a barcode.'}</Text>
          {problem !== null && <Text style={styles.hint} accessibilityRole="alert">{problem}</Text>}
          {mode !== 'barcode' && <Pressable
            style={[shared.button, !ready && shared.buttonDisabled]}
            onPress={() => void takePhoto()}
            disabled={!ready}
            accessibilityRole="button"
            accessibilityState={{ disabled: !ready }}
          >
            <Text style={shared.buttonText}>Take photo</Text>
          </Pressable>}
        </View>
      </View>
    </View>
  );
}
