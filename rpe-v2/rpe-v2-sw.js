const CACHE="ranova-rpe-v2-shell-v1";
const CORE=[
  "./",
  "./index.html",
  "./app.js",
  "./config.js",
  "./design-system.css",
  "./customer-icon.svg",
  "./customer-app.webmanifest",
  "./admin.html",
  "./admin.js",
  "./admin-icon.svg",
  "./admin-app.webmanifest"
];

self.addEventListener("install",event=>{
  event.waitUntil(
    caches.open(CACHE).then(cache=>cache.addAll(CORE)).catch(()=>{})
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(
      keys.filter(k=>k.startsWith("ranova-")&&k!==CACHE).map(k=>caches.delete(k))
    )).then(()=>self.clients.claim())
  );
});

async function networkFirst(request){
  try{
    const fresh=await fetch(request,{cache:"no-store"});
    if(fresh&&fresh.ok){
      const cache=await caches.open(CACHE);
      cache.put(request,fresh.clone()).catch(()=>{});
    }
    return fresh;
  }catch(err){
    const cached=await caches.match(request);
    if(cached)return cached;
    if(request.mode==="navigate"){
      const fallback=await caches.match("./index.html");
      if(fallback)return fallback;
    }
    throw err;
  }
}

self.addEventListener("fetch",event=>{
  const req=event.request;
  if(req.method!=="GET")return;
  const url=new URL(req.url);
  if(url.origin!==location.origin)return;
  if(!url.pathname.startsWith("/appliances/rpe-v2/"))return;
  event.respondWith(networkFirst(req));
});

self.addEventListener("message",event=>{
  if(event.data&&event.data.type==="SKIP_WAITING")self.skipWaiting();
});