const CACHE = 'gacha-v5';
const SHELL = ['./'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    // 이전 버전 캐시 전부 삭제 (현재 CACHE만 남김)
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// 클라이언트에 새 버전 알림 (페치한 응답이 캐시본과 다를 때만)
async function notifyNewVersion(){
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  clients.forEach(c => c.postMessage({ type: 'NEW_VERSION', cache: CACHE }));
}

self.addEventListener('fetch', e => {
  // API 요청은 캐시 안 함
  if (e.request.url.includes('generativelanguage.googleapis.com')) return;
  if (e.request.url.includes('fonts.googleapis.com')) return;

  // 페이지(HTML) 네비게이션은 stale-while-revalidate:
  // 1) 캐시본을 즉시 반환 (빠른 첫 페인트)
  // 2) 백그라운드로 네트워크 페치 → 새 응답이 캐시본과 다르면 알림
  if (e.request.mode === 'navigate') {
    e.respondWith((async () => {
      const cached = await caches.match(e.request);
      const networkPromise = fetch(e.request).then(async res => {
        if (res && res.ok) {
          const clone = res.clone();
          const c = await caches.open(CACHE);
          await c.put(e.request, clone);
          // 캐시본과 비교해 다르면 클라이언트에 알림
          if (cached) {
            try {
              const oldText = await cached.clone().text();
              const newText = await res.clone().text();
              if (oldText !== newText) await notifyNewVersion();
            } catch(_){}
          }
        }
        return res;
      }).catch(() => cached || caches.match('./'));
      return cached || networkPromise;
    })());
    return;
  }

  // 그 외 정적 리소스는 cache-first
  e.respondWith(
    caches.match(e.request).then(cached => cached ||
      fetch(e.request).catch(() => caches.match('./'))
    )
  );
});

// 클라이언트에서 SKIP_WAITING 메시지 받으면 즉시 활성화
self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
