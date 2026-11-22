import { Asset } from 'expo-asset';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, shared } from '../theme.ts';
import { GlassCard } from '../ui/glass.tsx';
import { ScanBeam } from '../ui/scan-beam.tsx';
import { Button } from './scan-controls.tsx';
import { isProductBarcode } from './scan-request.ts';

async function loadReader() {
  const reader = await import('zxing-wasm/reader');
  const wasm = Asset.fromModule(require('zxing-wasm/reader/zxing_reader.wasm')).uri;
  reader.prepareZXingModule({ overrides: { locateFile: () => wasm } });
  return reader;
}

export function BarcodeCamera({ onBarcode }: { onBarcode(value: string): void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [digits, setDigits] = useState('');
  const [state, setState] = useState<'starting' | 'reading' | 'unavailable'>('starting');
  const [attempt, setAttempt] = useState(0);
  const submitted = useRef(false);
  const onRead = useRef(onBarcode);
  onRead.current = onBarcode;

  function submit(value: string) {
    if (submitted.current || !isProductBarcode(value)) return;
    submitted.current = true;
    onRead.current(value);
  }

  useEffect(() => {
    const preview = video.current;
    if (!preview) return;
    let closed = false;
    let stream: MediaStream | undefined;
    let timer: ReturnType<typeof setTimeout>;
    function stop() {
      closed = true;
      clearTimeout(timer);
      stream?.getTracks().forEach(track => track.stop());
      if (preview) preview.srcObject = null;
    }
    async function start(element: HTMLVideoElement) {
      setState('starting');
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
      if (closed) { stop(); return; }
      element.srcObject = stream;
      await element.play();
      const reader = await loadReader();
      if (closed) return;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) throw new Error('Camera frames unavailable');
      setState('reading');
      async function frame() {
        if (closed || submitted.current) return;
        if (element.readyState >= 2 && element.videoWidth && ctx) {
          canvas.width = Math.min(960, element.videoWidth);
          canvas.height = Math.round(canvas.width * element.videoHeight / element.videoWidth);
          ctx.drawImage(element, 0, 0, canvas.width, canvas.height);
          const codes = await reader.readBarcodes(ctx.getImageData(0, 0, canvas.width, canvas.height), {
            formats: ['EAN13', 'EAN8', 'UPCA', 'UPCE'], maxNumberOfSymbols: 1,
          });
          if (closed || submitted.current) return;
          const found = codes.find(code => code.isValid && isProductBarcode(code.text));
          if (found) { stop(); submit(found.text); return; }
        }
        timer = setTimeout(() => void frame().catch(fail), 240);
      }
      await frame();
    }
    function fail() {
      if (!closed) { stop(); setState('unavailable'); }
    }
    const hidden = () => { if (document.hidden) fail(); };
    document.addEventListener('visibilitychange', hidden);
    void start(preview).catch(fail);
    return () => { document.removeEventListener('visibilitychange', hidden); stop(); };
  }, [attempt]);

  return (
    <GlassCard>
      <Text style={shared.title} accessibilityRole="header">ဘားကုဒ်ဖတ်ရန်</Text>
      <View style={[layout.preview, state === 'unavailable' && layout.hidden]}>
        <video ref={video} muted playsInline autoPlay aria-hidden="true" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        <ScanBeam />
      </View>
      <Text style={shared.muted} accessibilityLiveRegion="polite">{state === 'starting' ? 'ကင်မရာ ဖွင့်နေသည်…' : state === 'reading'
        ? 'ဘားကုဒ်ကို ဘောင်အတွင်း ချိန်ထားပါ။' : 'ကင်မရာ အသုံးပြု၍ မရပါ။ အောက်တွင် ဘားကုဒ်နံပါတ် ရိုက်ထည့်နိုင်သည်။'}</Text>
      {state === 'unavailable' && <Button secondary label="ကင်မရာ ပြန်ဖွင့်ရန်" onPress={() => setAttempt(value => value + 1)} />}
      <Text style={layout.label}>ဘားကုဒ်နံပါတ်</Text>
      <TextInput accessibilityLabel="ဘားကုဒ်နံပါတ်" keyboardType="number-pad" inputMode="numeric" value={digits}
        placeholder="ဥပမာ 3017620422003" placeholderTextColor={colors.muted} style={layout.input}
        onChangeText={value => setDigits(value.replace(/[၀-၉]/g, d => String(d.charCodeAt(0) - 0x1040)).replace(/\s/g, ''))}
        returnKeyType="go" onSubmitEditing={() => submit(digits)} />
      <Button label="နံပါတ်ဖြင့် စစ်ရန်" disabled={!isProductBarcode(digits)} onPress={() => submit(digits)} />
    </GlassCard>
  );
}

const layout = StyleSheet.create({
  preview: { aspectRatio: 1.65, width: '100%', backgroundColor: '#163C34', borderRadius: 16, overflow: 'hidden' },
  hidden: { display: 'none' },
  label: { color: colors.text, fontWeight: '700', marginTop: 8 },
  input: { fontSize: 16, minHeight: 52, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.background, color: colors.text },
});
