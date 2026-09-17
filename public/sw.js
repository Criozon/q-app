// Минимальный service worker.
//
// Нужен ровно за одним: Chrome на Android ЗАПРЕЩАЕТ `new Notification()`
// со страницы и бросает «Illegal constructor. Use
// ServiceWorkerRegistration.showNotification() instead». Через
// регистрацию воркера уведомление показывается нормально, в том числе
// на заблокированном экране.
//
// Своего push-канала здесь нет: воркер только показывает уведомление по
// просьбе страницы и возвращает человека на вкладку по нажатию.
// Полноценный Web Push (когда страница уже выгружена) — отдельная задача,
// он требует VAPID-ключей и серверной части.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const target = event.notification.data && event.notification.data.url;
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
            // Если вкладка с очередью ещё жива — вернуть человека в неё,
            // а не открывать вторую копию.
            for (const client of clients) {
                if (!target || client.url.includes(target)) {
                    return client.focus();
                }
            }
            return self.clients.openWindow(target || '/');
        })
    );
});
