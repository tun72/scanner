import { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { AccountRequestError, accountRequest } from '../account/session.ts';
import { shared } from '../theme.ts';
import { GlassCard } from '../ui/glass.tsx';

export function NotificationTest() {
  const [setup, setSetup] = useState<{ registration: ServiceWorkerRegistration; publicKey: string }>();
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (!window.isSecureContext || !('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return;
    let active = true;
    void (async () => {
      const response = await accountRequest('/v1/push/key');
      const { publicKey } = await response.json();
      if (typeof publicKey !== 'string' || !publicKey) return;
      await navigator.serviceWorker.register('/push-worker.js');
      const registration = await navigator.serviceWorker.ready;
      if (active) setSetup({ registration, publicKey });
    })().catch(() => undefined);
    return () => { active = false; };
  }, []);

  async function send() {
    if (!setup || sending) return;
    setSending(true);
    setMessage('');
    try {
      const subscription = await setup.registration.pushManager.subscribe({
        userVisibleOnly: true, applicationServerKey: setup.publicKey,
      });
      try {
        await accountRequest('/v1/push/test', { method: 'POST', body: JSON.stringify(subscription.toJSON()) });
        setMessage('စမ်းသပ် အသိပေးချက် ပို့ပြီးပါပြီ။');
      } catch (error) {
        if (!(error instanceof AccountRequestError) || error.status !== 410) throw error;
        await subscription.unsubscribe();
        setMessage('အသိပေးချက် ပြန်ဖွင့်ဖို့ ထပ်နှိပ်ပါ။');
      }
    } catch {
      setMessage(Notification.permission === 'denied'
        ? 'အသိပေးချက်ကို ဖုန်း သို့မဟုတ် ဘရောက်ဇာ ဆက်တင်မှာ ခွင့်ပြုပေးပါ။'
        : 'အသိပေးချက် ပို့လို့ မရပါ။ ခဏနေ ပြန်စမ်းပါ။');
    } finally {
      setSending(false);
    }
  }

  if (!setup) return null;
  return (
    <GlassCard>
      <Pressable style={[shared.button, shared.buttonSecondary, sending && shared.buttonDisabled]}
        accessibilityRole="button" disabled={sending} onPress={() => void send()}>
        <Text style={[shared.buttonText, shared.buttonSecondaryText]}>
          {sending ? 'ပို့နေပါတယ်…' : 'စမ်းသပ် အသိပေးချက် ပို့ရန်'}
        </Text>
      </Pressable>
      {message && <Text style={shared.muted} accessibilityLiveRegion="polite">{message}</Text>}
    </GlassCard>
  );
}
