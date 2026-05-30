const CACHE_NAME='vr-lab-v2';
const STATIC_ASSETS=['index.html','app.js','style.css','manifest.json','icon.svg'];

self.addEventListener('install',e=>{
  e.waitUntil(caches.open(CACHE_NAME).then(c=>c.addAll(STATIC_ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate',e=>{
  e.waitUntil(
    caches.keys().then(keys=>Promise.all(
      keys.filter(k=>k!==CACHE_NAME).map(k=>caches.delete(k))
    ))
  );
  self.clients.claim();
});

self.addEventListener('fetch',e=>{
  const url=e.request.url;
  let parsed;
  try{parsed=new URL(url);}catch(err){return;}

  // Never intercept font requests
  if(parsed.hostname==='fonts.googleapis.com'||parsed.hostname==='fonts.gstatic.com')return;

  // Pass through ALL external requests (workers, analytics, etc.)
  if(parsed.origin!==self.location.origin){
    e.respondWith(fetch(e.request));
    return;
  }

  // Cache-first for local static assets (GET only)
  if(e.request.method==='GET'){
    e.respondWith(
      fetch(e.request).then(res=>{
        if(res&&res.status===200){
          const clone=res.clone();
          caches.open(CACHE_NAME).then(c=>c.put(e.request,clone));
        }
        return res;
      }).catch(()=>caches.match(e.request))
    );
  }
});
