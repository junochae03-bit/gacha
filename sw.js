const CACHE = 'gacha-v14';
const SHELL = ['./'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

async function notifyNewVersion(){
  const clients = await self.clients.matchAll({ includeUncontrolled: true });
  clients.forEach(c => c.postMessage({ type: 'NEW_VERSION', cache: CACHE }));
}

// network-first with timeout — 빠른 네트워크면 항상 최신, 느리거나 오프라인이면 캐시 폴백
function networkFirst(req, timeoutMs){
  return new Promise(resolve => {
    let done = false;
    const timer = setTimeout(async () => {
      if (done) return;
      done = true;
      const cached = await caches.match(req);
      resolve(cached || caches.match('./'));
    }, timeoutMs);
    fetch(req).then(async res => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (res && res.ok) {
        try {
          const cacheRef = await caches.open(CACHE);
          // 응답 본문 1회 클론 (cache.put + 비교용 1회)
          const cachedPrev = await caches.match(req);
          await cacheRef.put(req, res.clone());
          // 캐시본과 다르면 클라이언트에 알림 (방금 푸시된 본은 이미 사용자에게 가지만, 다음 접속자에 신호)
          if (cachedPrev) {
            try {
              const oldText = await cachedPrev.text();
              const newText = await res.clone().text();
              if (oldText !== newText) await notifyNewVersion();
            } catch(_) {}
          }
        } catch(_) {}
      }
      resolve(res);
    }).catch(async () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      const cached = await caches.match(req);
      resolve(cached || caches.match('./'));
    });
  });
}

self.addEventListener('fetch', e => {
  if (e.request.url.includes('generativelanguage.googleapis.com')) return;
  if (e.request.url.includes('fonts.googleapis.com')) return;

  // 페이지(HTML) 네비게이션은 network-first(1.5s timeout) → 첫 로드부터 항상 최신
  if (e.request.mode === 'navigate') {
    e.respondWith(networkFirst(e.request, 1500));
    return;
  }

  // 그 외 정적 리소스는 cache-first
  e.respondWith(
    caches.match(e.request).then(cached => cached ||
      fetch(e.request).catch(() => caches.match('./'))
    )
  );
});

self.addEventListener('message', e => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
