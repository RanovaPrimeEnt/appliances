const CACHE="ranova-rpe-v2-shell-v68";
const IMAGE_CACHE="ranova-rpe-v2-images-v1";
const CORE=[
  "../all/fonts/inter-0.woff2",
  "../all/fonts/inter-1.woff2",
  "../all/fonts/inter-2.woff2",
  "../all/fonts/inter-3.woff2",
  "../all/fonts/inter-4.woff2",
  "../all/fonts/inter-5.woff2",
  "../all/fonts/inter-6.woff2",
  "../all/ranova-typography.css?v=20260930-7",
  "../all/ranova-typography.js?v=20260930-5",
  "./",
  "./index.html",
  "./offline-marketplace.json",
  "./app.js?v=20261003-v3a68",
  "./config.js",
  "./design-system.css",
  "./customer-icon.svg",
  "./customer-icon-v2.svg",
  "./customer-icon-192.svg",
  "./customer-icon-512.svg",
  "./customer-icon-maskable.svg",
  "./customer-app.webmanifest",
  "./customer-pwa.js?v=20261003-v3a68",
  "./customer-pro.js?v=20261003-v3a68",
  "./customer-pro.css?v=20261003-v3a68",
  "./report-store.html",
  "./ranova-prime-store.html",
  "./admin.html",
  "./admin.js",
  "./admin-icon.svg",
  "./admin-icon-v2.svg",
  "./admin-app.webmanifest"
];

self.addEventListener("install",event=>{
  event.waitUntil((async()=>{
    try{
      const cache=await caches.open(CACHE);
      await cache.addAll(CORE.map(url=>new Request(url,{cache:"reload"})));
      const snap=await (await cache.match("./offline-marketplace.json")).json();
      const urls=[...new Set([
        ...(snap.products||[]).map(p=>p.primary_image_url),
        ...(snap.stores||[]).flatMap(s=>[s.logo_url,s.banner_url])
      ].filter(Boolean))].slice(0,140);
      const imageCache=await caches.open(IMAGE_CACHE);
      for(let i=0;i<urls.length;i+=8){
        await Promise.allSettled(urls.slice(i,i+8).map(async url=>{
          const req=new Request(url,{mode:new URL(url,self.location.href).origin===self.location.origin?"same-origin":"no-cors",cache:"reload"});
          const res=await fetch(req);
          if(res&&(res.ok||res.type==="opaque"))await imageCache.put(req,res.clone());
        }));
      }
    }catch{}
    await self.skipWaiting();
  })());
});

self.addEventListener("activate",event=>{
  event.waitUntil(
    caches.keys().then(keys=>Promise.all(
      keys.filter(k=>k.startsWith("ranova-")&&k!==CACHE&&k!==IMAGE_CACHE).map(k=>caches.delete(k))
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

async function imageCacheFirst(request){
  const cache=await caches.open(IMAGE_CACHE);
  const hit=await cache.match(request);
  if(hit){
    if(self.navigator?.onLine!==false)fetch(request).then(r=>{if(r&&r.ok||r&&r.type==="opaque")cache.put(request,r.clone()).catch(()=>{})}).catch(()=>{});
    return hit;
  }
  try{
    const fresh=await fetch(request);
    if(fresh&&(fresh.ok||fresh.type==="opaque"))cache.put(request,fresh.clone()).catch(()=>{});
    return fresh;
  }catch(err){
    return new Response('<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="100%" height="100%" fill="%23f1f1f1"/><path d="M110 250l55-70 42 46 34-39 49 63z" fill="%23c4cbc8"/><circle cx="165" cy="130" r="22" fill="%23c4cbc8"/></svg>',{headers:{"Content-Type":"image/svg+xml"}});
  }
}
self.addEventListener("fetch",event=>{
  const req=event.request;
  if(req.method!=="GET")return;
  const url=new URL(req.url);
  if(req.destination==="image"){event.respondWith(imageCacheFirst(req));return}
  if(url.origin!==location.origin)return;
  if(!url.pathname.startsWith("/appliances/rpe-v2/")&&!url.pathname.startsWith("/appliances/all/fonts/")&&!url.pathname.startsWith("/appliances/all/ranova-typography."))return;
  event.respondWith(networkFirst(req));
});

self.addEventListener("message",event=>{
  if(event.data&&event.data.type==="SKIP_WAITING"){self.skipWaiting();return}
  if(event.data&&event.data.type==="CACHE_MARKET_IMAGES"&&Array.isArray(event.data.urls)){
    const urls=[...new Set(event.data.urls.filter(x=>/^https?:\/\//i.test(String(x))))].slice(0,120);
    event.waitUntil((async()=>{
      const cache=await caches.open(IMAGE_CACHE);
      for(let i=0;i<urls.length;i+=8){
        await Promise.allSettled(urls.slice(i,i+8).map(async url=>{
          try{
            const req=new Request(url,{mode:"no-cors",cache:"reload"});
            const res=await fetch(req);
            if(res&&(res.ok||res.type==="opaque"))await cache.put(req,res.clone());
          }catch{}
        }));
      }
    })());
  }
});