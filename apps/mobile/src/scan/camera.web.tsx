import { useRef, useState, type ChangeEvent } from 'react';
import { ScrollView, Text } from 'react-native';
import { shared } from '../theme.ts';
import { GlassBackground, GlassCard } from '../ui/glass.tsx';
import { BarcodeCamera } from './barcode-camera.web.tsx';
import { Button } from './scan-controls.tsx';
import type { CapturedPhoto } from './scan-food.ts';

export function Camera({ onPhoto, onBack, mode, onBarcode }: { mode?: 'photo' | 'barcode' | undefined; onBarcode(value: string): void; onPhoto(photo: CapturedPhoto): Promise<void>; onBack(): void }) {
  const camera = useRef<HTMLInputElement>(null);
  const library = useRef<HTMLInputElement>(null);
  const [problem, setProblem] = useState(false);
  const [reading, setReading] = useState(false);

  async function selectPhoto(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';
    if (!file || reading) return;
    setProblem(false);
    setReading(true);
    const uri = URL.createObjectURL(file);
    try {
      const image = new Image();
      image.src = uri;
      await image.decode();
      if (camera.current) await onPhoto({ uri, width: image.naturalWidth, height: image.naturalHeight });
    } catch {
      setProblem(true);
    } finally {
      URL.revokeObjectURL(uri);
      setReading(false);
    }
  }

  return (
    <GlassBackground>
      <ScrollView contentContainerStyle={shared.screen}>
        <Button label="နောက်သို့" onPress={onBack} secondary />
        {mode === 'barcode' ? <BarcodeCamera onBarcode={onBarcode} /> : <GlassCard>
          <Text style={shared.title} accessibilityRole="header">ဓာတ်ပုံဖြင့် စစ်ရန်</Text>
          <input hidden ref={camera} type="file" accept="image/*" capture="environment" onChange={selectPhoto} />
          <input hidden ref={library} type="file" accept="image/*" onChange={selectPhoto} />
          <Button label={reading ? 'ဓာတ်ပုံ ဖွင့်နေသည်…' : 'ဓာတ်ပုံ ရိုက်ရန်'} onPress={() => camera.current?.click()} disabled={reading} />
          <Button label="ဖုန်းထဲမှ ပုံရွေးရန်" onPress={() => library.current?.click()} disabled={reading} secondary />
          {problem && <Text style={shared.body} accessibilityRole="alert">ဤပုံကို ဖွင့်၍ မရပါ။ ပုံအသစ်ရိုက်ပါ သို့မဟုတ် JPEG၊ PNG ပုံရွေးပါ။</Text>}
        </GlassCard>}
      </ScrollView>
    </GlassBackground>
  );
}
