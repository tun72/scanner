self.addEventListener('push', event => {
  let body = 'Scanner မှ အသိပေးချက် ရောက်လာပါတယ်။';
  try {
    const message = event.data?.json();
    if (typeof message?.body === 'string' && message.body) body = message.body;
  } catch {
    // Every push still shows a visible notification.
  }
  event.waitUntil(self.registration.showNotification('Scanner', {
    body,
    icon: '/app-icon-192.png',
    lang: 'my-MM',
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (windows.length) return windows[0].focus();
    return self.clients.openWindow('/');
  })());
});
