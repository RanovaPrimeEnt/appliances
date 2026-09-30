(function(){
"use strict";

var frame=document.getElementById("site");
if(!frame)return;

var ENDPOINT="https://igaerssbzobutlwvjfwt.supabase.co/functions/v1/ranova-marketplace-discovery";
var DEVICE_KEY="ranova_customer_device_v1";
var REFRESH_KEY="ranova_home_refresh_nonce_v1";
var ROTATE_MS=10*60*1000;
var PAGE_SIZE=48;
var INITIAL_PAGES=2;
var BATCH=12;
var MAX_PAGES=8;

var state={
  deviceId:"",
  refreshNonce:0,
  timeBucket:0,
  products:[],
  queue:[],
  sponsored:[],
  rendered:0,
  offset:0,
  pages:0,
  exhausted:false,
  loading:false,
  sessionId:"",
  doc:null,
  observer:null,
  lastSeenProductIds:new Set()
};

function idoc(){try{return frame.contentDocument||frame.contentWindow.document}catch(e){return null}}
function esc(v){return String(v==null?"":v).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]})}
function getDeviceId(){
  try{
    var id=localStorage.getItem(DEVICE_KEY);
    if(!id){
      id=(window.crypto&&crypto.randomUUID)?crypto.randomUUID():"rv-"+Date.now().toString(36)+"-"+Math.random().toString(36).slice(2);
      localStorage.setItem(DEVICE_KEY,id);
    }
    return id;
  }catch(e){return "rv-"+Math.random().toString(36).slice(2)}
}
function getRefreshNonce(){
  try{return Number(sessionStorage.getItem(REFRESH_KEY)||0)||0}catch(e){return 0}
}
function bumpRefreshNonce(){
  state.refreshNonce++;
  try{sessionStorage.setItem(REFRESH_KEY,String(state.refreshNonce))}catch(e){}
}
function hash(str){
  var h=2166136261;
  for(var i=0;i<str.length;i++){h^=str.charCodeAt(i);h=Math.imul(h,16777619)}
  return h>>>0;
}
function rng(seed){
  var a=seed>>>0;
  return function(){
    a|=0;a=a+0x6D2B79F5|0;
    var t=Math.imul(a^a>>>15,1|a);
    t=t+Math.imul(t^t>>>7,61|t)^t;
    return((t^t>>>14)>>>0)/4294967296;
  };
}
function shuffle(arr,seedText){
  var out=arr.slice(),r=rng(hash(seedText));
  for(var i=out.length-1;i>0;i--){
    var j=Math.floor(r()*(i+1)),tmp=out[i];out[i]=out[j];out[j]=tmp;
  }
  return out;
}
function money(p){
  if(p.price==null||p.price==="")return "Ask seller";
  var n=Number(p.price);
  if(!isFinite(n))return esc(p.price);
  return "GHC "+n.toLocaleString("en-GH",{minimumFractionDigits:2,maximumFractionDigits:2});
}
function productKey(p){return String(p.product_id||p.id||"")}
var PRICE_REST="https://igaerssbzobutlwvjfwt.supabase.co/rest/v1/ranova_seller_products";
var PRICE_KEY="sb_publishable_NMzJFpXOIJMEH3LW50Cs9g_Otc6tlYr";
async function refreshLivePrices(){
  if(!state.products.length)return;
  try{
    var ids=Array.from(new Set(state.products.map(productKey).filter(Boolean))).slice(0,250);
    if(!ids.length)return;
    var r=await fetch(PRICE_REST+"?select=id,price,currency&id=in.("+ids.map(encodeURIComponent).join(",")+")",{headers:{apikey:PRICE_KEY,Authorization:"Bearer "+PRICE_KEY},cache:"no-store"});
    if(!r.ok)return;
    var rows=await r.json(),by={};(rows||[]).forEach(function(x){by[String(x.id)]=x});
    state.products.forEach(function(p){var x=by[productKey(p)];if(x){p.price=x.price==null?null:Number(x.price);if(x.currency)p.currency=x.currency}});
    var d=state.doc;if(!d)return;
    [].slice.call(d.querySelectorAll(".rch-card[data-product-id]")).forEach(function(card){
      var p=state.products.find(function(x){return productKey(x)===card.dataset.productId});if(!p)return;
      var price=card.querySelector(".rch-price");if(price)price.innerHTML=money(p)+"<small>View details</small>";
    });
  }catch(e){}
}
function sellerKey(p){return String(p.store_id||p.store_slug||p.store_name||"unknown")}
function dedupe(list){
  var seen=new Set(),out=[];
  list.forEach(function(p){
    var k=productKey(p);
    if(!k||seen.has(k))return;
    seen.add(k);out.push(p);
  });
  return out;
}
function fairOrder(list,seed){
  var buckets={};
  shuffle(list,seed+"-products").forEach(function(p){
    var k=sellerKey(p);
    (buckets[k]||(buckets[k]=[])).push(p);
  });
  var sellers=shuffle(Object.keys(buckets),seed+"-sellers"),out=[],round=0;
  while(sellers.length){
    var next=[];
    sellers.forEach(function(k){
      var bucket=buckets[k];
      if(bucket&&bucket.length){
        out.push(bucket.shift());
        if(bucket.length)next.push(k);
      }
    });
    sellers=shuffle(next,seed+"-round-"+(++round));
  }
  return out;
}
function currentBucket(){return Math.floor(Date.now()/ROTATE_MS)}
function seed(){return state.deviceId+"|"+state.timeBucket+"|"+state.refreshNonce}
async function api(body){
  var r=await fetch(ENDPOINT,{
    method:"POST",
    headers:{"Content-Type":"application/json","x-ranova-client":"ranova-customer-home-v1"},
    body:JSON.stringify(body||{})
  });
  var out=await r.json().catch(function(){return{}});
  if(!r.ok||!out.ok)throw new Error(out.error||"Marketplace feed is temporarily unavailable.");
  return out;
}
async function fetchPage(){
  if(state.loading||state.exhausted||state.pages>=MAX_PAGES)return [];
  state.loading=true;
  setStatus(state.products.length?"Loading more products…":"Loading products from RANOVA stores…");
  try{
    var out=await api({
      action:"search",
      query:"",
      sort:"relevance",
      limit:PAGE_SIZE,
      offset:state.offset,
      session_id:state.sessionId
    });
    var organic=Array.isArray(out.organic)?out.organic:[];
    var sponsored=Array.isArray(out.sponsored)?out.sponsored:[];
    if(!state.sponsored.length&&sponsored.length)state.sponsored=sponsored.slice(0,8);
    state.offset+=organic.length;
    state.pages++;
    if(organic.length<PAGE_SIZE)state.exhausted=true;
    var existing=new Set(state.products.map(productKey));
    organic.forEach(function(p){
      var k=productKey(p);
      if(k&&!existing.has(k)){state.products.push(p);existing.add(k)}
    });
    return organic;
  }finally{state.loading=false}
}
function addStyles(d){
  if(d.getElementById("ranovaCustomerHomeCss"))return;
  var s=d.createElement("style");s.id="ranovaCustomerHomeCss";
  s.textContent=`
#ranovaCustomerHome{background:#f4f6f5;color:#17352e;padding:0 0 30px;border-bottom:1px solid #e1e9e5}
.rch-shell{width:min(1180px,calc(100% - 28px));margin:auto}
.rch-top{position:relative;padding:18px 0 11px}
.rch-brandrow{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}
.rch-brand{display:flex;align-items:center;gap:9px;font-weight:950;color:#0b5c4d;letter-spacing:.01em}
.rch-brandmark{width:35px;height:35px;border-radius:12px;background:linear-gradient(135deg,#0b5c4d,#18866e);color:#fff;display:grid;place-items:center;font-size:14px;box-shadow:0 8px 20px rgba(11,92,77,.18)}
.rch-brand small{display:block;color:#76867f;font-size:9px;letter-spacing:0;font-weight:750;margin-top:1px}
.rch-search{display:grid;grid-template-columns:1fr 46px;gap:8px}
.rch-searchbox{display:flex;align-items:center;gap:9px;background:#fff;border:2px solid #163a32;border-radius:999px;padding:0 14px;min-height:48px;box-shadow:0 8px 24px rgba(24,56,47,.05)}
.rch-searchbox svg{width:19px;height:19px;flex:0 0 auto;color:#62736d}
.rch-searchbox input{border:0;outline:0;background:transparent;width:100%;min-width:0;font-size:13px;color:#17352e}
.rch-searchgo{border:0;border-radius:999px;background:#ff6533;color:#fff;font-weight:950;font-size:11px;cursor:pointer}
.rch-shortcuts{display:flex;gap:9px;overflow-x:auto;padding:14px 0 3px;scrollbar-width:none;scroll-snap-type:x proximity}
.rch-shortcuts::-webkit-scrollbar{display:none}
.rch-shortcut{flex:0 0 auto;min-width:78px;border:0;background:transparent;padding:0;display:grid;justify-items:center;gap:6px;color:#566a63;font-size:9px;font-weight:800;cursor:pointer;scroll-snap-align:start}
.rch-shortcut i{width:46px;height:46px;border-radius:15px;display:grid;place-items:center;background:#fff;border:1px solid #e1e9e5;font-style:normal;font-size:20px;box-shadow:0 6px 18px rgba(25,58,49,.06)}
.rch-shortcut:nth-child(4n+1) i{background:#eef8f4}.rch-shortcut:nth-child(4n+2) i{background:#fff5e8}.rch-shortcut:nth-child(4n+3) i{background:#f2efff}.rch-shortcut:nth-child(4n) i{background:#eef5ff}
.rch-trustbar{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:12px 0 4px}
.rch-trustitem{display:flex;align-items:center;gap:8px;padding:10px 11px;border:1px solid #e0e8e4;border-radius:14px;background:#fff;box-shadow:0 4px 14px rgba(20,58,48,.04);min-width:0}
.rch-trustitem i{width:29px;height:29px;border-radius:10px;background:#eef8f4;color:#0b6a53;display:grid;place-items:center;font-style:normal;font-size:14px;font-weight:950;flex:0 0 auto}
.rch-trustitem b{display:block;font-size:10px;color:#17352e;line-height:1.2}
.rch-trustitem small{display:block;margin-top:2px;font-size:8px;color:#7a8983;line-height:1.25}
.rch-mobile-nav{display:none}
.rch-banner{margin:14px 0 16px;border-radius:20px;overflow:hidden;background:linear-gradient(120deg,#0a4a3d,#11745e 58%,#f3a82f);color:#fff;padding:18px;display:grid;grid-template-columns:1.25fr .75fr;gap:12px;min-height:132px;position:relative}
.rch-banner:after{content:"";position:absolute;width:190px;height:190px;border-radius:50%;right:-75px;top:-80px;background:#ffffff18}
.rch-banner h2{margin:4px 0 7px!important;color:#fff!important;font-size:clamp(19px,4vw,29px)!important;line-height:1.08!important}
.rch-banner p{margin:0!important;color:#dceee8!important;font-size:13px!important;line-height:1.5!important;max-width:570px}
.rch-banner small{font-size:10px;font-weight:900;letter-spacing:.13em;color:#ffe6bd}
.rch-banner-side{display:grid;align-content:center;gap:7px;position:relative;z-index:1}
.rch-banner-side span{background:#ffffff17;border:1px solid #ffffff26;border-radius:999px;padding:7px 9px;font-size:8px;font-weight:850;text-align:center}
.rch-head{display:flex;align-items:end;justify-content:space-between;gap:12px;margin:16px 0 9px}
.rch-head h2{margin:0!important;font-size:20px!important;color:#17352e!important}
.rch-head p{margin:3px 0 0!important;color:#71827b!important;font-size:12px!important}
.rch-live{display:flex;align-items:center;gap:6px;color:#64766f;font-size:10px;font-weight:850;white-space:nowrap}
.rch-live:before{content:"";width:7px;height:7px;border-radius:50%;background:#1dbf73;box-shadow:0 0 0 4px #1dbf7320}
.rch-sponsored{display:none;margin:8px 0 15px}
.rch-sponsored.show{display:block}
.rch-sponsored-title{font-size:9px;color:#7b7160;margin:0 0 7px}
.rch-sponsored-row{display:flex;gap:9px;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;padding-bottom:4px}
.rch-sponsored-row::-webkit-scrollbar{display:none}
.rch-ad{flex:0 0 min(230px,72vw);background:#fff;border:1px solid #eadcb8;border-radius:15px;display:grid;grid-template-columns:74px 1fr;gap:9px;padding:8px;text-decoration:none;color:#17352e;scroll-snap-align:start}
.rch-ad img{width:74px;height:74px;object-fit:contain;background:#f6f7f6;border-radius:10px}
.rch-ad b{font-size:10px;line-height:1.25;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.rch-ad small{display:block;margin-top:4px;font-size:7px;color:#8a6b26;font-weight:900}
.rch-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:11px}
.rch-card{background:#fff;border:1px solid #e1e8e5;border-radius:16px;overflow:hidden;min-width:0;box-shadow:0 5px 18px rgba(20,58,48,.045);display:flex;flex-direction:column;text-decoration:none;color:#17352e;position:relative}
.rch-media{aspect-ratio:1/1;background:#f5f7f6;position:relative;overflow:hidden}
.rch-media img{width:100%;height:100%;object-fit:contain;display:block}
.rch-trust{position:absolute;left:7px;top:7px;background:#fffffff0;border:1px solid #dbe7e2;border-radius:999px;padding:4px 6px;font-size:7px;font-weight:900;color:#0d6b51}
.rch-copy{padding:10px;display:flex;flex-direction:column;gap:5px;flex:1}
.rch-store{font-size:8px;color:#0b6a53;font-weight:900;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rch-name{font-size:11px;font-weight:850;line-height:1.28;min-height:28px;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.rch-desc{font-size:8px;color:#74847e;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:23px}
.rch-meta{display:flex;gap:5px;flex-wrap:wrap}
.rch-meta span{font-size:7px;background:#f0f5f3;border-radius:999px;padding:4px 6px;color:#596c65}
.rch-price{margin-top:auto;padding-top:3px;font-size:14px;font-weight:950;color:#ff5a00}
.rch-price small{font-size:7px;color:#819089;font-weight:750;margin-left:3px}
.rch-sentinel{min-height:60px;display:grid;place-items:center;color:#7a8984;font-size:10px}
.rch-status{text-align:center;padding:13px 0;color:#788983;font-size:9px}
.rch-error{padding:24px 14px;border:1px dashed #ccd8d3;border-radius:15px;background:#fff;text-align:center;color:#6c7d76;font-size:10px;grid-column:1/-1}
@media(max-width:920px){.rch-grid{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:760px){
  #ranovaCustomerHome{padding-bottom:104px}
  .rch-trustbar{grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}
  .rch-trustitem{padding:9px}
  .rch-trustitem b{font-size:9px}
  .rch-trustitem small{font-size:7px}
  .rch-mobile-nav{display:grid;grid-template-columns:repeat(5,1fr);position:fixed;left:0;right:0;bottom:0;z-index:9998;background:#fff;border-top:1px solid #dfe7e3;padding:7px max(8px,env(safe-area-inset-right)) max(7px,env(safe-area-inset-bottom)) max(8px,env(safe-area-inset-left));box-shadow:0 -8px 24px rgba(18,52,44,.10)}
  .rch-mobile-nav a{display:grid;justify-items:center;gap:3px;text-decoration:none;color:#6b7c76;font-size:9px;font-weight:850;padding:5px 2px;border-radius:10px}
  .rch-mobile-nav a span:first-child{font-size:19px;line-height:1}
  .rch-mobile-nav a.active{color:#0b5c4d;background:#eef8f4}
  .rch-shell{width:min(100% - 18px,1180px)}
  .rch-top{padding-top:10px}
  .rch-brandrow{margin-bottom:9px}
  .rch-brandmark{width:32px;height:32px;border-radius:10px}
  .rch-search{grid-template-columns:1fr 43px;gap:7px}
  .rch-searchbox{min-height:45px;padding:0 12px}
  .rch-shortcuts{margin-left:-3px;margin-right:-3px}
  .rch-shortcut{min-width:69px;font-size:8px}
  .rch-shortcut i{width:42px;height:42px;border-radius:14px;font-size:18px}
  .rch-banner{margin-top:11px;border-radius:17px;grid-template-columns:1fr;min-height:116px;padding:15px}
  .rch-banner-side{display:flex;gap:6px;flex-wrap:wrap}
  .rch-banner-side span{font-size:7px;padding:5px 7px}
  .rch-head{margin-top:14px}
  .rch-head h2{font-size:18px!important}
  .rch-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  .rch-card{border-radius:14px}
  .rch-copy{padding:9px 8px}
  .rch-name{font-size:10px;min-height:26px}
  .rch-store{font-size:7px}
  .rch-desc{font-size:7px;min-height:20px}
  .rch-price{font-size:13px}
}
@media(max-width:350px){.rch-grid{gap:6px}.rch-copy{padding:7px}.rch-name{font-size:9px}}
`;
  d.head.appendChild(s);
}
function setStatus(msg){
  var d=state.doc||idoc(),x=d&&d.getElementById("rchStatus");
  if(x)x.textContent=msg||"";
}
function shortcutIcon(name){
  var n=String(name||"").toLowerCase();
  if(n.indexOf("solar")>=0||n.indexOf("light")>=0)return "☀";
  if(n.indexOf("home")>=0||n.indexOf("furniture")>=0)return "⌂";
  if(n.indexOf("kitchen")>=0||n.indexOf("appliance")>=0)return "◫";
  if(n.indexOf("fashion")>=0||n.indexOf("cloth")>=0)return "♢";
  if(n.indexOf("elect")>=0)return "ϟ";
  if(n.indexOf("beaut")>=0)return "✦";
  return "◉";
}
function buildShell(d){
  var old=d.getElementById("ranovaCustomerHome");if(old)old.remove();
  var sec=d.createElement("section");sec.id="ranovaCustomerHome";
  sec.innerHTML='<div class="rch-shell">'+
    '<div class="rch-top">'+
      '<div class="rch-brandrow"><div class="rch-brand"><span class="rch-brandmark">R</span><div>RANOVA<small>Marketplace</small></div></div></div>'+
      '<form class="rch-search" id="rchSearchForm"><label class="rch-searchbox" aria-label="Search marketplace"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg><input id="rchSearchInput" type="search" placeholder="Search products and stores…" autocomplete="off"></label><button class="rch-searchgo" type="submit" aria-label="Search">Search</button></form>'+
      '<div class="rch-shortcuts" id="rchShortcuts">'+
        '<button class="rch-shortcut" type="button" data-action="categories"><i>▦</i><span>Categories</span></button>'+
        '<button class="rch-shortcut" type="button" data-url="./marketplace.html?sort=newest"><i>✦</i><span>New arrivals</span></button>'+
        '<button class="rch-shortcut" type="button" data-url="./marketplace.html?trusted=1"><i>✓</i><span>Trusted stores</span></button>'+
        '<button class="rch-shortcut" type="button" data-url="./rfq.html"><i>₵</i><span>Bulk quote</span></button>'+
        '<button class="rch-shortcut" type="button" data-action="camera"><i>⌾</i><span>Image search</span></button>'+
      '</div>'+      '<div class="rch-trustbar">'+
        '<div class="rch-trustitem"><i>✓</i><span><b>Verified sellers</b><small>Approved marketplace stores</small></span></div>'+
        '<div class="rch-trustitem"><i>🛡</i><span><b>Buyer protection</b><small>Secure RANOVA order flow</small></span></div>'+
        '<div class="rch-trustitem"><i>↺</i><span><b>Order tracking</b><small>Follow every order stage</small></span></div>'+
        '<div class="rch-trustitem"><i>☏</i><span><b>Customer support</b><small>Help when an order needs attention</small></span></div>'+
      '</div>'+
      '<div class="rch-banner"><div><small>SHOP RANOVA</small><h2>Find products from trusted stores in one place.</h2><p>Search, compare and order with protected checkout and clear order tracking.</p></div><div class="rch-banner-side"><span>Verified sellers</span><span>Buyer protection</span><span>Order tracking</span></div></div>'+
    '</div>'+
    '<div class="rch-head"><div><h2>Recommended for you</h2><p>Discover products from RANOVA stores.</p></div><span class="rch-live">Marketplace</span></div>'+
    '<div class="rch-sponsored" id="rchSponsored"><div class="rch-sponsored-title">Sponsored</div><div class="rch-sponsored-row" id="rchSponsoredRow"></div></div>'+
    '<section class="rch-store-section" id="rchStoreSection" style="display:none"><div class="rch-head"><div><h2>Stores to discover</h2><p>Explore verified RANOVA sellers.</p></div><span class="rch-live">Stores</span></div><div class="rch-store-row" id="rchStoreRow"></div></section>'+
    '<div class="rch-grid" id="rchGrid"></div>'+
    '<div class="rch-status" id="rchStatus">Loading products from RANOVA stores…</div>'+
    '<div class="rch-sentinel" id="rchSentinel">Scroll for more products</div>'+
  '</div>'+
  '<nav class="rch-mobile-nav" aria-label="Main navigation">'+
    '<a class="active" href="./"><span>⌂</span><span>Home</span></a>'+
    '<a href="./marketplace.html"><span>▦</span><span>Categories</span></a>'+
    '<a href="./cart.html"><span>🛒</span><span>Cart</span></a>'+
    '<a href="./order-status.html"><span>⌖</span><span>Orders</span></a>'+
    '<a href="./account.html"><span>◉</span><span>Account</span></a>'+
  '</nav>';

  var anchor=d.querySelector(".hero")||d.querySelector("main")||d.body.firstElementChild;
  if(anchor&&anchor.parentNode)anchor.parentNode.insertBefore(sec,anchor);else d.body.insertBefore(sec,d.body.firstChild);
  state.doc=d;

  d.getElementById("rchSearchForm").addEventListener("submit",function(e){
    e.preventDefault();
    var q=d.getElementById("rchSearchInput").value.trim();
    if(q)window.top.location.href="./marketplace.html?q="+encodeURIComponent(q);
  });
  d.getElementById("rchShortcuts").addEventListener("click",function(e){
    var b=e.target.closest("button");if(!b)return;
    if(b.dataset.url){window.top.location.href=b.dataset.url;return}
    if(b.dataset.action==="camera"){
      var camera=d.getElementById("rpeMCamera");
      if(camera)camera.click();
      else{var g=document.getElementById("gallery");if(g)g.click()}
    }
    if(b.dataset.action==="categories"){
      window.top.location.href="./marketplace.html";
    }
  });

  d.addEventListener("click",function(e){
    var a=e.target.closest&&e.target.closest("a");
    if(!a)return;
    var label=(a.textContent||"").trim().toLowerCase();
    if(label==="home"){
      e.preventDefault();
      sec.scrollIntoView({behavior:"smooth",block:"start"});
    }
  },true);

  hookExistingMobileHome(d,sec);
  setupObserver(d);
}
function hookExistingMobileHome(d,sec){
  function wire(){
    var b=d.getElementById("rpeMHome");
    if(b&&!b.dataset.rchWired){
      b.dataset.rchWired="1";
      b.addEventListener("click",function(e){e.preventDefault();sec.scrollIntoView({behavior:"smooth",block:"start"})},true);
    }
  }
  wire();
  var o=new MutationObserver(wire);o.observe(d.body,{childList:true,subtree:true});
  setTimeout(function(){o.disconnect();wire()},8000);
}
function setupObserver(d){
  if(state.observer)state.observer.disconnect();
  var s=d.getElementById("rchSentinel");
  if(!s)return;
  state.observer=new IntersectionObserver(function(entries){
    if(entries.some(function(x){return x.isIntersecting}))loadMore();
  },{rootMargin:"600px 0px"});
  state.observer.observe(s);
}

function renderStores(){
  var d=state.doc;if(!d)return;
  var sec=d.getElementById("rchStoreSection"),row=d.getElementById("rchStoreRow");
  if(!sec||!row)return;
  var groups={};
  state.products.forEach(function(p){
    var k=sellerKey(p);
    if(!groups[k])groups[k]={key:k,name:p.store_name||"RANOVA seller",slug:p.store_slug||"",trusted:!!p.trusted_badge,rating:p.overall_rating,items:[]};
    groups[k].items.push(p);
  });
  var stores=shuffle(Object.keys(groups).map(function(k){return groups[k]}),seed()+"-stores").slice(0,10);
  if(!stores.length){sec.style.display="none";row.innerHTML="";return}
  row.innerHTML=stores.map(function(s){
    var imgs=shuffle(s.items,seed()+"-store-"+s.key).filter(function(p){return !!p.primary_image_url}).slice(0,4);
    var collage=imgs.map(function(p){return '<img src="'+esc(p.primary_image_url)+'" alt="" loading="lazy">'}).join("");
    while((collage.match(/<img/g)||[]).length<4)collage+='<span style="background:#f4f6f5"></span>';
    var href="./seller-store.html?store="+encodeURIComponent(s.slug||s.key);
    var rating=s.rating!=null&&isFinite(Number(s.rating))?"★ "+Number(s.rating).toFixed(1):"";
    return '<a class="rch-store-card" href="'+href+'" target="_top"><div class="rch-store-collage">'+collage+'</div><div class="rch-store-copy"><b>'+esc(s.name)+'</b><small>'+s.items.length+' product'+(s.items.length===1?"":"s")+' currently in this marketplace selection</small><div class="rch-store-tags">'+(s.trusted?'<span>✓ Trusted</span>':'<span>Marketplace seller</span>')+(rating?'<span>'+esc(rating)+'</span>':'')+'<span>Visit store →</span></div></div></a>';
  }).join("");
  sec.style.display="block";
}
function renderSponsored(){
  var d=state.doc;if(!d)return;
  var sec=d.getElementById("rchSponsored"),row=d.getElementById("rchSponsoredRow");
  if(!state.sponsored.length){sec.classList.remove("show");row.innerHTML="";return}
  var ads=shuffle(state.sponsored,seed()+"-ads").slice(0,6);
  row.innerHTML=ads.map(function(p){
    return '<a class="rch-ad" href="./product.html?product='+encodeURIComponent(productKey(p))+'" target="_top">'+
      (p.primary_image_url?'<img src="'+esc(p.primary_image_url)+'" alt="'+esc(p.product_name||"Product")+'" loading="lazy">':'<span></span>')+
      '<div><b>'+esc(p.product_name||"Marketplace product")+'</b><small>Sponsored • '+esc(p.store_name||"RANOVA seller")+'</small><div style="margin-top:6px;font-size:11px;font-weight:950;color:#ff5a00">'+money(p)+'</div></div></a>';
  }).join("");
  sec.classList.add("show");
}
function card(p){
  var id=productKey(p),rating=p.overall_rating!=null?Number(p.overall_rating).toFixed(1):"";
  var trust=p.trusted_badge?'<span class="rch-trust">✓ Trusted</span>':"";
  var img=p.primary_image_url?'<img src="'+esc(p.primary_image_url)+'" alt="'+esc(p.product_name||"Product")+'" loading="lazy" decoding="async">':"";
  return '<a class="rch-card" href="./product.html?product='+encodeURIComponent(id)+'" target="_top" data-product-id="'+esc(id)+'">'+
    '<div class="rch-media">'+img+trust+'</div>'+
    '<div class="rch-copy">'+
      '<div class="rch-store">'+esc(p.store_name||"RANOVA seller")+'</div>'+
      '<div class="rch-name">'+esc(p.product_name||"Marketplace product")+'</div>'+
      '<div class="rch-desc">'+esc(p.short_description||p.category||"Open for product details and seller information.")+'</div>'+
      '<div class="rch-meta"><span>MOQ '+esc(p.moq||1)+'</span>'+(rating?'<span>★ '+esc(rating)+'</span>':'')+(p.category?'<span>'+esc(p.category)+'</span>':'')+'</div>'+
      '<div class="rch-price">'+money(p)+'<small>View details</small></div>'+
    '</div></a>';
}
function rebuildQueue(){
  state.timeBucket=currentBucket();
  state.queue=fairOrder(dedupe(state.products),seed());
  state.rendered=0;
}
function renderNext(){
  var d=state.doc;if(!d)return;
  var grid=d.getElementById("rchGrid");if(!grid)return;
  var start=state.rendered,end=Math.min(start+BATCH,state.queue.length),batch=state.queue.slice(start,end);
  if(start===0)grid.innerHTML="";
  if(batch.length){
    grid.insertAdjacentHTML("beforeend",batch.map(card).join(""));
    state.rendered=end;
    setStatus(state.exhausted&&state.rendered>=state.queue.length?"You have reached the end of the current marketplace selection.":"Showing a rotating mix from RANOVA sellers.");
  }
  if(!state.queue.length&&!state.loading){
    grid.innerHTML='<div class="rch-error">No approved marketplace products are available right now. Please check again shortly.</div>';
    setStatus("");
  }
}
async function loadMore(){
  if(state.rendered<state.queue.length){renderNext();return}
  if(state.exhausted||state.loading)return;
  var before=state.products.length;
  try{
    await fetchPage();
    if(state.products.length>before){
      var existingRendered=new Set(state.queue.slice(0,state.rendered).map(productKey));
      var fresh=state.products.filter(function(p){return !existingRendered.has(productKey(p))});
      var ordered=fairOrder(fresh,seed()+"-page-"+state.pages);
      state.queue=state.queue.slice(0,state.rendered).concat(ordered);
      renderNext();
    }
  }catch(e){setStatus(e.message||"Could not load more products.")}
}
async function rotate(manual){
  if(manual)bumpRefreshNonce();
  state.timeBucket=currentBucket();
  var btn=state.doc&&state.doc.getElementById("rchRefresh");
  if(btn){btn.disabled=true;btn.textContent="↻ Refreshing…"}
  try{
    if(!state.products.length){
      for(var i=0;i<INITIAL_PAGES;i++){
        await fetchPage();
        if(state.exhausted)break;
      }
    }
    rebuildQueue();renderSponsored();renderStores();renderNext();
    if(state.doc)state.doc.getElementById("ranovaCustomerHome").scrollIntoView({behavior:manual?"smooth":"auto",block:"start"});
  }catch(e){
    var d=state.doc;if(d){
      var grid=d.getElementById("rchGrid");
      if(grid)grid.innerHTML='<div class="rch-error">'+esc(e.message||"Marketplace feed is temporarily unavailable.")+'</div>';
      setStatus("Please try refreshing the feed.");
    }
  }finally{
    if(btn){btn.disabled=false;btn.innerHTML="<span>↻</span> Refresh feed"}
  }
}
async function loadCategories(){
  try{
    var out=await api({action:"categories"}),cats=(out.categories||[]).slice(0,8),d=state.doc;
    if(!d||!cats.length)return;
    var host=d.getElementById("rchShortcuts");
    cats.slice(0,4).forEach(function(c){
      var b=d.createElement("button");b.className="rch-shortcut";b.type="button";
      b.innerHTML="<i>"+shortcutIcon(c)+"</i><span>"+esc(c)+"</span>";
      b.onclick=function(){window.top.location.href="./marketplace.html?category="+encodeURIComponent(c)};
      host.appendChild(b);
    });
  }catch(e){}
}
function boot(){
  var d=idoc();if(!d||!d.body)return false;
  addStyles(d);buildShell(d);
  state.deviceId=getDeviceId();
  state.refreshNonce=getRefreshNonce();
  state.timeBucket=currentBucket();
  state.sessionId="home-"+state.deviceId+"-"+state.timeBucket;
  rotate(false);loadCategories();
  return true;
}
var tries=0,timer;
function start(){tries++;if(boot())return;if(tries<50)timer=setTimeout(start,250)}
frame.addEventListener("load",function(){clearTimeout(timer);tries=0;setTimeout(start,500)});
setTimeout(start,700);

setInterval(function(){
  if(!state.doc)return;
  var b=currentBucket();
  if(b!==state.timeBucket&&document.visibilityState!=="hidden"){rotate(false)}
},60000);
document.addEventListener("visibilitychange",function(){
  if(document.visibilityState==="visible"){
    if(state.doc&&currentBucket()!==state.timeBucket)rotate(false);
    refreshLivePrices();
  }
});
window.addEventListener("focus",refreshLivePrices);
setInterval(function(){if(document.visibilityState!=="hidden")refreshLivePrices()},15000);
try{
  if("BroadcastChannel" in window){
    var homePriceChannel=new BroadcastChannel("ranova-marketplace-updates");
    homePriceChannel.addEventListener("message",function(e){if(e.data&&e.data.type==="product_price")refreshLivePrices()});
  }
  window.addEventListener("storage",function(e){if(e.key==="ranova_price_update_v1")refreshLivePrices()});
}catch(e){}
})();