(() => {
"use strict";
const cfg=window.RPE_CONFIG||{},loading=document.getElementById("loading"),auth=document.getElementById("auth"),denied=document.getElementById("denied"),app=document.getElementById("app");
if(!cfg.supabaseUrl||!cfg.supabasePublishableKey||!window.supabase){loading.textContent="Admin backend is not connected.";return}
const sb=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey);
const marketEndpoint=cfg.supabaseUrl+"/functions/v1/ranova-admin-marketplace";
let session=null,user=null,role=null,orders=[],products=[],categories=[];
let market={applications:[],files:[],stores:[],products:[],counts:{}},marketError=null,selectedApplicationRef=null;

const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
const slug=s=>String(s||"").toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"");
const pretty=s=>String(s||"").replaceAll("_"," ").replace(/\b\w/g,m=>m.toUpperCase());
const label=s=>({
  quote_pending:"Quote pending",awaiting_confirmation:"Awaiting confirmation",awaiting_payment:"Awaiting payment",
  payment_confirmed:"Payment confirmed",preparing:"Preparing",ready_for_dispatch:"Ready for dispatch",
  dispatched:"Dispatched",out_for_delivery:"Out for delivery",delivered:"Delivered",cancelled:"Cancelled",
  return_requested:"Return requested",returned:"Returned",refund_pending:"Refund pending",refunded:"Refunded",
  confirm_on_enquiry:"Confirm on enquiry",in_stock:"In stock",low_stock:"Low stock",out_of_stock:"Out of stock",
  preorder:"Pre-order",pending_review:"Pending review",needs_information:"Needs information",under_review:"Under review",
  not_started:"Not started",submitted:"Submitted",approved:"Approved",rejected:"Rejected",suspended:"Suspended",
  paused:"Paused",active:"Active",draft:"Draft",complete:"Complete",verified:"Verified"
})[s]||pretty(s);
const canSellerReview=()=>role==="owner"||role==="manager";
const canProductReview=()=>role==="owner"||role==="manager"||role==="catalogue";
const marketEmpty=()=>({applications:[],files:[],stores:[],products:[],counts:{}});

function statusClass(v){return "status-"+String(v||"").toLowerCase().replace(/[^a-z0-9_]+/g,"_")}
function show(id){
  document.querySelectorAll(".panel").forEach(x=>x.classList.remove("active"));
  const p=$(id);if(p)p.classList.add("active");
  document.querySelectorAll("[data-panel]").forEach(b=>b.classList.toggle("active",b.dataset.panel===id));
}
document.addEventListener("click",e=>{const b=e.target.closest("[data-panel]");if(b&&!b.classList.contains("hide"))show(b.dataset.panel)});

$("login").onclick=async()=>{
  const {error}=await sb.auth.signInWithPassword({email:$("email").value.trim(),password:$("password").value});
  if(error){$("authMsg").textContent=error.message;$("authMsg").classList.remove("hide")}
};
$("signOut").onclick=$("deniedSignOut").onclick=()=>sb.auth.signOut();
$("refreshOrders").onclick=async()=>{await loadOrders();renderOrders();renderToday()};

async function checkSession(nextSession){
  session=nextSession||null;user=session?.user||null;
  if(!user){
    loading.classList.add("hide");app.classList.add("hide");denied.classList.add("hide");auth.classList.remove("hide");return;
  }
  auth.classList.add("hide");loading.classList.remove("hide");loading.textContent="Checking admin access…";
  const {data,error}=await sb.from("admin_users").select("role").eq("user_id",user.id).maybeSingle();
  if(error||!data){
    loading.classList.add("hide");denied.classList.remove("hide");app.classList.add("hide");return;
  }
  role=data.role;denied.classList.add("hide");
  renderRoleNav();
  try{await loadAll()}catch(err){console.error(err)}
  loading.classList.add("hide");app.classList.remove("hide");
}
function renderRoleNav(){
  document.querySelectorAll('[data-market-role="seller"]').forEach(x=>x.classList.toggle("hide",!canSellerReview()));
  document.querySelectorAll('[data-market-role="product"]').forEach(x=>x.classList.toggle("hide",!canProductReview()));
}

async function loadAll(){
  await Promise.all([
    loadOrders(),
    loadProducts(),
    loadCategories(),
    loadMarketplace().catch(err=>{marketError=err;market=marketEmpty();console.error(err)})
  ]);
  renderToday();renderOrders();renderProducts();renderStock();renderCategoryOptions();renderMarketplaceAll();
}
async function loadOrders(){
  const {data,error}=await sb.from("orders").select("*,order_items(*)").order("created_at",{ascending:false}).limit(200);
  if(error)throw error;orders=data||[];
}
async function loadProducts(){
  const {data,error}=await sb.from("products").select("id,name,sku,brand,price,currency,stock_quantity,stock_status,active,category_id,categories(name)").order("created_at",{ascending:false}).limit(500);
  if(error)throw error;products=data||[];
}
async function loadCategories(){
  const {data,error}=await sb.from("categories").select("*").order("display_order").order("name");
  if(error)throw error;categories=data||[];
}
async function marketApi(payload){
  if(!session?.access_token)throw new Error("Admin session expired.");
  const res=await fetch(marketEndpoint,{
    method:"POST",
    headers:{
      "Content-Type":"application/json",
      "Authorization":"Bearer "+session.access_token,
      "apikey":cfg.supabasePublishableKey,
      "x-ranova-client":"ranova-site-v1"
    },
    body:JSON.stringify(payload||{})
  });
  const out=await res.json().catch(()=>({}));
  if(!res.ok||!out.ok)throw new Error(out.error||"Marketplace moderation request failed.");
  return out;
}
async function loadMarketplace(){
  marketError=null;
  if(!canSellerReview()&&!canProductReview()){market=marketEmpty();return}
  market=await marketApi({action:"dashboard"});
}
async function reloadMarketplace(){
  await loadMarketplace();
  renderMarketplaceAll();
}

function renderToday(){
  $("mNew").textContent=orders.filter(o=>["quote_pending","awaiting_confirmation"].includes(o.order_status)).length;
  $("mPrep").textContent=orders.filter(o=>["payment_confirmed","preparing"].includes(o.order_status)).length;
  $("mDispatch").textContent=orders.filter(o=>o.order_status==="ready_for_dispatch").length;
  $("mProducts").textContent=products.length;
  const attention=orders.filter(o=>["quote_pending","awaiting_confirmation","payment_confirmed","preparing","ready_for_dispatch"].includes(o.order_status)).slice(0,8);
  $("attention").innerHTML=attention.length?attention.map(orderRow).join(""):'<div class="empty">Nothing urgent right now.</div>';
  wireOrderRows($("attention"));
  renderMarketplaceSummary();
}
function orderRow(o){
  return `<div class="row" data-order="${o.id}"><div><b>${esc(o.order_number)}</b><small>${o.order_items?.length||0} item(s) • ${new Date(o.created_at).toLocaleString()}</small></div><span class="chip">${esc(label(o.order_status))}</span><div><small>Payment</small><b>${esc(label(o.payment_status))}</b></div><div class="actions"><select data-status><option value="">Change status…</option>${["awaiting_confirmation","awaiting_payment","payment_confirmed","preparing","ready_for_dispatch","dispatched","out_for_delivery","delivered","cancelled"].map(s=>'<option value="'+s+'">'+label(s)+'</option>').join("")}</select></div></div>`;
}
function renderOrders(){
  $("ordersList").innerHTML=orders.length?orders.map(orderRow).join(""):'<div class="empty">No orders yet.</div>';
  wireOrderRows($("ordersList"));
}
function wireOrderRows(root){
  root.querySelectorAll("[data-order]").forEach(row=>{
    const select=row.querySelector("[data-status]");
    if(select)select.onchange=async()=>{
      if(!select.value)return;
      const id=row.dataset.order;select.disabled=true;
      const {error}=await sb.from("orders").update({order_status:select.value}).eq("id",id);
      select.disabled=false;if(error)return alert(error.message);
      await sb.from("admin_activity").insert({admin_user_id:user.id,action:"order_status_changed",entity_type:"order",entity_id:id,metadata:{new_status:select.value}});
      await loadOrders();renderOrders();renderToday();
    };
  });
}
function renderProducts(){
  $("productsList").innerHTML=products.length?products.map(p=>`<div class="row"><div><b>${esc(p.name)}</b><small>${esc(p.sku||"No SKU")} • ${esc(p.categories?.name||"Uncategorised")}</small></div><span class="chip">${esc(label(p.stock_status))}</span><div><small>Price</small><b>${p.price==null?"Unconfirmed":"GHS "+Number(p.price).toFixed(2)}</b></div><div class="actions"><button data-toggle-product="${p.id}" class="primary">${p.active?"Hide":"Show"}</button></div></div>`).join(""):'<div class="empty">No products in the new database yet.</div>';
  $("productsList").querySelectorAll("[data-toggle-product]").forEach(b=>b.onclick=async()=>{
    const p=products.find(x=>x.id===b.dataset.toggleProduct);
    const {error}=await sb.from("products").update({active:!p.active}).eq("id",p.id);
    if(error)return alert(error.message);
    await loadProducts();renderProducts();renderStock();renderToday();
  });
}
function renderStock(){
  $("stockList").innerHTML=products.length?products.map(p=>`<div class="row"><div><b>${esc(p.name)}</b><small>${esc(p.sku||"No SKU")}</small></div><span class="chip">${esc(label(p.stock_status))}</span><div><small>Quantity</small><b>${p.stock_quantity==null?"Not set":p.stock_quantity}</b></div><div></div></div>`).join(""):'<div class="empty">Stock will appear when products are added.</div>';
}
function renderCategoryOptions(){
  $("pCategory").innerHTML='<option value="">No category</option>'+categories.filter(c=>c.active).map(c=>'<option value="'+c.id+'">'+esc(c.name)+'</option>').join("");
}
$("addProduct").onclick=async()=>{
  const name=$("pName").value.trim();if(!name)return alert("Enter a product name.");
  const payload={name,slug:slug(name)+"-"+Date.now().toString(36),sku:$("pSku").value.trim()||null,brand:$("pBrand").value.trim()||null,category_id:$("pCategory").value||null,price:$("pPrice").value===""?null:Number($("pPrice").value),stock_status:$("pStock").value,short_description:$("pDesc").value.trim()||null,active:true};
  const {data,error}=await sb.from("products").insert(payload).select("id").single();if(error)return alert(error.message);
  await sb.from("admin_activity").insert({admin_user_id:user.id,action:"product_created",entity_type:"product",entity_id:data.id,metadata:{name}});
  ["pName","pSku","pBrand","pPrice","pDesc"].forEach(id=>$(id).value="");$("pStock").value="confirm_on_enquiry";$("pCategory").value="";
  await loadProducts();renderProducts();renderStock();renderToday();
};

function renderMarketplaceAll(){
  renderMarketplaceSummary();
  renderSellerApplications();
  renderSellerProducts();
  renderSellerStores();
  if(selectedApplicationRef)renderSellerDetail(selectedApplicationRef);
}
function renderMarketplaceSummary(){
  const box=$("marketplaceSummary");
  if(!box)return;
  const allowed=canSellerReview()||canProductReview();
  box.classList.toggle("hide",!allowed);
  if(!allowed)return;
  const c=market.counts||{};
  $("mSellerPending").textContent=canSellerReview()?(c.seller_pending||0):"—";
  $("mDocsPending").textContent=canSellerReview()?(c.documents_pending||0):"—";
  $("mSellerProductsPending").textContent=canProductReview()?(c.products_pending||0):"—";
}
function appStatus(a){return String(a.verification_status||a.status||"submitted").toLowerCase()}
function filesFor(ref){return (market.files||[]).filter(f=>f.application_ref===ref)}
function storeForRef(ref){return (market.stores||[]).find(s=>s.application_ref===ref)}
function renderSellerApplications(){
  const host=$("sellerApplicationsList");if(!host)return;
  if(!canSellerReview()){host.innerHTML='<div class="empty">Your admin role does not include seller verification.</div>';return}
  if(marketError){host.innerHTML='<div class="empty">Marketplace moderation could not load. Refresh and try again.</div>';return}
  const apps=market.applications||[];
  host.innerHTML=apps.length?apps.map(a=>{
    const st=appStatus(a),fc=filesFor(a.application_ref).length,store=storeForRef(a.application_ref);
    return `<div class="market-row"><div><b>${esc(a.business_name)}</b><small>${esc(a.application_ref)} • ${esc(a.supplier_type||"Seller")} • ${esc(a.business_location||"Location not provided")}</small></div><span class="chip ${statusClass(st)}">${esc(label(st))}</span><div><small>Verification files</small><b>${fc}</b><small>${a.linked_user_id?"Seller account linked":"Not linked yet"}${store?" • Store created":""}</small></div><div class="actions"><button class="primary" data-review-seller="${esc(a.application_ref)}">Review</button></div></div>`;
  }).join(""):'<div class="empty">No seller applications yet.</div>';
  host.querySelectorAll("[data-review-seller]").forEach(b=>b.onclick=()=>{selectedApplicationRef=b.dataset.reviewSeller;renderSellerDetail(selectedApplicationRef);$("sellerReviewDetail").scrollIntoView({behavior:"smooth",block:"start"})});
}
function stageOptions(current){
  const values=["not_started","in_progress","under_review","needs_information","complete","approved","verified","rejected"];
  return values.map(v=>'<option value="'+v+'"'+(v===current?' selected':'')+'>'+esc(label(v))+'</option>').join("");
}
function renderSellerDetail(ref){
  const host=$("sellerReviewDetail");if(!host||!canSellerReview())return;
  const a=(market.applications||[]).find(x=>x.application_ref===ref);
  if(!a){host.classList.add("hide");selectedApplicationRef=null;return}
  const docs=filesFor(ref),st=appStatus(a),store=storeForRef(ref);
  const stages=[
    ["Business information","business_info_status",a.business_info_status],
    ["Business documents","business_documents_status",a.business_documents_status],
    ["Identity verification","identity_status",a.identity_status],
    ["Fulfilment readiness","fulfilment_status",a.fulfilment_status]
  ];
  host.classList.remove("hide");
  host.innerHTML=`
    <div class="review-head"><div><h2>${esc(a.business_name)}</h2><p>${esc(a.application_ref)} • ${esc(a.supplier_type||"Seller")} • Submitted ${new Date(a.created_at).toLocaleDateString()}</p></div><span class="chip ${statusClass(st)}">${esc(label(st))}</span></div>
    <div class="review-body">
      <div class="review-meta">
        <div><span>Contact person</span><b>${esc(a.contact_person||"—")}</b><span>${esc(a.phone||"")}${a.email?" • "+esc(a.email):""}</span></div>
        <div><span>Business location</span><b>${esc(a.business_location||"—")}</b><span>${esc(a.categories||"Categories not provided")}</span></div>
        <div><span>Business registration</span><b>${a.has_business_registration?"Declared registered":"Not declared registered"}</b><span>${esc(a.registration_number||"No registration number supplied")}</span></div>
      </div>
      <div class="review-meta">
        <div><span>Years in business</span><b>${a.years_in_business==null?"—":esc(a.years_in_business)}</b></div>
        <div><span>Preferred fulfilment</span><b>${esc(a.preferred_fulfilment||"—")}</b></div>
        <div><span>Seller account</span><b>${a.linked_user_id?"Linked":"Not linked"}</b><span>${store?esc(store.store_name+" • "+label(store.store_status)):"No store created yet"}</span></div>
      </div>
      <div class="card" style="box-shadow:none;margin-top:0"><div class="card-head"><h2>Verification stages</h2></div><div class="body"><div class="stage-grid">${stages.map(x=>`<div class="stage-card"><b>${esc(x[0])}</b><small>Current: ${esc(label(x[2]))}</small><select data-stage-select="${x[1]}">${stageOptions(String(x[2]||"not_started"))}</select><button data-apply-stage="${x[1]}">Apply stage status</button></div>`).join("")}</div></div></div>
      <div class="card" style="box-shadow:none"><div class="card-head"><h2>Verification documents</h2></div><div class="body"><div class="docs">${docs.length?docs.map(f=>`<div class="doc-row"><div><b>${esc(label(f.document_type))}</b><small>${esc(f.original_filename||"Document")} • ${esc(label(f.review_status))}${f.review_note?" • "+esc(f.review_note):""}</small></div><div class="actions"><button data-doc-view="${f.id}">Secure view</button><button data-doc-action="approved" data-doc-id="${f.id}" class="primary">Approve</button><button data-doc-action="needs_information" data-doc-id="${f.id}">Needs info</button><button data-doc-action="rejected" data-doc-id="${f.id}">Reject</button></div></div>`).join(""):'<div class="empty">No verification documents submitted yet.</div>'}</div></div></div>
      <div class="card" style="box-shadow:none"><div class="card-head"><h2>Overall seller decision</h2></div><div class="body"><textarea id="sellerDecisionNote" class="review-note" placeholder="Review note for the seller. Required for rejection, suspension or requests for more information.">${esc(a.verification_notes||"")}</textarea><div class="decision-actions"><button data-seller-decision="under_review">Mark under review</button><button data-seller-decision="needs_information" class="warn">Request more information</button><button data-seller-decision="approved" class="approve">Approve seller</button><button data-seller-decision="rejected" class="danger">Reject seller</button>${st==="approved"?'<button data-seller-decision="suspended" class="danger">Suspend seller</button>':""}</div></div></div>
    </div>`;
  wireSellerDetail(host,a);
}
function wireSellerDetail(host,a){
  host.querySelectorAll("[data-apply-stage]").forEach(b=>b.onclick=async()=>{
    const stage=b.dataset.applyStage,select=host.querySelector('[data-stage-select="'+stage+'"]');
    if(!select)return;
    b.disabled=true;
    try{
      await marketApi({action:"set_seller_stage",application_ref:a.application_ref,stage,status:select.value,note:$("sellerDecisionNote")?.value||""});
      await reloadMarketplace();selectedApplicationRef=a.application_ref;renderSellerDetail(a.application_ref);
    }catch(err){alert(err.message)}finally{b.disabled=false}
  });
  host.querySelectorAll("[data-doc-view]").forEach(b=>b.onclick=async()=>{
    const win=window.open("about:blank","_blank");
    try{
      const out=await marketApi({action:"document_url",id:b.dataset.docView});
      if(win)win.location.href=out.url;else location.href=out.url;
    }catch(err){if(win)win.close();alert(err.message)}
  });
  host.querySelectorAll("[data-doc-action]").forEach(b=>b.onclick=async()=>{
    const status=b.dataset.docAction;
    let note="";
    if(status!=="approved"){note=prompt(status==="rejected"?"Why is this document rejected?":"What information is needed?","")||"";if(!note)return}
    b.disabled=true;
    try{
      await marketApi({action:"review_document",id:b.dataset.docId,status,note});
      await reloadMarketplace();selectedApplicationRef=a.application_ref;renderSellerDetail(a.application_ref);
    }catch(err){alert(err.message)}finally{b.disabled=false}
  });
  host.querySelectorAll("[data-seller-decision]").forEach(b=>b.onclick=async()=>{
    const decision=b.dataset.sellerDecision,note=$("sellerDecisionNote")?.value.trim()||"";
    if(["rejected","needs_information","suspended"].includes(decision)&&!note)return alert("Add a review note explaining this decision.");
    if(["approved","rejected","suspended"].includes(decision)&&!confirm("Confirm: "+label(decision)+" this seller?"))return;
    b.disabled=true;
    try{
      await marketApi({action:"review_seller",application_ref:a.application_ref,decision,note});
      await reloadMarketplace();selectedApplicationRef=a.application_ref;renderSellerDetail(a.application_ref);
    }catch(err){alert(err.message)}finally{b.disabled=false}
  });
}

function renderSellerProducts(){
  const host=$("sellerProductsList");if(!host)return;
  if(!canProductReview()){host.innerHTML='<div class="empty">Your admin role does not include seller product moderation.</div>';return}
  const stores=new Map((market.stores||[]).map(s=>[s.id,s]));
  const list=[...(market.products||[])].sort((a,b)=>{
    const rank={pending_review:0,rejected:1,active:2,paused:3,draft:4,archived:5};
    return (rank[a.product_status]??9)-(rank[b.product_status]??9);
  });
  host.innerHTML=list.length?list.filter(p=>p.product_status!=="archived").map(p=>{
    const store=stores.get(p.store_id),st=p.product_status;
    const actions=['<button class="primary" data-product-review="'+p.id+'">Review listing</button>'];
    if(st==="active")actions.push('<button data-product-decision="paused" data-product-id="'+p.id+'">Pause</button>');
    return '<div class="market-row market-product"><img src="'+esc(p.primary_image_url||"")+'" alt=""><div><b>'+esc(p.name)+'</b><small>'+esc(store?.store_name||"Seller store")+' • '+esc(p.category)+' • SKU '+esc(p.sku||"—")+'</small>'+(p.moderation_note?'<small>'+esc(p.moderation_note)+'</small>':"")+'</div><span class="chip '+statusClass(st)+'">'+esc(label(st))+'</span><div><small>Price / MOQ</small><b>'+(p.price==null?"Ask for price":"GHS "+Number(p.price).toFixed(2))+' / '+esc(p.moq||1)+'</b><small>'+esc(label(p.stock_status))+'</small></div><div class="actions">'+actions.join("")+'</div></div>';
  }).join(""):'<div class="empty">No seller products yet.</div>';

  host.querySelectorAll("[data-product-review]").forEach(b=>b.onclick=()=>renderSellerProductDetail(b.dataset.productReview));
  wireProductDecisionButtons(host);
}
function wireProductDecisionButtons(root){
  root.querySelectorAll("[data-product-decision]").forEach(b=>b.onclick=async()=>{
    const decision=b.dataset.productDecision;
    let note="";
    if(decision==="rejected"){note=prompt("Why is this product being rejected? The seller will see this note.","")||"";if(!note)return}
    if(decision==="approved"&&!confirm("Approve this seller product for public marketplace visibility?"))return;
    if(decision==="paused"&&!confirm("Pause this seller product? It will stop being publicly visible."))return;
    b.disabled=true;
    try{
      await marketApi({action:"review_product",id:b.dataset.productId,decision,note});
      await reloadMarketplace();
      const detail=$("sellerProductDetail");if(detail)detail.classList.add("hide");
    }catch(err){alert(err.message)}finally{b.disabled=false}
  });
}
function renderSellerProductDetail(id){
  const host=$("sellerProductDetail");if(!host)return;
  const p=(market.products||[]).find(x=>x.id===id);
  if(!p){host.classList.add("hide");return}
  const store=(market.stores||[]).find(s=>s.id===p.store_id);
  const imgs=[p.primary_image_url,...(Array.isArray(p.image_urls)?p.image_urls:[])].filter(Boolean);
  const st=p.product_status,actions=[];
  if(st==="pending_review"){actions.push('<button class="approve" data-product-decision="approved" data-product-id="'+p.id+'">Approve product</button>');actions.push('<button class="danger" data-product-decision="rejected" data-product-id="'+p.id+'">Reject product</button>')}
  if(st==="active")actions.push('<button class="danger" data-product-decision="paused" data-product-id="'+p.id+'">Pause product</button>');
  if(st==="paused")actions.push('<button class="approve" data-product-decision="approved" data-product-id="'+p.id+'">Reactivate product</button>');
  host.classList.remove("hide");
  host.innerHTML='<div class="review-head"><div><h2>'+esc(p.name)+'</h2><p>'+esc(store?.store_name||"Seller store")+' • '+esc(p.category)+' • SKU '+esc(p.sku||"—")+'</p></div><span class="chip '+statusClass(st)+'">'+esc(label(st))+'</span></div><div class="review-body"><div class="review-meta"><div><span>Price</span><b>'+(p.price==null?"Ask for price":"GHS "+Number(p.price).toFixed(2))+'</b></div><div><span>MOQ / unit</span><b>'+esc(p.moq||1)+' '+esc(p.unit_label||"unit(s)")+'</b></div><div><span>Stock</span><b>'+esc(label(p.stock_status))+'</b><span>'+esc(p.stock_quantity==null?"Quantity not set":p.stock_quantity+" available")+'</span></div></div><div class="detail-copy"><b style="color:var(--rpe-ink)">Short description</b><br>'+esc(p.short_description||"—")+'<br><br><b style="color:var(--rpe-ink)">Full description</b><br>'+esc(p.description||"No full description supplied.")+'</div><div class="product-review-gallery">'+(imgs.length?imgs.map((u,i)=>'<a href="'+esc(u)+'" target="_blank" rel="noopener"><img src="'+esc(u)+'" alt="Product image '+(i+1)+'"></a>').join(""):'<div class="empty">No product images.</div>')+'</div>'+(p.moderation_note?'<div class="detail-copy" style="margin-top:10px"><b style="color:var(--rpe-ink)">Current moderation note</b><br>'+esc(p.moderation_note)+'</div>':"")+'<div class="decision-actions">'+actions.join("")+'</div></div>';
  wireProductDecisionButtons(host);
  host.scrollIntoView({behavior:"smooth",block:"start"});
}

function renderSellerStores(){
  const host=$("sellerStoresList");if(!host)return;
  if(!canSellerReview()){host.innerHTML='<div class="empty">Your admin role does not include seller store management.</div>';return}
  const apps=new Map((market.applications||[]).map(a=>[a.application_ref,a]));
  const list=market.stores||[];
  host.innerHTML=list.length?list.map(s=>{
    const appRow=apps.get(s.application_ref),sellerSt=appRow?appStatus(appRow):"unknown",actions=[];
    if(s.store_status==="active"){
      actions.push('<button data-store-status="paused" data-store-id="'+s.id+'">Pause</button>');
      actions.push('<button data-store-status="suspended" data-store-id="'+s.id+'">Suspend</button>');
      actions.push('<button data-store-view="'+esc(s.slug)+'" class="primary">View store</button>');
    }else if(["paused","suspended"].includes(s.store_status)&&sellerSt==="approved"){
      actions.push('<button data-store-status="active" data-store-id="'+s.id+'" class="primary">Activate</button>');
    }
    return `<div class="market-row"><div><b>${esc(s.store_name)}</b><small>${esc(s.application_ref)} • /${esc(s.slug)}${s.moderation_note?" • "+esc(s.moderation_note):""}</small></div><span class="chip ${statusClass(s.store_status)}">${esc(label(s.store_status))}</span><div><small>Seller verification</small><b>${esc(label(sellerSt))}</b></div><div class="actions">${actions.join("")}</div></div>`;
  }).join(""):'<div class="empty">No seller stores have been created yet.</div>';
  host.querySelectorAll("[data-store-view]").forEach(b=>b.onclick=()=>window.open("../all/seller-store.html?store="+encodeURIComponent(b.dataset.storeView),"_blank"));
  host.querySelectorAll("[data-store-status]").forEach(b=>b.onclick=async()=>{
    const status=b.dataset.storeStatus;let note="";
    if(status==="suspended"){note=prompt("Why is this store being suspended?","")||"";if(!note)return}
    if(!confirm("Change this store status to "+label(status)+"?"))return;
    b.disabled=true;
    try{await marketApi({action:"set_store_status",id:b.dataset.storeId,status,note});await reloadMarketplace()}
    catch(err){alert(err.message)}finally{b.disabled=false}
  });
}
$("refreshMarketplace").onclick=async()=>{
  $("refreshMarketplace").disabled=true;
  try{await reloadMarketplace()}catch(err){alert(err.message)}
  finally{$("refreshMarketplace").disabled=false}
};

(async()=>{
  const {data:{session:initial}}=await sb.auth.getSession();
  await checkSession(initial);
  sb.auth.onAuthStateChange((_e,s)=>setTimeout(()=>checkSession(s),0));
})();
})();