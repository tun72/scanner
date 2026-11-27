import { useEffect, useState } from 'react';
import { Pressable, Text } from 'react-native';
import { accountRequest } from '../account/session.ts';
import { shared } from '../theme.ts';
import { GlassCard } from '../ui/glass.tsx';

export function NotificationTest() {
  const [setup, setSetup] = useState<{ registration: ServiceWorkerRegistration; publicKey: string }>();
  const [enabled, setEnabled] = useState(false);
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
      const subscription = await registration.pushManager.getSubscription();
      const status = subscription && await accountRequest('/v1/push/subscription/status', {
        method: 'POST', body: JSON.stringify({ endpoint: subscription.endpoint }),
      });
      const isEnabled = status && (await status.json()).enabled === true;
      if (active) {
        setEnabled(Boolean(isEnabled));
        setSetup({ registration, publicKey });
      }
    })().catch(() => undefined);
    return () => { active = false; };
  }, []);

  async function toggle() {
    if (!setup || sending) return;
    setSending(true);
    setMessage('');
    try {
      const { pushManager } = setup.registration;
      if (enabled) {
        const subscription = await pushManager.getSubscription();
        if (subscription) await accountRequest('/v1/push/subscription', {
          method: 'DELETE', body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
      } else {
        const subscription = await pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: setup.publicKey });
        await accountRequest('/v1/push/subscription', { method: 'PUT', body: JSON.stringify(subscription.toJSON()) });
      }
      setEnabled(!enabled);
    } catch {
      setMessage(Notification.permission === 'denied'
        ? 'အသိပေးချက်ကို ဖုန်း သို့မဟုတ် ဘရောက်ဇာ ဆက်တင်မှာ ခွင့်ပြုပေးပါ။'
        : 'အသိပေးချက် ဆက်တင်ကို ပြောင်းလို့ မရပါ။ ခဏနေ ပြန်စမ်းပါ။');
    } finally {
      setSending(false);
    }
  }

  if (!setup) return null;
  return (
    <GlassCard>
      <Text style={shared.heading}>ဖုန်း အသိပေးချက်</Text>
      <Text style={shared.muted}>Scanner ရဲ့ ကြေညာချက်တွေနဲ့ Sobo ရဲ့ နေ့စဉ်စာတိုတွေကို ဖုန်းမှာ ရနိုင်ပါတယ်။</Text>
      <Pressable style={[shared.button, shared.buttonSecondary, sending && shared.buttonDisabled]}
        accessibilityRole="button" disabled={sending} onPress={() => void toggle()}>
        <Text style={[shared.buttonText, shared.buttonSecondaryText]}>
          {sending ? 'သိမ်းနေပါတယ်…' : enabled ? 'အသိပေးချက် ပိတ်ရန်' : 'အသိပေးချက် ဖွင့်ရန်'}
        </Text>
      </Pressable>
      {message && <Text style={shared.muted} accessibilityLiveRegion="polite">{message}</Text>}
    </GlassCard>
  );
}
