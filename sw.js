// Offline support for this app: keeps the app itself on the phone, so it opens without internet. Your checklist progress and
// notes are saved on the phone by the app; nothing passes through here.
const PREFIX = "ff7r-guide-", SHELL = PREFIX + "shell-v8", FONTS = PREFIX + "fonts-v1";

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(["./", "./index.html"].map(u => new Request(u, { cache:"reload" })))).then(() => self.skipWaiting()));
});
// only this app's old caches: other apps on this site keep theirs
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k.startsWith(PREFIX) && k !== SHELL && k !== FONTS).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// the page: the newest copy when online, the saved copy when offline or when the network is too slow (3.5 s)
function page(req){
  return new Promise(resolve => {
    let done = false;
    const saved = () => caches.match("./index.html", { cacheName:SHELL });
    const finish = r => { if (!done && r){ done = true; resolve(r); } };
    const timer = setTimeout(() => saved().then(finish), 3500);
    fetch(req).then(res => {
      if (res.ok){ const copy = res.clone(); caches.open(SHELL).then(c => c.put("./index.html", copy)); }
      clearTimeout(timer); finish(res);
    }).catch(() => { clearTimeout(timer); saved().then(r => finish(r || Response.error())); });
  });
}
// saved copy first, refreshed in the background
function fresh(req, name){
  return caches.open(name).then(c => c.match(req).then(hit => {
    const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => hit);
    return hit || net;
  }));
}

self.addEventListener("fetch", e => {
  const req = e.request; if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (req.mode === "navigate"){ e.respondWith(page(req)); return; }
  if (url.origin === location.origin){ if (url.pathname.startsWith(new URL("./", location).pathname)) e.respondWith(fresh(req, SHELL)); return; }
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) e.respondWith(fresh(req, FONTS));
});
