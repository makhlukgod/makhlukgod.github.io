// sw.js - Service Worker для офлайн-работы

const CACHE_NAME = 'podcast-player-v1';

// Файлы, которые нужно кэшировать при установке
const FILES_TO_CACHE = [
  '/',
  '/index.html',
  '/simple-player.js',
  '/manifest.json'
];

// Установка Service Worker — кэшируем основные файлы
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Установка');
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[Service Worker] Кэширование файлов');
      return cache.addAll(FILES_TO_CACHE);
    })
  );
  self.skipWaiting();
});

// Активация — удаляем старые кэши
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Активация');
  event.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          console.log('[Service Worker] Удаление старого кэша', key);
          return caches.delete(key);
        }
      }));
    })
  );
  self.clients.claim();
});

// Перехват запросов — сначала пробуем сеть, потом кэш
self.addEventListener('fetch', (event) => {
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Кэшируем успешные ответы для будущего офлайн-доступа
        if (event.request.url.includes('/api.rss2json.com') === false) {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
        }
        return response;
      })
      .catch(() => {
        // Если сеть недоступна, пробуем взять из кэша
        return caches.match(event.request);
      })
  );
});
