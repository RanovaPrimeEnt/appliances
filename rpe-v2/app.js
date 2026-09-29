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
let recentIds = [];
let cartId = null;
let cartItems = [];
let orders = [];
let notifications = [];
let addresses = [];
let returns = [];
let toPayOrders = [];
let toPayStores = [];
let toPayRecommendations = [];
let orderFilter = null;
let signUpMode = false;
let incomingCartHandled = false;
let realtimeChannels = [];
let messageConversations=[],messageCurrent=null,messageRole=null,messagePoll=null,msgAttachment=null,msgRecorder=null,msgStream=null,msgChunks=[],msgStarted=0,msgPaused=0,msgPauseStarted=0,msgTimer=null;
const MESSAGE_ENDPOINT=cfg.supabaseUrl+"/functions/v1/ranova-messaging";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const money = (n,c='GHS') => n == null ? "Ask for price" : new Intl.NumberFormat("en-GH",{style:"currency",currency:c}).format(Number(n));
const imageFor = (p) => {
  const imgs = (p.product_images || []).slice().sort((a,b)=>(b.is_primary?1:0)-(a.is_primary?1:0)||(a.sort_order||0)-(b.sort_order||0));
  return imgs[0]?.image_url || "";
};
function showToast(msg){toast.textContent=msg;toast.classList.add("show");clearTimeout(showToast.t);showToast.t=setTimeout(()=>toast.classList.remove("show"),1700)}
function statusLabel(s){return ({
  quote_pending:"Quote pending",awaiting_confirmation:"Awaiting confirmation",awaiting_payment:"To pay",
  payment_confirmed:"Payment confirmed",preparing:"Preparing",ready_for_dispatch:"Ready for dispatch",
  dispatched:"Dispatched",out_for_delivery:"On the way",delivered:"Delivered",cancelled:"Cancelled",
  return_requested:"Return requested",returned:"Returned",refund_pending:"Refund pending",refunded:"Refunded"
})[s] || String(s||"").replaceAll("_"," ")}
function prettyKey(s){return String(s||"").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase())}
function setBadge(id,n){const el=$(id);if(!el)return;el.textContent=n;el.classList.toggle("hide",!n)}
function contactRpe(){window.open("https://wa.me/233542846895?text="+encodeURIComponent("Hello Ranova Prime Enterprise, I need some help with my order or shopping."),"_blank","noopener")}

function showPanel(id){
  document.querySelectorAll(".panel").forEach(x=>x.classList.remove("active"));
  $(id)?.classList.add("active");
  document.querySelectorAll(".bottom button[data-panel]").forEach(b=>b.classList.toggle("active",b.dataset.panel===id));
  if(id==="notifPanel") markNotificationsRead();
  if(id==="ordersPanel") renderOrders();
  if(id==="messagesPanel") loadMessageConversations().catch(()=>{});
  if(id==="toPayPanel") loadToPayOrders().catch(e=>showToast(e.message||"Could not load unpaid orders"));
  window.scrollTo({top:0,behavior:"smooth"});
}
document.addEventListener("click",e=>{
  const b=e.target.closest("[data-panel]");
  if(b){orderFilter=null;showPanel(b.dataset.panel)}
  const s=e.target.closest("[data-order-filter]");
  if(s){orderFilter=s.dataset.orderFilter;showPanel("ordersPanel")}
  const coming=e.target.closest("[data-coming]");
  if(coming){showToast(coming.dataset.coming+" is coming soon to RANOVA.")}
});
if($("contactShortcut"))$("contactShortcut").onclick=contactRpe;
if($("helpContact"))$("helpContact").onclick=contactRpe;
if($("notifBtn"))$("notifBtn").onclick=()=>showPanel("notifPanel");
if($("cartBtn"))$("cartBtn").onclick=openCart;
if($("bottomCart"))$("bottomCart").onclick=openCart;
if($("openCartShortcut"))$("openCartShortcut").onclick=openCart;
$("closeCart").onclick=closeCart;
$("cartDrawer").addEventListener("click",e=>{if(e.target===$("cartDrawer"))closeCart()});
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeCart()});

function authUI(){
  $("authTitle").textContent=signUpMode?"Create your My RPE account":"Welcome back";
  $("authText").textContent=signUpMode?"Create one simple account for saved products, your cart, delivery addresses and live order updates.":"Sign in to see your saved products, cart and live order updates.";
  $("signupFields").classList.toggle("hide",!signUpMode);
  $("confirmWrap").classList.toggle("hide",!signUpMode);
  $("authFinePrint").classList.toggle("hide",!signUpMode);
  $("authSubmit").textContent=signUpMode?"Create my account":"Sign in";
  $("signInTab").classList.toggle("active",!signUpMode);
  $("createTab").classList.toggle("active",signUpMode);
  $("password").autocomplete=signUpMode?"new-password":"current-password";
}
$("signInTab").onclick=()=>{signUpMode=false;$("authMsg").textContent="";authUI()};
$("createTab").onclick=()=>{signUpMode=true;$("authMsg").textContent="";authUI()};
$("togglePassword").onclick=()=>{
  const p=$("password"),show=p.type==="password";p.type=show?"text":"password";
  $("togglePassword").textContent=show?"Hide":"Show";
  $("togglePassword").setAttribute("aria-label",show?"Hide password":"Show password");
};
$("authSubmit").onclick=async()=>{
  const email=$("email").value.trim(),password=$("password").value;
  $("authMsg").textContent="Working…";
  try{
    let error;
    if(signUpMode){
      const first=$("firstName").value.trim(),last=$("lastName").value.trim(),phone=$("phone").value.trim(),confirm=$("confirmPassword").value;
      if(!first){$("authMsg").textContent="Please enter your first name.";return}
      if(!email){$("authMsg").textContent="Please enter your email address.";return}
      if(password.length<8){$("authMsg").textContent="Use at least 8 characters for your password.";return}
      if(password!==confirm){$("authMsg").textContent="The two passwords do not match.";return}
      ({error}=await sb.auth.signUp({
        email,password,
        options:{
          emailRedirectTo:location.origin+location.pathname+location.search,
          data:{first_name:first,last_name:last,phone:phone}
        }
      }));
      if(!error){
        $("authMsg").textContent="Your account has been created. If RPE asks you to confirm your email, open the message in your inbox and tap the confirmation link.";
        $("password").value="";$("confirmPassword").value="";
      }
    }else{
      ({error}=await sb.auth.signInWithPassword({email,password}));
    }
    if(error)$("authMsg").textContent=error.message;
  }catch(e){$("authMsg").textContent="We couldn't complete that. Please try again."}
};
$("signOut").onclick=()=>sb.auth.signOut();

async function boot(){
  const {data:{session}}=await sb.auth.getSession();
  applySession(session);
  sb.auth.onAuthStateChange((_event,session)=>setTimeout(()=>applySession(session),0));
}
async function applySession(session){
  cleanupRealtime();
  user=session?.user||null;
  if(!user){
    setup.classList.add("hide");appBox.classList.add("hide");authBox.classList.remove("hide");authUI();return;
  }
  authBox.classList.add("hide");setup.classList.remove("hide");setup.textContent="Loading your RPE account…";
  try{
    await loadAll();
    setup.classList.add("hide");appBox.classList.remove("hide");subscribeRealtime();
    await handleIncomingCartLink();
  }catch(e){
    console.error(e);
    setup.innerHTML='<div style="text-align:center;padding:24px"><b style="display:block;color:#173d32">We could not load My RPE.</b><span>Please refresh or try again shortly.</span></div>';
  }
}

async function loadAll(){
  const uid=user.id;
  const [
    prof,prod,fav,rec,cart,ord,noti,addr,ret
  ]=await Promise.all([
    sb.from("profiles").select("*").eq("user_id",uid).maybeSingle(),
    sb.from("products").select("id,legacy_id,sku,name,slug,brand,short_description,description,price,currency,stock_status,category_id,dimensions,specifications,product_images(image_url,is_primary,sort_order),categories(name)").eq("active",true).order("created_at",{ascending:false}),
    sb.from("favorites").select("product_id").eq("user_id",uid),
    sb.from("recently_viewed").select("product_id,viewed_at").eq("user_id",uid).order("viewed_at",{ascending:false}).limit(20),
    sb.from("carts").select("id").eq("user_id",uid).maybeSingle(),
    sb.from("orders").select("*,order_items(*)").eq("user_id",uid).order("created_at",{ascending:false}),
    sb.from("notifications").select("*").eq("user_id",uid).order("created_at",{ascending:false}).limit(50),
    sb.from("addresses").select("*").eq("user_id",uid).order("is_default",{ascending:false}).order("created_at",{ascending:false}),
    sb.from("return_requests").select("*").eq("user_id",uid).order("created_at",{ascending:false})
  ]);
  [prof,prod,fav,rec,cart,ord,noti,addr,ret].forEach(x=>{if(x.error)throw x.error});
  profile=prof.data;products=prod.data||[];favorites=new Set((fav.data||[]).map(x=>x.product_id));recentIds=(rec.data||[]).map(x=>x.product_id);
  cartId=cart.data?.id||null;orders=ord.data||[];notifications=noti.data||[];addresses=addr.data||[];returns=ret.data||[];
  await loadCartItems();
  renderAll();
}
async function loadCartItems(){
  if(!cartId){cartItems=[];return}
  const {data,error}=await sb.from("cart_items").select("id,quantity,product_id,products(id,name,sku,price,currency,stock_status,product_images(image_url,is_primary,sort_order))").eq("cart_id",cartId).order("created_at");
  if(error)throw error;cartItems=data||[];
}


function renderAll(){
  const fallback=user.user_metadata?.first_name || user.email?.split("@")[0] || "Customer";
  const fullName=[profile?.first_name,profile?.last_name].filter(Boolean).join(" ")||fallback;
  $("helloName").textContent=fullName;
  if($("accountAvatar"))$("accountAvatar").textContent=fullName.split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]||"").join("").toUpperCase()||"R";
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
      <div class="product-copy"><h3>${esc(p.name)}</h3><small>${esc(cat)} • ${esc(p.sku||p.legacy_id||"RPE")}</small><small style="font-weight:800;color:#0e5b43">${esc(money(p.price,p.currency))}</small></div>
    </button>
    <div class="product-copy" style="padding-top:0"><div class="product-actions"><button class="add" data-add="${p.id}">Add to cart</button><button class="fav" data-fav="${p.id}" aria-label="Save product">${favorites.has(p.id)?"♥":"♡"}</button></div></div>
  </article>`;
}
function renderProducts(list){
  $("productsGrid").innerHTML=list.length?list.map(productCard).join(""):'<div class="empty" style="grid-column:1/-1"><b>No matching products</b>Try another search.</div>';
}
function renderHomeProducts(){$("homeProducts").innerHTML=products.slice(0,4).map(productCard).join("")||'<div class="empty" style="grid-column:1/-1">Products will appear here when the RPE catalogue is connected.</div>'}
function renderSaved(){const list=products.filter(p=>favorites.has(p.id));$("savedGrid").innerHTML=list.length?list.map(productCard).join(""):'<div class="empty" style="grid-column:1/-1"><b>No saved products yet</b>Tap ♡ on a product you want to remember.</div>'}
function renderRecent(){const map=new Map(products.map(p=>[p.id,p]));const list=recentIds.map(id=>map.get(id)).filter(Boolean);$("recentGrid").innerHTML=list.length?list.map(productCard).join(""):'<div class="empty" style="grid-column:1/-1"><b>Nothing viewed yet</b>Products you open will appear here automatically.</div>'}

document.addEventListener("click",async e=>{
  const add=e.target.closest("[data-add]"); if(add){e.stopPropagation();await addToCart(add.dataset.add);return}
  const fav=e.target.closest("[data-fav]"); if(fav){e.stopPropagation();await toggleFavorite(fav.dataset.fav);return}
  const open=e.target.closest("[data-open-product]"); if(open){await openProduct(open.dataset.openProduct);return}
});
$("searchBtn").onclick=searchProducts;$("productSearch").addEventListener("input",searchProducts);
function searchProducts(){
  const q=$("productSearch").value.trim().toLowerCase();
  if(!q)return renderProducts(products);
  renderProducts(products.filter(p=>[p.name,p.sku,p.legacy_id,p.brand,p.categories?.name,p.short_description].some(x=>String(x||"").toLowerCase().includes(q))));
}
async function toggleFavorite(id){
  if(favorites.has(id)){
    const {error}=await sb.from("favorites").delete().eq("user_id",user.id).eq("product_id",id);if(error)return showToast("Could not update saved products");
    favorites.delete(id);showToast("Removed from saved");
  }else{
    const {error}=await sb.from("favorites").insert({user_id:user.id,product_id:id});if(error)return showToast("Could not save product");
    favorites.add(id);showToast("Saved");
  }
  renderProducts(filteredProductsNow());renderHomeProducts();renderSaved();renderRecent();
}
function filteredProductsNow(){
  const q=$("productSearch").value.trim().toLowerCase();return q?products.filter(p=>[p.name,p.sku,p.legacy_id,p.brand,p.categories?.name,p.short_description].some(x=>String(x||"").toLowerCase().includes(q))):products
}
async function openProduct(id){
  const p=products.find(x=>x.id===id);if(!p)return;
  await sb.from("recently_viewed").upsert({user_id:user.id,product_id:id,viewed_at:new Date().toISOString()},{onConflict:"user_id,product_id"});
  recentIds=[id,...recentIds.filter(x=>x!==id)].slice(0,20);renderRecent();
  const specRows=Object.entries(p.specifications||{}).map(([k,v])=>`<div class="list-row"><div><b>${esc(prettyKey(k))}</b><small>${esc(typeof v==="boolean"?(v?"Yes":"No"):v)}</small></div></div>`).join("");
  const dimensions=p.dimensions?`<div class="list-row"><div><b>Dimensions</b><small>${esc(p.dimensions)}</small></div></div>`:"";
  const overlay=document.createElement("div");overlay.className="cart-drawer open";overlay.innerHTML=`<aside class="drawer"><div class="drawer-head"><h3>Product details</h3><button class="icon-btn" data-close-product>×</button></div><div class="drawer-list">
    ${imageFor(p)?'<img src="'+esc(imageFor(p))+'" style="width:100%;height:250px;object-fit:contain;background:#f5f7f6;border-radius:18px" alt="'+esc(p.name)+'">':""}
    <h2 style="font-family:Georgia,serif">${esc(p.name)}</h2><p style="font-size:12px;color:var(--muted)">${esc(p.description||p.short_description||"Contact RPE for full product information.")}</p>
    <div class="list-row"><div><b>Price</b><small>${esc(money(p.price,p.currency))}</small></div><span class="status-chip">${esc(p.stock_status==="confirm_on_enquiry"?"Confirm availability":statusLabel(p.stock_status))}</span></div>
    <div class="list-row"><div><b>Product ID</b><small>${esc(p.sku||p.legacy_id||p.id)}</small></div></div>
    ${dimensions}${specRows}
  </div><div class="drawer-foot"><button class="btn primary" data-modal-add="${p.id}">Add to cart</button><button class="btn soft" data-modal-fav="${p.id}">${favorites.has(p.id)?"Remove from saved":"Save product"}</button></div></aside>`;
  document.body.appendChild(overlay);
  const close=()=>overlay.remove();overlay.addEventListener("click",async e=>{
    if(e.target===overlay||e.target.closest("[data-close-product]"))close();
    if(e.target.closest("[data-modal-add]")){await addToCart(p.id);close()}
    if(e.target.closest("[data-modal-fav]")){await toggleFavorite(p.id);close()}
  });
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
  let res;
  if(existing)res=await sb.from("cart_items").update({quantity:Math.min(99,existing.quantity+1)}).eq("id",existing.id);
  else res=await sb.from("cart_items").insert({cart_id:cartId,product_id:productId,quantity:1});
  if(res.error)return showToast("Could not add product");
  await loadCartItems();renderCart();showToast("Added to cart");
}
async function changeQty(item,delta){
  const q=Math.max(1,Math.min(99,item.quantity+delta));const {error}=await sb.from("cart_items").update({quantity:q}).eq("id",item.id);
  if(error)return showToast("Could not update quantity");await loadCartItems();renderCart();
}
async function removeCart(item){const {error}=await sb.from("cart_items").delete().eq("id",item.id);if(error)return showToast("Could not remove product");await loadCartItems();renderCart()}
function renderCart(){
  const list=$("cartList");setBadge("cartCount",cartItems.length);setBadge("bottomCartCount",cartItems.length);
  if(!cartItems.length){list.innerHTML='<div class="empty"><b>Your cart is empty</b>Add products you want and they will appear here.</div>';return}
  list.innerHTML=cartItems.map(i=>{const p=i.products||{},img=imageFor(p);return `<div class="cart-item" data-cart="${i.id}">
    ${img?'<img src="'+esc(img)+'" alt="">':'<div style="width:58px;height:58px;background:#f5f7f6;border-radius:10px"></div>'}
    <div><b>${esc(p.name||"Product")}</b><small>${esc(money(p.price,p.currency))}</small><div class="qty"><button data-minus="${i.id}">−</button><span>${i.quantity}</span><button data-plus="${i.id}">+</button></div></div>
    <button class="remove" data-remove="${i.id}">Remove</button>
  </div>`}).join("");
  list.querySelectorAll("[data-minus]").forEach(b=>b.onclick=()=>changeQty(cartItems.find(x=>x.id===b.dataset.minus),-1));
  list.querySelectorAll("[data-plus]").forEach(b=>b.onclick=()=>changeQty(cartItems.find(x=>x.id===b.dataset.plus),1));
  list.querySelectorAll("[data-remove]").forEach(b=>b.onclick=()=>removeCart(cartItems.find(x=>x.id===b.dataset.remove)));
}
function openCart(){renderCart();$("cartDrawer").classList.add("open")}
function closeCart(){$("cartDrawer").classList.remove("open")}
$("sendOrder").onclick=async()=>{
  if(!cartItems.length)return showToast("Your cart is empty");
  $("sendOrder").disabled=true;$("sendOrder").textContent="Sending…";
  const defaultAddr=addresses.find(x=>x.is_default)||addresses[0]||null;
  const {data,error}=await sb.rpc("create_rpe_order_from_cart",{p_address_id:defaultAddr?.id||null,p_note:null});
  $("sendOrder").disabled=false;$("sendOrder").textContent="Send order request";
  if(error)return showToast(error.message||"Could not send order");
  closeCart();showToast("Order request sent");await Promise.all([loadCartItems(),loadOrdersOnly(),loadNotificationsOnly()]);renderCart();renderOrders();renderNotifications();renderCounts();showPanel("ordersPanel");
};

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
function openOrder(id){
  const o=orders.find(x=>x.id===id);if(!o)return;
  const overlay=document.createElement("div");overlay.className="cart-drawer open";overlay.innerHTML=`<aside class="drawer"><div class="drawer-head"><div><small style="color:var(--muted)">ORDER</small><h3>${esc(o.order_number)}</h3></div><button class="icon-btn" data-close-order>×</button></div><div class="drawer-list">
    <div class="list-row"><div><b>Current status</b><small>Updates automatically when RPE changes your order.</small></div><span class="status-chip">${esc(statusLabel(o.order_status))}</span></div>
    <h4>Products</h4>
    ${(o.order_items||[]).map(i=>'<div class="list-row"><div><b>'+esc(i.product_name_snapshot)+'</b><small>Quantity '+i.quantity+'</small></div><span class="status-chip">'+esc(i.unit_price==null?"Price to confirm":money(i.unit_price,o.currency))+'</span></div>').join("")}
    <div class="list-row"><div><b>Payment</b><small>${esc(statusLabel(o.payment_status))}</small></div></div>
  </div><div class="drawer-foot"><button class="btn primary" data-order-help>Contact RPE about this order</button></div></aside>`;
  document.body.appendChild(overlay);overlay.addEventListener("click",e=>{
    if(e.target===overlay||e.target.closest("[data-close-order]"))overlay.remove();
    if(e.target.closest("[data-order-help]"))window.open("https://wa.me/233542846895?text="+encodeURIComponent("Hello Ranova Prime Enterprise, I need help with order "+o.order_number+"."),"_blank","noopener");
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
  if(error)return showToast("Could not save details");profile=data;$("helloName").textContent=profile.first_name||"Customer";showToast("Details saved");
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
  realtimeChannels=[orderCh,notifCh,returnCh];
}
function cleanupRealtime(){realtimeChannels.forEach(ch=>sb.removeChannel(ch));realtimeChannels=[]}




async function loadToPayOrders(){
  const out=await messageApi({action:"buyer_payment_orders"});
  toPayOrders=out.orders||[];toPayStores=out.stores||[];toPayRecommendations=out.recommendations||[];
  renderToPayOrders($("toPaySearch")?.value||"");
}
function payStore(id){return toPayStores.find(s=>s.id===id)||null}
function payItemImage(item){return item?.image_url||""}
function renderToPayOrders(filter=""){
  const host=$("toPayOrders");if(!host)return;
  const q=String(filter||"").trim().toLowerCase();
  const rows=toPayOrders.filter(o=>{const s=payStore(o.store_id),items=Array.isArray(o.items)?o.items:[];return !q||[o.order_ref,s?.store_name,...items.flatMap(i=>[i.product_name,i.sku])].some(x=>String(x||"").toLowerCase().includes(q))});
  if(!rows.length){host.innerHTML='<div class="pay-empty"><b>No unpaid orders</b>Your orders that still need payment will appear here.</div>';return}
  host.innerHTML=rows.map(o=>{
    const store=payStore(o.store_id)||{},items=Array.isArray(o.items)?o.items:[],item=items[0]||{},currency=o.currency||"GHS";
    const subtotal=o.subtotal==null?items.reduce((a,i)=>a+Number(i.line_total||0),0):Number(o.subtotal||0),delivery=Number(o.delivery_fee||0),total=o.total==null?(subtotal||0)+delivery:Number(o.total||0);
    const recs=toPayRecommendations.filter(p=>p.store_id===o.store_id&&!items.some(i=>i.seller_product_id===p.id)).slice(0,4);
    return '<article class="pay-order" data-pay-order="'+esc(o.id)+'">'+
      '<div class="pay-store"><span class="pay-store-avatar">'+(store.logo_url?'<img src="'+esc(store.logo_url)+'" alt="">':'🏪')+'</span><b>'+esc(store.store_name||"RANOVA Store")+'</b><span class="pay-status">To Pay</span></div>'+
      (items.length?items.map(i=>'<div class="pay-item">'+(payItemImage(i)?'<img class="pay-item-img" src="'+esc(payItemImage(i))+'" alt="'+esc(i.product_name||"Product")+'">':'<div class="pay-item-img" style="display:grid;place-items:center;color:#999">Product</div>')+'<div class="pay-item-copy"><div class="pay-item-title">'+esc(i.product_name||"Product")+'</div><div class="pay-item-meta">'+esc(i.sku||i.unit_label||"")+'</div><div class="pay-price">'+esc(i.unit_price==null?"Price pending":money(i.unit_price,currency))+'</div><span class="pay-qty">×'+esc(i.quantity||1)+'</span><div class="pay-benefit">RANOVA protected marketplace order</div></div></div>').join(""):'<div class="pay-item"><div class="pay-item-img"></div><div class="pay-item-copy"><div class="pay-item-title">Marketplace order</div></div></div>')+
      '<div class="pay-total-row"><span>Delivery '+esc(money(delivery,currency))+'</span><span>Amount due</span><strong>'+esc(total?money(total,currency):"Awaiting quote")+'</strong></div>'+
      '<div class="pay-actions"><button type="button" data-pay-close="'+esc(o.id)+'">Close</button><button type="button" data-pay-address="'+esc(o.id)+'">Modify Address</button><button class="pay-now" type="button" data-pay-now="'+esc(o.id)+'">Pay Now</button></div>'+
      (recs.length?'<div class="pay-rec-head">More from '+esc(store.store_name||"this store")+'</div><div class="pay-recommend">'+recs.map(p=>'<button class="pay-product" type="button" data-pay-product="'+esc(p.id)+'">'+(p.primary_image_url?'<img src="'+esc(p.primary_image_url)+'" alt="'+esc(p.name)+'">':'<div style="aspect-ratio:1;background:#eee"></div>')+'<div class="pay-product-copy"><b>'+esc(p.name)+'</b><div class="price">'+esc(p.price==null?"Ask":money(p.price,p.currency||currency))+'</div><small>'+esc(p.moq?("MOQ "+p.moq+" "+(p.unit_label||"")):(p.category||"Store product"))+'</small></div></button>').join("")+'</div>':"")+
    '</article>';
  }).join("");
}
if($("toPayBack"))$("toPayBack").onclick=()=>showPanel("homePanel");
if($("toPaySearch"))$("toPaySearch").addEventListener("input",e=>renderToPayOrders(e.target.value));
document.addEventListener("click",async e=>{
  const close=e.target.closest("[data-pay-close]");if(close){const card=close.closest(".pay-order");if(card)card.style.display="none";return}
  const address=e.target.closest("[data-pay-address]");if(address){showPanel("addressPanel");return}
  const pay=e.target.closest("[data-pay-now]");if(pay){const order=toPayOrders.find(x=>x.id===pay.dataset.payNow);if(!order)return;showToast(order.total==null?"The seller must confirm the final amount before payment.":"Secure payment checkout is being connected for this order.");return}
  const product=e.target.closest("[data-pay-product]");if(product){const p=toPayRecommendations.find(x=>x.id===product.dataset.payProduct);if(!p)return;try{const out=await messageApi({action:"start",product_id:p.id,subject:p.name});showPanel("messagesPanel");await openMessageConversation(out.conversation.id)}catch(err){showToast(err.message||"Could not open product enquiry")}return}
});

// RANOVA in-app buyer messenger 2026-09-29
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
async function loadMessageConversations(){
  if(!user)return;
  const out=await messageApi({action:"list"});messageConversations=out.conversations||[];
  renderMessageList();
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
async function openMessageConversation(id){
  const out=await messageApi({action:"open",conversation_id:id});messageCurrent=out.conversation;messageRole=out.role;
  $("messagesPanel").classList.add("chat-open");
  const store=messageCurrent.store||{};$("messageChatTitle").textContent=store.store_name||"RANOVA Store";$("messageChatSub").textContent="Online store conversation";
  $("messageChatAvatar").innerHTML=store.logo_url?'<img src="'+esc(store.logo_url)+'" alt="" style="width:100%;height:100%;object-fit:cover">':animalAvatar(store.id||store.store_name);
  const p=messageCurrent.product,ctx=$("messageProductContext");
  if(p){ctx.classList.add("show");ctx.innerHTML=(p.primary_image_url?'<img src="'+esc(p.primary_image_url)+'" alt="'+esc(p.name)+'">':'<div style="width:48px;height:48px;border-radius:9px;background:#eee"></div>')+'<div><b>'+esc(p.name||"Product")+'</b><small>'+esc(p.price==null?"Ask for price":money(p.price,p.currency||"GHS"))+'</small></div><span class="ask-tag">Product enquiry</span>'}else{ctx.classList.remove("show");ctx.innerHTML=""}
  renderMessageThread();
  await loadMessageConversations();
  clearInterval(messagePoll);messagePoll=setInterval(()=>{if(messageCurrent&&$("messagesPanel").classList.contains("active"))refreshOpenMessage().catch(()=>{})},5000);
}
async function refreshOpenMessage(){if(!messageCurrent)return;const out=await messageApi({action:"open",conversation_id:messageCurrent.id});messageCurrent=out.conversation;messageRole=out.role;renderMessageThread()}
function renderMessageThread(){
  const host=$("messageThread");if(!host||!messageCurrent)return;
  let day="";
  host.innerHTML=(messageCurrent.messages||[]).map(m=>{const d=new Date(m.created_at),key=d.toDateString(),sep=key!==day?'<div class="msg-date">'+d.toLocaleDateString([],{year:"numeric",month:"long",day:"numeric"})+'</div>':"";day=key;const mine=m.sender_role===messageRole,cl=m.sender_role==="system"?"system":mine?"mine":"other",media=messageMedia(m),body=m.body?'<div>'+esc(m.body)+'</div>':"";return sep+'<div class="msg-bubble '+cl+'">'+media+body+'<time>'+d.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})+'</time></div>'}).join("")||'<div class="msg-list-empty">Start your conversation with this store.</div>';
  host.scrollTop=host.scrollHeight;
}
$("messageBack").onclick=()=>{$("messagesPanel").classList.remove("chat-open");messageCurrent=null;clearInterval(messagePoll);loadMessageConversations().catch(()=>{})};
$("messageStoreButton").onclick=()=>{if(messageCurrent?.store?.slug)location.href="../all/marketplace.html?store="+encodeURIComponent(messageCurrent.store.slug)};
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
function updateMsgAction(){const has=!!$("msgInput").value.trim()||!!msgAttachment;$("msgRecordStart").hidden=has;$("msgSend").hidden=!has}
function showMsgEmoji(group="Recent",filter=""){$("msgEmojiPanel").hidden=false;$("msgEmojiTabs").innerHTML=Object.keys(msgEmojiGroups).map(g=>'<button type="button" class="'+(g===group?'active':'')+'" data-msg-emoji-group="'+g+'">'+g+'</button>').join("");const src=filter?Object.values(msgEmojiGroups).join(" "):(msgEmojiGroups[group]||msgEmojiGroups.Recent);$("msgEmojiGrid").innerHTML=[...new Set(src.split(/\s+/))].filter(Boolean).map(e=>'<button type="button" data-msg-emoji="'+e+'">'+e+'</button>').join("");$("msgEmojiTabs").querySelectorAll("[data-msg-emoji-group]").forEach(b=>b.onclick=()=>showMsgEmoji(b.dataset.msgEmojiGroup));$("msgEmojiGrid").querySelectorAll("[data-msg-emoji]").forEach(b=>b.onclick=()=>{const i=$("msgInput"),at=i.selectionStart;i.setRangeText(b.dataset.msgEmoji,at,i.selectionEnd,"end");i.focus();updateMsgAction()})}
function previewMsgAttachment(file){msgAttachment=file;$("msgAttachmentPreview").hidden=false;$("msgAttachmentPreview").innerHTML='<span>'+esc(file.name)+' ('+Math.ceil(file.size/1024)+' KB)</span><button id="msgRemoveAttachment" type="button">×</button>';$("msgRemoveAttachment").onclick=()=>{msgAttachment=null;$("msgAttachmentPreview").hidden=true;updateMsgAction()};updateMsgAction()}
async function sendInAppMessage(fileOverride){
  if(!messageCurrent)return;const body=$("msgInput").value.trim(),file=fileOverride||msgAttachment;if(!body&&!file)return;
  $("msgSend").disabled=true;
  try{
    if(file){if(file.size>15*1024*1024)throw Error("The attachment must be under 15 MB.");const mime=file.type||"audio/webm",prep=await messageApi({action:"prepare_media",conversation_id:messageCurrent.id,mime_type:mime,file_size:file.size});const up=await sb.storage.from("buyer-seller-media").uploadToSignedUrl(prep.path,prep.token,file,{contentType:mime});if(up.error)throw up.error;await messageApi({action:"send_media",conversation_id:messageCurrent.id,body,storage_path:prep.path,media_type:prep.media_type,file_name:file.name,mime_type:mime});msgAttachment=null;$("msgAttachmentPreview").hidden=true}else await messageApi({action:"send",conversation_id:messageCurrent.id,body});
    $("msgInput").value="";updateMsgAction();await refreshOpenMessage();await loadMessageConversations();
  }catch(e){showToast(e.message||"Could not send message")}finally{$("msgSend").disabled=false}
}
function stopMsgRecording(){if(msgStream){msgStream.getTracks().forEach(t=>t.stop());msgStream=null}msgRecorder=null;$("msgRecording").hidden=true}
$("msgEmojiToggle").onclick=()=>{$("msgEmojiPanel").hidden?showMsgEmoji():$("msgEmojiPanel").hidden=true};$("msgEmojiSearch").oninput=e=>showMsgEmoji("Recent",e.target.value.trim());
$("msgFilePick").onclick=()=>$("msgFileInput").click();$("msgImagePick").onclick=()=>$("msgImageInput").click();["msgFileInput","msgImageInput"].forEach(id=>$(id).onchange=e=>{if(e.target.files?.[0])previewMsgAttachment(e.target.files[0])});
$("msgInput").oninput=updateMsgAction;$("msgInput").onkeydown=e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();sendInAppMessage()}};$("msgSend").onclick=()=>sendInAppMessage();
$("msgRecordStart").onclick=async()=>{try{if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder)throw Error("Voice recording is unavailable in this browser.");msgStream=await navigator.mediaDevices.getUserMedia({audio:true});const mime=["audio/webm;codecs=opus","audio/mp4","audio/webm"].find(x=>MediaRecorder.isTypeSupported(x))||"";msgRecorder=new MediaRecorder(msgStream,mime?{mimeType:mime}:undefined);msgChunks=[];msgStarted=Date.now();msgPaused=0;msgPauseStarted=0;msgRecorder.ondataavailable=e=>{if(e.data.size)msgChunks.push(e.data)};msgRecorder.onstop=()=>{const type=msgRecorder?.mimeType?.split(";")[0]||"audio/webm",blob=new Blob(msgChunks,{type});stopMsgRecording();if(blob.size)sendInAppMessage(new File([blob],"Voice note."+({"audio/mp4":"m4a","audio/ogg":"ogg"}[type]||"webm"),{type}))};msgRecorder.start();$("msgRecording").hidden=false;$("msgRecordTime").textContent="0:00";msgTimer=setInterval(()=>{const ms=(msgPauseStarted||Date.now())-msgStarted-msgPaused,sec=Math.floor(ms/1000);$("msgRecordTime").textContent=Math.floor(sec/60)+":"+String(sec%60).padStart(2,"0")},500)}catch(e){stopMsgRecording();showToast(e.message||"Microphone access was denied.")}};
$("msgRecordPause").onclick=()=>{if(!msgRecorder)return;const b=$("msgRecordPause");if(msgRecorder.state==="recording"){msgRecorder.pause();msgPauseStarted=Date.now();b.textContent="▶ Resume"}else if(msgRecorder.state==="paused"){msgRecorder.resume();msgPaused+=Date.now()-msgPauseStarted;msgPauseStarted=0;b.textContent="⏸ Pause"}};
$("msgRecordDelete").onclick=()=>{if(msgRecorder){msgRecorder.onstop=null;if(msgRecorder.state!=="inactive")msgRecorder.stop()}clearInterval(msgTimer);stopMsgRecording()};$("msgRecordSend").onclick=()=>{if(msgRecorder&&msgRecorder.state!=="inactive"){clearInterval(msgTimer);msgRecorder.stop()}};
updateMsgAction();

boot();
})();