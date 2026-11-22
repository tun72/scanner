import type { CloudScan, ScanRequest, VerdictResponse } from '@food-scanner/contracts';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { rememberCloudScan, retryCloudPhoto } from '../account/history.ts';
import { accountRequest, AccountRequestError, activeSession } from '../account/session.ts';
import { VerdictCard } from '../history/verdict-card.tsx';
import { ACTION_LABELS, describeFailure, type FailureAction } from '../scan/scan-failure.ts';
import type { ScanFailure } from '../scan/scan-outcome.ts';
import type { CapturedPhoto, Prepared, PreparedScan } from '../scan/scan-food.ts';
import { Camera } from '../scan/camera';
import { Button, styles } from '../scan/scan-controls.tsx';
import type { Scanner } from '../scan/scan-request.ts';
import { keepVerdict, loadInstallId, profileStore, scanFood } from '../services.ts';
import { shared } from '../theme.ts';
import { ScanBeam } from '../ui/scan-beam.tsx';
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
  // Steps 1 and 2 of "အစားအစာ စစ်ရန်": without a profile there is nothing to judge against, so set one up first.
  if (scanner === null) return <Redirect href="/notice" />;
  return <Scanning scanner={scanner} initialMode={mode} />;
}

type Phase =
  | { name: 'camera' }
  | { name: 'preparing' }
  | { name: 'confirm-photo'; scan: PreparedScan }
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
    if (version.current !== attempt) return;
    if (prepared.ok && activeSession()) {
      try {
        const response = await accountRequest('/v1/photo-sharing', {}, null);
        const policy: unknown = await response.json();
        if (version.current !== attempt) return;
        if (typeof policy !== 'object' || policy === null || !('requireFoodOnlyPhoto' in policy)
          || typeof policy.requireFoodOnlyPhoto !== 'boolean') throw new Error('Invalid photo policy');
        if (policy.requireFoodOnlyPhoto) {
          setPhase({ name: 'confirm-photo', scan: prepared.scan });
          return;
        }
      } catch (error) {
        if (version.current !== attempt) return;
        // Older API deployments have no Gemini photo policy.
        if (!(error instanceof AccountRequestError) || error.status !== 404) {
          setPhase({ name: 'failed', failure: { reason: 'not-sendable' }, kind: 'photo', scan: null });
          return;
        }
      }
    }
    sendPrepared(prepared, 'photo');
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
    case 'confirm-photo': {
      const { scan } = phase;
      if (scan.request.kind !== 'photo') return null;
      const request = { ...scan.request, foodOnly: true as const };
      return (
        <GlassBackground>
          <ScrollView contentContainerStyle={[shared.screen, { paddingTop: insets.top + 16 }]}>
            <GlassCard>
              <Text style={shared.title} accessibilityRole="header">ဓာတ်ပုံ အတည်ပြုရန်</Text>
              <Text style={shared.body}>စစ်ဆေးဖို့ ဒီပုံကို ပေးပို့ပါမယ်။ လူ၊ လိပ်စာနဲ့ ကိုယ်ရေးအချက်အလက်တွေ မပါစေပါနဲ့။</Text>
              <Image source={{ uri: `data:image/jpeg;base64,${request.photo}` }} style={{ width: '100%', height: 220 }} resizeMode="contain" accessibilityLabel="စစ်ဆေးမည့် ဓာတ်ပုံ" />
            </GlassCard>
            <Button label="အတည်ပြုပြီး စစ်ရန်" onPress={() => void send({ ...scan, request })} />
            <Button label="အခြားပုံ ရွေးရန်" onPress={backToCamera} secondary />
          </ScrollView>
        </GlassBackground>
      );
    }
    case 'preparing':
    case 'checking':
      return <Checking request={phase.name === 'checking' ? phase.scan.request : null} onBack={done} />;
    case 'verdict':
      return (
        <GlassBackground>
          <ScrollView contentContainerStyle={{ paddingTop: insets.top, paddingBottom: insets.bottom + 18 }}>
            <VerdictCard verdict={phase.verdict} photo={phase.photo ? { uri: `data:image/jpeg;base64,${phase.photo}` } : undefined}
              note={scanner.profile.notes} onBack={done} />
            <View style={styles.resultActions}>
              <Text style={shared.muted}>
                {phase.saved === 'saving' ? 'မှတ်တမ်းတွင် သိမ်းနေသည်…' : phase.saved === 'saved' ? 'မှတ်တမ်းတွင် သိမ်းပြီးပါပြီ။' : "ဤရလဒ်ကို သိမ်း၍ မရပါ။"}
              </Text>
              {phase.cloud?.photoState === 'pending' && <>
                <Text style={shared.muted} accessibilityRole="alert">{retryFailed ? 'ဓာတ်ပုံတင်၍ မရပါ။ ပြန်ကြိုးစားပါ။' : 'ဓာတ်ပုံတင်ရန် စောင့်နေသည်။'}</Text>
                <Button label={retrying ? 'တင်နေသည်…' : 'ဓာတ်ပုံ ပြန်တင်ရန်'} disabled={retrying} onPress={() => {
                  if (phase.cloud) void retryPhoto(phase.cloud.id, phase.photo);
                }} secondary />
              </>}
              <Button label="ထပ်မံ စစ်ဆေးရန်" onPress={backToCamera} />
              <Button label="ပြီးပါပြီ" onPress={done} secondary />
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
              <Text style={shared.title} accessibilityRole="header">ရလဒ် မရသေးပါ</Text>
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

function Checking({ request, onBack }: { request: ScanRequest | null; onBack(): void }) {
  const insets = useSafeAreaInsets();
  const uri = request?.kind === 'photo' ? `data:image/jpeg;base64,${request.photo}` : undefined;
  return (
    <GlassBackground>
      <View style={[shared.screen, { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16 }]}>
        <GlassIcon label="နောက်သို့" glyph="‹" onPress={onBack} />
        <GlassCard style={styles.progress}>
          <View style={styles.stage}>
            {uri && <Image source={{ uri }} style={StyleSheet.absoluteFill} resizeMode="cover" />}
            <ScanBeam />
          </View>
          <Text style={shared.heading} accessibilityRole="header" accessibilityLiveRegion="polite">
            {!request ? 'ဓာတ်ပုံ ပြင်ဆင်နေသည်' : request.kind === 'barcode' ? 'ကုန်ပစ္စည်း ရှာဖွေနေသည်' : 'အစားအစာ စစ်ဆေးနေသည်'}
          </Text>
        </GlassCard>
      </View>
    </GlassBackground>
  );
}
