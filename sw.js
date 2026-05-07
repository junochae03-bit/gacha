const CACHE = 'gacha-v4';
const SHELL = ['./'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    // 이전 버전 캐시 전부 삭제 (gacha-v1만 남김)
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  // API 요청은 캐시 안 함
  if (e.request.url.includes('generativelanguage.googleapis.com')) return;
  if (e.request.url.includes('fonts.googleapis.com')) return;

  // 페이지(HTML) 네비게이션은 network-first — 최신 배포 즉시 반영
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      }).catch(() =>
        caches.match(e.request).then(c => c || caches.match('./'))
      )
    );
    return;
  }

  // 그 외 정적 리소스는 cache-first
  e.respondWith(
    caches.match(e.request).then(cached => cached ||
      fetch(e.request).catch(() => caches.match('./'))
    )
  );
});
