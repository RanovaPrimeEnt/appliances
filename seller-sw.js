const CACHE="ranova-seller-shell-v9";
const CORE=[
  "./all/seller-center.html",
  "./all/seller-dashboard.html",
  "./all/seller-admin-messages.html",
  "./all/seller-status.html",
  "./all/seller-icon.svg",
  "./all/seller-icon-v2.svg",
  "./all/seller-app.webmanifest",
  "./all/seller-pwa.js"
];

self.addEventListener("install",event=>{
  event.waitUntil(
    caches.open(CACHE).then(cache=>cache.addAll(CORE)).catch(()=>{})
      .then(()=>self.skipWaiting())
  );
});
self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith("ranova-seller-shell-")&&k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});
async function networkFirst(req){
  try{
    const fresh=await fetch(req,{cache:"no-store"});
    if(fresh&&fresh.ok){
      const cache=await caches.open(CACHE);
      cache.put(req,fresh.clone()).catch(()=>{});
    }
    return fresh;
  }catch(e){
    const cached=await caches.match(req);
    if(cached)return cached;
    throw e;
  }
}
self.addEventListener("fetch",event=>{
  if(event.request.method!=="GET")return;
  const url=new URL(event.request.url);
  if(url.origin!==location.origin)return;
  if(!url.pathname.startsWith("/appliances/all/"))return;
  event.respondWith(networkFirst(event.request));
});
self.addEventListener("message",event=>{
  if(event.data&&event.data.type==="SKIP_WAITING")self.skipWaiting();
});