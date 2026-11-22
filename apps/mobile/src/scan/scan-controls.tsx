import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, shared } from '../theme.ts';

export function Button({ label, onPress, secondary = false, disabled = false }: { label: string; onPress: () => void; secondary?: boolean; disabled?: boolean }) {
  return (
    <Pressable style={({ pressed }) => [shared.button, secondary && shared.buttonSecondary, disabled && shared.buttonDisabled, pressed && { opacity: 0.82 }]} disabled={disabled} onPress={onPress} accessibilityRole="button">
      <Text style={[shared.buttonText, secondary && shared.buttonSecondaryText]}>{label}</Text>
    </Pressable>
  );
}

export const styles = StyleSheet.create({
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
  resultActions: { width: '100%', maxWidth: 720, alignSelf: 'center', padding: 18, gap: 10 },
  stage: { alignSelf: 'stretch', aspectRatio: 1.55, borderRadius: 16, overflow: 'hidden', backgroundColor: '#18463A' },
  progress: { alignItems: 'center', padding: 18 },
});
