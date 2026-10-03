(() => {
"use strict";

const cfg = window.RPE_CONFIG || {};
const setup = document.getElementById("setup");
const authBox = document.getElementById("auth");
const appBox = document.getElementById("app");
const toast = document.getElementById("toast");

if (!cfg.supabaseUrl || !cfg.supabasePublishableKey || !window.supabase) {
  setup.innerHTML = '<div style="text-align:center;padding:24px"><b style="display:block;color:#173d32;margin-bottom:6px">My RPE is being connected.</b><span>This customer area is not live yet. Please continue using the main RPE catalogue for now.</span></div>';
  return;
}

const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey);
let user = null;
let profile = null;
let products = [];
let favorites = new Set();
let marketSavedProducts = new Set();
let recentIds = [];
let cartId = null;
let cartItems = [];
let marketCartRows=[];
let marketCartProducts=new Map();
let marketCartStores=new Map();
let cartSelectedKeys=new Set();
let cartEditMode=false;
let cartViewMode="all";
let marketCartLoaded=false;
let marketCartLoadPromise=null;
const UNIVERSAL_MARKET_CART_DRAFT_KEY="ranova_universal_market_cart_v2";
const PENDING_MARKET_SAVED_KEY="ranova_pending_saved_products_v2";
let shoppingRefreshPromise=null;
function readLocalJson(key,fallback){try{const v=JSON.parse(localStorage.getItem(key)||"null");return v==null?fallback:v}catch{return fallback}}
function writeLocalJson(key,value){try{localStorage.setItem(key,JSON.stringify(value))}catch{}}
const SHOPPING_SYNC_CHANNEL="ranova-shopping-sync-v1";
let shoppingSyncChannel=null;
function marketplaceDraftSnapshot(){
  const out={};
  marketCartRows.forEach(r=>{if(r?.store_id)out[r.store_id]={...(r.items||{})}});
  return out;
}
function saveMarketplaceCartDrafts(){
  writeLocalJson(UNIVERSAL_MARKET_CART_DRAFT_KEY,marketplaceDraftSnapshot());
}
function clearMarketplaceCartDraft(storeId){
  const drafts=readLocalJson(UNIVERSAL_MARKET_CART_DRAFT_KEY,{});
  delete drafts[storeId];writeLocalJson(UNIVERSAL_MARKET_CART_DRAFT_KEY,drafts);
}
function restoreMarketplaceCartDrafts(){
  const drafts=readLocalJson(UNIVERSAL_MARKET_CART_DRAFT_KEY,{});
  if(!drafts||typeof drafts!=="object")return false;
  let changed=false;
  for(const [storeId,items] of Object.entries(drafts)){
    if(!items||typeof items!=="object")continue;
    let row=marketCartRows.find(r=>r.store_id===storeId);
    if(!row){row={store_id:storeId,items:{}};marketCartRows.push(row)}
    row.items={...(row.items||{}),...items};changed=true;
  }
  return changed;
}
function announceShoppingChange(kind,storeId=null,productId=null){
  const payload={type:"shopping-change",kind,storeId,productId,at:Date.now()};
  try{shoppingSyncChannel?.postMessage(payload)}catch{}
  try{localStorage.setItem("ranova-shopping-ping",JSON.stringify(payload))}catch{}
}

let orders = [];
let notifications = [];
let addresses = [];
let returns = [];
let toPayOrders = [];
let toPayStores = [];
let toPayRecommendations = [];
let marketStores=[],marketSellerProducts=[],marketLoadedAt=0,marketFetchInFlight=false;
const PUBLIC_MARKET_CACHE_KEY="ranova-public-market-v1";
const PUBLIC_MARKET_CACHE_MAX_AGE=24*60*60*1000;

function restorePublicMarketCache(){
  try{
    const raw=localStorage.getItem(PUBLIC_MARKET_CACHE_KEY);
    if(!raw)return false;
    const d=JSON.parse(raw);
    if(!d?.t)return false;
    if(navigator.onLine&&Date.now()-d.t>PUBLIC_MARKET_CACHE_MAX_AGE)return false;
    if(!Array.isArray(d.stores)||!Array.isArray(d.products))return false;
    marketStores=d.stores;
    marketSellerProducts=d.products;
    marketLoadedAt=d.t;
    return marketStores.length>0||marketSellerProducts.length>0;
  }catch{return false}
}
function primeOfflineMarketplaceImages(){
  if(!navigator.onLine||!("serviceWorker" in navigator))return;
  const urls=[...new Set([
    ...marketSellerProducts.flatMap(p=>[p.primary_image_url,...(Array.isArray(p.image_urls)?p.image_urls.slice(0,2):[])]),
    ...marketStores.flatMap(s=>[s.logo_url,s.banner_url])
  ].filter(Boolean))].slice(0,120);
  if(!urls.length)return;
  navigator.serviceWorker.ready.then(reg=>reg.active?.postMessage({type:"CACHE_MARKET_IMAGES",urls})).catch(()=>{});
}
function savePublicMarketCache(){
  if(!marketStores.length&&!marketSellerProducts.length)return;
  try{
    localStorage.setItem(PUBLIC_MARKET_CACHE_KEY,JSON.stringify({
      t:Date.now(),stores:marketStores,products:marketSellerProducts
    }));
  }catch{}
  primeOfflineMarketplaceImages();
}
function marketSkeleton(count=6){
  return '<div class="market-loading-grid">'+Array.from({length:count},()=>'<div class="market-skeleton-card"><span class="market-skeleton-img"></span><span class="market-skeleton-line wide"></span><span class="market-skeleton-line"></span></div>').join("")+'</div>';
}
function marketStoreSkeleton(count=3){
  return Array.from({length:count},()=>'<div class="market-store-skeleton"><span class="market-store-skeleton-img"></span><span class="market-store-skeleton-copy"><i></i><i></i><i></i></span></div>').join("");
}
restorePublicMarketCache();
let offlineMarketSnapshotPromise=null;
async function loadOfflineMarketplaceSnapshot(){
  if(marketStores.length||marketSellerProducts.length)return true;
  if(offlineMarketSnapshotPromise)return offlineMarketSnapshotPromise;
  offlineMarketSnapshotPromise=(async()=>{
    try{
      const r=await fetch("./offline-marketplace.json",{cache:"force-cache"});
      if(!r.ok)return false;
      const d=await r.json();
      if(!Array.isArray(d.stores)||!Array.isArray(d.products))return false;
      marketStores=d.stores;marketSellerProducts=d.products;marketLoadedAt=Date.now();
      populateMarketplaceFilters?.();
      renderMarketplaceHome?.($("marketHomeSearch")?.value||"");
      renderHomeProducts?.();
      return marketStores.length>0||marketSellerProducts.length>0;
    }catch{return false}
  })();
  try{return await offlineMarketSnapshotPromise}finally{offlineMarketSnapshotPromise=null}
}
loadOfflineMarketplaceSnapshot().catch(()=>{});
let marketCategory="",marketLocation="",marketSort="recommended",marketMoqOne=false;
let marketProductCurrent=null,marketProductOrigin="marketplaceHomePanel";
let manualPaymentOrderRef="",paymentStatusTimer=null;
let orderFilter = null;
let signUpMode = false;
let authMethod = "email";
let guestBrowseMode = false;
const GUEST_BROWSE_CODE = "RNV-16032005";
let incomingCartHandled = false;
let realtimeChannels = [];
let messageConversations=[],messageCurrent=null,messageRole=null,messagePoll=null,messageRealtimeChannel=null,messageRefreshPromise=null,messageRefreshQueued=false,msgAttachment=null,msgRecorder=null,msgStream=null,msgChunks=[],msgStarted=0,msgPaused=0,msgPauseStarted=0,msgTimer=null,msgReplyingTo=null,msgEditingMessage=null,msgPressTimer=null;
const MESSAGE_ENDPOINT=cfg.supabaseUrl+"/functions/v1/ranova-messaging";
const PAYMENT_ENDPOINT=cfg.supabaseUrl+"/functions/v1/ranova-payment-gateway";
const ORDER_STATUS_ENDPOINT=cfg.supabaseUrl+"/functions/v1/ranova-order-status";
const FAST_CACHE_TTL=5*60*1000;
let messagesLoadedAt=0,toPayLoadedAt=0,secondaryLoadPromise=null;
let initializedUserId=null,sessionApplyInFlight=false;
let activePanelId="marketplaceHomePanel";
let simpleDiscoveryOrigin="homePanel";
let simpleDiscoveryProductId=null;
let recommendationRotation=0,recommendationTimer=null;
let homeRecommendationLimit=20,homeRecommendationObserver=null;
const panelPainted=new Set();
function afterPaint(fn){requestAnimationFrame(()=>setTimeout(fn,0))}
function markPanelPainted(id){panelPainted.add(id)}
function panelIsPainted(id){return panelPainted.has(id)}

const $ = (id) => document.getElementById(id);
function setAuthOnlyMode(on){
  document.body.classList.toggle("ranova-auth-only",!!on);
  if(on){
    appBox?.classList.add("hide");
    authBox?.classList.remove("hide");
  }else{
    authBox?.classList.add("hide");
  }
}
function showAuthConsole(createAccount=false){
  guestBrowseMode=false;
  if(createAccount)signUpMode=true;
  setAuthOnlyMode(true);
  if($("authMsg"))$("authMsg").textContent="";
  authUI();
  window.scrollTo(0,0);
}
window.RANOVA_IS_SIGNED_IN=()=>!!user;
window.RANOVA_SHOW_AUTH=showAuthConsole;
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const money = (n,c='GHS') => n == null ? "Ask for price" : "GHC " + Number(n).toLocaleString("en-GH",{minimumFractionDigits:2,maximumFractionDigits:2});
const imageFor = (p) => {
  const imgs = (p.product_images || []).slice().sort((a,b)=>(b.is_primary?1:0)-(a.is_primary?1:0)||(a.sort_order||0)-(b.sort_order||0));
  return imgs[0]?.image_url || "";
};
function hidePreparationScreen(){
  if(setup)setup.classList.add("hide");
  if(appBox&&(user||guestBrowseMode))appBox.classList.remove("hide");
}
function showToast(msg){toast.textContent=msg;toast.classList.add("show");clearTimeout(showToast.t);showToast.t=setTimeout(()=>toast.classList.remove("show"),1700)}
function statusLabel(s){return ({
  quote_pending:"Quote pending",awaiting_confirmation:"To pay",awaiting_payment:"To pay",
  payment_confirmed:"Payment confirmed",preparing:"Preparing",ready_for_dispatch:"Ready for dispatch",
  dispatched:"Dispatched",out_for_delivery:"On the way",delivered:"Delivered",cancelled:"Cancelled",
  return_requested:"Return requested",returned:"Returned",refund_pending:"Refund pending",refunded:"Refunded"
})[s] || String(s||"").replaceAll("_"," ")}
function prettyKey(s){return String(s||"").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase())}
function setBadge(id,n){const el=$(id);if(!el)return;el.textContent=n;el.classList.toggle("hide",!n)}

function fastCacheKey(){return user?"rpe-fast-"+user.id:""}
function saveFastCache(){
  if(!user)return;
  try{sessionStorage.setItem(fastCacheKey(),JSON.stringify({
    t:Date.now(),profile,products,favorites:[...favorites],recentIds,cartId,cartItems,orders,notifications,addresses,returns,
    toPayOrders,toPayStores,toPayRecommendations,messageConversations,marketStores,marketSellerProducts,marketSavedProducts:[...marketSavedProducts],marketLoadedAt
  }))}catch{}
}
function restoreFastCache(){
  if(!user)return false;
  try{
    const raw=sessionStorage.getItem(fastCacheKey());if(!raw)return false;
    const d=JSON.parse(raw);if(!d?.t||Date.now()-d.t>FAST_CACHE_TTL)return false;
    profile=d.profile||null;products=d.products||[];favorites=new Set(d.favorites||[]);recentIds=d.recentIds||[];
    cartId=d.cartId||null;cartItems=d.cartItems||[];orders=d.orders||[];notifications=d.notifications||[];
    addresses=d.addresses||[];returns=d.returns||[];toPayOrders=d.toPayOrders||[];toPayStores=d.toPayStores||[];
    toPayRecommendations=d.toPayRecommendations||[];messageConversations=d.messageConversations||[];marketStores=d.marketStores||[];marketSellerProducts=d.marketSellerProducts||[];marketSavedProducts=new Set(d.marketSavedProducts||[]);marketLoadedAt=d.marketLoadedAt||0;
    renderAll();
    if(messageConversations.length){renderMessageList();setBadge("bottomMessageCount",messageConversations.filter(x=>x.unread).length)}
    return true;
  }catch{return false}
}
function idleRun(fn,timeout=1200){if("requestIdleCallback"in window)requestIdleCallback(fn,{timeout});else setTimeout(fn,250)}
async function contactRpe(subject="Shopping enquiry",draft="Hello Ranova Prime Enterprise, I need help with my order or shopping."){
 showPanel("messagesPanel");
 try{const found=await sb.from("ranova_seller_stores").select("id").eq("slug","ranova-prime-enterprise").eq("store_status","active").maybeSingle();if(found.error)throw found.error;if(!found.data)throw Error("RANOVA Store is currently unavailable. Please try again later.");const out=await messageApi({action:"start",store_id:found.data.id,subject});await openMessageConversation(out.conversation.id);$("msgInput").value=draft;updateMsgAction();$("msgInput").focus()}catch(e){showToast(e.message||"Could not open messages")}
}

function showPanel(id){
  hidePreparationScreen();
  const next=$(id);if(!next)return;
  activePanelId=id;
  document.querySelectorAll(".panel.active").forEach(x=>x.classList.remove("active"));
  next.classList.add("active");
  document.querySelectorAll(".bottom [data-panel]").forEach(b=>b.classList.toggle("active",b.dataset.panel===id));
  if($("bottomCart"))$("bottomCart").classList.toggle("active",id==="cartPanel");
  window.scrollTo(0,0);

  // Paint the destination first. Any database refresh happens only after
  // the browser has displayed the tapped section.
  afterPaint(()=>{
    if(id==="notifPanel"){if(!panelIsPainted(id)){renderNotifications();markPanelPainted(id)}markNotificationsRead().catch(()=>{})}
    else if(id==="ordersPanel"){if(!panelIsPainted(id)){renderOrders();markPanelPainted(id)}}
    else if(id==="savedPanel"){if(!panelIsPainted(id)){renderSaved();markPanelPainted(id)}}
    else if(id==="recentPanel"){if(!panelIsPainted(id)){renderRecent();markPanelPainted(id)}}
    else if(id==="addressPanel"){if(!panelIsPainted(id)){renderAddresses();markPanelPainted(id)}}
    else if(id==="messagesPanel"){
      if(!panelIsPainted(id)){renderMessageList();markPanelPainted(id)}
      if(Date.now()-messagesLoadedAt>30000)loadMessageConversations().catch(()=>{});
    }else if(id==="toPayPanel"){
      if(!panelIsPainted(id)){renderToPayOrders($("toPaySearch")?.value||"");markPanelPainted(id)}
      if(Date.now()-toPayLoadedAt>30000)loadToPayOrders().catch(e=>showToast(e.message||"Could not load unpaid orders"));
    }else if(id==="marketplaceHomePanel"){
      if(!panelIsPainted(id)){renderMarketplaceHome($("marketHomeSearch")?.value||"");markPanelPainted(id)}
      if(Date.now()-marketLoadedAt>60000)loadMarketplaceHomeData().catch(()=>{renderMarketplaceHome($("marketHomeSearch")?.value||"")});
    }
  });
}
document.addEventListener("click",e=>{
  const s=e.target.closest("[data-order-filter]");
  if(s){e.preventDefault();orderFilter=s.dataset.orderFilter;panelPainted.delete("ordersPanel");showPanel("ordersPanel");return}
  const b=e.target.closest("[data-panel]");
  if(b){e.preventDefault();orderFilter=null;showPanel(b.dataset.panel);return}
  const coming=e.target.closest("[data-coming]");
  if(coming){showToast(coming.dataset.coming+" is coming soon to RANOVA.")}
});
if($("simpleDiscoveryBack"))$("simpleDiscoveryBack").onclick=()=>showPanel(simpleDiscoveryOrigin||"homePanel");
if($("simpleDiscoveryAdd"))$("simpleDiscoveryAdd").onclick=async()=>{
  const id=simpleDiscoveryProductId;if(!id)return;
  await addToCart(id);
};
if($("simpleDiscoverySave"))$("simpleDiscoverySave").onclick=async()=>{
  const id=simpleDiscoveryProductId;if(!id)return;
  await toggleFavorite(id);
  $("simpleDiscoverySave").textContent=favorites.has(id)?"★ Saved":"☆ Save";
};
if($("simpleDiscoveryStore"))$("simpleDiscoveryStore").onclick=()=>{
  const url=$("simpleDiscoveryStore").dataset.url;if(url)location.href=url;
};
document.addEventListener("click",e=>{
  const related=e.target.closest("[data-simple-related]");
  if(!related)return;
  const p=products.find(x=>x.id===related.dataset.simpleRelated);if(!p)return;
  renderSimpleDiscoveryProduct(p,true);
  recentIds=[p.id,...recentIds.filter(x=>x!==p.id)].slice(0,20);
  panelPainted.delete("recentPanel");
  sb.from("recently_viewed").upsert({user_id:user.id,product_id:p.id,viewed_at:new Date().toISOString()},{onConflict:"user_id,product_id"}).then(()=>saveFastCache()).catch(()=>{});
  window.scrollTo(0,0);
});
if($("contactShortcut"))$("contactShortcut").onclick=()=>contactRpe();
if($("helpContact"))$("helpContact").onclick=()=>contactRpe();
if($("notifBtn"))$("notifBtn").onclick=()=>showPanel("notifPanel");
if($("cartBtn"))$("cartBtn").onclick=openCart;
const bottomHome=document.querySelector('.bottom [data-panel="marketplaceHomePanel"]');
if(bottomHome)bottomHome.onclick=e=>{e.preventDefault();orderFilter=null;showPanel("marketplaceHomePanel")};
if($("bottomMessages"))$("bottomMessages").onclick=e=>{e.preventDefault();orderFilter=null;showPanel("messagesPanel")};
if($("bottomCart"))$("bottomCart").onclick=e=>{e.preventDefault();e.stopPropagation();orderFilter=null;openCart()};
if($("bottomMe"))$("bottomMe").onclick=e=>{
  e.preventDefault();
  orderFilter=null;
  showPanel("homePanel");
};
if($("openCartShortcut"))$("openCartShortcut").onclick=openCart;
$("closeCart").onclick=closeCart;
if($("cartSelectAll"))$("cartSelectAll").onchange=e=>{const entries=cartUnifiedEntries().filter(i=>i.available);entries.forEach(i=>e.target.checked?cartSelectedKeys.add(cartItemKey(i)):cartSelectedKeys.delete(cartItemKey(i)));renderCart()};
if($("cartEditToggle"))$("cartEditToggle").onclick=()=>{cartEditMode=!cartEditMode;$("cartEditToggle").textContent=cartEditMode?"Done":"Edit";renderCart()};
if($("cartAllTab"))$("cartAllTab").onclick=()=>{cartViewMode="all";renderCart()};
if($("cartAvailableTab"))$("cartAvailableTab").onclick=()=>{cartViewMode="available";renderCart()};
if($("cartSavedTab"))$("cartSavedTab").onclick=()=>showPanel("savedPanel");
if($("cartCheckoutSelected"))$("cartCheckoutSelected").onclick=openMarketplaceCheckout;
$("cartDrawer").addEventListener("click",e=>{if(e.target===$("cartDrawer"))closeCart()});
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeCart()});

async function enterGuestBrowse(){
  guestBrowseMode=true;
  cleanupRealtime();
  user=null;
  profile={buyer_code:GUEST_BROWSE_CODE,first_name:"",last_name:"",phone:"",avatar_url:""};
  favorites=new Set();recentIds=[];cartId=null;cartItems=[];orders=[];notifications=[];addresses=[];returns=[];
  setup.classList.add("hide");
  setAuthOnlyMode(false);
  appBox.classList.remove("hide");
  if($("helloName"))$("helloName").textContent=GUEST_BROWSE_CODE;
  if($("accountAvatar"))$("accountAvatar").textContent="R";
  showPanel("marketplaceHomePanel");
  await loadOfflineMarketplaceSnapshot().catch(()=>{});

  // Load only public catalogue data. No cart, orders, messages or private profile data.
  try{
    const {data,error}=await sb.from("products")
      .select("id,legacy_id,sku,name,slug,brand,short_description,description,price,currency,stock_status,category_id,dimensions,specifications,product_images(image_url,is_primary,sort_order),categories(name)")
      .eq("active",true).order("created_at",{ascending:false}).limit(120);
    if(!error){products=data||[];renderMarketplaceHome($("marketHomeSearch")?.value||"");}
  }catch{}
  loadMarketplaceHomeData().catch(()=>{renderMarketplaceHome($("marketHomeSearch")?.value||"")});
}

function exitGuestToRegistration(){
  if(!guestBrowseMode)return;
  guestBrowseMode=false;
  setup.classList.add("hide");
  showAuthConsole(true);
}

window.RANOVA_ENTER_GUEST_BROWSE=enterGuestBrowse;
window.RANOVA_GUEST_BROWSE_CODE=GUEST_BROWSE_CODE;

// Guest browsing is intentionally read-only. Any product/action intent returns
// directly to account creation with no toast or extra notification.
document.addEventListener("click",e=>{
  if(!guestBrowseMode)return;
  const restricted=e.target.closest([
    "[data-add]",
    "[data-fav]",
    "[data-market-save]",
    "#marketProductSave",
    "#marketProductBuy",
    "#marketProductStore",
    "#marketProductMessage",
    "#simpleDiscoveryAdd",
    "#simpleDiscoveryStore",
    "#simpleDiscoverySave",
    "#bottomMessages",
    "#bottomCart",
    "#bottomMe",
    "[data-panel='messagesPanel']",
    "[data-panel='savedPanel']",
    "[data-panel='homePanel']",
    ".seller-switch",
    ".gear"
  ].join(","));
  if(!restricted)return;
  e.preventDefault();
  e.stopImmediatePropagation();
  exitGuestToRegistration();
},true);

function authUI(){
  $("authSubmit").textContent=signUpMode?"Create my account":"Sign in";
  $("signInTab").classList.toggle("active",!signUpMode);
  $("createTab").classList.toggle("active",signUpMode);
  $("authMethodEmail").classList.toggle("active",authMethod==="email");
  $("authMethodPhone").classList.toggle("active",authMethod==="phone");
  $("authEmailFields").classList.toggle("hide",authMethod!=="email");
  $("authPhoneFields").classList.toggle("hide",authMethod!=="phone");
  $("password").autocomplete=signUpMode?"new-password":"current-password";
}
$("signInTab").onclick=()=>{signUpMode=false;$("authMsg").textContent="";authUI()};
$("createTab").onclick=()=>{signUpMode=true;$("authMsg").textContent="";authUI()};
$("authMethodEmail").onclick=()=>{authMethod="email";$("authMsg").textContent="";authUI()};
$("authMethodPhone").onclick=()=>{authMethod="phone";$("authMsg").textContent="";authUI()};
$("togglePassword").onclick=()=>{
  const p=$("password"),show=p.type==="password";p.type=show?"text":"password";
  $("togglePassword").textContent=show?"Hide":"Show";
  $("togglePassword").setAttribute("aria-label",show?"Hide password":"Show password");
};
$("authSubmit").onclick=async()=>{
  const email=$("email").value.trim();
  const password=$("password").value;
  const countryCode=$("countryCode").value;
  const localPhone=$("phone").value.trim().replace(/\D/g,"").replace(/^0+/,"");
  const phone=countryCode+localPhone;
  $("authMsg").textContent="Working…";
  try{
    if(password.length<8){$("authMsg").textContent="Use at least 8 characters for your password.";return}
    let error;
    if(authMethod==="email"){
      if(!email){$("authMsg").textContent="Please enter your email address.";return}
      if(signUpMode){
        ({error}=await sb.auth.signUp({
          email,password,
          options:{emailRedirectTo:location.origin+location.pathname+location.search}
        }));
      }else{
        ({error}=await sb.auth.signInWithPassword({email,password}));
      }
    }else{
      if(localPhone.length<7){$("authMsg").textContent="Please enter a valid phone number.";return}
      if(signUpMode){
        ({error}=await sb.auth.signUp({
          phone,password,
          options:{data:{phone}}
        }));
      }else{
        ({error}=await sb.auth.signInWithPassword({phone,password}));
      }
    }
    if(error){$("authMsg").textContent=error.message;return}
    if(signUpMode){
      $("authMsg").textContent=authMethod==="email"
        ?"Your account has been created. Check your email if confirmation is required."
        :"Your account has been created. Complete phone verification if RANOVA asks for it.";
      $("password").value="";
    }
  }catch(e){$("authMsg").textContent="We couldn't complete that. Please try again."}
};
$("signOut").onclick=()=>sb.auth.signOut();

function handleRequestedPanel(){
  const qs=new URLSearchParams(location.search);
  const forceHome=qs.get("home")==="1";
  const requested=forceHome?"marketplaceHomePanel":(qs.get("panel")||"");
  const allowed=new Set(["marketplaceHomePanel","messagesPanel","cartPanel","savedPanel","homePanel","ordersPanel","toPayPanel","recentPanel","addressPanel","notifPanel","helpPanel"]);
  if(!allowed.has(requested))return false;
  orderFilter=null;
  showPanel(requested);
  const url=new URL(location.href);
  url.searchParams.delete("panel");
  url.searchParams.delete("home");
  history.replaceState(null,"",url.pathname+(url.searchParams.toString()?"?"+url.searchParams.toString():""));
  return true;
}
async function handleRequestedConversation(){
  const qs=new URLSearchParams(location.search),cid=qs.get("conversation")||"";
  if(!cid)return false;
  showPanel("messagesPanel");
  try{await openMessageConversation(cid)}catch(e){showToast(e.message||"Could not open conversation")}
  const url=new URL(location.href);
  url.searchParams.delete("conversation");
  history.replaceState(null,"",url.pathname+(url.searchParams.toString()?"?"+url.searchParams.toString():""));
  return true;
}

async function boot(){
  const {data:{session}}=await sb.auth.getSession();
  await applySession(session,true);
  sb.auth.onAuthStateChange((event,session)=>{
    setTimeout(()=>{
      const nextId=session?.user?.id||null;
      if(event==="SIGNED_OUT"||!nextId){applySession(null,false);return}
      if(initializedUserId===nextId){
        user=session.user;
        return;
      }
      applySession(session,false);
    },0);
  });
}
async function applySession(session,initial=false){
  const nextUser=session?.user||null;
  const nextId=nextUser?.id||null;

  if(!nextUser){
    cleanupRealtime();
    initializedUserId=null;
    user=null;
    setup.classList.add("hide");
    setAuthOnlyMode(true);
    authUI();
    return;
  }

  // If the same signed-in user is already inside the app, never replace
  // the current screen with the loading page on token refresh/auth events.
  if(initializedUserId===nextId && appBox && !appBox.classList.contains("hide")){
    user=nextUser;
    return;
  }
  if(sessionApplyInFlight)return;
  sessionApplyInFlight=true;

  cleanupRealtime();
  guestBrowseMode=false;
  user=nextUser;
  setAuthOnlyMode(false);

  // Keep the actual app visible immediately. Data paints from cache first,
  // then refreshes silently in the background.
  const cached=restoreFastCache();
  setup.classList.add("hide");
  appBox.classList.remove("hide");

  // A fresh signed-in launch always starts on the marketplace Home feed.
  // Account/Me stays available from the bottom navigation.
  if(initial){
    showPanel("marketplaceHomePanel");
  }
  if(!cached){
    // Render the existing shell immediately rather than showing
    // "Preparing My RPE..." between destinations.
    try{renderAll()}catch{}
  }

  try{
    await importStoreShoppingDrafts().catch(()=>{});
    await loadAll();
    initializedUserId=nextId;
    setup.classList.add("hide");
    setAuthOnlyMode(false);
    appBox.classList.remove("hide");
    subscribeRealtime();
    handleRequestedPanel();
    handleRequestedConversation().catch(()=>{});
    handleIncomingCartLink().catch(()=>{});
    afterPaint(()=>loadMessageConversations(true).catch(()=>{}));
    setTimeout(()=>loadToPayOrders(true).catch(()=>{}),80);
    setTimeout(()=>loadMarketplaceHomeData().catch(()=>{renderMarketplaceHome($("marketHomeSearch")?.value||"")}),140);
    handleDirectPaymentLink().catch(()=>{});
    handlePaymentReturn().catch(()=>{});
  }catch(e){
    console.error(e);
    // Do not blank an already-open app because one refresh call failed.
    if(!cached)showToast("Some account information is still loading.");
  }finally{
    sessionApplyInFlight=false;
  }
}

async function loadAll(){
  const uid=user.id;
  const [prof,prod,cart,ord]=await Promise.all([
    sb.from("profiles").select("user_id,buyer_code,first_name,last_name,phone,avatar_url").eq("user_id",uid).maybeSingle(),
    sb.from("products").select("id,legacy_id,sku,name,slug,brand,short_description,description,price,currency,stock_status,category_id,dimensions,specifications,product_images(image_url,is_primary,sort_order),categories(name)").eq("active",true).order("created_at",{ascending:false}).limit(120),
    sb.from("carts").select("id").eq("user_id",uid).maybeSingle(),
    sb.from("orders").select("id,order_number,user_id,address_id,order_type,order_status,payment_status,subtotal,discount,delivery_fee,total,currency,created_at,updated_at,order_items(id,product_id,product_name_snapshot,sku_snapshot,quantity,unit_price,line_total)").eq("user_id",uid).order("created_at",{ascending:false}).limit(60)
  ]);
  [prof,prod,cart,ord].forEach(x=>{if(x.error)throw x.error});
  profile=prof.data;products=prod.data||[];cartId=cart.data?.id||null;orders=ord.data||[];
  renderAll();
  if(activePanelId==="marketplaceHomePanel")renderMarketplaceHome($("marketHomeSearch")?.value||"");
  panelPainted.clear();
  ["homePanel","shopPanel","ordersPanel","savedPanel","recentPanel","addressPanel","notifPanel","profilePanel"].forEach(markPanelPainted);
  saveFastCache();

  secondaryLoadPromise=Promise.all([
    sb.from("favorites").select("product_id").eq("user_id",uid),
    sb.from("ranova_buyer_saved_products").select("product_id").eq("user_id",uid),
    sb.from("recently_viewed").select("product_id,viewed_at").eq("user_id",uid).order("viewed_at",{ascending:false}).limit(20),
    sb.from("notifications").select("id,user_id,type,title,message,related_order_id,read_at,created_at").eq("user_id",uid).order("created_at",{ascending:false}).limit(40),
    sb.from("addresses").select("id,user_id,label,recipient_name,phone,region,city,area,street_address,landmark,is_default,created_at").eq("user_id",uid).order("is_default",{ascending:false}).order("created_at",{ascending:false}).limit(20),
    sb.from("return_requests").select("id,order_id,order_item_id,user_id,reason,return_status,created_at,updated_at").eq("user_id",uid).order("created_at",{ascending:false}).limit(30),
    Promise.all([loadCartItems(),loadMarketplaceCart()]).then(()=>({data:null,error:null}))
  ]).then(([fav,marketFav,rec,noti,addr,ret])=>{
    [fav,marketFav,rec,noti,addr,ret].forEach(x=>{if(x?.error)throw x.error});
    favorites=new Set((fav.data||[]).map(x=>x.product_id));
    marketSavedProducts=new Set((marketFav.data||[]).map(x=>x.product_id));
    recentIds=(rec.data||[]).map(x=>x.product_id);
    notifications=noti.data||[];addresses=addr.data||[];returns=ret.data||[];
    renderProducts(filteredProductsNow());renderHomeProducts();renderSaved();renderRecent();renderCart();renderNotifications();renderAddresses();renderCounts();
    ["savedPanel","recentPanel","addressPanel","notifPanel"].forEach(markPanelPainted);
    saveFastCache();
  }).catch(console.error);
}
async function loadCartItems(){
  if(!cartId){cartItems=[];return}
  const {data,error}=await sb.from("cart_items").select("id,quantity,product_id,products(id,name,sku,price,currency,stock_status,product_images(image_url,is_primary,sort_order))").eq("cart_id",cartId).order("created_at").limit(100);
  if(error)throw error;cartItems=data||[];
}

async function importStoreShoppingDrafts(){
  if(!user||!navigator.onLine)return false;
  let changed=false;
  const drafts=readLocalJson(UNIVERSAL_MARKET_CART_DRAFT_KEY,{});
  for(const [storeId,items] of Object.entries(drafts||{})){
    try{
      const clean=items&&typeof items==="object"?items:{};
      const req=Object.keys(clean).length
        ? sb.from("ranova_buyer_carts").upsert({user_id:user.id,store_id:storeId,items:clean,updated_at:new Date().toISOString()},{onConflict:"user_id,store_id"})
        : sb.from("ranova_buyer_carts").delete().eq("user_id",user.id).eq("store_id",storeId);
      const {error}=await req;if(error)throw error;
      delete drafts[storeId];changed=true;
    }catch{}
  }
  writeLocalJson(UNIVERSAL_MARKET_CART_DRAFT_KEY,drafts);

  const pending=readLocalJson(PENDING_MARKET_SAVED_KEY,{});
  for(const [productId,save] of Object.entries(pending||{})){
    try{
      const req=save
        ? sb.from("ranova_buyer_saved_products").upsert({user_id:user.id,product_id:productId,saved_at:new Date().toISOString()},{onConflict:"user_id,product_id"})
        : sb.from("ranova_buyer_saved_products").delete().eq("user_id",user.id).eq("product_id",productId);
      const {error}=await req;if(error)throw error;
      delete pending[productId];changed=true;
    }catch{}
  }
  writeLocalJson(PENDING_MARKET_SAVED_KEY,pending);
  return changed;
}
async function refreshBuyerShoppingState(){
  if(!user||!navigator.onLine)return;
  if(shoppingRefreshPromise)return shoppingRefreshPromise;
  shoppingRefreshPromise=(async()=>{
    await importStoreShoppingDrafts().catch(()=>{});
    marketCartLoaded=false;
    await loadMarketplaceCart().catch(()=>{});
    const {data,error}=await sb.from("ranova_buyer_saved_products").select("product_id").eq("user_id",user.id);
    if(!error)marketSavedProducts=new Set((data||[]).map(x=>x.product_id));
    renderCart();renderSaved();renderHomeProducts();renderMarketplaceHome($("marketHomeSearch")?.value||"");saveFastCache();
  })();
  try{return await shoppingRefreshPromise}finally{shoppingRefreshPromise=null}
}

function setupShoppingSynchronization(){
  try{
    if("BroadcastChannel" in window){
      shoppingSyncChannel=new BroadcastChannel(SHOPPING_SYNC_CHANNEL);
      shoppingSyncChannel.addEventListener("message",e=>{
        if(e.data?.type==="shopping-change"&&user)refreshBuyerShoppingState().catch(()=>{});
      });
    }
  }catch{}
  window.addEventListener("storage",e=>{
    if((e.key==="ranova-shopping-ping"||e.key===UNIVERSAL_MARKET_CART_DRAFT_KEY||e.key===PENDING_MARKET_SAVED_KEY)&&user){
      refreshBuyerShoppingState().catch(()=>{});
    }
  });
}
setupShoppingSynchronization();

async function loadMarketplaceCart(){
  if(!user){marketCartRows=[];marketCartProducts=new Map();marketCartStores=new Map();marketCartLoaded=false;return}
  if(marketCartLoadPromise)return marketCartLoadPromise;
  marketCartLoadPromise=(async()=>{
  const {data:rows,error}=await sb.from("ranova_buyer_carts").select("store_id,items,updated_at").eq("user_id",user.id);
  if(error)throw error;
  marketCartRows=(rows||[]).map(r=>({store_id:r.store_id,items:r.items&&typeof r.items==="object"?r.items:{},updated_at:r.updated_at}));
  const productIds=[...new Set(marketCartRows.flatMap(r=>Object.keys(r.items||{})))];
  const storeIds=[...new Set(marketCartRows.map(r=>r.store_id).filter(Boolean))];
  marketCartProducts=new Map();
  marketCartStores=new Map();
  if(productIds.length){
    const {data,error:pe}=await sb.from("ranova_seller_products")
      .select("id,store_id,name,sku,category,price,currency,moq,stock_quantity,stock_status,unit_label,primary_image_url,image_urls,pricing_tiers,product_status")
      .in("id",productIds);
    if(pe)throw pe;
    (data||[]).forEach(p=>marketCartProducts.set(p.id,p));
  }
  if(storeIds.length){
    const known=new Map(marketStores.map(s=>[s.id,s]));
    storeIds.forEach(id=>{if(known.has(id))marketCartStores.set(id,known.get(id))});
    const missing=storeIds.filter(id=>!marketCartStores.has(id));
    if(missing.length){
      const {data,error:se}=await sb.from("ranova_seller_stores").select("id,store_name,slug,logo_url,store_status").in("id",missing);
      if(se)throw se;
      (data||[]).forEach(s=>marketCartStores.set(s.id,s));
    }
  }
  restoreMarketplaceCartDrafts();
  marketCartLoaded=true;
  })();
  try{return await marketCartLoadPromise}finally{marketCartLoadPromise=null}
}
function marketCartEntries(){
  const out=[];
  marketCartRows.forEach(row=>{
    Object.entries(row.items||{}).forEach(([productId,quantity])=>{
      const product=marketCartProducts.get(productId)||marketSellerProducts.find(p=>p.id===productId);
      if(!product)return;
      const q=marketProductQuantity(product,quantity);
      if(q<1)return;
      out.push({store_id:row.store_id,product_id:productId,quantity:q,product,store:marketCartStores.get(row.store_id)||marketStores.find(s=>s.id===row.store_id)||{}});
    });
  });
  return out;
}
function marketCartLineCount(){return marketCartEntries().length}
function cartLineCount(){return cartItems.length+marketCartLineCount()}
function cartQuantityCount(){return cartItems.reduce((n,i)=>n+Number(i.quantity||0),0)+marketCartEntries().reduce((n,i)=>n+Number(i.quantity||0),0)}
async function persistMarketCartRow(storeId){
  const row=marketCartRows.find(r=>r.store_id===storeId);
  if(!row||!Object.keys(row.items||{}).length){
    marketCartRows=marketCartRows.filter(r=>r.store_id!==storeId);
    const {error}=await sb.from("ranova_buyer_carts").delete().eq("user_id",user.id).eq("store_id",storeId);
    if(error)throw error;
    return;
  }
  const {error}=await sb.from("ranova_buyer_carts").upsert({
    user_id:user.id,store_id:storeId,items:row.items,updated_at:new Date().toISOString()
  },{onConflict:"user_id,store_id"});
  if(error)throw error;
}
async function addMarketplaceToCart(product,quantity){
  if(!user){showAuthConsole(true);return}
  if(!marketCartLoaded)try{await loadMarketplaceCart()}catch{}
  if(!product?.id||!product.store_id)return showToast("Product unavailable");
  const q=marketProductQuantity(product,quantity||product.moq||1);
  if(q<marketProductMinimum(product))return showToast("Quantity is below the minimum order");
  let row=marketCartRows.find(r=>r.store_id===product.store_id);
  if(!row){row={store_id:product.store_id,items:{}};marketCartRows.push(row)}
  const previous=Number(row.items[product.id]||0);
  row.items={...(row.items||{}),[product.id]:q};
  saveMarketplaceCartDrafts();
  marketCartProducts.set(product.id,product);
  const store=marketStores.find(s=>s.id===product.store_id);if(store)marketCartStores.set(store.id,store);
  renderCart();
  openCart();
  try{
    await persistMarketCartRow(product.store_id);
    clearMarketplaceCartDraft(product.store_id);
    announceShoppingChange("cart",product.store_id,product.id);
    showToast(previous?"Cart quantity updated":"Added to cart");
  }catch(e){
    if(previous)row.items[product.id]=previous;else delete row.items[product.id];
    renderCart();showToast("Could not update cart");
  }
}
async function changeMarketCartQty(storeId,productId,delta){
  const row=marketCartRows.find(r=>r.store_id===storeId),product=marketCartProducts.get(productId)||marketSellerProducts.find(p=>p.id===productId);
  if(!row||!product)return;
  const previous=Number(row.items[productId]||marketProductMinimum(product));
  const next=marketProductQuantity(product,previous+delta);
  if(next<marketProductMinimum(product))return;
  row.items={...(row.items||{}),[productId]:next};
  saveMarketplaceCartDrafts();renderCart();saveFastCache();
  try{await persistMarketCartRow(storeId);clearMarketplaceCartDraft(storeId);announceShoppingChange("cart",storeId,productId)}
  catch{row.items[productId]=previous;saveMarketplaceCartDrafts();renderCart();saveFastCache();showToast("Could not update quantity")}
}
async function removeMarketCartItem(storeId,productId){
  const row=marketCartRows.find(r=>r.store_id===storeId);if(!row)return;
  const previous=Number(row.items[productId]||0);
  const next={...(row.items||{})};delete next[productId];row.items=next;saveMarketplaceCartDrafts();renderCart();saveFastCache();
  try{await persistMarketCartRow(storeId);clearMarketplaceCartDraft(storeId);announceShoppingChange("cart",storeId,productId)}
  catch{row.items={...(row.items||{}),[productId]:previous};saveMarketplaceCartDrafts();renderCart();saveFastCache();showToast("Could not remove product")}
}
function marketUnitPrice(product,quantity){
  if(product?.price==null)return null;
  let price=Number(product.price);
  const tiers=Array.isArray(product.pricing_tiers)?product.pricing_tiers.slice().sort((a,b)=>Number(a.min_qty||0)-Number(b.min_qty||0)):[];
  tiers.forEach(t=>{if(Number(quantity)>=Number(t.min_qty||0)&&Number.isFinite(Number(t.unit_price)))price=Number(t.unit_price)});
  return price;
}
function marketplaceCartSubtotal(){
  let known=true,total=0;
  marketCartEntries().forEach(i=>{const price=marketUnitPrice(i.product,i.quantity);if(price==null)known=false;else total+=price*Number(i.quantity)});
  cartItems.forEach(i=>{const p=i.products||{};if(p.price==null)known=false;else total+=Number(p.price)*Number(i.quantity)});
  return known?total:null;
}



function renderAll(){
  const buyerCode=profile?.buyer_code||"RNV-BYR";
  $("helloName").textContent=buyerCode;
  $("helloName").setAttribute("title",buyerCode);
  if($("accountAvatar"))$("accountAvatar").textContent="R";
  $("profileFirst").value=profile?.first_name||"";
  $("profileLast").value=profile?.last_name||"";
  $("profilePhone").value=profile?.phone||"";
  renderProducts(products);
  renderHomeProducts();
  renderSaved();
  renderRecent();
  renderCart();
  renderOrders();
  renderNotifications();
  renderAddresses();
  renderCounts();
}
function productCard(p){
  const image=imageFor(p),cat=p.categories?.name||"RPE Product";
  return `<article class="product" data-product="${p.id}">
    <button class="product-open" data-open-product="${p.id}" style="display:block;width:100%;padding:0;border:0;background:#fff;text-align:left">
      ${image?'<img src="'+esc(image)+'" loading="lazy" alt="'+esc(p.name)+'">':'<div style="height:155px;display:grid;place-items:center;background:#f5f7f6;color:#93a49e;font-size:10px">RPE Product</div>'}
      <div class="product-copy"><h3>${esc(p.name)}</h3><small>${esc(cat)} • ${esc(p.sku||p.legacy_id||"RPE")}</small><small class="ranova-product-price" style="font-weight:800;color:#f05a21">${esc(money(p.price,p.currency))}</small></div>
    </button>
    <div class="product-copy" style="padding-top:0"><div class="product-actions"><button class="add" data-add="${p.id}">Add to cart</button><button class="fav" data-fav="${p.id}" aria-pressed="${favorites.has(p.id)}" aria-label="${favorites.has(p.id)?'Remove saved product':'Save product'}">${favorites.has(p.id)?"★":"☆"}</button></div></div>
  </article>`;
}
function renderProducts(list){
  $("productsGrid").innerHTML=list.length?list.map(productCard).join(""):'<div class="empty" style="grid-column:1/-1"><b>No matching products</b>Try another search.</div>';
}
function homeSellerCard(p){
  const store=marketStores.find(s=>s.id===p.store_id)||{},moq=Math.max(1,Number(p.moq||1));
  return '<article class="product home-seller-product">'+
    '<button class="home-market-save '+(marketSavedProducts.has(p.id)?"active":"")+'" type="button" data-market-save="'+esc(p.id)+'" aria-label="'+(marketSavedProducts.has(p.id)?"Remove saved product":"Save product")+'">'+(marketSavedProducts.has(p.id)?"★":"☆")+'</button>'+
    '<button class="product-open" data-home-seller-product="'+esc(p.id)+'" style="display:block;width:100%;padding:0;border:0;background:#fff;text-align:left">'+
      (p.primary_image_url?'<img src="'+esc(p.primary_image_url)+'" loading="lazy" decoding="async" alt="'+esc(p.name)+'">':'<div style="height:155px;display:grid;place-items:center;background:#f5f7f6;color:#93a49e;font-size:10px">Marketplace Product</div>')+
      '<div class="product-copy"><h3>'+esc(p.name||"Product")+'</h3>'+
      '<small class="home-store-name">'+esc(store.store_name||p.category||"Marketplace Store")+'</small>'+
      '<small class="ranova-product-price" style="font-weight:800;color:#f05a21">'+esc(p.price==null?"Ask for quote":money(p.price,p.currency||"GHS"))+'</small>'+
      (moq>1?'<span class="home-moq">MOQ '+esc(moq)+(p.unit_label?" "+esc(p.unit_label):"")+'</span>':'')+
      '</div>'+
    '</button>'+
  '</article>';
}
function homeRecommendationPoolSize(){
  return marketSellerProducts.filter(p=>p&&p.id).length||products.length;
}
function pickHomeRecommendations(limit=homeRecommendationLimit){
  const sellerPool=marketSellerProducts.filter(p=>p&&p.id);
  if(sellerPool.length){
    const storeBuckets=new Map();
    sellerPool.forEach(p=>{
      const key=p.store_id||"unknown";
      if(!storeBuckets.has(key))storeBuckets.set(key,[]);
      storeBuckets.get(key).push(p);
    });
    const stores=[...storeBuckets.keys()];
    const chosen=[],used=new Set();
    let round=0;
    while(chosen.length<limit&&round<sellerPool.length+stores.length+4){
      for(let i=0;i<stores.length&&chosen.length<limit;i++){
        const storeKey=stores[(i+recommendationRotation)%stores.length];
        const arr=storeBuckets.get(storeKey)||[];
        if(!arr.length)continue;
        const p=arr[(recommendationRotation+round+i)%arr.length];
        if(p&&!used.has(p.id)){used.add(p.id);chosen.push({kind:"seller",p})}
      }
      round++;
    }
    // Fill the rest with products from the complete marketplace catalogue,
    // while keeping duplicates out and preserving variety.
    const ordered=sellerPool.slice().sort((a,b)=>{
      const ac=String(a.category||""),bc=String(b.category||"");
      return ac.localeCompare(bc)||String(a.name||"").localeCompare(String(b.name||""));
    });
    for(let i=0;i<ordered.length&&chosen.length<limit;i++){
      const p=ordered[(i+recommendationRotation*3)%ordered.length];
      if(p&&!used.has(p.id)){used.add(p.id);chosen.push({kind:"seller",p})}
    }
    if(chosen.length)return chosen;
  }

  // Fallback catalogue: mix categories first, then fill from the full catalogue.
  const byCategory=new Map();
  products.forEach(p=>{
    const key=p.categories?.name||p.brand||"Other";
    if(!byCategory.has(key))byCategory.set(key,[]);
    byCategory.get(key).push(p);
  });
  const cats=[...byCategory.keys()],chosen=[],used=new Set();
  if(cats.length){
    let round=0;
    while(chosen.length<limit&&round<products.length+cats.length){
      for(let i=0;i<cats.length&&chosen.length<limit;i++){
        const arr=byCategory.get(cats[(i+recommendationRotation)%cats.length])||[];
        if(!arr.length)continue;
        const p=arr[(recommendationRotation+round+i)%arr.length];
        if(p&&!used.has(p.id)){used.add(p.id);chosen.push({kind:"legacy",p})}
      }
      round++;
    }
  }
  for(let i=0;i<products.length&&chosen.length<limit;i++){
    const p=products[(i+recommendationRotation)%products.length];
    if(p&&!used.has(p.id)){used.add(p.id);chosen.push({kind:"legacy",p})}
  }
  return chosen;
}
function observeMoreHomeRecommendations(){
  if(homeRecommendationObserver){homeRecommendationObserver.disconnect();homeRecommendationObserver=null}
  const sentinel=$("homeRecommendationsMore");
  if(!sentinel||!("IntersectionObserver" in window))return;
  homeRecommendationObserver=new IntersectionObserver(entries=>{
    if(!entries.some(x=>x.isIntersecting))return;
    const total=Math.min(100,homeRecommendationPoolSize());
    if(homeRecommendationLimit>=total)return;
    homeRecommendationLimit=Math.min(total,homeRecommendationLimit+8);
    renderHomeProducts();
  },{rootMargin:"500px 0px"});
  homeRecommendationObserver.observe(sentinel);
}
function renderHomeProducts(){
  const host=$("homeProducts");if(!host)return;
  const total=Math.min(100,homeRecommendationPoolSize());
  const picks=pickHomeRecommendations(Math.min(homeRecommendationLimit,total||homeRecommendationLimit));
  const hasMore=total>picks.length;
  host.innerHTML=picks.length
    ? picks.map(x=>x.kind==="seller"?homeSellerCard(x.p):productCard(x.p)).join("")+
      (hasMore?'<div id="homeRecommendationsMore" class="home-recommend-more"><span>More products loading…</span></div>':'<div class="home-recommend-end">You’re all caught up for now.</div>')
    : '<div class="empty" style="grid-column:1/-1">Products will appear here when the RPE catalogue is connected.</div>';
  observeMoreHomeRecommendations();
}
function startRecommendationRotation(){
  if(recommendationTimer)return;
  recommendationTimer=setInterval(()=>{
    if(document.hidden)return;
    recommendationRotation++;
    homeRecommendationLimit=Math.max(homeRecommendationLimit,20);
    renderHomeProducts();
  },45000);
}
function savedProductCard(item){
  const p=item.product,kind=item.kind;
  const image=kind==="market"?(p.primary_image_url||(Array.isArray(p.image_urls)?p.image_urls.find(Boolean):"")):imageFor(p);
  const desc=kind==="market"?(p.short_description||p.category||"Marketplace product"):(p.short_description||p.description||p.categories?.name||"RANOVA product");
  const price=kind==="market"?(p.price==null?"Ask for price":money(p.price,p.currency||"GHS")):money(p.price,p.currency);
  const openAttr=kind==="market"?'data-saved-market="'+esc(p.id)+'"':'data-open-product="'+esc(p.id)+'"';
  const removeAttr=kind==="market"?'data-market-save="'+esc(p.id)+'"':'data-fav="'+esc(p.id)+'"';
  return '<article class="saved-love-card">'+
    '<button class="saved-love-main" type="button" '+openAttr+'>'+
      (image?'<img src="'+esc(image)+'" alt="'+esc(p.name||"Product")+'" loading="lazy" decoding="async">':'<div class="saved-love-placeholder">Product</div>')+
      '<span class="saved-love-copy"><b>'+esc(p.name||"Product")+'</b><small>'+esc(String(desc||"").slice(0,110))+'</small><strong>'+esc(price)+'</strong></span>'+
    '</button>'+
    '<button class="saved-love-star active" type="button" '+removeAttr+' aria-label="Remove saved product">★</button>'+
  '</article>';
}
function renderSaved(){
  const rows=[
    ...marketSellerProducts.filter(p=>marketSavedProducts.has(p.id)).map(product=>({kind:"market",product})),
    ...products.filter(p=>favorites.has(p.id)).map(product=>({kind:"legacy",product}))
  ];
  $("savedGrid").classList.add("saved-love-grid");
  $("savedGrid").innerHTML=rows.length?rows.map(savedProductCard).join(""):'<div class="empty saved-love-empty"><b>No saved products yet</b>Tap ☆ on a product you want to remember.</div>';
}
function renderRecent(){const map=new Map(products.map(p=>[p.id,p]));const list=recentIds.map(id=>map.get(id)).filter(Boolean);$("recentGrid").innerHTML=list.length?list.map(productCard).join(""):'<div class="empty" style="grid-column:1/-1"><b>Nothing viewed yet</b>Products you open will appear here automatically.</div>'}

document.addEventListener("click",async e=>{
  const sellerHome=e.target.closest("[data-home-seller-product]");
  if(sellerHome){
    const p=marketSellerProducts.find(x=>x.id===sellerHome.dataset.homeSellerProduct);
    const url=sellerStoreProductUrl(p);
    if(url)location.href=url;else showToast("This seller store is not available right now.");
    return;
  }
  const add=e.target.closest("[data-add]"); if(add){e.stopPropagation();await addToCart(add.dataset.add);return}
  const fav=e.target.closest("[data-fav]"); if(fav){e.stopPropagation();await toggleFavorite(fav.dataset.fav);return}
  const open=e.target.closest("[data-open-product]"); if(open){openProduct(open.dataset.openProduct);return}
});
let productSearchFrame=0,marketSearchFrame=0;
$("searchBtn").onclick=searchProducts;
$("productSearch").addEventListener("input",()=>{cancelAnimationFrame(productSearchFrame);productSearchFrame=requestAnimationFrame(searchProducts)});
function searchProducts(){
  const q=$("productSearch").value.trim().toLowerCase();
  if(!q)return renderProducts(products);
  renderProducts(products.filter(p=>[p.name,p.sku,p.legacy_id,p.brand,p.categories?.name,p.short_description].some(x=>String(x||"").toLowerCase().includes(q))));
}
async function toggleMarketplaceSaved(id){
  if(!user){showAuthConsole(true);return}
  const wasSaved=marketSavedProducts.has(id);
  if(wasSaved)marketSavedProducts.delete(id);else marketSavedProducts.add(id);
  renderMarketplaceHome($("marketHomeSearch")?.value||"");
  renderHomeProducts();renderSaved();saveFastCache();
  if(marketProductCurrent?.id===id&&$("marketProductSave"))$("marketProductSave").textContent=marketSavedProducts.has(id)?"★":"☆";
  showToast(wasSaved?"Removed from saved":"Saved");
  const req=wasSaved
    ? sb.from("ranova_buyer_saved_products").delete().eq("user_id",user.id).eq("product_id",id)
    : sb.from("ranova_buyer_saved_products").upsert({user_id:user.id,product_id:id},{onConflict:"user_id,product_id"});
  const {error}=await req;
  if(!error)announceShoppingChange("saved",null,id);
  if(error){
    const offline=!navigator.onLine||/fetch|network|connection/i.test(String(error.message||error));
    if(offline){
      const pending=readLocalJson(PENDING_MARKET_SAVED_KEY,{});
      pending[id]=!wasSaved;writeLocalJson(PENDING_MARKET_SAVED_KEY,pending);
      showToast((wasSaved?"Removed":"Saved")+" — will sync when online");
    }else{
      if(wasSaved)marketSavedProducts.add(id);else marketSavedProducts.delete(id);
      renderMarketplaceHome($("marketHomeSearch")?.value||"");renderHomeProducts();renderSaved();saveFastCache();
      if(marketProductCurrent?.id===id&&$("marketProductSave"))$("marketProductSave").textContent=marketSavedProducts.has(id)?"★":"☆";
      showToast("Could not update saved products");
    }
  }
}

async function toggleFavorite(id){
  const wasSaved=favorites.has(id);
  if(wasSaved)favorites.delete(id);else favorites.add(id);
  renderProducts(filteredProductsNow());renderHomeProducts();renderSaved();renderRecent();saveFastCache();
  showToast(wasSaved?"Removed from saved":"Saved");
  const req=wasSaved
    ? sb.from("favorites").delete().eq("user_id",user.id).eq("product_id",id)
    : sb.from("favorites").insert({user_id:user.id,product_id:id});
  const {error}=await req;
  if(error){
    if(wasSaved)favorites.add(id);else favorites.delete(id);
    renderProducts(filteredProductsNow());renderHomeProducts();renderSaved();renderRecent();saveFastCache();
    showToast("Could not update saved products");
  }
}
function filteredProductsNow(){
  const q=$("productSearch").value.trim().toLowerCase();return q?products.filter(p=>[p.name,p.sku,p.legacy_id,p.brand,p.categories?.name,p.short_description].some(x=>String(x||"").toLowerCase().includes(q))):products
}
function renderSimpleDiscoveryProduct(p,keepOrigin=false){
  if(!p)return;
  simpleDiscoveryProductId=p.id;
  if(!keepOrigin)simpleDiscoveryOrigin=activePanelId||"homePanel";
  const image=imageFor(p);
  $("simpleDiscoveryImage").innerHTML=image
    ? '<img src="'+esc(image)+'" alt="'+esc(p.name)+'" loading="eager" decoding="async">'
    : '<div class="sd-empty">RPE Product</div>';
  $("simpleDiscoveryName").textContent=p.name||"Product";
  $("simpleDiscoveryCategory").textContent=p.categories?.name||"RPE Product";
  $("simpleDiscoveryPrice").textContent=money(p.price,p.currency);

  const selectedCategory=String(p.categories?.name||"").trim().toLowerCase();
  const related=[
    ...products.filter(x=>x.id!==p.id&&selectedCategory&&String(x.categories?.name||"").trim().toLowerCase()===selectedCategory),
    ...products.filter(x=>x.id!==p.id&&(!selectedCategory||String(x.categories?.name||"").trim().toLowerCase()!==selectedCategory))
  ].slice(0,5);

  $("simpleDiscoveryRelated").innerHTML=related.length
    ? '<h3>More products</h3>'+related.map(x=>{
        const img=imageFor(x);
        return '<button class="sd-related-card" type="button" data-simple-related="'+esc(x.id)+'">'+
          (img?'<img src="'+esc(img)+'" alt="'+esc(x.name)+'" loading="lazy" decoding="async">':'<span class="sd-related-empty">RPE</span>')+
          '<span class="sd-related-copy"><b>'+esc(x.name||"Product")+'</b><small>'+esc(x.categories?.name||"RPE Product")+'</small><strong>'+esc(money(x.price,x.currency))+'</strong></span>'+
        '</button>';
      }).join("")
    : "";

  const sellerProduct=matchingSellerProduct(p),storeUrl=sellerStoreProductUrl(sellerProduct);
  $("simpleDiscoverySave").textContent=favorites.has(p.id)?"★ Saved":"☆ Save";
  $("simpleDiscoveryStore").classList.toggle("hide",!storeUrl);
  $("simpleDiscoveryStore").dataset.url=storeUrl||"";
  $("simpleDiscoveryAdd").dataset.productId=p.id;
}
async function openProduct(id){
  const p=products.find(x=>x.id===id);if(!p)return;
  simpleDiscoveryProductId=p.id;
  simpleDiscoveryOrigin=activePanelId||"homePanel";
  const image=imageFor(p);
  $("simpleDiscoveryImage").innerHTML=image
    ? '<img src="'+esc(image)+'" alt="'+esc(p.name)+'" loading="eager" fetchpriority="high" decoding="async">'
    : '<div class="sd-empty">RPE Product</div>';
  $("simpleDiscoveryName").textContent=p.name||"Product";
  $("simpleDiscoveryCategory").textContent=p.categories?.name||"RPE Product";
  $("simpleDiscoveryPrice").textContent=money(p.price,p.currency);
  showPanel("simpleDiscoveryPanel");

  afterPaint(()=>renderSimpleDiscoveryProduct(p,true));
  recentIds=[id,...recentIds.filter(x=>x!==id)].slice(0,20);
  panelPainted.delete("recentPanel");
  sb.from("recently_viewed").upsert({user_id:user.id,product_id:id,viewed_at:new Date().toISOString()},{onConflict:"user_id,product_id"}).then(()=>saveFastCache()).catch(()=>{});
}

async function handleIncomingCartLink(){
  if(incomingCartHandled)return;
  const sku=new URLSearchParams(location.search).get("add");
  if(!sku)return;
  const p=products.find(x=>x.sku===sku);
  if(!p)return showToast("That product is not available right now");
  incomingCartHandled=true;
  history.replaceState(null,"",location.pathname);
  await addToCart(p.id);
  openCart();
}

async function addToCart(productId){
  if(!cartId)return showToast("Cart is not ready");
  const existing=cartItems.find(x=>x.product_id===productId);
  const product=products.find(x=>x.id===productId)||null;
  const previous=existing?existing.quantity:null;

  if(existing){
    existing.quantity=Math.min(99,existing.quantity+1);
  }else{
    cartItems.push({
      id:"temp-"+productId+"-"+Date.now(),
      quantity:1,
      product_id:productId,
      products:product?{
        id:product.id,name:product.name,sku:product.sku,price:product.price,currency:product.currency,
        stock_status:product.stock_status,product_images:product.product_images||[]
      }:null,
      __optimistic:true
    });
  }
  renderCart();saveFastCache();showToast("Added to cart");openCart();

  const res=existing
    ? await sb.from("cart_items").update({quantity:existing.quantity}).eq("id",existing.id)
    : await sb.from("cart_items").insert({cart_id:cartId,product_id:productId,quantity:1});
  if(res.error){
    if(existing)existing.quantity=previous;
    else cartItems=cartItems.filter(x=>!(x.__optimistic&&x.product_id===productId));
    renderCart();saveFastCache();showToast("Could not add product");
    return;
  }
  loadCartItems().then(()=>{renderCart();saveFastCache()}).catch(()=>{});
}
async function changeQty(item,delta){
  const previous=item.quantity;
  const q=Math.max(1,Math.min(99,item.quantity+delta));
  item.quantity=q;renderCart();saveFastCache();
  if(item.__optimistic)return;
  const {error}=await sb.from("cart_items").update({quantity:q}).eq("id",item.id);
  if(error){item.quantity=previous;renderCart();saveFastCache();showToast("Could not update quantity")}
}
async function removeCart(item){
  const index=cartItems.findIndex(x=>x.id===item.id);
  if(index<0)return;
  const removed=cartItems[index];
  cartItems.splice(index,1);renderCart();saveFastCache();
  if(removed.__optimistic)return;
  const {error}=await sb.from("cart_items").delete().eq("id",removed.id);
  if(error){cartItems.splice(Math.min(index,cartItems.length),0,removed);renderCart();saveFastCache();showToast("Could not remove product")}
}
function cartItemKey(entry){
  return entry.kind==="market"?"m:"+entry.store_id+":"+entry.product_id:"l:"+entry.id;
}
function cartUnifiedEntries(){
  const out=marketCartEntries().map(i=>({...i,kind:"market",available:i.product.product_status!=="inactive"&&i.product.stock_status!=="out_of_stock"&&Number(i.product.stock_quantity??1)>0}));
  cartItems.forEach(i=>out.push({kind:"legacy",id:i.id,product_id:i.product_id,quantity:Number(i.quantity||1),product:i.products||{},store_id:"ranova-prime",store:{store_name:"RANOVA Prime"},available:(i.products?.stock_status||"")!=="out_of_stock"}));
  return out;
}
function selectedCartEntries(){
  return cartUnifiedEntries().filter(i=>i.available&&cartSelectedKeys.has(cartItemKey(i)));
}
function selectedCartTotal(){
  let total=0,known=true;
  selectedCartEntries().forEach(i=>{
    const p=i.product||{};
    const unit=i.kind==="market"?marketUnitPrice(p,i.quantity):(p.price==null?null:Number(p.price));
    if(unit==null||!Number.isFinite(Number(unit)))known=false;else total+=Number(unit)*Number(i.quantity);
  });
  return known?total:null;
}
function ensureCartSelections(){
  const valid=cartUnifiedEntries().filter(i=>i.available);
  const validKeys=new Set(valid.map(cartItemKey));
  [...cartSelectedKeys].forEach(k=>{if(!validKeys.has(k))cartSelectedKeys.delete(k)});
  if(!cartSelectedKeys.size)valid.forEach(i=>cartSelectedKeys.add(cartItemKey(i)));
}
function toggleCartSelection(key,on){
  if(on)cartSelectedKeys.add(key);else cartSelectedKeys.delete(key);
  renderCart();
}
function renderCartRecommendations(){
  const host=$("cartRecommendations");if(!host)return;
  const picks=pickHomeRecommendations(8);
  host.innerHTML=picks.length?picks.map(x=>x.kind==="seller"?homeSellerCard(x.p):productCard(x.p)).join(""):'<div class="empty">Products will appear here as stores add them.</div>';
}
function renderCart(){
  const entries=cartUnifiedEntries();
  ensureCartSelections();
  const lineCount=entries.length;
  setBadge("cartCount",lineCount);setBadge("bottomCartCount",lineCount);
  if($("cartPageCount"))$("cartPageCount").textContent=lineCount+" item"+(lineCount===1?"":"s");
  const available=entries.filter(i=>i.available),unavailable=entries.filter(i=>!i.available);
  const selected=selectedCartEntries(),total=selectedCartTotal();
  if($("cartAllTab"))$("cartAllTab").classList.toggle("active",cartViewMode==="all");
  if($("cartAvailableTab"))$("cartAvailableTab").classList.toggle("active",cartViewMode==="available");

  if($("cartSelectedTotal"))$("cartSelectedTotal").textContent=total==null?"Price to confirm":money(total,"GHS");
  if($("cartCheckoutSelected"))$("cartCheckoutSelected").disabled=!selected.length;
  if($("cartSelectAll")){
    $("cartSelectAll").checked=available.length>0&&available.every(i=>cartSelectedKeys.has(cartItemKey(i)));
    $("cartSelectAll").indeterminate=available.some(i=>cartSelectedKeys.has(cartItemKey(i)))&&!available.every(i=>cartSelectedKeys.has(cartItemKey(i)));
  }

  const host=$("cartPageList");
  if(host){
    if(!lineCount){
      host.innerHTML='<div class="rnv-cart-empty"><div class="rnv-cart-empty-icon">🛒</div><b>Your cart is empty</b><span>Browse RANOVA and add products you want to buy.</span><button type="button" data-cart-home>Go shopping</button></div>';
      host.querySelector("[data-cart-home]")?.addEventListener("click",()=>showPanel("marketplaceHomePanel"));
    }else{
      const grouped=new Map();
      available.forEach(i=>{const key=i.store_id||"store";if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(i)});
      let html="";
      grouped.forEach((items,storeId)=>{
        const store=items[0]?.store||{};
        html+='<section class="rnv-cart-store-block"><div class="rnv-cart-store-title"><label><input type="checkbox" data-cart-store="'+esc(storeId)+'"> <b>'+esc(store.store_name||"RANOVA Store")+'</b></label></div>';
        html+=items.map(i=>{
          const p=i.product||{},key=cartItemKey(i),img=p.primary_image_url||(Array.isArray(p.image_urls)?p.image_urls[0]:"")||imageFor(p)||"";
          const unit=i.kind==="market"?marketUnitPrice(p,i.quantity):(p.price==null?null:Number(p.price));
          return '<div class="rnv-cart-row">'+
            '<input class="rnv-cart-check" type="checkbox" data-cart-select="'+esc(key)+'" '+(cartSelectedKeys.has(key)?"checked":"")+'>'+
            '<button class="rnv-cart-product" type="button" data-cart-product="'+esc(i.kind)+':'+esc(i.product_id)+'">'+
              (img?'<img src="'+esc(img)+'" alt="'+esc(p.name||"Product")+'">':'<div class="rnv-cart-img-empty"></div>')+
              '<span><b>'+esc(p.name||"Product")+'</b><small>'+esc(unit==null?"Price to confirm":money(unit,p.currency||"GHS"))+'</small></span>'+
            '</button>'+
            '<div class="rnv-cart-row-actions">'+
              '<div class="qty"><button type="button" data-cart-minus="'+esc(key)+'">−</button><span>'+esc(i.quantity)+'</span><button type="button" data-cart-plus="'+esc(key)+'">+</button></div>'+
              '<button class="rnv-cart-remove show" type="button" data-cart-remove="'+esc(key)+'" aria-label="Remove '+esc(p.name||"product")+' from cart">Remove</button>'+
            '</div></div>';
        }).join("");
        html+='</section>';
      });
      if(cartViewMode==="all"&&unavailable.length){
        html+='<section class="rnv-cart-unavailable"><div class="rnv-cart-unavailable-head"><b>Unavailable Products</b><button type="button" data-clear-unavailable>Clear unavailable</button></div>'+
          unavailable.map(i=>{const p=i.product||{},key=cartItemKey(i),img=p.primary_image_url||(Array.isArray(p.image_urls)?p.image_urls[0]:"")||imageFor(p)||"";return '<div class="rnv-cart-row unavailable">'+(img?'<img src="'+esc(img)+'" alt="">':'<div class="rnv-cart-img-empty"></div>')+'<span><b>'+esc(p.name||"Product")+'</b><small>Currently unavailable</small></span><button type="button" data-cart-remove="'+esc(key)+'">Remove</button></div>'}).join("")+
          '</section>';
      }
      host.innerHTML=html;

      host.querySelectorAll("[data-cart-select]").forEach(x=>x.onchange=()=>toggleCartSelection(x.dataset.cartSelect,x.checked));
      host.querySelectorAll("[data-cart-store]").forEach(x=>{
        const rows=available.filter(i=>String(i.store_id)===String(x.dataset.cartStore));
        x.checked=rows.length&&rows.every(i=>cartSelectedKeys.has(cartItemKey(i)));
        x.onchange=()=>{rows.forEach(i=>x.checked?cartSelectedKeys.add(cartItemKey(i)):cartSelectedKeys.delete(cartItemKey(i)));renderCart()}
      });
      const findEntry=key=>entries.find(i=>cartItemKey(i)===key);
      host.querySelectorAll("[data-cart-minus]").forEach(b=>b.onclick=()=>{const i=findEntry(b.dataset.cartMinus);if(!i)return;i.kind==="market"?changeMarketCartQty(i.store_id,i.product_id,-1):changeQty(cartItems.find(x=>x.id===i.id),-1)});
      host.querySelectorAll("[data-cart-plus]").forEach(b=>b.onclick=()=>{const i=findEntry(b.dataset.cartPlus);if(!i)return;i.kind==="market"?changeMarketCartQty(i.store_id,i.product_id,1):changeQty(cartItems.find(x=>x.id===i.id),1)});
      host.querySelectorAll("[data-cart-remove]").forEach(b=>b.onclick=()=>{const i=findEntry(b.dataset.cartRemove);if(!i)return;cartSelectedKeys.delete(cartItemKey(i));i.kind==="market"?removeMarketCartItem(i.store_id,i.product_id):removeCart(cartItems.find(x=>x.id===i.id))});
      host.querySelector("[data-clear-unavailable]")?.addEventListener("click",()=>unavailable.forEach(i=>i.kind==="market"?removeMarketCartItem(i.store_id,i.product_id):removeCart(cartItems.find(x=>x.id===i.id))));
      host.querySelectorAll("[data-cart-product]").forEach(b=>b.onclick=()=>{
        const [kind,id]=b.dataset.cartProduct.split(":");
        if(kind==="market"){const p=marketCartProducts.get(id)||marketSellerProducts.find(x=>x.id===id);if(p)openMarketplaceProduct(p)}
        else{const p=products.find(x=>x.id===id);if(p)renderSimpleDiscoveryProduct(p,true)}
      });
    }
  }

  renderCartRecommendations();

  // Keep the old drawer synchronized for compatibility, but Cart navigation no longer depends on it.
  const list=$("cartList");if(list)list.innerHTML="";
  if($("cartGrandTotal"))$("cartGrandTotal").innerHTML="";
}
function openCart(){
  if(!user){showAuthConsole(true);return}
  showPanel("cartPanel");
  renderCart();
  loadMarketplaceCart().then(renderCart).catch(()=>renderCart());
}
function closeCart(){
  $("cartDrawer")?.classList.remove("open");
}

const COUNTRY_NAMES={GH:"Ghana",NG:"Nigeria",CI:"Côte d’Ivoire",TG:"Togo",BJ:"Benin",BF:"Burkina Faso",NE:"Niger",SN:"Senegal",GM:"Gambia",GN:"Guinea",SL:"Sierra Leone",LR:"Liberia",KE:"Kenya",UG:"Uganda",TZ:"Tanzania",ZA:"South Africa",US:"United States",CA:"Canada",GB:"United Kingdom",FR:"France",DE:"Germany",CN:"China",IN:"India",AE:"United Arab Emirates"};

async function openMarketplaceCheckout(){
  if(!user)return showAuthConsole(true);
  if(!selectedCartEntries().length)return showToast("Select at least one product");
  closeCart();
  $("marketCheckoutOverlay").classList.add("show");
  $("marketCheckoutOverlay").setAttribute("aria-hidden","false");
  $("marketCheckoutMsg").classList.add("hide");
  try{
    const [prof,addr,sessionResult]=await Promise.all([
      sb.from("ranova_buyer_profiles").select("full_name,phone,default_country_code").eq("user_id",user.id).maybeSingle(),
      sb.from("ranova_buyer_addresses").select("recipient_name,phone,country_code,country_name,address_text,is_default").eq("user_id",user.id).order("is_default",{ascending:false}).order("updated_at",{ascending:false}).limit(1),
      sb.auth.getSession()
    ]);
    const address=addr.data?.[0]||{},bp=prof.data||{},authUser=sessionResult.data?.session?.user||user;
    $("marketCheckoutName").value=address.recipient_name||bp.full_name||"";
    $("marketCheckoutPhone").value=address.phone||bp.phone||authUser.phone||"";
    $("marketCheckoutEmail").value=authUser.email||"";
    $("marketCheckoutCountry").value=address.country_code||bp.default_country_code||"GH";
    $("marketCheckoutLocation").value=address.address_text||"";
    $("marketCheckoutPayPhone").value=address.phone||bp.phone||authUser.phone||"";
  }catch{}
  renderMarketplaceCheckoutSummary();
}
function closeMarketplaceCheckout(){
  $("marketCheckoutOverlay").classList.remove("show");
  $("marketCheckoutOverlay").setAttribute("aria-hidden","true");
}
function renderMarketplaceCheckoutSummary(){
  const selected=selectedCartEntries(),count=selected.length,subtotal=selectedCartTotal();
  const groups=new Map();
  selected.forEach(i=>{
    const key=i.store_id||"ranova";
    const storeName=i.store?.store_name||i.product?.store_name||(i.kind==="legacy"?"RANOVA Prime Enterprise":"RANOVA Store");
    if(!groups.has(key))groups.set(key,{name:storeName,count:0,total:0,known:true});
    const g=groups.get(key);g.count++;
    const unit=i.kind==="market"?marketUnitPrice(i.product,i.quantity):Number(i.product?.price);
    if(!Number.isFinite(unit))g.known=false;else g.total+=unit*Number(i.quantity||1);
  });
  const groupRows=[...groups.values()].map(g=>
    '<div class="rnv-checkout-store-row"><span><b>'+esc(g.name)+'</b><small>'+g.count+' product'+(g.count===1?'':'s')+'</small></span><strong>'+(g.known?money(g.total,"GHS"):"Price to confirm")+'</strong></div>'
  ).join("");
  $("marketCheckoutSummary").innerHTML=
    '<div class="rnv-checkout-store-summary">'+groupRows+'</div>'+
    '<div class="rnv-checkout-grand"><span>'+count+' selected product'+(count===1?'':'s')+' from '+groups.size+' store'+(groups.size===1?'':'s')+'</span><strong>'+(subtotal==null?'Price confirmed at checkout':money(subtotal,"GHS"))+'</strong></div>';
}
function updateCheckoutPaymentFields(){
  const momo=$("marketCheckoutPayment").value==="Mobile Money";
  $("marketCheckoutNetworkWrap").classList.toggle("hide",!momo);
  $("marketCheckoutPayPhoneWrap").classList.toggle("hide",!momo);
}
async function placeMarketplaceCartOrder(){
  const name=$("marketCheckoutName").value.trim(),phone=$("marketCheckoutPhone").value.trim(),email=$("marketCheckoutEmail").value.trim();
  const country=$("marketCheckoutCountry").value,locationText=$("marketCheckoutLocation").value.trim(),method=$("marketCheckoutPayment").value;
  const network=$("marketCheckoutNetwork").value,payPhone=$("marketCheckoutPayPhone").value.trim(),note=$("marketCheckoutNote").value.trim();
  const msg=$("marketCheckoutMsg");
  const fail=t=>{msg.textContent=t;msg.classList.remove("hide")};
  if(!name||!phone||!country||!locationText)return fail("Complete your name, phone number, delivery country and delivery location.");
  if(method==="Mobile Money"&&!payPhone)return fail("Enter the Mobile Money number for payment authorization.");
  const selected=selectedCartEntries();
  const items=selected.map(i=>i.kind==="market"
    ?({seller_product_id:i.product_id,quantity:i.quantity})
    :({product_id:i.product_id,product_name:i.product?.name||"Product",quantity:i.quantity,unit_price:i.product?.price==null?null:Number(i.product.price)}));
  if(!items.length)return fail("Your cart is empty.");
  const button=$("marketCheckoutPlace"),old=button.textContent;button.disabled=true;button.textContent="Placing order…";msg.classList.add("hide");
  try{
    const {data:{session}}=await sb.auth.getSession();
    const res=await fetch(cfg.supabaseUrl+"/functions/v1/ranova-place-order",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        "x-ranova-client":"ranova-site-v1",
        "apikey":cfg.supabasePublishableKey,
        ...(session?.access_token?{Authorization:"Bearer "+session.access_token}:{})
      },
      body:JSON.stringify({
        customer_name:name,customer_phone:phone,customer_email:email,
        delivery_location:locationText,buyer_country_code:country,buyer_country_name:COUNTRY_NAMES[country]||country,
        payment_method:method,payment_network:method==="Mobile Money"?network:"bank_transfer",
        payment_phone:method==="Mobile Money"?payPhone:null,buyer_note:note,items
      })
    });
    const out=await res.json().catch(()=>({}));
    if(!res.ok||!out.ok)throw new Error(out.error||"Could not place the order.");
    if(out.order_ref&&out.buyer_access_code)try{localStorage.setItem("ranova_buyer_code_"+out.order_ref,String(out.buyer_access_code))}catch{}
    const checkedOut=selectedCartEntries();
    const touchedStores=new Set();
    checkedOut.forEach(i=>{
      if(i.kind==="market"){
        const row=marketCartRows.find(r=>r.store_id===i.store_id);
        if(row&&row.items){delete row.items[i.product_id];touchedStores.add(i.store_id)}
      }
    });
    for(const storeId of touchedStores){await persistMarketCartRow(storeId);clearMarketplaceCartDraft(storeId);announceShoppingChange("cart",storeId,null)}
    const legacyIds=checkedOut.filter(i=>i.kind==="legacy").map(i=>i.id);
    if(legacyIds.length&&cartId)await sb.from("cart_items").delete().eq("cart_id",cartId).in("id",legacyIds);
    cartItems=cartItems.filter(i=>!legacyIds.includes(i.id));
    checkedOut.forEach(i=>cartSelectedKeys.delete(cartItemKey(i)));
    renderCart();closeMarketplaceCheckout();
    await loadToPayOrders(false).catch(()=>{});
    showPanel("toPayPanel");
    showToast("Order placed. Continue to payment.");
  }catch(e){fail(e.message||"Could not place the order.")}
  finally{button.disabled=false;button.textContent=old}
}
$("sendOrder").onclick=openMarketplaceCheckout;
if($("marketCheckoutClose"))$("marketCheckoutClose").onclick=closeMarketplaceCheckout;
if($("marketCheckoutOverlay"))$("marketCheckoutOverlay").onclick=e=>{if(e.target===$("marketCheckoutOverlay"))closeMarketplaceCheckout()};
if($("marketCheckoutPayment"))$("marketCheckoutPayment").onchange=updateCheckoutPaymentFields;
if($("marketCheckoutPlace"))$("marketCheckoutPlace").onclick=placeMarketplaceCartOrder;
updateCheckoutPaymentFields();

async function loadOrdersOnly(){const {data,error}=await sb.from("orders").select("*,order_items(*)").eq("user_id",user.id).order("created_at",{ascending:false});if(!error)orders=data||[]}
async function loadNotificationsOnly(){const {data,error}=await sb.from("notifications").select("*").eq("user_id",user.id).order("created_at",{ascending:false}).limit(50);if(!error)notifications=data||[]}
function orderMatches(o){
  if(!orderFilter)return true;
  if(orderFilter==="receive")return ["ready_for_dispatch","dispatched","out_for_delivery"].includes(o.order_status);
  if(orderFilter==="returns")return ["return_requested","returned","refund_pending","refunded"].includes(o.order_status);
  if(orderFilter==="international"){
    const country=String(o.delivery_country_code||o.country_code||o.shipping_country_code||"").toUpperCase();
    return !!country&&country!=="GH";
  }
  return o.order_status===orderFilter;
}
function renderOrders(){
  const list=orders.filter(orderMatches);$("ordersList").innerHTML=list.length?list.map(o=>`<button class="list-row" style="width:100%;background:#fff;text-align:left" data-order="${o.id}">
    <div><b>${esc(o.order_number)}</b><small>${o.order_items?.length||0} item(s) • ${new Date(o.created_at).toLocaleDateString()}</small></div><span class="status-chip">${esc(statusLabel(o.order_status))}</span>
  </button>`).join(""):'<div class="empty"><b>No orders here yet</b>Your matching orders will appear automatically.</div>';
  $("ordersList").querySelectorAll("[data-order]").forEach(b=>b.onclick=()=>openOrder(b.dataset.order));
}
function deliveryStatusLabel(s){return ({
  pending_quote:"Delivery quote pending",awaiting_dispatch:"Awaiting dispatch",assigned:"Courier assigned",
  picked_up:"Picked up",in_transit:"In transit",out_for_delivery:"Out for delivery",
  delivered_pending_confirmation:"Delivered — confirm receipt",delivered_confirmed:"Delivered confirmed",
  failed_attempt:"Delivery attempt failed",returned:"Returned",cancelled:"Cancelled"
})[s]||statusLabel(s)}
function dateTimeLabel(v){
  if(!v)return "";
  const d=new Date(v);return Number.isNaN(d.getTime())?"":d.toLocaleString([],{dateStyle:"medium",timeStyle:"short"});
}
function etaLabel(d){
  if(!d)return "";
  const a=d.eta_start_date,b=d.eta_end_date;
  if(a&&b)return a===b?a:(a+" → "+b);
  return a||b||"";
}
async function orderStatusApi(orderRef){
  const {data:{session}}=await sb.auth.getSession();
  if(!session)throw Error("Sign in to view live order tracking.");
  const r=await fetch(ORDER_STATUS_ENDPOINT,{method:"POST",headers:{
    "Content-Type":"application/json","x-ranova-client":"ranova-site-v1",
    "apikey":cfg.supabasePublishableKey,"Authorization":"Bearer "+session.access_token
  },body:JSON.stringify({action:"lookup",order_ref:orderRef})});
  const out=await r.json().catch(()=>({}));
  if(!r.ok||!out.ok)throw Error(out.error||"Live tracking is unavailable.");
  return out;
}
function sellerTrackingHtml(seller){
  const d=seller?.delivery||null;
  const items=Array.isArray(seller?.items)?seller.items:[];
  const timeline=Array.isArray(d?.timeline)?d.timeline:[];
  const courier=[d?.courier_name,d?.courier_reference].filter(Boolean).join(" • ");
  const eta=etaLabel(d);
  return '<section style="border:1px solid var(--line);border-radius:14px;padding:12px;margin:10px 0;background:#fff">'+
    '<div style="display:flex;justify-content:space-between;gap:10px;align-items:flex-start"><div><b>'+esc(seller?.store_name||"Seller store")+'</b><small style="display:block;color:var(--muted);margin-top:3px">'+esc(seller?.order_ref||"")+'</small></div><span class="status-chip">'+esc(deliveryStatusLabel(d?.status||seller?.order_status))+'</span></div>'+
    (items.length?'<div style="margin-top:9px;font-size:11px;color:var(--muted)">'+esc(items.map(i=>(i.product_name||i.name||"Product")+" ×"+(i.quantity||1)).join(" • "))+'</div>':"")+
    (courier||eta?'<div class="list-row" style="padding-left:0;padding-right:0;margin-top:8px"><div><b>Delivery</b><small>'+esc([courier,eta?("ETA "+eta):""].filter(Boolean).join(" • "))+'</small></div></div>':"")+
    (d?.destination_text?'<div style="font-size:10px;color:var(--muted);margin:4px 0 8px">Delivering to '+esc(d.destination_text)+'</div>':"")+
    (timeline.length?'<div style="border-left:2px solid #f47a00;margin:10px 0 2px 7px;padding-left:12px">'+timeline.map((e,idx)=>'<div style="position:relative;padding:0 0 '+(idx===timeline.length-1?'2':'11')+'px"><span style="position:absolute;left:-17px;top:3px;width:8px;height:8px;border-radius:50%;background:#f47a00"></span><b style="font-size:11px">'+esc(deliveryStatusLabel(e.status))+'</b><small style="display:block;color:var(--muted);margin-top:2px">'+esc([dateTimeLabel(e.occurred_at),e.location_text,e.note].filter(Boolean).join(" • "))+'</small></div>').join("")+'</div>':'<small style="display:block;color:var(--muted);margin-top:8px">Delivery updates will appear here as the seller or courier progresses the order.</small>')+
  '</section>';
}
async function hydrateOrderTracking(order,overlay){
  const host=overlay.querySelector("[data-live-order-tracking]");if(!host)return;
  try{
    const out=await orderStatusApi(order.order_number);
    const sellers=Array.isArray(out.seller_orders)?out.seller_orders:[];
    if(!sellers.length){host.remove();return}
    host.innerHTML='<h4 style="margin:14px 0 8px">Live delivery tracking</h4>'+sellers.map(sellerTrackingHtml).join("");
  }catch{
    host.remove();
  }
}
function openOrder(id){
  const o=orders.find(x=>x.id===id);if(!o)return;
  const overlay=document.createElement("div");overlay.className="cart-drawer open";overlay.innerHTML=`<aside class="drawer"><div class="drawer-head"><div><small style="color:var(--muted)">ORDER</small><h3>${esc(o.order_number)}</h3></div><button class="icon-btn" data-close-order>×</button></div><div class="drawer-list">
    <div class="list-row"><div><b>Current status</b><small>Updates automatically when RPE changes your order.</small></div><span class="status-chip">${esc(statusLabel(o.order_status))}</span></div>
    <h4>Products</h4>
    ${(o.order_items||[]).map(i=>'<div class="list-row"><div><b>'+esc(i.product_name_snapshot)+'</b><small>Quantity '+i.quantity+'</small></div><span class="status-chip">'+esc(i.unit_price==null?"Price to confirm":money(i.unit_price,o.currency))+'</span></div>').join("")}
    <div class="list-row"><div><b>Payment</b><small>${esc(statusLabel(o.payment_status))}</small></div></div>
    <div data-live-order-tracking><small style="display:block;color:var(--muted);padding:8px 0">Checking live delivery tracking…</small></div>
  </div><div class="drawer-foot"><button class="btn primary" data-order-help>Contact RPE about this order</button></div></aside>`;
  document.body.appendChild(overlay);
  hydrateOrderTracking(o,overlay);
  overlay.addEventListener("click",e=>{
    if(e.target===overlay||e.target.closest("[data-close-order]"))overlay.remove();
    if(e.target.closest("[data-order-help]"))contactRpe("Order support","Hello Ranova Prime Enterprise, I need help with order "+o.order_number+".");
  })
}
function renderCounts(){
  setBadge("payN",toPayOrders.length||orders.filter(o=>o.order_status==="awaiting_payment").length);
  setBadge("prepN",orders.filter(o=>["payment_confirmed","preparing","ready_for_dispatch"].includes(o.order_status)).length);
  setBadge("recvN",orders.filter(o=>["ready_for_dispatch","dispatched","out_for_delivery"].includes(o.order_status)).length);
  setBadge("reviewN",orders.filter(o=>o.order_status==="delivered").length);
  setBadge("retN",returns.filter(r=>!["completed","rejected"].includes(r.return_status)).length);
  setBadge("notifCount",notifications.filter(n=>!n.read_at).length);
}

function renderNotifications(){
  $("notifList").innerHTML=notifications.length?notifications.map(n=>`<div class="list-row"><div><b>${esc(n.title)}</b><small>${esc(n.message)} • ${new Date(n.created_at).toLocaleString()}</small></div>${n.read_at?'':'<span class="status-chip">New</span>'}</div>`).join(""):'<div class="empty"><b>No notifications</b>Important order updates will appear here.</div>';
}
async function markNotificationsRead(){
  const unread=notifications.filter(n=>!n.read_at);if(!unread.length)return;
  await sb.from("notifications").update({read_at:new Date().toISOString()}).eq("user_id",user.id).is("read_at",null);
  notifications=notifications.map(n=>({...n,read_at:n.read_at||new Date().toISOString()}));renderNotifications();renderCounts();
}

function renderAddresses(){
  $("addressList").innerHTML=addresses.length?addresses.map(a=>`<div class="list-row"><div><b>${esc(a.label)}${a.is_default?" • Default":""}</b><small>${esc([a.area,a.city,a.region].filter(Boolean).join(", ")||"Address saved")} • ${esc(a.phone)}</small></div></div>`).join(""):'<div class="empty"><b>No delivery address yet</b>Save one once and reuse it for future orders.</div>';
}
$("addAddress").onclick=()=>openAddressForm();
function openAddressForm(){
  const overlay=document.createElement("div");overlay.className="cart-drawer open";overlay.innerHTML=`<aside class="drawer"><div class="drawer-head"><h3>Add delivery address</h3><button class="icon-btn" data-close-address>×</button></div><div class="drawer-list">
  <label style="font-size:10px;font-weight:800">Label</label><input id="aLabel" value="Home" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:12px;margin:5px 0 10px">
  <label style="font-size:10px;font-weight:800">Recipient name</label><input id="aName" value="${esc(((profile?.first_name||"")+" "+(profile?.last_name||"")).trim())}" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:12px;margin:5px 0 10px">
  <label style="font-size:10px;font-weight:800">Phone</label><input id="aPhone" value="${esc(profile?.phone||"")}" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:12px;margin:5px 0 10px">
  <label style="font-size:10px;font-weight:800">Region</label><input id="aRegion" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:12px;margin:5px 0 10px">
  <label style="font-size:10px;font-weight:800">City / town</label><input id="aCity" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:12px;margin:5px 0 10px">
  <label style="font-size:10px;font-weight:800">Area / neighbourhood</label><input id="aArea" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:12px;margin:5px 0 10px">
  <label style="font-size:10px;font-weight:800">Landmark or directions</label><textarea id="aLandmark" rows="3" style="width:100%;padding:12px;border:1px solid var(--line);border-radius:12px;margin:5px 0 10px"></textarea>
  <label style="display:flex;gap:8px;align-items:center;font-size:10px"><input id="aDefault" type="checkbox"> Use as my default address</label>
  </div><div class="drawer-foot"><button id="saveAddress" class="btn primary">Save address</button></div></aside>`;
  document.body.appendChild(overlay);
  const close=()=>overlay.remove();overlay.addEventListener("click",e=>{if(e.target===overlay||e.target.closest("[data-close-address]"))close()});
  overlay.querySelector("#saveAddress").onclick=async()=>{
    const payload={user_id:user.id,label:overlay.querySelector("#aLabel").value.trim()||"Home",recipient_name:overlay.querySelector("#aName").value.trim(),phone:overlay.querySelector("#aPhone").value.trim(),region:overlay.querySelector("#aRegion").value.trim(),city:overlay.querySelector("#aCity").value.trim(),area:overlay.querySelector("#aArea").value.trim(),landmark:overlay.querySelector("#aLandmark").value.trim(),is_default:overlay.querySelector("#aDefault").checked};
    if(!payload.recipient_name||!payload.phone)return showToast("Name and phone are required");
    if(payload.is_default)await sb.from("addresses").update({is_default:false}).eq("user_id",user.id);
    const {error}=await sb.from("addresses").insert(payload);if(error)return showToast("Could not save address");
    const {data}=await sb.from("addresses").select("*").eq("user_id",user.id).order("is_default",{ascending:false});addresses=data||[];renderAddresses();close();showToast("Address saved");
  };
}

$("saveProfile").onclick=async()=>{
  const patch={first_name:$("profileFirst").value.trim(),last_name:$("profileLast").value.trim(),phone:$("profilePhone").value.trim()};
  const {data,error}=await sb.from("profiles").update(patch).eq("user_id",user.id).select().single();
  if(error)return showToast("Could not save details");profile=data;renderAll();showToast("Details saved");
};

function subscribeRealtime(){
  cleanupRealtime();
  const orderCh=sb.channel("rpe-orders-"+user.id)
    .on("postgres_changes",{event:"*",schema:"public",table:"orders",filter:"user_id=eq."+user.id},async()=>{await loadOrdersOnly();renderOrders();renderCounts();showToast("Order updated")})
    .subscribe();
  const notifCh=sb.channel("rpe-notifications-"+user.id)
    .on("postgres_changes",{event:"INSERT",schema:"public",table:"notifications",filter:"user_id=eq."+user.id},async()=>{await loadNotificationsOnly();renderNotifications();renderCounts();showToast("New RPE update")})
    .subscribe();
  const returnCh=sb.channel("rpe-returns-"+user.id)
    .on("postgres_changes",{event:"*",schema:"public",table:"return_requests",filter:"user_id=eq."+user.id},async()=>{const {data}=await sb.from("return_requests").select("*").eq("user_id",user.id);returns=data||[];renderCounts()})
    .subscribe();
  const messageListCh=sb.channel("rpe-customer-message-list-"+user.id)
    .on("postgres_changes",{event:"*",schema:"public",table:"ranova_conversations",filter:"buyer_user_id=eq."+user.id},()=>{loadMessageConversations().catch(()=>{})})
    .subscribe();
  realtimeChannels=[orderCh,notifCh,returnCh,messageListCh];
}
function cleanupRealtime(){stopMessageRealtime();realtimeChannels.forEach(ch=>sb.removeChannel(ch));realtimeChannels=[]}





async function loadMarketplaceHomeData(){
  if(marketFetchInFlight)return;
  marketFetchInFlight=true;
  if(!marketStores.length&&!marketSellerProducts.length)await loadOfflineMarketplaceSnapshot();

  // Paint cached/live content immediately. On a first-ever launch render
  // skeletons instead of incorrectly declaring the marketplace empty.
  renderMarketplaceHome($("marketHomeSearch")?.value||"");

  try{
    const [storeResult,productResult]=await Promise.allSettled([
      sb.from("ranova_seller_stores").select("id,seller_id,store_name,slug,tagline,logo_url,banner_url,business_location,fulfilment_summary,return_policy_summary,store_status,country_code,country_name,updated_at").eq("store_status","active").order("updated_at",{ascending:false}).limit(60),
      sb.from("ranova_seller_products").select("id,seller_id,store_id,name,slug,sku,category,short_description,description,price,currency,moq,stock_quantity,stock_status,unit_label,primary_image_url,image_urls,pricing_tiers,product_status,updated_at,specifications").eq("product_status","active").order("updated_at",{ascending:false}).limit(240)
    ]);
    const storeResponse=storeResult.status==="fulfilled"?storeResult.value:null;
    const productResponse=productResult.status==="fulfilled"?productResult.value:null;

    const storesOk=storeResponse&&!storeResponse.error;
    const productsOk=productResponse&&!productResponse.error;
    const freshStores=storesOk?(storeResponse.data||[]):null;
    const freshProducts=productsOk?(productResponse.data||[]):null;

    // Never erase useful last-known-good marketplace content because one
    // refresh returned an error or an unexpected temporary empty response.
    if(storesOk&&freshStores.length)marketStores=freshStores;
    else if(storesOk&&freshStores.length===0&&!marketStores.length)marketStores=[];

    if(productsOk&&freshProducts.length)marketSellerProducts=freshProducts;
    else if(productsOk&&freshProducts.length===0&&!marketSellerProducts.length)marketSellerProducts=[];

    if(storesOk||productsOk)marketLoadedAt=Date.now();
    if(marketStores.length||marketSellerProducts.length)savePublicMarketCache();

    populateMarketplaceFilters();
    renderMarketplaceHome($("marketHomeSearch")?.value||"");
    renderHomeProducts();
    // Marketplace products are also needed by Saved/Love and the unified Cart.
    // Repaint them after every successful catalogue refresh so those sections
    // never appear empty simply because marketplace data arrived later.
    renderSaved();
    renderCart();
    markPanelPainted("marketplaceHomePanel");
  }finally{
    marketFetchInFlight=false;
  }
}
function marketStoreProducts(id){return marketSellerProducts.filter(p=>p.store_id===id)}
function populateMarketplaceFilters(){
  const cat=$("marketCategoryFilter"),loc=$("marketLocationFilter");
  if(cat){
    const current=marketCategory||cat.value||"";
    const values=[...new Set(marketSellerProducts.map(p=>String(p.category||"").trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
    cat.innerHTML='<option value="">All categories</option>'+values.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join("");
    cat.value=values.includes(current)?current:"";
    marketCategory=cat.value;
  }
  if(loc){
    const storeLocations=marketStores.map(s=>String(s.business_location||s.country_name||"").trim()).filter(Boolean);
    const values=[...new Set(storeLocations)].sort((a,b)=>a.localeCompare(b));
    const current=marketLocation||loc.value||"";
    loc.innerHTML='<option value="">All locations</option>'+values.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join("");
    loc.value=values.includes(current)?current:"";
    marketLocation=loc.value;
  }
}
function marketFilteredProducts(filter=""){
  const q=String(filter||"").trim().toLowerCase();
  const storeById=new Map(marketStores.map(s=>[s.id,s]));
  let rows=marketSellerProducts.filter(p=>{
    const store=storeById.get(p.store_id)||{};
    const textMatch=!q||[p.name,p.category,p.short_description,p.sku,store.store_name,store.business_location,store.country_name].some(x=>String(x||"").toLowerCase().includes(q));
    const categoryMatch=!marketCategory||String(p.category||"").toLowerCase()===marketCategory.toLowerCase();
    const storeLocation=String(store.business_location||store.country_name||"").toLowerCase();
    const locationMatch=!marketLocation||storeLocation===marketLocation.toLowerCase();
    const moqMatch=!marketMoqOne||Number(p.moq||1)<=1;
    return textMatch&&categoryMatch&&locationMatch&&moqMatch;
  });
  if(marketSort==="price_low")rows.sort((a,b)=>(Number.isFinite(Number(a.price))?Number(a.price):Infinity)-(Number.isFinite(Number(b.price))?Number(b.price):Infinity));
  else if(marketSort==="price_high")rows.sort((a,b)=>(Number.isFinite(Number(b.price))?Number(b.price):-Infinity)-(Number.isFinite(Number(a.price))?Number(a.price):-Infinity));
  else if(marketSort==="name")rows.sort((a,b)=>String(a.name||"").localeCompare(String(b.name||"")));
  return rows;
}
const SELLER_STORE_FAST_CACHE_PREFIX="ranova-seller-store-fast:";
function primeSellerStoreCache(product){
  if(!product)return null;
  const store=marketStores.find(s=>s.id===product.store_id);
  if(!store?.slug)return null;
  const storeProducts=marketSellerProducts.filter(p=>p.store_id===store.id);
  try{
    localStorage.setItem(SELLER_STORE_FAST_CACHE_PREFIX+store.slug,JSON.stringify({
      t:Date.now(),
      store,
      products:storeProducts
    }));
  }catch{}
  // Warm the selected image immediately while the seller-store document opens.
  const urls=[product.primary_image_url,...(Array.isArray(product.image_urls)?product.image_urls.slice(0,2):[])].filter(Boolean);
  urls.forEach(url=>{try{const img=new Image();img.decoding="async";img.src=url}catch{}});
  return store;
}
function sellerStoreProductUrl(product){
  if(!product)return null;
  const store=primeSellerStoreCache(product)||marketStores.find(s=>s.id===product.store_id);
  if(!store?.slug)return null;
  return "../all/seller-store.html?store="+encodeURIComponent(store.slug)+"&product="+encodeURIComponent(product.id);
}
function matchingSellerProduct(product){
  if(!product)return null;
  const sku=String(product.sku||product.legacy_id||"").trim().toLowerCase();
  const name=String(product.name||"").trim().toLowerCase();
  return marketSellerProducts.find(p=>{
    const psku=String(p.sku||"").trim().toLowerCase();
    const pname=String(p.name||"").trim().toLowerCase();
    return (sku&&psku===sku)||(name&&pname===name);
  })||null;
}
function marketStockLabel(p){
  return ({in_stock:"In stock",out_of_stock:"Out of stock",pre_order:"Pre-order",limited_stock:"Limited stock",confirm_on_enquiry:"Check availability"})[String(p?.stock_status||"")]||"Check availability";
}
function marketRelatedVariants(p){
  if(!p)return[];
  const stop=new Set(["the","and","for","with","from","this","that","product","item","new","model"]);
  const tokens=s=>new Set(String(s||"").toLowerCase().replace(/[^a-z0-9]+/g," ").split(/\s+/).filter(x=>x.length>2&&!stop.has(x)));
  const base=tokens([p.name,p.category].filter(Boolean).join(" "));
  const score=x=>{
    if(!x||x.id===p.id||x.store_id!==p.store_id)return-1;
    let n=0;
    if(String(x.category||"").trim().toLowerCase()===String(p.category||"").trim().toLowerCase()&&p.category)n+=6;
    const xt=tokens([x.name,x.category].filter(Boolean).join(" "));
    base.forEach(t=>{if(xt.has(t))n+=2});
    if(String(x.name||"").toLowerCase().includes(String(p.name||"").toLowerCase().split(/\s+/)[0]||""))n+=1;
    return n;
  };
  return marketSellerProducts.map(x=>({p:x,s:score(x)})).filter(x=>x.s>0).sort((a,b)=>b.s-a.s).slice(0,14).map(x=>x.p);
}
function marketProductMinimum(p){return Math.max(1,Math.floor(Number(p?.moq)||1))}
function marketProductQuantity(p,value){
  const min=marketProductMinimum(p),stock=p?.stock_quantity==null?null:Math.max(0,Math.floor(Number(p.stock_quantity)||0));
  let q=Math.max(min,Math.floor(Number(value)||min));
  if(stock!=null)q=Math.min(q,stock);
  return q;
}
function updateMarketProductTotal(){
  const p=marketProductCurrent,input=$("marketProductQty"),total=$("marketProductTotal"),buy=$("marketProductBuy");if(!p||!input)return;
  const min=marketProductMinimum(p),stock=p.stock_quantity==null?null:Math.max(0,Number(p.stock_quantity)||0),q=marketProductQuantity(p,input.value);
  input.value=q;
  const unavailable=String(p.stock_status||"")==="out_of_stock"||(stock!=null&&stock<min);
  if(total)total.textContent=p.price==null?"Price will be confirmed by the seller":"Product total: "+money(Number(p.price)*q,p.currency||"GHS");
  if(buy){buy.disabled=unavailable;buy.textContent=unavailable?"Unavailable":"Add to Cart"}
}
function paintMarketplaceProductDetails(p,store){
  if(!p)return;
  store=store||marketStores.find(s=>s.id===p.store_id)||{};
  marketProductCurrent=p;
  $("marketProductName").textContent=p.name||"Product";
  $("marketProductPrice").textContent=p.price==null?"Ask for price":money(p.price,p.currency||"GHS");
  if($("marketProductCategory"))$("marketProductCategory").textContent=p.category||"RANOVA Product";
  $("marketProductMeta").textContent=[store.store_name,p.sku&&("SKU "+p.sku)].filter(Boolean).join(" · ");
  $("marketProductDescription").textContent=p.description||p.short_description||"Contact the seller for additional product information.";
  if($("marketProductSave"))$("marketProductSave").textContent=marketSavedProducts.has(p.id)?"★":"☆";
  const badges=["✓ RANOVA seller",store.business_location||store.country_name,marketStockLabel(p)].filter(Boolean);
  $("marketProductTrust").innerHTML=badges.map(x=>'<span>'+esc(x)+'</span>').join("");
  const facts=[];
  if(p.sku)facts.push(["Model / SKU",p.sku]);
  if(p.category)facts.push(["Category",p.category]);
  facts.push(["Availability",marketStockLabel(p)]);
  if(Number(p.moq||1)>1)facts.push(["Minimum order",String(p.moq)+(p.unit_label?" "+p.unit_label:"")]);
  if(p.stock_quantity!=null)facts.push(["Stock",String(p.stock_quantity)+(p.unit_label?" "+p.unit_label:"")]);
  if(store.fulfilment_summary)facts.push(["Delivery",store.fulfilment_summary]);
  if(store.return_policy_summary)facts.push(["Returns",store.return_policy_summary]);
  const specs=p.specifications&&typeof p.specifications==="object"?p.specifications:{};
  Object.keys(specs).slice(0,8).forEach(k=>{const v=specs[k];if(v!=null&&v!==""&&typeof v!=="object")facts.push([prettyKey(k),String(v)])});
  $("marketProductFacts").innerHTML=facts.map(r=>'<div><dt>'+esc(r[0])+'</dt><dd>'+esc(r[1])+'</dd></div>').join("");
  const min=marketProductMinimum(p);
  $("marketProductMoq").textContent=min>1?"Minimum "+min+(p.unit_label?" "+p.unit_label:""):"No bulk minimum";
  $("marketProductQty").min=String(min);
  $("marketProductQty").value=String(min);
  if(p.stock_quantity!=null)$("marketProductQty").max=String(Math.max(0,Number(p.stock_quantity)||0));else $("marketProductQty").removeAttribute("max");
  updateMarketProductTotal();
}
function openMarketplaceProduct(id){
  const p=marketSellerProducts.find(x=>x.id===id);if(!p)return;
  const store=marketStores.find(s=>s.id===p.store_id)||{};
  marketProductCurrent=p;marketProductOrigin=activePanelId||"marketplaceHomePanel";

  const primaryImage=p.primary_image_url||(Array.isArray(p.image_urls)?p.image_urls.find(Boolean):"")||"";
  $("marketProductImage").innerHTML=primaryImage
    ? '<div class="mpd-swipe" id="marketProductSwipe"><button type="button" class="mpd-slide current" data-variant-product="'+esc(p.id)+'" aria-label="'+esc(p.name||"Product")+'"><img src="'+esc(primaryImage)+'" alt="'+esc(p.name||"Product")+'" loading="eager" fetchpriority="high" decoding="async"></button></div>'
    : 'Product image unavailable';
  $("marketProductName").textContent=p.name||"Product";
  $("marketProductPrice").textContent=p.price==null?"Ask for price":money(p.price,p.currency||"GHS");
  if($("marketProductCategory"))$("marketProductCategory").textContent=p.category||"RANOVA Product";
  $("marketProductMeta").textContent=[store.store_name,p.sku&&("SKU "+p.sku)].filter(Boolean).join(" · ");
  $("marketProductDescription").textContent=p.description||p.short_description||"Contact the seller for additional product information.";
  $("marketProductTrust").innerHTML="";
  $("marketProductFacts").innerHTML="";
  showPanel("marketProductPanel");

  afterPaint(()=>{
    if(marketProductCurrent?.id!==p.id)return;
    const ownImages=[
      p.primary_image_url,
      ...(Array.isArray(p.image_urls)?p.image_urls:[])
    ].filter(Boolean).filter((v,i,arr)=>arr.indexOf(v)===i);
    const variants=marketRelatedVariants(p);
    const slides=[
      ...ownImages.map((url,i)=>({id:p.id,url,name:p.name||"Product",current:true,label:i===0?"Current product":"More view"})),
      ...variants.map(v=>({id:v.id,url:v.primary_image_url||(Array.isArray(v.image_urls)?v.image_urls.find(Boolean):"")||"",name:v.name||"Similar product",current:false,label:"Similar option"}))
    ].filter(x=>x.url);

    if(slides.length){
      $("marketProductImage").innerHTML='<div class="mpd-swipe" id="marketProductSwipe">'+slides.map((s,i)=>
        '<button type="button" class="mpd-slide'+(s.current?" current":"")+'" data-variant-product="'+esc(s.id)+'" aria-label="'+esc(s.name)+'">'+
          '<img src="'+esc(s.url)+'" alt="'+esc(s.name)+'" loading="'+(i===0?"eager":"lazy")+'" '+(i===0?'fetchpriority="high" ':'')+'decoding="async">'+
          (!s.current?'<span class="mpd-variant-label">'+esc(s.label)+'</span>':'')+
        '</button>'
      ).join("")+'</div><div class="mpd-counter" id="marketProductCounter">1 / '+slides.length+'</div>'+
      (variants.length?'<div class="mpd-swipe-hint">Swipe for similar options from this store</div>':'');
    }

    const swipe=$("marketProductSwipe");
    if(swipe){
      let timer=null;
      swipe.addEventListener("scroll",()=>{
        clearTimeout(timer);
        timer=setTimeout(()=>{
          const w=swipe.clientWidth||1;
          const index=Math.max(0,Math.min(slides.length-1,Math.round(swipe.scrollLeft/w)));
          const counter=$("marketProductCounter");if(counter)counter.textContent=(index+1)+" / "+slides.length;
          const visible=slides[index];
          if(visible&&visible.id&&visible.id!==marketProductCurrent?.id){
            const nextProduct=marketSellerProducts.find(x=>x.id===visible.id);
            if(nextProduct){
              const nextStore=marketStores.find(s=>s.id===nextProduct.store_id)||{};
              paintMarketplaceProductDetails(nextProduct,nextStore);
            }
          }else if(visible&&visible.id===p.id&&marketProductCurrent?.id!==p.id){
            paintMarketplaceProductDetails(p,store);
          }
        },60);
      },{passive:true});
    }

    const badges=["✓ RANOVA seller",store.business_location||store.country_name,marketStockLabel(p)].filter(Boolean);
    $("marketProductTrust").innerHTML=badges.map(x=>'<span>'+esc(x)+'</span>').join("");
    const facts=[];
    if(p.sku)facts.push(["Model / SKU",p.sku]);
    if(p.category)facts.push(["Category",p.category]);
    facts.push(["Availability",marketStockLabel(p)]);
    if(Number(p.moq||1)>1)facts.push(["Minimum order",String(p.moq)+(p.unit_label?" "+p.unit_label:"")]);
    if(p.stock_quantity!=null)facts.push(["Stock",String(p.stock_quantity)+(p.unit_label?" "+p.unit_label:"")]);
    if(store.fulfilment_summary)facts.push(["Delivery",store.fulfilment_summary]);
    if(store.return_policy_summary)facts.push(["Returns",store.return_policy_summary]);
    const specs=p.specifications&&typeof p.specifications==="object"?p.specifications:{};
    Object.keys(specs).slice(0,8).forEach(k=>{const v=specs[k];if(v!=null&&v!==""&&typeof v!=="object")facts.push([prettyKey(k),String(v)])});
    $("marketProductFacts").innerHTML=facts.map(r=>'<div><dt>'+esc(r[0])+'</dt><dd>'+esc(r[1])+'</dd></div>').join("");
    const min=marketProductMinimum(p);
    $("marketProductMoq").textContent=min>1?"Minimum "+min+(p.unit_label?" "+p.unit_label:""):"No bulk minimum";
    $("marketProductQty").min=String(min);$("marketProductQty").value=String(min);
    if(p.stock_quantity!=null)$("marketProductQty").max=String(Math.max(0,Number(p.stock_quantity)||0));else $("marketProductQty").removeAttribute("max");
    updateMarketProductTotal();
  });
}

function warmMarketplaceProduct(id){
  const p=marketSellerProducts.find(x=>x.id===id);if(!p)return;
  const urls=[p.primary_image_url,...(Array.isArray(p.image_urls)?p.image_urls.slice(0,1):[])].filter(Boolean);
  urls.forEach(url=>{const img=new Image();img.decoding="async";img.src=url;});
}

const prefetchedDocuments=new Set();
function prefetchDocument(url){
  if(!url||prefetchedDocuments.has(url))return;
  prefetchedDocuments.add(url);
  try{
    const link=document.createElement("link");
    link.rel="prefetch";link.href=url;
    document.head.appendChild(link);
  }catch{}
}
function sellerStoreUrlFromSlug(slug){
  return slug?"../all/seller-store.html?store="+encodeURIComponent(slug):"";
}
function shareMarketplaceProduct(){
  const p=marketProductCurrent;if(!p)return;
  const url=sellerStoreProductUrl(p);if(!url)return;
  const absolute=new URL(url,location.href).href;
  if(navigator.share)navigator.share({title:p.name||"RANOVA product",url:absolute}).catch(()=>{});
  else if(navigator.clipboard)navigator.clipboard.writeText(absolute).then(()=>showToast("Product link copied")).catch(()=>{});
}
function renderMarketplaceHome(filter=""){
  const promo=$("marketPromoGrid"),feed=$("marketFactoryFeed"),productHost=$("marketProductResults"),summary=$("marketResultSummary");
  if(!promo||!feed)return;
  const q=String(filter||"").trim().toLowerCase();
  if(!marketStores.length&&!marketSellerProducts.length){
    const qLegacy=String(filter||"").trim().toLowerCase();
    const legacyRows=products.filter(p=>!qLegacy||[
      p.name,p.sku,p.legacy_id,p.brand,p.categories?.name,p.short_description
    ].some(x=>String(x||"").toLowerCase().includes(qLegacy))).slice(0,36);

    promo.innerHTML="";
    if(summary)summary.textContent=legacyRows.length
      ? legacyRows.length+" product"+(legacyRows.length===1?"":"s")
      : "Loading marketplace…";

    if(productHost){
      productHost.innerHTML=legacyRows.length?legacyRows.map(p=>{
        const image=imageFor(p);
        return '<button class="market-product-card" type="button" data-legacy-market-product="'+esc(p.id)+'">'+
          (image?'<img src="'+esc(image)+'" alt="'+esc(p.name||"Product")+'" loading="lazy">':'<span class="market-product-placeholder">Product image</span>')+
          '<span class="market-product-copy"><b>'+esc(p.name||"Product")+'</b><small>'+esc(p.categories?.name||p.brand||"RANOVA Marketplace")+'</small><strong>'+esc(money(p.price,p.currency||"GHS"))+'</strong></span></button>';
      }).join(""):marketSkeleton(6);
    }

    feed.innerHTML=marketStoreSkeleton(3);
    return;
  }
  const storeById=new Map(marketStores.map(s=>[s.id,s]));
  const ps=marketFilteredProducts(filter);
  const allowedStoreIds=new Set(ps.map(p=>p.store_id));
  const ss=marketStores.filter(s=>{
    const textMatch=!q||[s.store_name,s.tagline,s.description,s.business_location,s.country_name].some(x=>String(x||"").toLowerCase().includes(q))||marketStoreProducts(s.id).some(p=>[
      p.name,p.category,p.short_description,p.sku
    ].some(x=>String(x||"").toLowerCase().includes(q)));
    const locationValue=String(s.business_location||s.country_name||"");
    const locationMatch=!marketLocation||locationValue.toLowerCase()===marketLocation.toLowerCase();
    const productMatch=(!marketCategory&&!marketMoqOne)||allowedStoreIds.has(s.id);
    return textMatch&&locationMatch&&productMatch;
  });
  const promoPool=ps.length?ps:(!q?marketSellerProducts:[]);
  promo.innerHTML=[0,2,4,6].map((n,i)=>{
    const pair=promoPool.slice(n,n+2);if(!pair.length)return"";
    return '<div class="mh-promo"><h3>'+["Trending Picks","New Arrivals","Store Deals","Popular Today"][i]+'</h3><div class="mh-mini">'+pair.map(p=>
      '<button type="button" data-mh-product="'+esc(p.id)+'">'+
      (p.primary_image_url?'<img src="'+esc(p.primary_image_url)+'" alt="'+esc(p.name)+'" loading="lazy">':'')+
      '<div style="font-size:10px;font-weight:900;color:#e84e31;margin-top:4px">'+esc(p.price==null?"Ask for price":money(p.price,p.currency||"GHS"))+'</div></button>'
    ).join("")+'</div></div>';
  }).join("");

  if(summary){
    const filtered=Boolean(q||marketCategory||marketLocation||marketMoqOne||marketSort!=="recommended");
    summary.textContent=(filtered?ps.length:marketSellerProducts.length)+" product"+((filtered?ps.length:marketSellerProducts.length)===1?"":"s")+(filtered?" found":" live");
  }
  if(productHost){
    const productRows=navigator.onLine?ps.slice(0,36):ps;
    productHost.innerHTML=productRows.length?productRows.map(p=>{
      const store=storeById.get(p.store_id)||{};
      const moq=Number(p.moq||1);
      return '<article class="market-product-card-wrap">'+
        '<button class="market-card-save '+(marketSavedProducts.has(p.id)?"active":"")+'" type="button" data-market-save="'+esc(p.id)+'" aria-label="'+(marketSavedProducts.has(p.id)?"Remove saved product":"Save product")+'">'+(marketSavedProducts.has(p.id)?"★":"☆")+'</button>'+
        '<button class="market-product-card" type="button" data-mh-product="'+esc(p.id)+'">'+
        (p.primary_image_url?'<img src="'+esc(p.primary_image_url)+'" alt="'+esc(p.name||"Product")+'" loading="lazy">':'<span class="market-product-placeholder">Product image</span>')+
        '<span class="market-product-copy"><b>'+esc(p.name||"Product")+'</b><small>'+esc(store.store_name||p.category||"RANOVA Store")+'</small><strong>'+esc(p.price==null?"Ask for price":money(p.price,p.currency||"GHS"))+'</strong>'+
        (moq>1?'<em>MOQ '+esc(moq)+(p.unit_label?" "+esc(p.unit_label):"")+'</em>':"")+
        '</span></button></article>';
    }).join(""):'<div class="market-empty"><b>No matching products</b>Try another product, store, category or location.</div>';
  }

  const storeRows=q?ss:marketStores;
  feed.innerHTML=storeRows.length?storeRows.map(s=>{
    const p=marketStoreProducts(s.id),img=s.logo_url||p.find(x=>x.primary_image_url)?.primary_image_url||s.banner_url||"";
    return '<article class="mh-store"><div class="mh-store-media">'+
      (img?'<img src="'+esc(img)+'" alt="'+esc(s.store_name||"Store")+'" loading="lazy">':'<div style="display:grid;place-items:center;height:100%;font-size:38px">🏪</div>')+
      '</div><div style="min-width:0"><h3>'+esc(s.store_name||"RANOVA Store")+'</h3><div class="mh-meta">'+esc(s.business_location||s.country_name||"Marketplace seller")+' · '+p.length+' product'+(p.length===1?"":"s")+'</div>'+
      '<div style="font-size:9px;color:#888;margin-top:6px;line-height:1.4">'+esc(s.tagline||s.description||"Browse products and contact this seller through RANOVA.")+'</div>'+
      '<div class="mh-actions"><button class="mh-ask" type="button" data-mh-message="'+esc(s.id)+'">Message Store</button><button class="mh-view" type="button" data-mh-store="'+esc(s.slug||s.id)+'">View Store</button></div></div></article>';
  }).join(""):'<div class="market-empty"><b>No matching stores</b>Try a different search.</div>';
}
function refreshMarketplaceFilters(){renderMarketplaceHome($("marketHomeSearch")?.value||"")}
if($("marketCategoryFilter"))$("marketCategoryFilter").onchange=e=>{marketCategory=e.target.value;refreshMarketplaceFilters()};
if($("marketLocationFilter"))$("marketLocationFilter").onchange=e=>{marketLocation=e.target.value;refreshMarketplaceFilters()};
if($("marketSortFilter"))$("marketSortFilter").onchange=e=>{marketSort=e.target.value;refreshMarketplaceFilters()};
if($("marketMoqFilter"))$("marketMoqFilter").onclick=e=>{marketMoqOne=!marketMoqOne;e.currentTarget.classList.toggle("active",marketMoqOne);e.currentTarget.setAttribute("aria-pressed",String(marketMoqOne));refreshMarketplaceFilters()};
if($("marketClearFilters"))$("marketClearFilters").onclick=()=>{
  marketCategory="";marketLocation="";marketSort="recommended";marketMoqOne=false;
  if($("marketHomeSearch"))$("marketHomeSearch").value="";
  if($("marketCategoryFilter"))$("marketCategoryFilter").value="";
  if($("marketLocationFilter"))$("marketLocationFilter").value="";
  if($("marketSortFilter"))$("marketSortFilter").value="recommended";
  if($("marketMoqFilter")){$("marketMoqFilter").classList.remove("active");$("marketMoqFilter").setAttribute("aria-pressed","false")}
  refreshMarketplaceFilters();
};
document.querySelectorAll("[data-market-focus]").forEach(btn=>btn.addEventListener("click",()=>{
  document.querySelectorAll("[data-market-focus]").forEach(x=>x.classList.toggle("active",x===btn));
  const focus=btn.dataset.marketFocus;
  if(focus==="products")$("marketProductsAnchor")?.scrollIntoView({behavior:"smooth",block:"start"});
  else if(focus==="stores")$("marketStoresAnchor")?.scrollIntoView({behavior:"smooth",block:"start"});
  else if(focus==="categories"){$("marketCategoryFilter")?.focus();$("marketCategoryFilter")?.scrollIntoView({behavior:"smooth",block:"center"});}
}));
const MARKET_SEARCH_HISTORY_KEY="ranova-market-search-history-v3";
function marketSearchHistory(){const rows=readLocalJson(MARKET_SEARCH_HISTORY_KEY,[]);return Array.isArray(rows)?rows.slice(0,8):[]}
function rememberMarketSearch(value){
  const q=String(value||"").trim();if(q.length<2)return;
  const rows=[q,...marketSearchHistory().filter(x=>String(x).toLowerCase()!==q.toLowerCase())].slice(0,8);
  writeLocalJson(MARKET_SEARCH_HISTORY_KEY,rows);
}
function marketSearchSuggestions(value=""){
  const q=String(value||"").trim().toLowerCase(),seen=new Set(),rows=[];
  const add=(label,kind)=>{
    const text=String(label||"").trim();if(!text)return;
    const key=text.toLowerCase();if(seen.has(key))return;
    if(q&&!key.includes(q))return;
    seen.add(key);rows.push({label:text,kind});
  };
  marketSearchHistory().forEach(x=>add(x,"Recent"));
  marketSellerProducts.slice(0,160).forEach(p=>{add(p.name,"Product");add(p.category,"Category");add(p.sku,"SKU")});
  marketStores.slice(0,60).forEach(s=>{add(s.store_name,"Store");add(s.business_location||s.country_name,"Location")});
  return rows.slice(0,10);
}
function renderMarketSearchAssist(value=""){
  const host=$("marketSearchAssist"),input=$("marketHomeSearch");if(!host||!input)return;
  const rows=marketSearchSuggestions(value);
  host.innerHTML=rows.map(x=>'<button type="button" role="option" data-market-suggest="'+esc(x.label)+'"><span>'+esc(x.label)+'</span><small>'+esc(x.kind)+'</small></button>').join("");
  host.classList.toggle("hide",!rows.length);
  input.setAttribute("aria-expanded",rows.length?"true":"false");
  host.querySelectorAll("[data-market-suggest]").forEach(b=>b.onclick=()=>{
    input.value=b.dataset.marketSuggest||"";
    rememberMarketSearch(input.value);
    host.classList.add("hide");input.setAttribute("aria-expanded","false");
    refreshMarketplaceFilters();
  });
}
function submitMarketSearch(){
  const value=$("marketHomeSearch")?.value||"";
  rememberMarketSearch(value);
  $("marketSearchAssist")?.classList.add("hide");
  $("marketHomeSearch")?.setAttribute("aria-expanded","false");
  refreshMarketplaceFilters();
}
if($("marketHomeSearchBtn"))$("marketHomeSearchBtn").onclick=submitMarketSearch;
if($("marketHomeSearch"))$("marketHomeSearch").oninput=e=>{
  const value=e.target.value;renderMarketSearchAssist(value);
  cancelAnimationFrame(marketSearchFrame);marketSearchFrame=requestAnimationFrame(()=>renderMarketplaceHome(value))
};
if($("marketHomeSearch"))$("marketHomeSearch").onfocus=e=>renderMarketSearchAssist(e.target.value);
if($("marketHomeSearch"))$("marketHomeSearch").onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();submitMarketSearch()}else if(e.key==="Escape"){$("marketSearchAssist")?.classList.add("hide");e.currentTarget.setAttribute("aria-expanded","false")}};
document.addEventListener("click",e=>{if(!e.target.closest(".market-search-wrap")){$("marketSearchAssist")?.classList.add("hide");$("marketHomeSearch")?.setAttribute("aria-expanded","false")}});
document.addEventListener("pointerdown",e=>{
 const p=e.target.closest("[data-mh-product]");
 if(p){
   const item=marketSellerProducts.find(x=>x.id===p.dataset.mhProduct);
   warmMarketplaceProduct(p.dataset.mhProduct);
   prefetchDocument(sellerStoreProductUrl(item));
 }
 const store=e.target.closest("[data-mh-store]");
 if(store)prefetchDocument(sellerStoreUrlFromSlug(store.dataset.mhStore));
 const sellerHome=e.target.closest("[data-home-seller-product]");
 if(sellerHome){
   const item=marketSellerProducts.find(x=>x.id===sellerHome.dataset.homeSellerProduct);
   prefetchDocument(sellerStoreProductUrl(item));
 }
},{passive:true});
document.addEventListener("touchstart",e=>{
 const p=e.target.closest("[data-mh-product]");
 if(p)warmMarketplaceProduct(p.dataset.mhProduct);
},{passive:true});

function showOfflineProductNotice(){
  window.dispatchEvent(new CustomEvent("ranova:offline-product-click"));
}
document.addEventListener("click",e=>{
  if(navigator.onLine)return;
  const target=e.target.closest("[data-mh-product],[data-legacy-market-product],[data-home-seller-product],[data-open-product],[data-simple-related],[data-variant-product]");
  if(!target)return;
  e.preventDefault();e.stopImmediatePropagation();showOfflineProductNotice();
},true);

document.addEventListener("click",async e=>{
 const marketSave=e.target.closest("[data-market-save]");if(marketSave){e.preventDefault();e.stopPropagation();await toggleMarketplaceSaved(marketSave.dataset.marketSave);return}
 const savedMarket=e.target.closest("[data-saved-market]");if(savedMarket){const item=marketSellerProducts.find(x=>x.id===savedMarket.dataset.savedMarket);const url=sellerStoreProductUrl(item);if(url)location.href=url;else showToast("This seller store is not available right now.");return}
 const variant=e.target.closest("[data-variant-product]");if(variant&&variant.dataset.variantProduct!==marketProductCurrent?.id){openMarketplaceProduct(variant.dataset.variantProduct);return}
 const legacy=e.target.closest("[data-legacy-market-product]");if(legacy){openProduct(legacy.dataset.legacyMarketProduct);return}
 const p=e.target.closest("[data-mh-product]");if(p){const item=marketSellerProducts.find(x=>x.id===p.dataset.mhProduct);const url=sellerStoreProductUrl(item);if(url)location.href=url;else showToast("This seller store is not available right now.");return}
 const m=e.target.closest("[data-mh-message]");if(m){showPanel("messagesPanel");try{const out=await messageApi({action:"start",store_id:m.dataset.mhMessage,subject:"Store enquiry"});await openMessageConversation(out.conversation.id)}catch(err){showToast(err.message||"Could not open store chat")}return}
 const v=e.target.closest("[data-mh-store]");if(v){
   const st=marketStores.find(s=>s.slug===v.dataset.mhStore||s.id===v.dataset.mhStore);
   if(st){
     try{localStorage.setItem(SELLER_STORE_FAST_CACHE_PREFIX+st.slug,JSON.stringify({t:Date.now(),store:st,products:marketSellerProducts.filter(p=>p.store_id===st.id)}))}catch{}
   }
   location.href="../all/seller-store.html?store="+encodeURIComponent(v.dataset.mhStore);return
 }
});
if($("marketProductBack"))$("marketProductBack").onclick=()=>showPanel(marketProductOrigin||"marketplaceHomePanel");
if($("marketProductMinus"))$("marketProductMinus").onclick=()=>{if(!marketProductCurrent)return;$("marketProductQty").value=marketProductQuantity(marketProductCurrent,Number($("marketProductQty").value)-1);updateMarketProductTotal()};
if($("marketProductPlus"))$("marketProductPlus").onclick=()=>{if(!marketProductCurrent)return;$("marketProductQty").value=marketProductQuantity(marketProductCurrent,Number($("marketProductQty").value)+1);updateMarketProductTotal()};
if($("marketProductQty"))$("marketProductQty").onchange=()=>updateMarketProductTotal();
if($("marketProductShare"))$("marketProductShare").onclick=shareMarketplaceProduct;
if($("marketProductSave"))$("marketProductSave").onclick=()=>{if(marketProductCurrent)toggleMarketplaceSaved(marketProductCurrent.id)};
if($("marketProductStore"))$("marketProductStore").onclick=()=>{const url=sellerStoreProductUrl(marketProductCurrent);if(url)location.href=url;else showToast("Store unavailable")};
if($("marketProductBuy"))$("marketProductBuy").onclick=async()=>{const p=marketProductCurrent;if(!p)return;const q=marketProductQuantity(p,$("marketProductQty").value);await addMarketplaceToCart(p,q)};
if($("marketProductMessage"))$("marketProductMessage").onclick=async()=>{
  const p=marketProductCurrent;if(!p)return;
  showPanel("messagesPanel");
  try{
    const out=await messageApi({action:"start",store_id:p.store_id,subject:"Product enquiry: "+(p.name||"Product"),product_id:p.id});
    await openMessageConversation(out.conversation.id);
  }catch(err){showToast(err.message||"Could not open seller chat")}
};
async function loadToPayOrders(prefetch=false){
  if(prefetch&&toPayOrders.length&&Date.now()-toPayLoadedAt<30000)return;
  const out=await messageApi({action:"buyer_payment_orders"});
  toPayOrders=out.orders||[];toPayStores=out.stores||[];toPayRecommendations=out.recommendations||[];toPayLoadedAt=Date.now();saveFastCache();
  renderToPayOrders($("toPaySearch")?.value||"");markPanelPainted("toPayPanel");
}
function payStore(id){return toPayStores.find(s=>s.id===id)||null}
function payItemImage(item){return item?.image_url||""}
function renderToPayOrders(filter=""){
  const host=$("toPayOrders");if(!host)return;
  const q=String(filter||"").trim().toLowerCase();
  const rows=toPayOrders.filter(o=>{
    const s=payStore(o.store_id),items=Array.isArray(o.items)?o.items:[];
    return !q||[o.order_ref,s?.store_name,...items.flatMap(i=>[i.product_name,i.sku])].some(x=>String(x||"").toLowerCase().includes(q));
  });
  if(!rows.length){
    host.innerHTML='<div class="pay-empty"><b>No unpaid orders</b>Your orders that still need payment will appear here.</div>';
    return;
  }

  const pendingHtml=rows.map(o=>{
    const store=payStore(o.store_id)||{},items=Array.isArray(o.items)?o.items:[],currency="GHS";
    const subtotal=o.subtotal==null?items.reduce((a,i)=>a+Number(i.line_total||0),0):Number(o.subtotal||0);
    const delivery=Number(o.delivery_fee||0);
    const total=o.total==null?(subtotal||0)+delivery:Number(o.total||0);
    return '<article class="pay-order" data-pay-order="'+esc(o.id)+'">'+
      '<div class="pay-store"><span class="pay-store-avatar">'+(store.logo_url?'<img src="'+esc(store.logo_url)+'" alt="">':'🏪')+'</span><b>'+esc(store.store_name||"RANOVA Store")+'</b><span class="pay-status">To Pay</span></div>'+
      (items.length?items.map(i=>'<div class="pay-item">'+
        (payItemImage(i)?'<img class="pay-item-img" src="'+esc(payItemImage(i))+'" alt="'+esc(i.product_name||"Product")+'">':'<div class="pay-item-img" style="display:grid;place-items:center;color:#999">Product</div>')+
        '<div class="pay-item-copy"><div class="pay-item-title">'+esc(i.product_name||"Product")+'</div><div class="pay-item-meta">'+esc(i.sku||i.unit_label||"")+'</div><div class="pay-price">'+esc(i.unit_price==null?"Price pending":money(i.unit_price,currency))+'</div><span class="pay-qty">×'+esc(i.quantity||1)+'</span><div class="pay-benefit">RANOVA protected marketplace order</div></div></div>').join("")
        :'<div class="pay-item"><div class="pay-item-img"></div><div class="pay-item-copy"><div class="pay-item-title">Marketplace order</div></div></div>')+
      '<div class="pay-total-row"><span>Delivery '+esc(money(delivery,currency))+'</span><span>Amount due</span><strong>'+esc(total?money(total,currency):"Awaiting quote")+'</strong></div><div style="margin:8px 11px;padding:9px 10px;border-radius:10px;background:#fff7ef;color:#75401f;font-size:9px;line-height:1.45"><b>RANOVA Buyer Protection</b><br>Your payment is recorded against this order. The seller is not paid immediately; payout waits for the required delivery and protection checks.</div>'+
      '<div class="pay-actions"><button type="button" data-pay-close="'+esc(o.id)+'">Close</button><button type="button" data-pay-address="'+esc(o.id)+'">Modify Address</button><button class="pay-now" type="button" data-pay-now="'+esc(o.id)+'">Pay Now</button></div>'+
    '</article>';
  }).join("");

  const storeIds=[...new Set(rows.map(o=>o.store_id).filter(Boolean))];
  const orderedProductIds=new Set(rows.flatMap(o=>(Array.isArray(o.items)?o.items:[]).map(i=>i.seller_product_id).filter(Boolean)));
  const recommendationSections=storeIds.map(storeId=>{
    const store=payStore(storeId)||{};
    const recs=toPayRecommendations
      .filter(p=>p.store_id===storeId&&!orderedProductIds.has(p.id))
      .slice(0,8);
    if(!recs.length)return "";
    return '<section class="pay-other-store">'+
      '<div class="pay-rec-head">More from '+esc(store.store_name||"this store")+'</div>'+
      '<div class="pay-recommend">'+
      recs.map(p=>'<button class="pay-product" type="button" data-pay-product="'+esc(p.id)+'">'+
        (p.primary_image_url?'<img src="'+esc(p.primary_image_url)+'" alt="'+esc(p.name)+'">':'<div style="aspect-ratio:1;background:#eee"></div>')+
        '<div class="pay-product-copy"><b>'+esc(p.name)+'</b><div class="price">'+esc(p.price==null?"Ask":money(p.price,p.currency||"GHS"))+'</div><small>'+esc(p.moq?("MOQ "+p.moq+" "+(p.unit_label||"")):(p.category||"Store product"))+'</small></div></button>').join("")+
      '</div></section>';
  }).join("");

  host.innerHTML=pendingHtml+recommendationSections;
}
function showPaymentReceived(orderRef=""){
  clearInterval(paymentStatusTimer);paymentStatusTimer=null;
  $("manualPaymentOverlay")?.classList.remove("show");$("manualPaymentOverlay")?.setAttribute("aria-hidden","true");
  if($("paymentReceivedRef"))$("paymentReceivedRef").textContent=orderRef||"RANOVA order";
  $("paymentReceivedOverlay")?.classList.add("show");$("paymentReceivedOverlay")?.setAttribute("aria-hidden","false");
  loadToPayOrders().catch(()=>{});
}
async function checkOrderPayment(orderRef,{silent=false}={}){
  if(!orderRef)return false;
  try{
    const out=await paymentApi({action:"status",order_ref:orderRef});
    const paid=String(out.order_payment_status||"").toLowerCase()==="paid"||String(out.payment?.payment_status||"").toLowerCase()==="confirmed";
    if(paid){showPaymentReceived(orderRef);return true}
    if(!silent)showToast("Payment has not been confirmed yet.");
  }catch(err){if(!silent)showToast(err.message||"Could not check payment.")}
  return false;
}
function watchPaymentStatus(orderRef){
  clearInterval(paymentStatusTimer);
  let checks=0;
  paymentStatusTimer=setInterval(async()=>{
    checks++;
    const paid=await checkOrderPayment(orderRef,{silent:true});
    if(paid||checks>=40){clearInterval(paymentStatusTimer);paymentStatusTimer=null}
  },3000);
}
function showManualPayment(out){
  const a=out.collection_account||{};
  manualPaymentOrderRef=out.order_ref||"";
  $("manualPayAmount").textContent="GHC "+Number(out.amount||0).toLocaleString("en-GH",{minimumFractionDigits:2,maximumFractionDigits:2});
  $("manualPayMethod").textContent=a.payment_method||"Payment";
  $("manualPayProvider").textContent=a.provider_name||"RANOVA";
  $("manualPayName").textContent=a.account_name||"RANOVA";
  $("manualPayAccount").textContent=a.account_reference||"—";
  $("manualPayReference").textContent=out.reference||"—";
  $("manualPayInstructions").textContent=a.instructions||"Use the RANOVA payment reference when making payment.";
  $("manualPaymentOverlay").classList.add("show");
  $("manualPaymentOverlay").setAttribute("aria-hidden","false");
  watchPaymentStatus(manualPaymentOrderRef);
}
document.addEventListener("click",async e=>{
  if(e.target.closest("#manualPayClose")||e.target===$("manualPaymentOverlay")){
    $("manualPaymentOverlay")?.classList.remove("show");$("manualPaymentOverlay")?.setAttribute("aria-hidden","true");return;
  }
  if(!e.target.closest("#manualPayCopy"))return;
  const text=[
    "RANOVA CUSTOMER PAYMENT",
    "Amount: "+$("manualPayAmount").textContent,
    "Method: "+$("manualPayMethod").textContent,
    "Provider: "+$("manualPayProvider").textContent,
    "Account name: "+$("manualPayName").textContent,
    "Account: "+$("manualPayAccount").textContent,
    "Reference: "+$("manualPayReference").textContent
  ].join("\n");
  try{await navigator.clipboard.writeText(text);showToast("Payment details copied")}catch{showToast("Could not copy automatically")}
});
if($("manualPayCheck"))$("manualPayCheck").onclick=()=>checkOrderPayment(manualPaymentOrderRef);
if($("paymentReceivedClose"))$("paymentReceivedClose").onclick=()=>{
  $("paymentReceivedOverlay")?.classList.remove("show");$("paymentReceivedOverlay")?.setAttribute("aria-hidden","true");showPanel("ordersPanel");
};
if($("toPayBack"))$("toPayBack").onclick=()=>showPanel("homePanel");
if($("toPaySearch"))$("toPaySearch").addEventListener("input",e=>renderToPayOrders(e.target.value));
document.addEventListener("click",async e=>{
  const close=e.target.closest("[data-pay-close]");if(close){const card=close.closest(".pay-order");if(card)card.style.display="none";return}
  const address=e.target.closest("[data-pay-address]");if(address){showPanel("addressPanel");return}
  const pay=e.target.closest("[data-pay-now]");if(pay){
    const order=toPayOrders.find(x=>x.id===pay.dataset.payNow);if(!order)return;
    if(order.total==null){showToast("This order total is not ready for payment yet.");return}
    pay.disabled=true;pay.textContent="Opening secure payment…";
    try{
      const out=await paymentApi({action:"initialize",order_ref:order.order_ref});
      if(out.authorization_url){location.href=out.authorization_url;return}
      if(out.payment_mode==="manual_collection_account"){showManualPayment(out);return}
      if(out.payment_mode==="mobile_money_prompt"){
        showToast(out.display_text||"Check your phone and authorize the Mobile Money payment.");
        watchPaymentStatus(out.order_ref||order.order_ref);
      }else showToast("Payment started securely.");
    }catch(err){showToast(err.message||"Could not start payment.")}
    finally{pay.disabled=false;pay.textContent="Pay Now"}
    return
  }
  const product=e.target.closest("[data-pay-product]");if(product){const p=toPayRecommendations.find(x=>x.id===product.dataset.payProduct);if(!p)return;const store=toPayStores.find(s=>s.id===p.store_id);if(store?.slug){location.href="../all/seller-store.html?store="+encodeURIComponent(store.slug)+"&product="+encodeURIComponent(p.id)}else showToast("This seller store is not available right now.");return}
});

// RANOVA in-app buyer messenger 2026-09-29
async function handleDirectPaymentLink(){
  const qs=new URLSearchParams(location.search);
  const orderRef=qs.get("pay_order_ref")||"";
  if(!orderRef)return;
  try{
    await loadToPayOrders();
    const found=toPayOrders.find(x=>x.order_ref===orderRef)||null;
    showPanel("toPayPanel");
    renderToPayOrders(orderRef);
    if(found)setTimeout(()=>document.querySelector('[data-pay-order="'+CSS.escape(found.id)+'"]')?.scrollIntoView({behavior:"smooth",block:"start"}),80);
    history.replaceState(null,"",location.pathname);
  }catch(err){showToast(err.message||"Could not open payment for this order.")}
}

async function handlePaymentReturn(){
  const qs=new URLSearchParams(location.search);
  if(qs.get("payment_return")!=="1")return;
  const orderRef=qs.get("order_ref")||"";
  const reference=qs.get("reference")||qs.get("trxref")||"";
  if(!orderRef)return;
  try{
    const out=await paymentApi({action:"verify",order_ref:orderRef,reference});
    const paid=String(out.order_payment_status||out.payment_status||out.status||"").toLowerCase();
    if(out.ok&&(paid==="paid"||paid==="confirmed"||out.confirmed===true))showPaymentReceived(orderRef);
    else if(await checkOrderPayment(orderRef,{silent:true})){}
    else showToast("Payment verification is still processing.");
  }catch(err){
    if(!(await checkOrderPayment(orderRef,{silent:true})))showToast(err.message||"Payment verification is still processing.");
  }finally{
    history.replaceState(null,"",location.pathname);
  }
}

async function paymentApi(body){
  const {data:{session}}=await sb.auth.getSession();
  if(!session)throw Error("Sign in before paying.");
  const r=await fetch(PAYMENT_ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json","x-ranova-client":"ranova-site-v1","apikey":cfg.supabasePublishableKey,"Authorization":"Bearer "+session.access_token},body:JSON.stringify(body)});
  const out=await r.json().catch(()=>({}));if(!r.ok||!out.ok)throw Error(out.error||"Secure payment request failed.");return out;
}
async function messageApi(body){
  const {data:{session}}=await sb.auth.getSession();
  if(!session)throw Error("Sign in to use messages.");
  const r=await fetch(MESSAGE_ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json","x-ranova-client":"ranova-site-v1","apikey":cfg.supabasePublishableKey,"Authorization":"Bearer "+session.access_token},body:JSON.stringify(body)});
  const out=await r.json().catch(()=>({}));if(!r.ok||!out.ok)throw Error(out.error||"Messaging request failed.");return out;
}
function animalAvatar(seed){
  const animals=["🦁","🐯","🐺","🦅","🐆","🦊","🐻","🦈","🐉","🦬"];
  let h=0;for(const ch of String(seed||"RANOVA"))h=(h*31+ch.charCodeAt(0))>>>0;
  return '<span class="msg-animal" title="Wildlife store avatar">'+animals[h%animals.length]+'</span>';
}
function messageAvatar(store,cls="msg-avatar"){
  return '<span class="'+cls+'">'+(store?.logo_url?'<img src="'+esc(store.logo_url)+'" alt="'+esc(store.store_name||"Store")+'">':animalAvatar(store?.id||store?.store_name))+'</span>';
}
function msgPreview(c){
  const m=c.last_message;if(!m)return "Start a conversation";
  return m.body||({image:"📷 Photo",audio:"🎙 Voice note",file:"📎 Attachment",rfq:"Quotation request",quote:"Seller quotation",quote_status:"Quote update"}[m.message_type]||prettyKey(m.message_type));
}
function messageTime(v){const d=new Date(v);if(Number.isNaN(d.getTime()))return "";const now=new Date();return d.toDateString()===now.toDateString()?d.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"}):d.toLocaleDateString([],{month:"2-digit",day:"2-digit"})}
async function loadMessageConversations(prefetch=false){
  if(!user)return;if(prefetch&&messageConversations.length&&Date.now()-messagesLoadedAt<30000)return;
  const out=await messageApi({action:"list"});messageConversations=out.conversations||[];messagesLoadedAt=Date.now();saveFastCache();
  renderMessageList();markPanelPainted("messagesPanel");
  setBadge("bottomMessageCount",messageConversations.filter(x=>x.unread).length);
}
function renderMessageList(){
  const host=$("messageConversationList");if(!host)return;
  $("messageConversationCount").textContent=messageConversations.length?"("+messageConversations.length+")":"";
  host.innerHTML=messageConversations.length?messageConversations.map(c=>{
    const store=c.store||{},product=c.product||null;
    return '<button class="msg-row" type="button" data-message-conversation="'+esc(c.id)+'">'+
      messageAvatar(store)+
      '<span class="msg-row-main"><span class="msg-row-top"><b>'+esc(store.store_name||"RANOVA Store")+'</b>'+(c.unread?'<span class="msg-unread">new</span>':'')+'<time class="msg-row-time">'+esc(messageTime(c.last_message?.created_at||c.updated_at))+'</time></span><span class="msg-row-preview">'+esc(msgPreview(c))+'</span></span>'+
      '<span class="msg-row-product">'+(product?.primary_image_url?'<img src="'+esc(product.primary_image_url)+'" alt="'+esc(product.name||"Product")+'">':'<span>'+(product?esc(product.name||"Product"):"Chat")+'</span>')+'</span>'+
    '</button>';
  }).join(""):'<div class="msg-list-empty"><b>No messages yet</b><br>When you contact a store, the conversation will appear here.</div>';
  host.querySelectorAll("[data-message-conversation]").forEach(b=>b.onclick=()=>openMessageConversation(b.dataset.messageConversation));
}
function messageMedia(m){
  if(!m.media_url)return "";
  const url=esc(m.media_url),name=esc(m.file_name||"Attachment");
  if(m.message_type==="image")return '<a href="'+url+'" target="_blank" rel="noopener"><img src="'+url+'" alt="'+name+'"></a>';
  if(m.message_type==="audio")return '<audio controls preload="metadata" src="'+url+'"></audio>';
  if(m.message_type==="file")return '<a href="'+url+'" target="_blank" rel="noopener">📎 '+name+'</a>';
  return "";
}
function messageById(id){return (messageCurrent?.messages||[]).find(m=>String(m.id)===String(id))}
function shortMessageBody(m){return String(m?.body||({image:"Photo",audio:"Voice note",file:"Attachment",rfq:"Quotation request",quote:"Quotation",quote_status:"Quote update"}[m?.message_type]||"Message")).slice(0,120)}
function messageReplyHtml(m){
  if(!m.reply_to_message_id)return "";
  const q=messageById(m.reply_to_message_id);
  return q?'<button class="msg-reply-quote" type="button" data-msg-jump="'+esc(q.id)+'"><b>'+esc(String(q.sender_user_id||"")===String(user?.id||"")?"You":prettyKey(q.sender_role))+'</b><span>'+esc(shortMessageBody(q))+'</span></button>':"";
}
function clearMsgAction(){
  msgReplyingTo=null;msgEditingMessage=null;
  const box=$("msgReplyPreview");if(box){box.hidden=true;box.innerHTML=""}
  resizeMsgInput();
}
function setMsgReply(m){
  msgEditingMessage=null;msgReplyingTo=m;
  const box=$("msgReplyPreview");if(!box)return;
  box.hidden=false;box.innerHTML='<span><b>Reply</b> · '+esc(shortMessageBody(m))+'</span><button id="msgCancelAction" type="button">×</button>';
  $("msgCancelAction").onclick=clearMsgAction;$("msgInput").focus();
}
function setMsgEdit(m){
  msgReplyingTo=null;msgEditingMessage=m;
  const box=$("msgReplyPreview");if(!box)return;
  box.hidden=false;box.innerHTML='<span><b>Edit message</b> · You have 3 minutes after sending.</span><button id="msgCancelAction" type="button">×</button>';
  $("msgCancelAction").onclick=clearMsgAction;
  $("msgInput").value=m.body||"";updateMsgAction();$("msgInput").focus();
}
function closeCustomerMessageActions(){
  const sheet=$("msgActionSheet");if(sheet){sheet.classList.remove("open");sheet.innerHTML=""}
}
async function deleteCustomerMessage(m){
  if(!m||!messageCurrent)return;
  if(!confirm("Delete this message for both sides?"))return;
  try{
    await messageApi({action:"delete_message",conversation_id:messageCurrent.id,message_id:m.id});
    closeCustomerMessageActions();clearMsgAction();await refreshOpenMessage();await loadMessageConversations();showToast("Message deleted");
  }catch(e){showToast(e.message||"Could not delete message")}
}
function showCustomerMessageActions(m){
  if(!m||m.sender_role==="system")return;
  const mine=m.sender_role!=="system"&&String(m.sender_user_id||"")===String(user?.id||"");
  const fresh=Date.now()-new Date(m.created_at).getTime()<=180000;
  const canEdit=mine&&m.message_type==="text"&&fresh;
  const canDelete=mine;
  const sheet=$("msgActionSheet");if(!sheet)return;
  const buttons=[
    '<button type="button" data-msg-action="reply">↩ <span>Reply</span></button>',
    '<button type="button" data-msg-action="copy">⧉ <span>Copy</span></button>',
    ...(canEdit?['<button type="button" data-msg-action="edit">✎ <span>Edit</span></button>']:[]),
    ...(canDelete?['<button type="button" class="danger" data-msg-action="delete">🗑 <span>Delete</span></button>']:[]),
    ...(!mine?['<button type="button" class="danger" data-msg-action="report">! <span>Report</span></button>']:[])
  ];
  sheet.className="msg-action-sheet open "+(mine?"sent-actions":"received-actions");
  sheet.innerHTML='<div class="msg-action-backdrop"></div><div class="msg-action-card"><div class="msg-action-handle"></div>'+buttons.join("")+'<button type="button" class="cancel" data-msg-action="cancel">Cancel</button></div>';
  sheet.querySelector(".msg-action-backdrop").onclick=closeCustomerMessageActions;
  sheet.querySelectorAll("[data-msg-action]").forEach(b=>b.onclick=async()=>{
    const action=b.dataset.msgAction;
    if(action==="cancel")return closeCustomerMessageActions();
    if(action==="reply"){closeCustomerMessageActions();setMsgReply(m)}
    else if(action==="copy"){await navigator.clipboard?.writeText(m.body||"").catch(()=>{});closeCustomerMessageActions();showToast("Message copied")}
    else if(action==="edit"&&canEdit){closeCustomerMessageActions();setMsgEdit(m)}
    else if(action==="delete"&&canDelete)await deleteCustomerMessage(m);
    else if(action==="report"&&!mine){closeCustomerMessageActions();await reportCustomerMessage(m.id)}
  });
}
async function reportCustomerMessage(messageId){
  const category=(prompt("Report reason: spam, fraud_suspected, off_platform_payment, harassment, misleading_product, counterfeit_suspected, or other","spam")||"").trim().toLowerCase();
  if(!category)return;
  const description=(prompt("Briefly explain why you are reporting this message.","")||"").trim();
  if(description.length<5)return showToast("Add a short explanation.");
  try{
    const out=await messageApi({action:"report_message",conversation_id:messageCurrent.id,message_id:messageId,category,description});
    showToast(out.report_ref?"Report submitted: "+out.report_ref:"Report submitted");
  }catch(e){showToast(e.message||"Could not submit report")}
}
function customerQuoteCard(q){
  const expired=q.expires_at&&new Date(q.expires_at).getTime()<=Date.now();
  const status=expired&&["quoted","revised"].includes(q.status)?"expired":q.status;
  let actions="";
  if(messageRole==="buyer"&&["quoted","revised"].includes(status)){
    actions='<button type="button" class="msg-quote-primary" data-msg-quote-accept="'+esc(q.id)+'">Accept</button>'+
      '<button type="button" data-msg-quote-negotiate="'+esc(q.id)+'">Negotiate</button>'+
      '<button type="button" data-msg-quote-decline="'+esc(q.id)+'">Decline</button>';
  }else if(status==="accepted"&&messageRole==="buyer"){
    actions='<button type="button" class="msg-quote-primary" data-msg-quote-cart="'+esc(q.id)+'">Use accepted quote</button>';
  }
  return '<article class="msg-quote-card"><b>'+esc(q.quote_ref||"Quotation")+' · '+esc(prettyKey(status))+'</b>'+
    '<small>'+esc(q.requested_quantity||1)+' unit(s)'+(q.unit_price!=null?' · GHC '+Number(q.unit_price).toFixed(2)+' each':'')+(q.delivery_fee!=null?' · Delivery GHC '+Number(q.delivery_fee).toFixed(2):'')+'</small>'+
    (q.expires_at?'<small>Valid until '+esc(new Date(q.expires_at).toLocaleString())+'</small>':'')+
    (q.seller_terms?'<p>'+esc(q.seller_terms)+'</p>':'')+
    (actions?'<div class="msg-quote-actions">'+actions+'</div>':'')+'</article>';
}
async function requestCustomerQuote(){
  if(!messageCurrent?.product||messageRole!=="buyer")return;
  const p=messageCurrent.product;
  const qty=prompt("Quantity for quotation",String(p.moq||1));if(qty==null)return;
  const country=(prompt("Destination country code (example: GH)","GH")||"").trim().toUpperCase();
  const destination=(prompt("Delivery destination / location","")||"").trim();
  const note=(prompt("Extra quotation details (optional)","")||"").trim();
  try{
    await messageApi({action:"request_quote",conversation_id:messageCurrent.id,product_id:p.id,quantity:qty,destination_country_code:country,destination_text:destination,note});
    await refreshOpenMessage();showToast("Quotation request sent");
  }catch(e){showToast(e.message||"Could not request quotation")}
}
async function respondCustomerQuote(id,decision){
  try{
    const out=await messageApi({action:"respond_quote",conversation_id:messageCurrent.id,quote_id:id,decision});
    await refreshOpenMessage();
    if(decision==="accepted")showToast("Quotation accepted");
    if(decision==="accepted"&&out.cart_url){
      const b=$("msgAcceptedQuoteLink");if(b){b.hidden=false;b.dataset.url=out.cart_url}
    }
  }catch(e){showToast(e.message||"Could not update quotation")}
}
function negotiateCustomerQuote(id){
  const q=(messageCurrent?.quotes||[]).find(x=>x.id===id);if(!q)return;
  $("msgInput").value="I would like to negotiate "+q.quote_ref+". ";
  $("msgInput").focus();updateMsgAction();
}
function bindCustomerMessageActions(){
  const host=$("messageThread");if(!host)return;
  host.querySelectorAll(".msg-bubble[data-message-id]").forEach(node=>{
    const m=messageById(node.dataset.messageId);if(!m)return;
    node.oncontextmenu=e=>{e.preventDefault();showCustomerMessageActions(m)};
    node.ontouchstart=()=>{clearTimeout(msgPressTimer);msgPressTimer=setTimeout(()=>showCustomerMessageActions(m),550)};
    node.ontouchend=node.ontouchmove=()=>clearTimeout(msgPressTimer);
  });
  host.querySelectorAll("[data-msg-jump]").forEach(b=>b.onclick=e=>{e.stopPropagation();host.querySelector('[data-message-id="'+CSS.escape(b.dataset.msgJump)+'"]')?.scrollIntoView({behavior:"smooth",block:"center"})});
  host.querySelectorAll("[data-msg-report]").forEach(b=>b.onclick=()=>reportCustomerMessage(b.dataset.msgReport));
  host.querySelectorAll("[data-msg-quote-accept]").forEach(b=>b.onclick=()=>respondCustomerQuote(b.dataset.msgQuoteAccept,"accepted"));
  host.querySelectorAll("[data-msg-quote-decline]").forEach(b=>b.onclick=()=>respondCustomerQuote(b.dataset.msgQuoteDecline,"declined"));
  host.querySelectorAll("[data-msg-quote-negotiate]").forEach(b=>b.onclick=()=>negotiateCustomerQuote(b.dataset.msgQuoteNegotiate));
  host.querySelectorAll("[data-msg-quote-cart]").forEach(b=>b.onclick=()=>location.href="../all/cart.html?quote="+encodeURIComponent(b.dataset.msgQuoteCart));
}
function stopMessageRealtime(){
  if(messageRealtimeChannel){sb.removeChannel(messageRealtimeChannel);messageRealtimeChannel=null}
}
function subscribeOpenConversationRealtime(id){
  stopMessageRealtime();
  let refreshTimer=null;
  const refresh=()=>{clearTimeout(refreshTimer);refreshTimer=setTimeout(()=>{if(messageCurrent?.id===id)refreshOpenMessage().catch(()=>{})},90)};
  messageRealtimeChannel=sb.channel("rpe-customer-conversation-"+id)
    .on("postgres_changes",{event:"*",schema:"public",table:"ranova_messages",filter:"conversation_id=eq."+id},refresh)
    .on("postgres_changes",{event:"*",schema:"public",table:"ranova_quotes",filter:"conversation_id=eq."+id},refresh)
    .subscribe();
}
async function openMessageConversation(id){
  const out=await messageApi({action:"open",conversation_id:id});messageCurrent=out.conversation;messageRole=out.role;
  clearMsgAction();
  $("messagesPanel").classList.add("chat-open");document.body.classList.add("ranova-chat-open");syncChatViewport();requestAnimationFrame(syncChatViewport);
  const store=messageCurrent.store||{};$("messageChatTitle").textContent=store.store_name||"RANOVA Store";$("messageChatSub").textContent=messageCurrent.subject||"Online store conversation";
  $("messageChatAvatar").innerHTML=store.logo_url?'<img src="'+esc(store.logo_url)+'" alt="" style="width:100%;height:100%;object-fit:cover">':animalAvatar(store.id||store.store_name);
  const p=messageCurrent.product,ctx=$("messageProductContext");
  if(p){
    ctx.classList.add("show");
    ctx.innerHTML=(p.primary_image_url?'<img src="'+esc(p.primary_image_url)+'" alt="'+esc(p.name)+'">':'<div style="width:48px;height:48px;border-radius:9px;background:#eee"></div>')+
      '<div><b>'+esc(p.name||"Product")+'</b><small>'+esc(p.price==null?"Ask for price":money(p.price,p.currency||"GHS"))+'</small></div>'+
      '<button class="ask-tag msg-rfq" id="msgRequestQuote" type="button">Request quote</button>';
    $("msgRequestQuote").onclick=requestCustomerQuote;
  }else{ctx.classList.remove("show");ctx.innerHTML=""}
  renderMessageThread();
  subscribeOpenConversationRealtime(id);
  await loadMessageConversations();
  clearInterval(messagePoll);
  messagePoll=setInterval(()=>{if(messageCurrent?.id===id&&$("messagesPanel").classList.contains("active"))refreshOpenMessage().catch(()=>{})},15000);
}
async function refreshOpenMessage(){
  if(!messageCurrent)return;
  if(messageRefreshPromise){messageRefreshQueued=true;return messageRefreshPromise}
  const id=messageCurrent.id;
  messageRefreshPromise=(async()=>{
    do{
      messageRefreshQueued=false;
      const out=await messageApi({action:"open",conversation_id:id});
      if(messageCurrent?.id!==id)return;
      messageCurrent=out.conversation;messageRole=out.role;renderMessageThread({preserveScroll:true});
    }while(messageRefreshQueued&&messageCurrent?.id===id);
  })();
  try{return await messageRefreshPromise}finally{messageRefreshPromise=null}
}
function renderMessageThread({preserveScroll=false}={}){
  const host=$("messageThread");if(!host||!messageCurrent)return;
  const wasNearBottom=host.scrollHeight-host.scrollTop-host.clientHeight<90;
  const previousTop=host.scrollTop;
  let day="";
  const quotes=(messageCurrent.quotes||[]).length?'<div class="msg-quote-stack">'+messageCurrent.quotes.map(customerQuoteCard).join("")+'</div>':"";
  const rows=(messageCurrent.messages||[]).map(m=>{
    const d=new Date(m.created_at),key=d.toDateString(),sep=key!==day?'<div class="msg-date">'+d.toLocaleDateString([],{year:"numeric",month:"long",day:"numeric"})+'</div>':"";
    day=key;
    const mine=m.sender_role!=="system"&&String(m.sender_user_id||"")===String(user?.id||""),cl=m.sender_role==="system"?"system":mine?"mine":"other";
    const media=messageMedia(m),body=m.body?'<div class="msg-body">'+esc(m.body)+'</div>':(!media&&m.message_type!=="system"?'<div class="msg-body">'+esc(prettyKey(m.message_type))+'</div>':"");
    const report=!mine&&m.sender_role!=="system"?'<button class="msg-report" type="button" data-msg-report="'+esc(m.id)+'">Report</button>':"";
    const edited=m.edited_at?" · Edited":"";
    const delivery=m.sender_role==="system"?"":(mine?(m.read_at?" · Read":m.delivered_at?" · Delivered":" · Sent"):" · Received");
    return sep+'<div class="msg-bubble '+cl+'" data-message-id="'+esc(m.id)+'">'+messageReplyHtml(m)+media+body+'<time>'+d.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})+delivery+edited+'</time>'+report+'</div>';
  }).join("");
  host.innerHTML=quotes+(rows||'<div class="msg-list-empty">Start your conversation with this store.</div>');
  bindCustomerMessageActions();
  if(!preserveScroll||wasNearBottom)host.scrollTop=host.scrollHeight;else host.scrollTop=previousTop;
}
$("messageBack").onclick=()=>{$("messagesPanel").classList.remove("chat-open");document.body.classList.remove("ranova-chat-open");clearChatViewport();messageCurrent=null;messageRefreshQueued=false;clearMsgAction();stopMessageRealtime();clearInterval(messagePoll);loadMessageConversations().catch(()=>{})};
$("messageStoreButton").onclick=()=>{if(messageCurrent?.store?.slug)location.href="../all/seller-store.html?store="+encodeURIComponent(messageCurrent.store.slug)};
$("messageSearchButton").onclick=()=>{const q=prompt("Search store conversations:","");if(q==null)return;const s=q.trim().toLowerCase();document.querySelectorAll("#messageConversationList .msg-row").forEach(row=>{row.style.display=!s||row.textContent.toLowerCase().includes(s)?"grid":"none"})};

const msgEmojiGroups={
 "Recent":"😂 🤣 🥳 🔥 👍 🥹 🌚 🙌 🫶 ❤️ 😭 🙏 😎 😍 😉 😊 😁 😅 💃 🕺 🎉 ✨",
 "Smileys":"😀 😃 😄 😁 😆 😅 😂 🤣 😊 😇 🙂 🙃 😉 😌 😍 🥰 😘 😋 😜 🤪 🤗 🤭 🤫 🤔 😎 🥺 🥹 😭 😱 😤 😡",
 "People":"👋 🤚 ✋ 👌 ✌️ 🤞 🤟 🤙 👈 👉 👆 👇 👍 👎 ✊ 👊 👏 🙌 🫶 🤲 🙏 💪 🧑‍💻 👨‍💼 👩‍💼",
 "Love":"❤️ 🩷 🧡 💛 💚 🩵 💙 💜 🤎 🖤 🤍 💘 💝 💖 💗 💓 💞 💕 💌 💋",
 "Animals":"🦁 🐯 🐺 🦅 🐆 🦊 🐻 🦬 🐘 🦏 🦈 🐊 🐍 🦍 🐆 🦓 🦒 🐒 🐼 🦋",
 "Food":"🍎 🍊 🍋 🍌 🍉 🍇 🍓 🍒 🍑 🥭 🍍 🥥 🥑 🍅 🍔 🍟 🍕 🌮 🍜 🍣 🍩 🎂 🍰 🍫 ☕ 🥤 🥂",
 "Nature":"🌹 🌷 🌸 🌺 🌻 🌿 🍀 🌴 🌍 🌞 🌝 🌚 ⭐ ✨ ⚡ 🔥 🌈 ☀️ ☁️ 🌧️ ❄️ 🌊",
 "Objects":"📱 💻 ⌚ 📷 📸 🎥 📎 📌 ✂️ 🖊️ 📚 📦 🎁 🛒 💳 🔑 🏆 🎓 💡 🔒",
 "Flags":"🇬🇭 🇳🇬 🇺🇸 🇬🇧 🇨🇦 🇿🇦 🇨🇮 🇰🇪 🇹🇬 🇫🇷 🇩🇪 🇪🇸 🇮🇹 🇯🇵 🇨🇳 🇮🇳 🇧🇷 🇦🇪"
};
function getMsgRecentEmojis(){try{return JSON.parse(localStorage.getItem("ranova-msg-recent-emojis")||"[]")}catch{return[]}}
function rememberMsgEmoji(e){const next=[e,...getMsgRecentEmojis().filter(x=>x!==e)].slice(0,32);try{localStorage.setItem("ranova-msg-recent-emojis",JSON.stringify(next))}catch{}}
function syncChatViewport(){
  if(!document.body.classList.contains("ranova-chat-open"))return;
  const vv=window.visualViewport;
  const top=vv?Math.max(0,vv.offsetTop):0;
  const height=vv?vv.height:window.innerHeight;
  document.documentElement.style.setProperty("--rnv-chat-top",top+"px");
  document.documentElement.style.setProperty("--rnv-chat-height",Math.max(320,height)+"px");
}
function clearChatViewport(){
  document.documentElement.style.removeProperty("--rnv-chat-top");
  document.documentElement.style.removeProperty("--rnv-chat-height");
}
if(window.visualViewport){
  window.visualViewport.addEventListener("resize",syncChatViewport,{passive:true});
  window.visualViewport.addEventListener("scroll",syncChatViewport,{passive:true});
}
window.addEventListener("resize",syncChatViewport,{passive:true});
function resizeMsgInput(){const i=$("msgInput");if(!i)return;i.style.height="36px";i.style.height=Math.min(116,Math.max(36,i.scrollHeight))+"px";i.style.overflowY=i.scrollHeight>116?"auto":"hidden";requestAnimationFrame(syncChatViewport)}
function updateMsgAction(){const has=!!$("msgInput").value.trim()||!!msgAttachment;$("msgRecordStart").hidden=has;$("msgSend").hidden=!has;resizeMsgInput()}
function showMsgEmoji(group="Recent",filter=""){
  $("msgEmojiPanel").hidden=false;
  $("msgEmojiTabs").innerHTML=Object.keys(msgEmojiGroups).map(g=>'<button type="button" class="'+(g===group?'active':'')+'" data-msg-emoji-group="'+g+'">'+g+'</button>').join("");
  const recent=getMsgRecentEmojis().concat(msgEmojiGroups.Recent.split(/\s+/)).filter((e,i,arr)=>e&&arr.indexOf(e)===i).join(" ");
  const src=filter?Object.values({...msgEmojiGroups,Recent:recent}).join(" "):(group==="Recent"?recent:(msgEmojiGroups[group]||recent));
  $("msgEmojiGrid").innerHTML=[...new Set(src.split(/\s+/))].filter(Boolean).map(e=>'<button type="button" data-msg-emoji="'+e+'">'+e+'</button>').join("");
  $("msgEmojiTabs").querySelectorAll("[data-msg-emoji-group]").forEach(b=>b.onclick=()=>showMsgEmoji(b.dataset.msgEmojiGroup));
  $("msgEmojiGrid").querySelectorAll("[data-msg-emoji]").forEach(b=>b.onclick=()=>{rememberMsgEmoji(b.dataset.msgEmoji);const i=$("msgInput"),at=i.selectionStart;i.setRangeText(b.dataset.msgEmoji,at,i.selectionEnd,"end");i.focus();updateMsgAction()})
}
function previewMsgAttachment(file){msgAttachment=file;$("msgAttachmentPreview").hidden=false;$("msgAttachmentPreview").innerHTML='<span>'+esc(file.name)+' ('+Math.ceil(file.size/1024)+' KB)</span><button id="msgRemoveAttachment" type="button">×</button>';$("msgRemoveAttachment").onclick=()=>{msgAttachment=null;$("msgAttachmentPreview").hidden=true;updateMsgAction()};updateMsgAction()}
async function sendInAppMessage(fileOverride){
  if(!messageCurrent)return;
  const body=$("msgInput").value.trim(),file=fileOverride||msgAttachment;
  if(!body&&!file)return;
  $("msgSend").disabled=true;
  try{
    if(msgEditingMessage){
      await messageApi({action:"edit_message",conversation_id:messageCurrent.id,message_id:msgEditingMessage.id,body});
      clearMsgAction();
    }else if(file){
      if(file.size>15*1024*1024)throw Error("The attachment must be under 15 MB.");
      const mime=file.type||"audio/webm",prep=await messageApi({action:"prepare_media",conversation_id:messageCurrent.id,mime_type:mime,file_size:file.size});
      const up=await sb.storage.from("buyer-seller-media").uploadToSignedUrl(prep.path,prep.token,file,{contentType:mime});if(up.error)throw up.error;
      await messageApi({action:"send_media",conversation_id:messageCurrent.id,body,storage_path:prep.path,media_type:prep.media_type,file_name:file.name,mime_type:mime});
      msgAttachment=null;$("msgAttachmentPreview").hidden=true;clearMsgAction();
    }else{
      await messageApi({action:"send",conversation_id:messageCurrent.id,body,reply_to_message_id:msgReplyingTo?.id||null});
      clearMsgAction();
    }
    $("msgInput").value="";updateMsgAction();await refreshOpenMessage();await loadMessageConversations();
  }catch(e){showToast(e.message||"Could not send message")}finally{$("msgSend").disabled=false}
}
function stopMsgRecording(){if(msgStream){msgStream.getTracks().forEach(t=>t.stop());msgStream=null}msgRecorder=null;$("msgRecording").hidden=true}
$("msgEmojiToggle").onclick=()=>{$("msgEmojiPanel").hidden?showMsgEmoji():$("msgEmojiPanel").hidden=true};$("msgEmojiSearch").oninput=e=>showMsgEmoji("Recent",e.target.value.trim());
$("msgFilePick").onclick=()=>$("msgFileInput").click();$("msgImagePick").onclick=()=>$("msgImageInput").click();["msgFileInput","msgImageInput"].forEach(id=>$(id).onchange=e=>{if(e.target.files?.[0])previewMsgAttachment(e.target.files[0])});
$("msgInput").oninput=updateMsgAction;$("msgInput").onfocus=()=>{syncChatViewport();setTimeout(syncChatViewport,60);setTimeout(syncChatViewport,250)};$("msgInput").onblur=()=>setTimeout(syncChatViewport,80);$("msgInput").onkeydown=e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendInAppMessage()}};$("msgSend").onclick=()=>sendInAppMessage();
$("msgRecordStart").onclick=async()=>{try{if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw Error("Voice recording is unavailable in this browser.");msgStream=await navigator.mediaDevices.getUserMedia({audio:true});const mime=["audio/webm;codecs=opus","audio/mp4","audio/webm"].find(x=>MediaRecorder.isTypeSupported(x))||"";msgRecorder=new MediaRecorder(msgStream,mime?{mimeType:mime}:undefined);msgChunks=[];msgStarted=Date.now();msgPaused=0;msgPauseStarted=0;msgRecorder.ondataavailable=e=>{if(e.data.size)msgChunks.push(e.data)};msgRecorder.onstop=()=>{const type=msgRecorder?.mimeType?.split(";")[0]||"audio/webm",blob=new Blob(msgChunks,{type});stopMsgRecording();if(blob.size)sendInAppMessage(new File([blob],"Voice note."+({"audio/mp4":"m4a","audio/ogg":"ogg"}[type]||"webm"),{type}))};msgRecorder.start();$("msgRecording").hidden=false;$("msgRecordTime").textContent="0:00";msgTimer=setInterval(()=>{const ms=(msgPauseStarted||Date.now())-msgStarted-msgPaused,sec=Math.floor(ms/1000);$("msgRecordTime").textContent=Math.floor(sec/60)+":"+String(sec%60).padStart(2,"0")},500)}catch(e){stopMsgRecording();showToast(e.message||"Microphone access was denied.")}};
$("msgRecordPause").onclick=()=>{if(!msgRecorder)return;const b=$("msgRecordPause");if(msgRecorder.state==="recording"){msgRecorder.pause();msgPauseStarted=Date.now();b.textContent="▶ Resume"}else if(msgRecorder.state==="paused"){msgRecorder.resume();msgPaused+=Date.now()-msgPauseStarted;msgPauseStarted=0;b.textContent="⏸ Pause"}};
$("msgRecordDelete").onclick=()=>{if(msgRecorder){msgRecorder.onstop=null;if(msgRecorder.state!=="inactive")msgRecorder.stop()}clearInterval(msgTimer);stopMsgRecording()};$("msgRecordSend").onclick=()=>{if(msgRecorder&&msgRecorder.state!=="inactive"){clearInterval(msgTimer);msgRecorder.stop()}};
updateMsgAction();

function removeLegacyFeedNotice(root=document){
  root.querySelectorAll?.(".home-feed-note,.rpe-feed-live,[data-ranova-feed-note]").forEach(x=>x.remove());
  root.querySelectorAll?.("p,div,span,a,button").forEach(x=>{
    if(x.children.length>3)return;
    const t=(x.textContent||"").trim();
    if(/Products from different RANOVA stores/i.test(t)||/^Refreshing mix$/i.test(t)||(/^Explore\s*›?$/i.test(t)&&x.closest(".home-feed-note,[data-ranova-feed-note]")))x.remove();
  });
}
removeLegacyFeedNotice();
new MutationObserver(records=>records.forEach(r=>r.addedNodes.forEach(n=>{if(n.nodeType===1)removeLegacyFeedNotice(n)}))).observe(document.body,{childList:true,subtree:true});
window.addEventListener("pageshow",()=>{if(!user)return;restoreMarketplaceCartDrafts();renderCart();if(navigator.onLine)refreshBuyerShoppingState().catch(()=>{})});
window.addEventListener("online",()=>{if(user)refreshBuyerShoppingState().catch(()=>{})});
document.addEventListener("visibilitychange",()=>{if(document.visibilityState==="visible"&&user)refreshBuyerShoppingState().catch(()=>{})});
startRecommendationRotation();
boot();
})();