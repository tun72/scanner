import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';
import { accountRequest, signOut } from '../account/session.ts';
import { colors, shared } from '../theme.ts';
import { GlassBackground, GlassCard } from '../ui/glass.tsx';

export default function SetPassword() {
  const router = useRouter();
  const [token,setToken] = useState('');
  const [password,setPassword] = useState('');
  const [confirm,setConfirm] = useState('');
  const [saving,setSaving] = useState(false);
  const [done,setDone] = useState(false);
  const [error,setError] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined' && window.location?.hash) {
      const value = window.location.hash.slice(1);
      if (/^[A-Za-z0-9_-]{43}$/.test(value)) setToken(value);
      window.history.replaceState(window.history.state,'',window.location.pathname);
    }
  },[]);

  async function save() {
    if (password !== confirm) { setError('စကားဝှက်နှစ်ခု တူအောင် ပြန်ရိုက်ပါ။'); return; }
    setSaving(true);
    setError('');
    try {
      await accountRequest('/v1/credentials/password',{ method: 'POST',body: JSON.stringify({ token,password }) },null);
      setToken('');
      setPassword('');
      setConfirm('');
      setDone(true);
      await signOut().catch(() => undefined);
    } catch {
      setError('စကားဝှက် သတ်မှတ်၍ မရပါ။ လင့်ခ်သက်တမ်း ကုန်သွားပါက လင့်ခ်အသစ် တောင်းပါ။');
    } finally { setSaving(false); }
  }

  return <GlassBackground><ScrollView contentContainerStyle={shared.screen}><GlassCard>
    <Text style={shared.heading} accessibilityRole="header">စကားဝှက် သတ်မှတ်ရန်</Text>
    {done ? <>
      <Text style={shared.body}>စကားဝှက် သတ်မှတ်ပြီးပါပြီ။</Text>
      <Pressable accessibilityRole="button" style={shared.button} onPress={() => router.replace('/login')}>
        <Text style={shared.buttonText}>အကောင့်ဝင်ရန်</Text>
      </Pressable>
    </> : !token ? <Text style={shared.body}>စကားဝှက် သတ်မှတ်ဖို့ လင့်ခ်အသစ် တောင်းပါ။</Text> : <>
      <Text style={shared.muted}>အနည်းဆုံး စာလုံး ၁၂ လုံး သုံးပါ။</Text>
      <TextInput accessibilityLabel="စကားဝှက်အသစ်" placeholder="စကားဝှက်အသစ်" secureTextEntry autoComplete="new-password"
        value={password} onChangeText={setPassword} maxLength={128} style={styles.input} />
      <TextInput accessibilityLabel="စကားဝှက် ထပ်ရိုက်ရန်" placeholder="စကားဝှက် ထပ်ရိုက်ရန်" secureTextEntry
        value={confirm} onChangeText={setConfirm} maxLength={128} style={styles.input} />
      {error && <Text style={shared.muted} accessibilityRole="alert">{error}</Text>}
      <Pressable accessibilityRole="button" style={shared.button} disabled={saving || password.length < 12 || !confirm} onPress={() => void save()}>
        <Text style={shared.buttonText}>{saving ? 'သိမ်းနေပါတယ်…' : 'စကားဝှက် သိမ်းရန်'}</Text>
      </Pressable>
    </>}
  </GlassCard></ScrollView></GlassBackground>;
}

const styles = StyleSheet.create({
  input: { minHeight: 48, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border,
    borderRadius: 10, color: colors.text },
});
