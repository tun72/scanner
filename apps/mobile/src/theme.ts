import { StyleSheet } from 'react-native';

export const colors = {
  background: '#F8FAF4',
  surface: '#FFFFFF',
  tint: '#E2EBD5',
  tintLight: '#EFF4E8',
  text: '#243529',
  muted: '#516455',
  primary: '#365B3D',
  primaryPressed: '#26452E',
  primaryText: '#FFFFFF',
  border: '#CCD8C6',
  problem: '#9E3344',
  disabled: '#637466',
};

export const shared = StyleSheet.create({
  screen: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 16, paddingBottom: 32, gap: 16 },
  title: { fontSize: 32, fontWeight: '800', letterSpacing: -0.9, color: colors.text },
  heading: { fontSize: 20, fontWeight: '700', color: colors.text },
  body: { fontSize: 16, lineHeight: 24, color: colors.text },
  muted: { fontSize: 14, lineHeight: 20, color: colors.muted },
  card: { backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 10 },
  button: { minHeight: 56, borderRadius: 999, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 12, backgroundColor: colors.primary },
  buttonSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  buttonDisabled: { backgroundColor: colors.disabled },
  buttonText: { fontSize: 17, fontWeight: '700', color: colors.primaryText, textAlign: 'center' },
  buttonSecondaryText: { color: colors.primary },
});
