(() => {
"use strict";
const cfg=window.RPE_CONFIG||{},loading=document.getElementById("loading"),auth=document.getElementById("auth"),denied=document.getElementById("denied"),app=document.getElementById("app");
if(!cfg.supabaseUrl||!cfg.supabasePublishableKey||!window.supabase){loading.textContent="Admin backend is not connected.";return}
const sb=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey);
let user=null,role=null,orders=[],products=[],categories=[];
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const slug=s=>String(s||"").toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const label=s=>({quote_pending:"Quote pending",awaiting_confirmation:"Awaiting confirmation",awaiting_payment:"Awaiting payment",payment_confirmed:"Payment confirmed",preparing:"Preparing",ready_for_dispatch:"Ready for dispatch",dispatched:"Dispatched",out_for_delivery:"Out for delivery",delivered:"Delivered",cancelled:"Cancelled",return_requested:"Return requested",returned:"Returned",refund_pending:"Refund pending",refunded:"Refunded",confirm_on_enquiry:"Confirm on enquiry",in_stock:"In stock",low_stock:"Low stock",out_of_stock:"Out of stock",preorder:"Pre-order"})[s]||String(s||"").replaceAll("_"," ");
function show(id){document.querySelectorAll(".panel").forEach(x=>x.classList.remove("active"));$(id).classList.add("active");document.querySelectorAll("[data-panel]").forEach(b=>b.classList.toggle("active",b.dataset.panel===id))}
document.addEventListener("click",e=>{const b=e.target.closest("[data-panel]");if(b)show(b.dataset.panel)});
$("login").onclick=async()=>{const {error}=await sb.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});if(error){$("authMsg").textContent=error.message;$("authMsg").classList.remove("hide")}};
$("signOut").onclick=$("deniedSignOut").onclick=()=>sb.auth.signOut();
$("refreshOrders").onclick=async()=>{await loadOrders();renderOrders();renderToday()};
async function checkSession(session){
  user=session?.user||null;
  if(!user){loading.classList.add("hide");app.classList.add("hide");denied.classList.add("hide");auth.classList.remove("hide");return}
  auth.classList.add("hide");loading.classList.remove("hide");loading.textContent="Checking admin access…";
  const {data,error}=await sb.from("admin_users").select("role").eq("user_id",user.id).maybeSingle();
  if(error||!data){loading.classList.add("hide");denied.classList.remove("hide");app.classList.add("hide");return}
  role=data.role;denied.classList.add("hide");await loadAll();loading.classList.add("hide");app.classList.remove("hide");
}
async function loadAll(){await Promise.all([loadOrders(),loadProducts(),loadCategories()]);renderToday();renderOrders();renderProducts();renderStock();renderCategoryOptions()}
async function loadOrders(){const {data,error}=await sb.from("orders").select("*,order_items(*)").order("created_at",{ascending:false}).limit(200);if(error)throw error;orders=data||[]}
async function loadProducts(){const {data,error}=await sb.from("products").select("id,name,sku,brand,price,currency,stock_quantity,stock_status,active,category_id,categories(name)").order("created_at",{ascending:false}).limit(500);if(error)throw error;products=data||[]}
async function loadCategories(){const {data,error}=await sb.from("categories").select("*").order("display_order").order("name");if(error)throw error;categories=data||[]}
function renderToday(){
  $("mNew").textContent=orders.filter(o=>["quote_pending","awaiting_confirmation"].includes(o.order_status)).length;
  $("mPrep").textContent=orders.filter(o=>["payment_confirmed","preparing"].includes(o.order_status)).length;
  $("mDispatch").textContent=orders.filter(o=>o.order_status==="ready_for_dispatch").length;
  $("mProducts").textContent=products.length;
  const attention=orders.filter(o=>["quote_pending","awaiting_confirmation","payment_confirmed","preparing","ready_for_dispatch"].includes(o.order_status)).slice(0,8);
  $("attention").innerHTML=attention.length?attention.map(orderRow).join(""):'<div class="empty">Nothing urgent right now.</div>';wireOrderRows($("attention"));
}
function orderRow(o){return `<div class="row" data-order="${o.id}"><div><b>${esc(o.order_number)}</b><small>${o.order_items?.length||0} item(s) • ${new Date(o.created_at).toLocaleString()}</small></div><span class="chip">${esc(label(o.order_status))}</span><div><small>Payment</small><b>${esc(label(o.payment_status))}</b></div><div class="actions"><select data-status><option value="">Change status…</option>${["awaiting_confirmation","awaiting_payment","payment_confirmed","preparing","ready_for_dispatch","dispatched","out_for_delivery","delivered","cancelled"].map(s=>'<option value="'+s+'">'+label(s)+'</option>').join("")}</select></div></div>`}
function renderOrders(){$("ordersList").innerHTML=orders.length?orders.map(orderRow).join(""):'<div class="empty">No orders yet.</div>';wireOrderRows($("ordersList"))}
function wireOrderRows(root){root.querySelectorAll("[data-order]").forEach(row=>{const select=row.querySelector("[data-status]");if(select)select.onchange=async()=>{if(!select.value)return;const id=row.dataset.order;select.disabled=true;const {error}=await sb.from("orders").update({order_status:select.value}).eq("id",id);select.disabled=false;if(error)return alert(error.message);await sb.from("admin_activity").insert({admin_user_id:user.id,action:"order_status_changed",entity_type:"order",entity_id:id,metadata:{new_status:select.value}});await loadOrders();renderOrders();renderToday()}})}
function renderProducts(){
  $("productsList").innerHTML=products.length?products.map(p=>`<div class="row"><div><b>${esc(p.name)}</b><small>${esc(p.sku||"No SKU")} • ${esc(p.categories?.name||"Uncategorised")}</small></div><span class="chip">${esc(label(p.stock_status))}</span><div><small>Price</small><b>${p.price==null?"Unconfirmed":"GHS "+Number(p.price).toFixed(2)}</b></div><div class="actions"><button data-toggle-product="${p.id}" class="primary">${p.active?"Hide":"Show"}</button></div></div>`).join(""):'<div class="empty">No products in the new database yet.</div>';
  $("productsList").querySelectorAll("[data-toggle-product]").forEach(b=>b.onclick=async()=>{const p=products.find(x=>x.id===b.dataset.toggleProduct);const {error}=await sb.from("products").update({active:!p.active}).eq("id",p.id);if(error)return alert(error.message);await loadProducts();renderProducts();renderStock();renderToday()})
}
function renderStock(){$("stockList").innerHTML=products.length?products.map(p=>`<div class="row"><div><b>${esc(p.name)}</b><small>${esc(p.sku||"No SKU")}</small></div><span class="chip">${esc(label(p.stock_status))}</span><div><small>Quantity</small><b>${p.stock_quantity==null?"Not set":p.stock_quantity}</b></div><div></div></div>`).join(""):'<div class="empty">Stock will appear when products are added.</div>'}
function renderCategoryOptions(){$("pCategory").innerHTML='<option value="">No category</option>'+categories.filter(c=>c.active).map(c=>'<option value="'+c.id+'">'+esc(c.name)+'</option>').join("")}
$("addProduct").onclick=async()=>{
  const name=$("pName").value.trim();if(!name)return alert("Enter a product name.");
  const payload={name,slug:slug(name)+"-"+Date.now().toString(36),sku:$("pSku").value.trim()||null,brand:$("pBrand").value.trim()||null,category_id:$("pCategory").value||null,price:$("pPrice").value===""?null:Number($("pPrice").value),stock_status:$("pStock").value,short_description:$("pDesc").value.trim()||null,active:true};
  const {data,error}=await sb.from("products").insert(payload).select("id").single();if(error)return alert(error.message);
  await sb.from("admin_activity").insert({admin_user_id:user.id,action:"product_created",entity_type:"product",entity_id:data.id,metadata:{name}});
  ["pName","pSku","pBrand","pPrice","pDesc"].forEach(id=>$(id).value="");$("pStock").value="confirm_on_enquiry";$("pCategory").value="";
  await loadProducts();renderProducts();renderStock();renderToday();
};
(async()=>{const {data:{session}}=await sb.auth.getSession();await checkSession(session);sb.auth.onAuthStateChange((_e,s)=>setTimeout(()=>checkSession(s),0))})();
})();