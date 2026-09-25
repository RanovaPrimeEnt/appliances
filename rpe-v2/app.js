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
let orderFilter = null;
let signUpMode = false;
let realtimeChannels = [];

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
function setBadge(id,n){const el=$(id);if(!el)return;el.textContent=n;el.classList.toggle("hide",!n)}
function contactRpe(){window.open("https://wa.me/233542846895?text="+encodeURIComponent("Hello Ranova Prime Enterprise, I need some help with my order or shopping."),"_blank","noopener")}

function showPanel(id){
  document.querySelectorAll(".panel").forEach(x=>x.classList.remove("active"));
  $(id)?.classList.add("active");
  document.querySelectorAll(".bottom button[data-panel]").forEach(b=>b.classList.toggle("active",b.dataset.panel===id));
  if(id==="notifPanel") markNotificationsRead();
  if(id==="ordersPanel") renderOrders();
  window.scrollTo({top:0,behavior:"smooth"});
}
document.addEventListener("click",e=>{
  const b=e.target.closest("[data-panel]");
  if(b){orderFilter=null;showPanel(b.dataset.panel)}
  const s=e.target.closest("[data-order-filter]");
  if(s){orderFilter=s.dataset.orderFilter;showPanel("ordersPanel")}
});
$("contactShortcut").onclick=contactRpe;
$("helpContact").onclick=contactRpe;
$("notifBtn").onclick=()=>showPanel("notifPanel");
$("cartBtn").onclick=openCart;
$("bottomCart").onclick=openCart;
$("openCartShortcut").onclick=openCart;
$("closeCart").onclick=closeCart;
$("cartDrawer").addEventListener("click",e=>{if(e.target===$("cartDrawer"))closeCart()});
document.addEventListener("keydown",e=>{if(e.key==="Escape")closeCart()});

function authUI(){
  $("authTitle").textContent=signUpMode?"Create your RPE account":"Welcome back";
  $("authText").textContent=signUpMode?"One simple account keeps your saved items, cart and orders together.":"Sign in to see your saved products, cart and live order updates.";
  $("nameFields").classList.toggle("hide",!signUpMode);
  $("authSubmit").textContent=signUpMode?"Create account":"Sign in";
  $("authSwitch").textContent=signUpMode?"I already have an account":"Create an account";
  $("password").autocomplete=signUpMode?"new-password":"current-password";
}
$("authSwitch").onclick=()=>{signUpMode=!signUpMode;$("authMsg").textContent="";authUI()};
$("authSubmit").onclick=async()=>{
  const email=$("email").value.trim(),password=$("password").value;
  $("authMsg").textContent="Working…";
  try{
    let error;
    if(signUpMode){
      const first=$("firstName").value.trim(),last=$("lastName").value.trim();
      ({error}=await sb.auth.signUp({email,password,options:{data:{first_name:first,last_name:last}}}));
      if(!error)$("authMsg").textContent="Account created. Check your email if confirmation is required, then sign in.";
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
    sb.from("products").select("id,legacy_id,sku,name,slug,brand,short_description,description,price,currency,stock_status,category_id,product_images(image_url,is_primary,sort_order),categories(name)").eq("active",true).order("created_at",{ascending:false}),
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
  $("helloName").textContent=profile?.first_name||fallback;
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
  const overlay=document.createElement("div");overlay.className="cart-drawer open";overlay.innerHTML=`<aside class="drawer"><div class="drawer-head"><h3>Product details</h3><button class="icon-btn" data-close-product>×</button></div><div class="drawer-list">
    ${imageFor(p)?'<img src="'+esc(imageFor(p))+'" style="width:100%;height:250px;object-fit:contain;background:#f5f7f6;border-radius:18px" alt="'+esc(p.name)+'">':""}
    <h2 style="font-family:Georgia,serif">${esc(p.name)}</h2><p style="font-size:12px;color:var(--muted)">${esc(p.description||p.short_description||"Contact RPE for full product information.")}</p>
    <div class="list-row"><div><b>Price</b><small>${esc(money(p.price,p.currency))}</small></div><span class="status-chip">${esc(p.stock_status==="confirm_on_enquiry"?"Confirm availability":statusLabel(p.stock_status))}</span></div>
    <div class="list-row"><div><b>Product ID</b><small>${esc(p.sku||p.legacy_id||p.id)}</small></div></div>
  </div><div class="drawer-foot"><button class="btn primary" data-modal-add="${p.id}">Add to cart</button><button class="btn soft" data-modal-fav="${p.id}">${favorites.has(p.id)?"Remove from saved":"Save product"}</button></div></aside>`;
  document.body.appendChild(overlay);
  const close=()=>overlay.remove();overlay.addEventListener("click",async e=>{
    if(e.target===overlay||e.target.closest("[data-close-product]"))close();
    if(e.target.closest("[data-modal-add]")){await addToCart(p.id);close()}
    if(e.target.closest("[data-modal-fav]")){await toggleFavorite(p.id);close()}
  });
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
  setBadge("payN",orders.filter(o=>o.order_status==="awaiting_payment").length);
  setBadge("prepN",orders.filter(o=>["payment_confirmed","preparing"].includes(o.order_status)).length);
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

boot();
})();