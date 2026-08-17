// AniTube Buzz Service Worker
// Handles Monetag push notifications with updated zones

self.options = { 
  "domain": "5gvci.com", 
  "zoneId": 11594502 
};

// Only load Monetag SW in production
if (self.location.hostname !== 'localhost' && self.location.hostname !== '127.0.0.1') {
  try {
    importScripts('https://5gvci.com/act/files/service-worker.min.js?r=sw');
  } catch (e) {
    console.log('[SW] Monetag load failed:', e.message);
  }
}

// PWA caching for performance
const CACHE_NAME = 'anitube-v2';
const urlsToCache = ['/', '/favicon.svg'];

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
