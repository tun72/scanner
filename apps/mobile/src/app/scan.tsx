import type { ScanRequest, VerdictResponse } from '@food-scanner/contracts';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { VerdictCard } from '../history/verdict-card.tsx';
import { ACTION_LABELS, describeFailure, type FailureAction } from '../scan/scan-failure.ts';
import type { ScanFailure } from '../scan/scan-outcome.ts';
import type { CapturedPhoto, Prepared, PreparedScan } from '../scan/scan-food.ts';
import { PRODUCT_BARCODE_TYPES, isProductBarcode, type Scanner } from '../scan/scan-request.ts';
import { keepVerdict, loadInstallId, profileStore, scanFood } from '../services.ts';
import { colors, shared } from '../theme.ts';

/** Scan a food: needs a saved profile, then photo or barcode, then the verdict or an error. */
export default function ScanScreen() {
  // undefined while loading; null when no profile is saved.
  const [scanner, setScanner] = useState<Scanner | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    void (async () => {
      const profile = await profileStore.load();
      const loaded = profile === null ? null : { profile, installId: await loadInstallId() };
      if (active) setScanner(loaded);
    })();
    return () => {
      active = false;
    };
  }, []);

  if (scanner === undefined) return <ActivityIndicator style={styles.loading} />;
  // Steps 1 and 2 of "Scan a food": without a profile there is nothing to judge against, so set one up first.
  if (scanner === null) return <Redirect href="/notice" />;
  return <Scanning scanner={scanner} />;
}

type Phase =
  | { name: 'camera' }
  | { name: 'preparing' }
  | { name: 'checking'; scan: PreparedScan }
  | { name: 'verdict'; verdict: VerdictResponse; saved: 'saving' | 'saved' | 'failed' }
  | { name: 'failed'; failure: ScanFailure; kind: ScanRequest['kind']; scan: PreparedScan | null };

function Scanning({ scanner }: { scanner: Scanner }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>({ name: 'camera' });

  const send = async (scan: PreparedScan) => {
    setPhase({ name: 'checking', scan });
    const result = await scanFood.send(scan);
    if (result.kind === 'failed') {
      // Errors are shown and never saved.
      setPhase({ name: 'failed', failure: result.failure, kind: scan.request.kind, scan });
      return;
    }
    const { verdict } = result;
    setPhase({ name: 'verdict', verdict, saved: 'saving' });
    const saved = await keepVerdict(verdict, scan.thumbnail);
    setPhase((current) => (current.name === 'verdict' && current.verdict === verdict ? { ...current, saved: saved ? 'saved' : 'failed' } : current));
  };

  const sendPrepared = (prepared: Prepared, kind: ScanRequest['kind']) => {
    if (prepared.ok) void send(prepared.scan);
    else setPhase({ name: 'failed', failure: prepared.failure, kind, scan: null });
  };

  const onPhoto = async (photo: CapturedPhoto) => {
    setPhase({ name: 'preparing' });
    sendPrepared(await scanFood.preparePhoto(photo, scanner), 'photo');
  };
  const onBarcode = (barcode: string) => sendPrepared(scanFood.prepareBarcode(barcode, scanner), 'barcode');
  const backToCamera = () => setPhase({ name: 'camera' });
  const done = () => (router.canGoBack() ? router.back() : router.replace('/'));

  switch (phase.name) {
    case 'camera':
      return <Camera onPhoto={onPhoto} onBarcode={onBarcode} />;
    case 'preparing':
    case 'checking':
      return <Checking thumbnail={phase.name === 'checking' ? phase.scan.thumbnail : null} />;
    case 'verdict':
      return (
        <ScrollView contentContainerStyle={shared.screen}>
          <VerdictCard verdict={phase.verdict} />
          <Text style={shared.muted}>
            {phase.saved === 'saving' ? 'Saving to your history…' : phase.saved === 'saved' ? 'Saved to your history.' : "Couldn't save this scan to your history."}
          </Text>
          <Button label="Scan another" onPress={backToCamera} />
          <Button label="Done" onPress={done} secondary />
        </ScrollView>
      );
    case 'failed': {
      const { message, actions } = describeFailure(phase.failure, phase.kind);
      const { scan } = phase;
      const run: Record<FailureAction, () => void> = {
        retry: () => {
          if (scan !== null) void send(scan);
        },
        'take-photo': backToCamera,
        'scan-again': backToCamera,
        home: done,
      };
      return (
        <ScrollView contentContainerStyle={shared.screen}>
          <Text style={shared.title} accessibilityRole="header">
            No verdict
          </Text>
          <Text style={shared.body} accessibilityRole="alert">
            {message}
          </Text>
          {actions.map((action, index) => (
            <Button key={action} label={ACTION_LABELS[action]} onPress={run[action]} secondary={index > 0} />
          ))}
        </ScrollView>
      );
    }
  }
}

/** Step 3 of "Scan a food": one camera for both a photo and a product barcode. */
function Camera({ onPhoto, onBarcode }: { onPhoto: (photo: CapturedPhoto) => void; onBarcode: (barcode: string) => void }) {
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
        <Text style={shared.title} accessibilityRole="header">
          Camera needed
        </Text>
        <Text style={shared.body}>Food Scanner uses the camera to photograph your food and read product barcodes.</Text>
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
        onBarcodeScanned={barcodeRead}
        onCameraReady={() => setReady(true)}
      />
      <View style={styles.overlay} pointerEvents="box-none">
        <Text style={styles.hint}>Photograph your meal or package, or point at the product's barcode.</Text>
        {problem !== null && (
          <Text style={styles.hint} accessibilityRole="alert">
            {problem}
          </Text>
        )}
        <Pressable
          style={[styles.shutter, !ready && styles.shutterWaiting]}
          onPress={() => void takePhoto()}
          disabled={!ready}
          accessibilityRole="button"
          accessibilityState={{ disabled: !ready }}
        >
          <Text style={styles.shutterText}>Take photo</Text>
        </Pressable>
      </View>
    </View>
  );
}

function Checking({ thumbnail }: { thumbnail: string | null }) {
  return (
    <View style={[shared.screen, styles.centred]}>
      {thumbnail !== null && <Image source={{ uri: `data:image/jpeg;base64,${thumbnail}` }} style={styles.thumbnail} accessibilityIgnoresInvertColors />}
      <ActivityIndicator size="large" color={colors.primary} />
      <Text style={shared.body}>Checking this food for your stomach…</Text>
    </View>
  );
}

function Button({ label, onPress, secondary = false }: { label: string; onPress: () => void; secondary?: boolean }) {
  return (
    <Pressable style={[shared.button, secondary && shared.buttonSecondary]} onPress={onPress} accessibilityRole="button">
      <Text style={[shared.buttonText, secondary && shared.buttonSecondaryText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1 },
  fill: { flex: 1, backgroundColor: '#000000' },
  overlay: { flex: 1, justifyContent: 'flex-end', gap: 16, padding: 24 },
  hint: { fontSize: 16, lineHeight: 22, color: '#FFFFFF', textAlign: 'center', backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 12, padding: 12 },
  shutter: { minHeight: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' },
  shutterWaiting: { opacity: 0.5 },
  shutterText: { fontSize: 18, fontWeight: '700', color: colors.text },
  centred: { alignItems: 'center', justifyContent: 'center' },
  thumbnail: { width: 160, height: 160, borderRadius: 16 },
});
