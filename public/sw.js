// MinLab AI Office 서비스 워커: 휴대폰 알림만 다룬다(화면 캐시는 하지 않아 늘 최신 앱을 연다).
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let msg = { title: 'minoffia.', body: '내 차례가 생겼어요.', tag: 'my-turn', url: '/' };
  try {
    if (event.data) msg = { ...msg, ...event.data.json() };
  } catch {
    // 내용을 못 읽으면 기본 문구
  }
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(msg.title, {
        body: msg.body,
        tag: msg.tag,
        renotify: true,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: { url: msg.url },
      }),
      // 열려 있는 앱 화면에 바로 다시 읽으라고 알린다(v0.4.85)
      refreshClients(),
    ]),
  );
});

function refreshClients() {
  return self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) c.postMessage({ type: 'refresh' });
  });
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.location.origin) && 'focus' in c) {
          c.postMessage({ type: 'refresh' });
          // 알림의 업무 카드를 연다(v0.5.83)
          const taskId = new URL(url).searchParams.get('task');
          if (taskId) c.postMessage({ type: 'open-task', taskId });
          return c.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
