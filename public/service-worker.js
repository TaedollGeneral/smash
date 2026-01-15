const CACHE_NAME = 'uos-smash-v20260116-FINAL-FIX'; // 버전을 확실하게 바꿈
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/manifest.json' // 아이콘 등 매니페스트 파일도 캐싱
];

// 1. 설치 (Install): 새 파일 내려받기 + 즉시 대기열 건너뛰기
self.addEventListener('install', (event) => {
  // [중요] skipWaiting: "대기하지 말고 즉시 작동해라!"
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('캐시 시작:', CACHE_NAME);
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

// 2. 활성화 (Activate): 옛날 캐시 싹 다 삭제하기 (청소부)
self.addEventListener('activate', (event) => {
  const cacheWhitelist = [CACHE_NAME];

  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // 현재 내 이름(uos-smash-v...FIX)이 아닌 건 다 지워버려!
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('옛날 캐시 삭제:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => {
      // [중요] clients.claim: "새로고침 안 해도 내가 당장 제어한다!"
      return self.clients.claim();
    })
  );
});

// 3. 요청 가로채기 (Fetch): 캐시 우선, 없으면 네트워크
self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      // 캐시에 있으면 그거 주고, 없으면 서버 가서 가져와라
      return response || fetch(event.request);
    })
  );
});