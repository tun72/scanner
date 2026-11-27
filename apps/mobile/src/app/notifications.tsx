import { AnnouncementPageSchema, type Announcement } from '@food-scanner/contracts';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, Text } from 'react-native';
import { accountRequest } from '../account/session.ts';
import { shared } from '../theme.ts';
import { GlassBackground, GlassCard } from '../ui/glass.tsx';

const time = new Intl.DateTimeFormat('my-MM',{
  timeZone: 'Asia/Yangon',dateStyle: 'medium',timeStyle: 'short',
});
const path = '/v1/announcements';

export default function Notifications() {
  const [items,setItems] = useState<Announcement[]>([]);
  const [next,setNext] = useState<string | null>(null);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState(false);
  const [refresh,setRefresh] = useState(0);
  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true);
    setError(false);
    void accountRequest(path).then(async reply => AnnouncementPageSchema.parse(await reply.json())).then(page => {
      if (active) { setItems(page.items); setNext(page.next); }
    }).catch(() => { if (active) setError(true); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  },[refresh]));

  const loadMore = async () => {
    if (!next || loading) return;
    setLoading(true);
    setError(false);
    try {
      const reply = await accountRequest(path + '?after=' + encodeURIComponent(next));
      const page = AnnouncementPageSchema.parse(await reply.json());
      setItems(current => [...current,...page.items.filter(item => !current.some(saved => saved.id === item.id))]);
      setNext(page.next);
    } catch { setError(true); }
    finally { setLoading(false); }
  };

  return <GlassBackground><ScrollView contentContainerStyle={shared.screen}>
    {loading && <Text style={shared.muted} accessibilityLiveRegion="polite">အသိပေးချက်များ ဖွင့်နေပါတယ်…</Text>}
    {error && <>
      <Text style={shared.muted} accessibilityRole="alert">အသိပေးချက်များကို ဖွင့်လို့ မရသေးပါ။</Text>
      <Pressable style={shared.button} accessibilityRole="button" onPress={() => setRefresh(value => value + 1)}>
        <Text style={shared.buttonText}>ပြန်ကြိုးစားရန်</Text>
      </Pressable>
    </>}
    {!loading && !error && !items.length && <Text style={shared.muted}>အသိပေးချက် မရှိသေးပါ။</Text>}
    {items.map(item => <GlassCard key={item.id}>
      <Text style={shared.heading} accessibilityRole="header">{item.title}</Text>
      <Text style={shared.body}>{item.body}</Text>
      <Text style={shared.muted}>{time.format(new Date(item.publishedAt))}</Text>
    </GlassCard>)}
    {next && <Pressable style={[shared.button,shared.buttonSecondary]} accessibilityRole="button" disabled={loading} onPress={() => void loadMore()}>
      <Text style={[shared.buttonText,shared.buttonSecondaryText]}>ထပ်ကြည့်ရန်</Text>
    </Pressable>}
  </ScrollView></GlassBackground>;
}
