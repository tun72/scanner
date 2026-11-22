import { Alert, Platform } from 'react-native';

export function confirmDelete(title: string, message: string, label: string, remove: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) remove();
    return;
  }
  Alert.alert(title, message, [
    { text: 'မလုပ်တော့ပါ', style: 'cancel' },
    { text: label, style: 'destructive', onPress: remove },
  ]);
}
