/* Sharp End Exposure — app-shell service worker.
   Keep APP_VERSION in sync with `var app_version` in index.html / index-staging.html.
   A new deploy changes this file, so browsers install a fresh worker and drop the
   old versioned cache on activate. */
var APP_VERSION = 'staging-index220';
var CACHE_NAME = 'see-shell-' + APP_VERSION;

var SHELL_URLS = [
  './',
  './index.html',
  './coach-dashboard.html',
  './manifest.json',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/carabiner.svg'
];

function isApiRequest(url){
  // Live data must never be served stale. Match Supabase host + REST/Auth/Realtime paths.
  if(/supabase\.co$/i.test(url.hostname) || /\.supabase\.co$/i.test(url.hostname)) return true;
  if(/\/rest\/v1\//.test(url.pathname) || /\/auth\/v1\//.test(url.pathname) || /\/realtime\//.test(url.pathname)) return true;
  return false;
}

function isSameOrigin(url){
  return url.origin === self.location.origin;
}

self.addEventListener('install', function(event){
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache){
      return Promise.all(SHELL_URLS.map(function(url){
        return cache.add(url).catch(function(){ /* missing optional shell file — don't fail install */ });
      }));
    }).then(function(){ return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(event){
  event.waitUntil(
    caches.keys().then(function(keys){
      return Promise.all(keys.filter(function(k){ return k !== CACHE_NAME; }).map(function(k){
        return caches.delete(k);
      }));
    }).then(function(){ return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(event){
  var req = event.request;
  if(req.method !== 'GET') return;
  var url;
  try{ url = new URL(req.url); }catch(e){ return; }
  if(isApiRequest(url)) return; // network-only — do not respondWith, do not cache
  if(/\/sw\.js$/i.test(url.pathname)) return; // let the browser fetch worker updates itself

  event.respondWith(
    fetch(req).then(function(res){
      if(res && res.ok && (isSameOrigin(url) || res.type === 'basic' || res.type === 'cors')){
        var copy = res.clone();
        caches.open(CACHE_NAME).then(function(cache){ cache.put(req, copy); }).catch(function(){});
      }
      return res;
    }).catch(function(){
      return caches.match(req).then(function(cached){
        if(cached) return cached;
        // Directory URL and index.html are the same shell.
        if(isSameOrigin(url) && (url.pathname === '/' || /\/$/.test(url.pathname) || /\/index\.html$/i.test(url.pathname))){
          return caches.match('./index.html').then(function(shell){ return shell || caches.match('./'); });
        }
        return cached;
      });
    })
  );
});
