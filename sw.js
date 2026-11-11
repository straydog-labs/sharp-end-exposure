/* Sharp End Exposure — app-shell service worker.
   Keep APP_VERSION in sync with `var app_version` in index.html / index-staging.html.
   A new deploy changes this file, so browsers install a fresh worker and drop the
   old versioned cache on activate. */
var APP_VERSION = 'index329';
var CACHE_NAME = 'see-shell-' + APP_VERSION;
var SEE_VAPID_PUBLIC_KEY = 'BP6DrkZmQspCullBBbaIlg41Z7W_AXFbefEAksCLdkdlkHBUPiJHP5YyKU7BXFBKU0sK1tJUU4v88zZtYJDRmd4';

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

function urlBase64ToUint8Array(base64String){
  var padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  var base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  var raw = atob(base64);
  var output = new Uint8Array(raw.length);
  for(var i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
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

var APP_SHELL_TIMEOUT_MS = 3000;

function isAppShellRequest(req, url){
  if(req.mode === 'navigate') return true;
  if(!isSameOrigin(url)) return false;
  var path = url.pathname || '';
  if(/\/(?:index|index-staging)\.html$/i.test(path)) return true;
  if(/\/sw\.js$/i.test(path)) return true;
  if(/\/js\/.+\.js$/i.test(path)) return true;
  if(/\/(?:version\.(?:json|txt|js)|app_version(?:\.[a-z0-9]+)?)$/i.test(path)) return true;
  if(path === '/' || /\/$/.test(path)) return true;
  return false;
}

function isStaticAsset(url){
  return /\.(?:png|jpe?g|gif|webp|svg|ico|woff2?|ttf|otf|eot)$/i.test(url.pathname || '');
}

function putCache(req, res){
  if(!res || !res.ok) return;
  var copy;
  try{ copy = res.clone(); }catch(e){ return; }
  caches.open(CACHE_NAME).then(function(cache){ return cache.put(req, copy); }).catch(function(){});
}

function fromCache(req, url){
  return caches.match(req).then(function(cached){
    if(cached) return cached;
    if(isSameOrigin(url) && (url.pathname === '/' || /\/$/.test(url.pathname) || /\/index\.html$/i.test(url.pathname))){
      return caches.match('./index.html').then(function(shell){ return shell || caches.match('./'); });
    }
    return null;
  });
}

function networkFirstApp(req, url){
  var timeoutId;
  var network = fetch(req, { cache: 'no-cache' }).then(function(res){
    putCache(req, res);
    return res;
  });
  var timeout = new Promise(function(resolve){
    timeoutId = setTimeout(function(){ resolve(null); }, APP_SHELL_TIMEOUT_MS);
  });
  return Promise.race([
    network.then(function(res){ return { kind: 'net', res: res }; }).catch(function(){ return { kind: 'err' }; }),
    timeout.then(function(){ return { kind: 'timeout' }; })
  ]).then(function(winner){
    if(timeoutId) clearTimeout(timeoutId);
    if(winner.kind === 'net' && winner.res) return winner.res;
    return fromCache(req, url).then(function(cached){
      if(cached) return cached;
      if(winner.kind === 'timeout') return network.catch(function(){ return Response.error(); });
      return Response.error();
    });
  });
}

function cacheFirstStatic(req){
  return caches.match(req).then(function(cached){
    var refresh = fetch(req).then(function(res){
      putCache(req, res);
      return res;
    }).catch(function(){ return cached || Response.error(); });
    return cached || refresh;
  });
}

self.addEventListener('fetch', function(event){
  var req = event.request;
  if(req.method !== 'GET') return;
  var url;
  try{ url = new URL(req.url); }catch(e){ return; }
  if(isApiRequest(url)) return; // network-only — do not respondWith, do not cache
  if(isAppShellRequest(req, url)){
    event.respondWith(networkFirstApp(req, url));
    return;
  }
  if(isStaticAsset(url)){
    event.respondWith(cacheFirstStatic(req));
    return;
  }
  if(!isSameOrigin(url)) return;
  event.respondWith(
    fetch(req, { cache: 'no-cache' }).then(function(res){
      putCache(req, res);
      return res;
    }).catch(function(){
      return fromCache(req, url).then(function(cached){ return cached || Response.error(); });
    })
  );
});

self.addEventListener('push', function(event){
  event.waitUntil((async function(){
    var title = 'Sharp End Exposure';
    var body = 'New message from your coach';
    var url = './index.html?open=train-chat';
    try{
      if(event.data){
        var parsed = event.data.json();
        if(parsed && typeof parsed === 'object'){
          if(parsed.title) title = String(parsed.title);
          if(parsed.body) body = String(parsed.body);
          if(parsed.url) url = String(parsed.url);
        }
      }
    }catch(e){
      try{ if(event.data) body = event.data.text() || body; }catch(e2){}
    }
    try{
      if('setAppBadge' in navigator) await navigator.setAppBadge(1);
    }catch(e){ /* badge API unsupported — ignore */ }
    try{
      var live = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      live.forEach(function(client){
        try{ client.postMessage({ type: 'coach-message-received' }); }catch(e3){}
      });
    }catch(e4){}
    return self.registration.showNotification(title, {
      body: body,
      icon: './icons/icon-192.png',
      badge: './icons/icon-192.png',
      data: { url: url }
    });
  })());
});

self.addEventListener('notificationclick', function(event){
  event.notification.close();
  var target = (event.notification && event.notification.data && event.notification.data.url)
    || './index.html?open=train-chat';
  event.waitUntil((async function(){
    try{ if('clearAppBadge' in navigator) await navigator.clearAppBadge(); }catch(e0){ /* ignore */ }
    var dest;
    try{ dest = new URL(target, self.registration.scope).href; }
    catch(e){ dest = target; }
    var list = [];
    try{ list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true }); }
    catch(e2){ list = []; }
    for(var i = 0; i < list.length; i++){
      var client = list[i];
      if(!client) continue;
      try{ client.postMessage({ type: 'open-screen', screen: 'screen-train-chat' }); }catch(e3){}
      if(typeof client.focus === 'function') return client.focus();
    }
    if(self.clients && typeof self.clients.openWindow === 'function'){
      return self.clients.openWindow(dest);
    }
  })());
});

self.addEventListener('pushsubscriptionchange', function(event){
  event.waitUntil((async function(){
    var sub = event.newSubscription;
    if(!sub){
      try{
        sub = await self.registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(SEE_VAPID_PUBLIC_KEY)
        });
      }catch(e){ sub = null; }
    }
    var list = [];
    try{ list = await self.clients.matchAll({ type: 'window', includeUncontrolled: true }); }
    catch(e){ list = []; }
    var payload = {
      type: 'pushsubscriptionchange',
      oldEndpoint: event.oldSubscription && event.oldSubscription.endpoint,
      newEndpoint: sub && sub.endpoint
    };
    list.forEach(function(client){
      try{ client.postMessage(payload); }catch(e2){}
    });
  })());
});
