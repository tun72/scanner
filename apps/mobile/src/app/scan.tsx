import type { CloudScan, ScanRequest, VerdictResponse } from '@food-scanner/contracts';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { rememberCloudScan, retryCloudPhoto } from '../account/history.ts';
import { activeSession } from '../account/session.ts';
import { VerdictCard } from '../history/verdict-card.tsx';
import { ACTION_LABELS, describeFailure, type FailureAction } from '../scan/scan-failure.ts';
import type { ScanFailure } from '../scan/scan-outcome.ts';
import type { CapturedPhoto, Prepared, PreparedScan } from '../scan/scan-food.ts';
import { PRODUCT_BARCODE_TYPES, isProductBarcode, type Scanner } from '../scan/scan-request.ts';
import { keepVerdict, loadInstallId, profileStore, scanFood } from '../services.ts';
import { colors, shared } from '../theme.ts';
import { GlassBackground, GlassCard, GlassIcon } from '../ui/glass.tsx';

/** Scan a food: needs a saved profile, then photo or barcode, then the verdict or an error. */
export default function ScanScreen() {
  const { mode } = useLocalSearchParams<{ mode?: 'photo' | 'barcode' }>();
  // undefined while loading; null when no profile is saved.
  const [scanner, setScanner] = useState<Scanner | null | undefined>(undefined);

  useEffect(() => {
    let active = true;
    void (async () => {
      const profile = await profileStore.load();
      const loaded = profile === null ? null : { profile, installId: await loadInstallId() };
      if (active) setScanner(loaded);
    })().catch(() => { if (active) setScanner(null); });
    return () => {
      active = false;
    };
  }, []);

  if (scanner === undefined) return <ActivityIndicator style={styles.loading} />;
  // Steps 1 and 2 of "Scan a food": without a profile there is nothing to judge against, so set one up first.
  if (scanner === null) return <Redirect href="/notice" />;
  return <Scanning scanner={scanner} initialMode={mode} />;
}

type Phase =
  | { name: 'camera' }
  | { name: 'preparing' }
  | { name: 'checking'; scan: PreparedScan }
  | { name: 'verdict'; verdict: VerdictResponse; photo: string | null; cloud?: CloudScan; saved: 'saving' | 'saved' | 'failed' }
  | { name: 'failed'; failure: ScanFailure; kind: ScanRequest['kind']; scan: PreparedScan | null };

function Scanning({ scanner, initialMode }: { scanner: Scanner; initialMode?: 'photo' | 'barcode' | undefined }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [phase, setPhase] = useState<Phase>({ name: 'camera' });
  const [mode, setMode] = useState(initialMode);
  const [retrying, setRetrying] = useState(false);
  const [retryFailed, setRetryFailed] = useState(false);
  const version = useRef(0);

  useEffect(() => () => { version.current += 1; }, []);

  const send = async (scan: PreparedScan) => {
    const attempt = ++version.current;
    const session = activeSession();
    const photo = scan.request.kind === 'photo' ? scan.request.photo : null;
    setPhase({ name: 'checking', scan });
    const result = await scanFood.send(scan);
    if (result.kind === 'failed') {
      if (version.current === attempt) setPhase({ name: 'failed', failure: result.failure, kind: scan.request.kind, scan });
      return;
    }
    const { verdict, cloudScan } = result;
    if (version.current === attempt) {
      setPhase({ name: 'verdict', verdict, photo, ...(cloudScan ? { cloud: cloudScan } : {}), saved: cloudScan ? 'saved' : 'saving' });
    }
    if (session && cloudScan) {
      await rememberCloudScan(session, cloudScan, photo).catch(() => undefined);
    } else if (!session && version.current === attempt) {
      const saved = await keepVerdict(verdict, scan.thumbnail);
      if (version.current === attempt) setPhase(current => current.name === 'verdict' ? { ...current, saved: saved ? 'saved' : 'failed' } : current);
    }
  };

  const sendPrepared = (prepared: Prepared, kind: ScanRequest['kind']) => {
    if (prepared.ok) void send(prepared.scan);
    else setPhase({ name: 'failed', failure: prepared.failure, kind, scan: null });
  };

  const onPhoto = async (photo: CapturedPhoto) => {
    const attempt = ++version.current;
    setPhase({ name: 'preparing' });
    const prepared = await scanFood.preparePhoto(photo, scanner);
    if (version.current === attempt) sendPrepared(prepared, 'photo');
  };
  const onBarcode = (barcode: string) => sendPrepared(scanFood.prepareBarcode(barcode, scanner), 'barcode');
  const backToCamera = () => { version.current += 1; setRetryFailed(false); setPhase({ name: 'camera' }); };
  const done = () => {
    version.current += 1;
    if (router.canGoBack()) router.back();
    else router.replace('/');
  };
  const retryPhoto = async (id: string, photo: string | null) => {
    setRetrying(true);
    setRetryFailed(false);
    try {
      const cloud = await retryCloudPhoto(id, photo);
      setPhase(current => current.name === 'verdict' && current.cloud?.id === id ? { ...current, cloud } : current);
      if (cloud.photoState !== 'ready') setRetryFailed(true);
    } catch {
      setRetryFailed(true);
    } finally {
      setRetrying(false);
    }
  };

  switch (phase.name) {
    case 'camera':
      return <Camera onPhoto={onPhoto} onBarcode={onBarcode} mode={mode} onBack={done} />;
    case 'preparing':
    case 'checking':
      return <Checking request={phase.name === 'checking' ? phase.scan.request : null} onBack={done} />;
    case 'verdict':
      return (
        <GlassBackground>
          <ScrollView contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom + 18 }}>
            <VerdictCard verdict={phase.verdict} photo={phase.photo ? { uri: `data:image/jpeg;base64,${phase.photo}` } : undefined} onBack={done} />
            <View style={styles.resultActions}>
              <Text style={shared.muted}>
                {phase.saved === 'saving' ? 'Saving to your history…' : phase.saved === 'saved' ? 'Saved to your history.' : "Couldn't save this scan to your history."}
              </Text>
              {phase.cloud?.photoState === 'pending' && <>
                <Text style={shared.muted} accessibilityRole="alert">{retryFailed ? 'Couldn’t upload the photo. Try again.' : 'Photo upload pending.'}</Text>
                <Button label={retrying ? 'Uploading…' : 'Retry photo upload'} disabled={retrying} onPress={() => {
                  if (phase.cloud) void retryPhoto(phase.cloud.id, phase.photo);
                }} secondary />
              </>}
              <Button label="Scan another" onPress={backToCamera} />
              <Button label="Done" onPress={done} secondary />
            </View>
          </ScrollView>
        </GlassBackground>
      );
    case 'failed': {
      const { message, actions } = describeFailure(phase.failure, phase.kind);
      const { scan } = phase;
      const run: Record<FailureAction, () => void> = {
        retry: () => {
          if (scan !== null) void send(scan);
        },
        'take-photo': () => { if (mode) setMode('photo'); backToCamera(); },
        'scan-again': backToCamera,
        home: done,
      };
      return (
        <GlassBackground>
          <ScrollView contentContainerStyle={[shared.screen, { paddingTop: insets.top + 16 }]}>
            <View style={[shared.card, styles.callout]}>
              <Text style={shared.title} accessibilityRole="header">No verdict</Text>
              <Text style={shared.body} accessibilityRole="alert">{message}</Text>
            </View>
            {actions.map((action, index) => (
              <Button key={action} label={ACTION_LABELS[action]} onPress={run[action]} secondary={index > 0} />
            ))}
          </ScrollView>
        </GlassBackground>
      );
    }
  }
}

/** Step 3 of "Scan a food": one camera for both a photo and a product barcode. */
function Camera({ onPhoto, onBarcode, mode, onBack }: {
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

function Checking({ request, onBack }: { request: ScanRequest | null; onBack(): void }) {
  const insets = useSafeAreaInsets();
  const photo = request?.kind === 'photo' ? request.photo : null;
  return (
    <GlassBackground>
      {photo && <>
        <Image source={{ uri: `data:image/jpeg;base64,${photo}` }} style={StyleSheet.absoluteFill} resizeMode="cover" />
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.analysisTint]} />
      </>}
      <View style={[styles.analysis, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
        <GlassIcon label="Back" glyph="‹" onPress={onBack} />
        {photo && <View pointerEvents="none" style={styles.framing}>
          <View style={[styles.frame, styles.analysisFrame]} />
        </View>}
        <GlassCard style={styles.progress}>
          <ActivityIndicator color={colors.primary} accessibilityLabel="Scan in progress" />
          <Text style={shared.heading} accessibilityRole="header">{request?.kind === 'barcode' ? 'Checking barcode' : 'Analyzing food'}</Text>
        </GlassCard>
      </View>
    </GlassBackground>
  );
}

function Button({ label, onPress, secondary = false, disabled = false }: { label: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  return (
    <Pressable style={[shared.button, secondary && shared.buttonSecondary, disabled && shared.buttonDisabled]} disabled={disabled} onPress={onPress} accessibilityRole="button">
      <Text style={[shared.buttonText, secondary && shared.buttonSecondaryText]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1 },
  fill: { flex: 1, backgroundColor: '#000000' },
  overlay: { flex: 1, justifyContent: 'flex-end', gap: 12, padding: 22 },
  framing: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  frame: { width: '77%', height: '58%', maxWidth: 320, maxHeight: 275 },
  corner: { position: 'absolute', width: 28, height: 28, borderColor: colors.tint },
  topLeft: { left: 0, top: 0, borderTopWidth: 4, borderLeftWidth: 4, borderTopLeftRadius: 12 },
  topRight: { right: 0, top: 0, borderTopWidth: 4, borderRightWidth: 4, borderTopRightRadius: 12 },
  bottomLeft: { left: 0, bottom: 0, borderBottomWidth: 4, borderLeftWidth: 4, borderBottomLeftRadius: 12 },
  bottomRight: { right: 0, bottom: 0, borderBottomWidth: 4, borderRightWidth: 4, borderBottomRightRadius: 12 },
  cameraControls: { borderRadius: 28, gap: 12, padding: 14, backgroundColor: colors.background },
  hint: { fontSize: 16, lineHeight: 22, color: colors.text, textAlign: 'center' },
  callout: { backgroundColor: colors.tintLight },
  resultActions: { padding: 18, gap: 10 },
  analysis: { flex: 1, paddingHorizontal: 18, justifyContent: 'space-between' },
  analysisTint: { backgroundColor: 'rgba(18,34,24,0.24)' },
  analysisFrame: { borderWidth: 2, borderColor: '#FAF4D9', borderRadius: 24, backgroundColor: 'rgba(173,205,159,0.13)' },
  progress: { alignItems: 'center', padding: 18 },
});
