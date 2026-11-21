import { useRef, useState, type ChangeEvent } from 'react';
import { ScrollView, Text } from 'react-native';
import { shared } from '../theme.ts';
import { GlassBackground, GlassCard } from '../ui/glass.tsx';
import { Button } from './scan-controls.tsx';
import type { CapturedPhoto } from './scan-food.ts';

export function Camera({ onPhoto, onBack }: { onPhoto(photo: CapturedPhoto): Promise<void>; onBack(): void }) {
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
        <Button label="Back" onPress={onBack} secondary />
        <GlassCard>
          <Text style={shared.title} accessibilityRole="header">Photo scan</Text>
          <Text style={shared.body}>Take a photo of your food or choose one from your library.</Text>
          <input hidden ref={camera} type="file" accept="image/*" capture="environment" onChange={selectPhoto} />
          <input hidden ref={library} type="file" accept="image/*" onChange={selectPhoto} />
          <Button label={reading ? 'Opening photo…' : 'Take photo'} onPress={() => camera.current?.click()} disabled={reading} />
          <Button label="Choose photo" onPress={() => library.current?.click()} disabled={reading} secondary />
          {problem && <Text style={shared.body} accessibilityRole="alert">Couldn’t open this photo. Take a new one or choose a JPEG or PNG.</Text>}
        </GlassCard>
      </ScrollView>
    </GlassBackground>
  );
}
