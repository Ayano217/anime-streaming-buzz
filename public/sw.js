// AniTube Buzz Service Worker
// Handles Monetag push notifications properly

self.options = { 
  "domain": "quge5.com", 
  "zoneId": 261500 
};

// Only load Monetag SW if in production
if (self.location.hostname !== 'localhost' && self.location.hostname !== '127.0.0.1') {
  try {
    importScripts('https://quge5.com/act/files/service-worker.min.js?r=sw');
  } catch (e) {
    console.log('[SW] Monetag load failed:', e.message);
  }
}

// Basic PWA caching for performance
const CACHE_NAME = 'anitube-v1';
const urlsToCache = [
  '/',
  '/favicon.svg',
];

self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(urlsToCache).catch(function() {});
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.filter(function(name) {
          return name !== CACHE_NAME;
        }).map(function(name) {
          return caches.delete(name);
        })
      );
    })
  );
  self.clients.claim();
});
