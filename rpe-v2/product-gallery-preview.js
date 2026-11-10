/* RANOVA immersive vertical product viewer. Preview branch only. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const esc = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const products = () => typeof marketSellerProducts !== "undefined" && Array.isArray(marketSellerProducts) ? marketSellerProducts : [];
  const current = () => typeof marketProductCurrent !== "undefined" ? marketProductCurrent : null;
  const images = p => [...new Set([p?.primary_image_url,...(Array.isArray(p?.image_urls)?p.image_urls:[])].filter(v=>typeof v==="string" && /^https?:\/\//i.test(v)))];
  const price = p => p.price==null ? "Ask for price" : typeof money==="function" ? money(p.price,p.currency||"GHS") : String(p.price)+" "+(p.currency||"GHS");
  let activeId="", busy=false, feedObserver=null, autoplay=null, lastInteraction=0, mounting=false;
  function stop(){if(autoplay)clearInterval(autoplay);autoplay=null;if(feedObserver)feedObserver.disconnect();feedObserver=null;}
  function syncProduct(p){
    if(!p || String(current()?.id)===String(p.id))return;
    if(typeof paintMarketplaceProductDetails==="function"){
      const store=typeof marketStores!=="undefined" ? marketStores.find(s=>s.id===p.store_id)||{} : {};
      paintMarketplaceProductDetails(p,store);
    }else if(typeof marketProductCurrent!=="undefined"){marketProductCurrent=p;}
  }
  function productSet(p){
    const all=products(),cat=String(p.category||"").toLowerCase();
    const others=all.filter(x=>x && String(x.id)!==String(p.id));
    const same=others.filter(x=>cat && String(x.category||"").toLowerCase()===cat);
    const different=others.filter(x=>!same.includes(x));
    return [p,...same,...different].slice(0,30);
  }
  function item(p,i){
    const urls=images(p);
    return '<article class="rnv-feed-item" data-feed-id="'+esc(p.id)+'" aria-label="'+esc(p.name||"Product")+'">'+
      '<div class="rnv-feed-photos" data-photo-index="0">'+(urls.length?urls.map((url,j)=>'<div class="rnv-feed-photo"><img src="'+esc(url)+'" alt="'+esc((p.name||"Product")+" photo "+(j+1))+'" loading="'+(i===0&&j===0?"eager":"lazy")+'"></div>').join(""):'<div class="rnv-feed-photo rnv-empty">Product image unavailable</div>')+'</div>'+
      '<div class="rnv-feed-top"><span>RANOVA</span><span class="rnv-photo-counter">1 / '+Math.max(1,urls.length)+'</span></div>'+
      '<div class="rnv-feed-info"><strong>'+esc(price(p))+'</strong><h2>'+esc(p.name||"Product")+'</h2><small>'+esc(p.category||"RANOVA Marketplace")+'</small><button type="button" class="rnv-feed-detail" data-details-id="'+esc(p.id)+'">Product details &amp; quantity</button></div>'+
      '</article>';
  }
  function setVisible(article){
    const id=article?.dataset.feedId;if(!id||activeId===id)return;
    const p=products().find(x=>String(x.id)===id);
    if(!p)return;
    activeId=id;syncProduct(p);
    const label=$("rnvFeedSeller");
    if(label){const store=typeof marketStores!=="undefined" ? marketStores.find(s=>s.id===p.store_id) : null;label.textContent=store?.store_name||"RANOVA seller";}
  }
  function mount(){
    if(mounting)return;
    const panel=$("marketProductPanel"),p=current(),host=$("marketProductImage");
    if(!panel||!host||!p||!panel.classList.contains("active"))return;
    if(panel.dataset.feedSeed===String(p.id) && $("rnvProductFeed"))return;
    mounting=true;stop();activeId=String(p.id);
    const old=$("rnvProductFeed");if(old)old.remove();
    panel.querySelector(".mpd-main")?.classList.remove("rnv-details-open");
    const feed=document.createElement("div");feed.id="rnvProductFeed";feed.className="rnv-product-feed";
    const chosen=productSet(p);feed.innerHTML=chosen.map(item).join("");
    const head=panel.querySelector(".mpd-head");if(head)head.insertAdjacentElement("afterend",feed);
    panel.dataset.feedSeed=String(p.id);panel.classList.add("rnv-feed-mode");
    host.dataset.rnvOriginal="1";
    const seller=$("rnvFeedSeller")||document.createElement("span");
    seller.id="rnvFeedSeller";seller.className="rnv-feed-seller";
    if(!seller.isConnected)panel.querySelector(".mpd-actions")?.prepend(seller);
    const store=typeof marketStores!=="undefined" ? marketStores.find(s=>s.id===p.store_id) : null;seller.textContent=store?.store_name||"RANOVA seller";
    feedObserver=new IntersectionObserver(entries=>{
      if(busy)return;
      const candidate=entries.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
      if(candidate&&candidate.intersectionRatio>=.5)setVisible(candidate.target);
    },{root:feed,threshold:[.5,.65,.8]});
    feed.querySelectorAll(".rnv-feed-item").forEach(el=>feedObserver.observe(el));
    feed.addEventListener("scroll",()=>{lastInteraction=Date.now();},{passive:true});
    feed.addEventListener("click",e=>{
      const btn=e.target.closest("[data-details-id]");
      if(btn){const details=panel.querySelector(".mpd-main");if(details){details.classList.toggle("rnv-details-open");details.scrollIntoView({behavior:"smooth",block:"start"});}return;}
    });
    feed.querySelectorAll(".rnv-feed-photos").forEach(track=>{
      track.addEventListener("scroll",()=>{
        const index=Math.round(track.scrollLeft/(track.clientWidth||1));
        track.dataset.photoIndex=String(index);
        const counter=track.parentElement.querySelector(".rnv-photo-counter");
        if(counter)counter.textContent=(index+1)+" / "+track.children.length;
        lastInteraction=Date.now();
      },{passive:true});
    });
    autoplay=setInterval(()=>{
      if(document.hidden||Date.now()-lastInteraction<7000||!panel.classList.contains("active"))return;
      const article=[...feed.querySelectorAll("[data-feed-id]")].find(el=>el.dataset.feedId===activeId);
      const track=article?.querySelector(".rnv-feed-photos");
      if(track && track.children.length>1){const next=(Number(track.dataset.photoIndex||0)+1)%track.children.length;track.scrollTo({left:next*track.clientWidth,behavior:"smooth"});}
    },4200);
    mounting=false;
  }
  function init(){
    const panel=$("marketProductPanel"),host=$("marketProductImage");
    if(!panel||!host)return;
    new MutationObserver(()=>{
      if(!panel.classList.contains("active")){stop();return;}
      const p=current();if(p && panel.dataset.feedSeed!==String(p.id))setTimeout(mount,50);
    }).observe(host,{childList:true});
    // Intercept legacy marketplace links before their bubble handlers redirect away.
    document.addEventListener("click",e=>{
      const card=e.target.closest("[data-mh-product],[data-home-seller-product]");
      if(!card || !navigator.onLine)return;
      const id=card.dataset.mhProduct||card.dataset.homeSellerProduct;
      if(!products().some(p=>String(p.id)===String(id)))return;
      e.preventDefault();e.stopImmediatePropagation();
      const panel=$("marketProductPanel");
      if(panel){panel.classList.remove("rnv-feed-mode");delete panel.dataset.feedSeed;}
      if(typeof openMarketplaceProduct==="function"){openMarketplaceProduct(id);setTimeout(mount,150);}
    },true);
    document.addEventListener("click",e=>{
      if(e.target.closest("#marketProductBack")){stop();panel.classList.remove("rnv-feed-mode");delete panel.dataset.feedSeed;return;}
      if(e.target.closest("[data-mh-product],[data-home-seller-product],[data-market-product],[data-legacy-market-product]"))setTimeout(mount,250);
    });
    document.addEventListener("visibilitychange",()=>{if(document.hidden)stop();else if(panel.classList.contains("active")){delete panel.dataset.feedSeed;mount();}});
    setTimeout(mount,400);
  }
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
