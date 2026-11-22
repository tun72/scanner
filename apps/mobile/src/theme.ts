import { StyleSheet } from 'react-native';

export const colors = {
  background: '#F4F7F3',
  surface: '#FFFFFF',
  tint: '#D8EBDF',
  tintLight: '#EBF5EE',
  text: '#172E28',
  muted: '#50665D',
  primary: '#205E48',
  primaryPressed: '#164735',
  primaryText: '#FFFFFF',
  border: '#CBDBD1',
  problem: '#9E3344',
  disabled: '#63786E',
};

export const shared = StyleSheet.create({
  screen: { flexGrow: 1, width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 16, paddingBottom: 32, gap: 16 },
  title: { fontSize: 26, lineHeight: 44, fontWeight: '700', color: colors.text },
  heading: { fontSize: 19, lineHeight: 34, fontWeight: '700', color: colors.text },
  body: { fontSize: 16, lineHeight: 29, color: colors.text },
  muted: { fontSize: 14, lineHeight: 25, color: colors.muted },
  card: { backgroundColor: colors.surface, borderRadius: 24, borderWidth: 1, borderColor: colors.border, padding: 18, gap: 10 },
  button: { minHeight: 56, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 12, backgroundColor: colors.primary },
  buttonSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  buttonDisabled: { backgroundColor: colors.disabled },
  buttonText: { fontSize: 16, lineHeight: 28, fontWeight: '700', color: colors.primaryText, textAlign: 'center' },
  buttonSecondaryText: { color: colors.primary },
});
