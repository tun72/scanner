const broadcastId = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

self.addEventListener('push', event => {
  let body = 'Scanner မှ အသိပေးချက် ရောက်လာပါတယ်။';
  let title = 'Scanner';
  let id;
  try {
    const message = event.data?.json();
    if (typeof message?.body === 'string' && message.body) body = message.body;
    if (typeof message?.id === 'string' && broadcastId.test(message.id) && typeof message.title === 'string' && message.title) {
      id = message.id;
      title = message.title;
    }
  } catch {
    // Every push still shows a visible notification.
  }
  event.waitUntil(self.registration.showNotification(title,{
    body, icon: '/app-icon-192.png',lang: 'my-MM',
    ...(id ? { tag: id,data: { broadcast: true } } : {}),
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const destination = event.notification.data?.broadcast ? '/notifications' : '/';
    const windows = await self.clients.matchAll({ type: 'window',includeUncontrolled: true });
    for (const window of windows) {
      const url = new URL(window.url);
      if (url.origin === self.location.origin && !/^\/admin(?:\/|$)/.test(url.pathname)) {
        const target = !event.notification.data?.broadcast || url.pathname === destination ? window : await window.navigate(destination).catch(() => null);
        if (target) return target.focus();
      }
    }
    return self.clients.openWindow(destination);
  })());
});
