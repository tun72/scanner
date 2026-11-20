import { StyleSheet } from 'react-native';

export const colors = {
  background: '#FFFFFF',
  text: '#1B1F23',
  muted: '#5B6470',
  primary: '#1F7A4D',
  primaryText: '#FFFFFF',
  border: '#D5DAE0',
  problem: '#B3261E',
  disabled: '#A8B0B9',
};

/** Styles shared by every screen, so the three screens look like one app. */
export const shared = StyleSheet.create({
  screen: { flexGrow: 1, padding: 24, gap: 16, backgroundColor: colors.background },
  title: { fontSize: 26, fontWeight: '700', color: colors.text },
  body: { fontSize: 16, lineHeight: 24, color: colors.text },
  muted: { fontSize: 14, lineHeight: 20, color: colors.muted },
  button: { minHeight: 52, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, backgroundColor: colors.primary },
  buttonSecondary: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.primary },
  buttonDisabled: { backgroundColor: colors.disabled },
  buttonText: { fontSize: 17, fontWeight: '600', color: colors.primaryText },
  buttonSecondaryText: { color: colors.primary },
});
