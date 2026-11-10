/* RANOVA opt-in immersive product gallery. Never intercept product-card navigation. */
(() => {
 "use strict";
 const $=id=>document.getElementById(id);
 const api=()=>window.ranovaProductViewerApi;
 const esc=value=>String(value??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
 let observer=null,activeId="",generation=0;
 const photos=p=>[...new Set([p?.primary_image_url,...(Array.isArray(p?.image_urls)?p.image_urls:[])].filter(v=>typeof v==="string"&&/^https?:\/\//i.test(v)))];
 const all=()=>Array.isArray(api()?.products())?api().products():[];
 const price=p=>p.price==null?"Ask for price":api()?.formatPrice(p)||String(p.price);
 function stop(){
  generation++;
  observer?.disconnect();observer=null;activeId="";
  $("rnvProductFeed")?.remove();
  const panel=$("marketProductPanel");
  panel?.classList.remove("rnv-feed-mode");
  panel?.querySelector(".mpd-main")?.classList.remove("rnv-details-open");
  delete panel?.dataset.feedSeed;
 }
 function display(p){
  if(!p||String(p.id)===activeId)return;
  activeId=String(p.id);
  api()?.sync(p);
  const store=api()?.stores()?.find(s=>String(s.id)===String(p.store_id));
  const label=$("rnvFeedSeller");if(label)label.textContent=store?.store_name||"RANOVA seller";
 }
 function item(p,i){
  const urls=photos(p);
  return '<article class="rnv-feed-item" data-feed-id="'+esc(p.id)+'" aria-label="'+esc(p.name||"Product")+'">'+
   '<div class="rnv-feed-photos" data-photo-index="0">'+(urls.length?urls.map((url,j)=>'<div class="rnv-feed-photo"><img src="'+esc(url)+'" alt="'+esc(p.name||"Product")+' image '+(j+1)+'" loading="'+(i===0&&j===0?"eager":"lazy")+'"></div>').join(""):'<div class="rnv-feed-photo rnv-empty">Product image unavailable</div>')+'</div>'+
   '<div class="rnv-feed-top"><span>RANOVA</span><span class="rnv-photo-counter">1 / '+Math.max(1,urls.length)+'</span></div>'+
   '<div class="rnv-feed-info"><strong>'+esc(price(p))+'</strong><h2>'+esc(p.name||"Product")+'</h2><small>'+esc(p.category||"Marketplace")+'</small><button type="button" class="rnv-feed-detail">Details &amp; quantity</button></div></article>';
 }
 function open(){
  const panel=$("marketProductPanel"),p=api()?.current();
  if(!panel?.classList.contains("active")||!p)return;
  stop();
  const peers=all().filter(x=>x&&String(x.id)!==String(p.id));
  const cat=String(p.category||"").toLowerCase();
  const chosen=[p,...peers.filter(x=>cat&&String(x.category||"").toLowerCase()===cat),...peers.filter(x=>!cat||String(x.category||"").toLowerCase()!==cat)].slice(0,30);
  const feed=document.createElement("div");feed.id="rnvProductFeed";feed.className="rnv-product-feed";
  feed.innerHTML=chosen.map(item).join("");
  panel.querySelector(".mpd-head")?.insertAdjacentElement("afterend",feed);
  panel.classList.add("rnv-feed-mode");panel.dataset.feedSeed=String(p.id);
  const seller=$("rnvFeedSeller")||document.createElement("span");seller.id="rnvFeedSeller";seller.className="rnv-feed-seller";
  if(!seller.isConnected)panel.querySelector(".mpd-actions")?.prepend(seller);
  display(p);
  const session=generation;
  observer=new IntersectionObserver(entries=>{
   if(session!==generation)return;
   const top=entries.filter(x=>x.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
   if(top&&top.intersectionRatio>=0.5){const found=chosen.find(x=>String(x.id)===top.target.dataset.feedId);if(found)display(found);}
  },{root:feed,threshold:[0.5,0.75]});
  feed.querySelectorAll(".rnv-feed-item").forEach(x=>observer.observe(x));
  feed.addEventListener("scroll",()=>{
   const i=Math.max(0,Math.min(chosen.length-1,Math.round(feed.scrollTop/Math.max(1,feed.clientHeight))));
   if(chosen[i])display(chosen[i]);
  },{passive:true});
  feed.addEventListener("click",e=>{
   if(e.target.closest(".rnv-feed-detail")){
    const details=panel.querySelector(".mpd-main");
    details?.classList.toggle("rnv-details-open");
   }
  });
  feed.querySelectorAll(".rnv-feed-photos").forEach(track=>track.addEventListener("scroll",()=>{
   const i=Math.max(0,Math.min(track.children.length-1,Math.round(track.scrollLeft/Math.max(1,track.clientWidth))));
   track.dataset.photoIndex=String(i);
   const counter=track.parentElement.querySelector(".rnv-photo-counter");
   if(counter)counter.textContent=(i+1)+" / "+Math.max(1,track.children.length);
  },{passive:true}));
 }
 function init(){
  const panel=$("marketProductPanel");
  if(!panel)return;
  $("marketProductImmersive")?.addEventListener("click",()=>panel.classList.contains("rnv-feed-mode")?stop():open());
  $("marketProductBack")?.addEventListener("click",()=>{if(panel.classList.contains("rnv-feed-mode"))stop();});
  new MutationObserver(()=>{if(!panel.classList.contains("active")&&panel.classList.contains("rnv-feed-mode"))stop();}).observe(panel,{attributes:true,attributeFilter:["class"]});
  document.addEventListener("visibilitychange",()=>{if(document.hidden&&panel.classList.contains("rnv-feed-mode"))stop();});
 }
 if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
