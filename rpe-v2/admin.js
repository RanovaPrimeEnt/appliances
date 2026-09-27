(() => {
"use strict";
const cfg=window.RPE_CONFIG||{},loading=document.getElementById("loading"),auth=document.getElementById("auth"),denied=document.getElementById("denied"),app=document.getElementById("app");
if(!cfg.supabaseUrl||!cfg.supabasePublishableKey||!window.supabase){loading.textContent="Admin backend is not connected.";return}
const sb=window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey);
const marketEndpoint=cfg.supabaseUrl+"/functions/v1/ranova-admin-marketplace";
const countryEndpoint=cfg.supabaseUrl+"/functions/v1/ranova-country-service";
const rateSyncEndpoint=cfg.supabaseUrl+"/functions/v1/ranova-rate-sync";
let session=null,user=null,role=null,orders=[],products=[],categories=[],countryList=[],countryMap={},googleCountryAvailable=false;
let market={applications:[],files:[],stores:[],products:[],seller_orders:[],marketplace_orders:[],finance_settings:null,payment_accounts:[],payouts:[],payments:[],country_rules:[],refunds:[],disputes:[],dispute_messages:[],deliveries:[],delivery_proofs:[],delivery_events:[],reviews:[],trust_metrics:[],performance:[],enforcement:[],enforcement_events:[],appeals:[],sponsored_placements:[],inventory_settings:null,inventory_reservations:[],inventory_events:[],after_sales_cases:[],after_sales_events:[],risk_flags:[],safety_reports:[],risk_review_events:[],counts:{}},marketError=null,selectedApplicationRef=null;

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
const canOrderReview=()=>role==="owner"||role==="manager"||role==="orders";
const canFinance=()=>role==="owner"||role==="manager";
const isOwner=()=>role==="owner";
const marketEmpty=()=>({applications:[],files:[],stores:[],products:[],seller_orders:[],marketplace_orders:[],finance_settings:null,payment_accounts:[],payouts:[],payments:[],country_rules:[],refunds:[],disputes:[],dispute_messages:[],deliveries:[],delivery_proofs:[],delivery_events:[],reviews:[],trust_metrics:[],performance:[],enforcement:[],enforcement_events:[],appeals:[],sponsored_placements:[],inventory_settings:null,inventory_reservations:[],inventory_events:[],after_sales_cases:[],after_sales_events:[],risk_flags:[],safety_reports:[],risk_review_events:[],counts:{}});

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
  document.querySelectorAll('[data-market-role="orders"]').forEach(x=>x.classList.toggle("hide",!canOrderReview()));
  document.querySelectorAll('[data-market-role="finance"]').forEach(x=>x.classList.toggle("hide",!canFinance()));
}

async function loadAll(){
  await Promise.all([
    loadOrders(),
    loadProducts(),
    loadCategories(),
    loadCountryData().catch(err=>console.error(err)),
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

async function loadCountryData(){
  const res=await fetch(countryEndpoint,{method:"POST",headers:{"Content-Type":"application/json","x-ranova-client":"ranova-site-v1"},body:JSON.stringify({action:"countries"})});
  const out=await res.json().catch(()=>({}));
  if(!res.ok||!out.ok)throw new Error(out.error||"Country service unavailable.");
  countryList=Array.isArray(out.countries)?out.countries:[];
  countryMap={};countryList.forEach(c=>countryMap[c.code]=c.name);
  googleCountryAvailable=!!out.google_available;
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
  if(!canSellerReview()&&!canProductReview()&&!canOrderReview()&&!canFinance()){market=marketEmpty();return}
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
  renderMarketplaceTrust();
  renderMarketplaceDiscovery();
  renderInventoryControl();
  renderSellerOrders();
  renderDeliveries();
  renderCases();
  renderSafetyRisk();
  renderFinance();
  if(selectedApplicationRef)renderSellerDetail(selectedApplicationRef);
}
function renderMarketplaceSummary(){
  const box=$("marketplaceSummary");
  if(!box)return;
  const allowed=canSellerReview()||canProductReview()||canOrderReview()||canFinance();
  box.classList.toggle("hide",!allowed);
  if(!allowed)return;
  const c=market.counts||{};
  $("mSellerPending").textContent=canSellerReview()?(c.seller_pending||0):"—";
  $("mDocsPending").textContent=canSellerReview()?(c.documents_pending||0):"—";
  $("mSellerProductsPending").textContent=canProductReview()?(c.products_pending||0):"—";
  $("mSellerOrdersOpen").textContent=canOrderReview()?(c.seller_orders_open||0):"—";
  $("mRefundsOpen").textContent=canOrderReview()?(c.refunds_open||0):"—";
  $("mDisputesOpen").textContent=canOrderReview()?(c.disputes_open||0):"—";if($("mAfterSalesOpen"))$("mAfterSalesOpen").textContent=canOrderReview()?(c.after_sales_open||0):"—";
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


function renderMarketplaceTrust(){
  const reviewHost=$("adminReviewsList"),metricHost=$("adminTrustMetricsList"),enfHost=$("adminEnforcementList"),appealHost=$("adminAppealsList");
  if(!reviewHost||!metricHost||!enfHost||!appealHost)return;
  if(!canSellerReview()){
    [reviewHost,metricHost,enfHost,appealHost].forEach(h=>h.innerHTML='<div class="empty">Your admin role does not include seller trust and enforcement.</div>');
    return;
  }
  const c=market.counts||{},reviews=market.reviews||[],metrics=market.trust_metrics||[],performance=market.performance||[],enforcement=market.enforcement||[],appeals=market.appeals||[],stores=market.stores||[];
  $("tReviewsPending").textContent=c.reviews_pending||0;
  $("tReviewsPublished").textContent=c.reviews_published||0;
  $("tReviewsHidden").textContent=c.reviews_hidden||0;
  $("tWatchlist").textContent=c.seller_watchlist||0;
  $("tTrusted").textContent=c.seller_trusted||0;
  $("tEnforced").textContent=(c.seller_restricted||0)+(c.seller_suspended||0);
  $("tAppeals").textContent=c.appeals_open||0;
  const storeName=id=>stores.find(s=>s.id===id)?.store_name||"Seller store";

  reviewHost.innerHTML=reviews.length?reviews.map(r=>{
    const flags=Array.isArray(r.moderation_flags)?r.moderation_flags:[];
    const actions=[
      r.moderation_status!=="published"?'<button class="primary" data-review-mod="'+r.id+'" data-review-status="published">Publish</button>':"",
      r.moderation_status!=="hidden"?'<button data-review-mod="'+r.id+'" data-review-status="hidden">Hide</button>':"",
      r.moderation_status!=="rejected"?'<button data-review-mod="'+r.id+'" data-review-status="rejected">Reject</button>':""
    ].join("");
    return '<div class="market-row"><div><b>'+esc(r.review_ref)+' · '+esc(storeName(r.store_id))+'</b><small>'+esc(r.buyer_display_name||"Verified buyer")+' · Overall '+esc(r.overall_rating)+'/5 · Product '+esc(r.product_rating)+'/5 · Service '+esc(r.service_rating)+'/5 · Delivery '+esc(r.delivery_rating)+'/5</small><small>'+esc(r.review_title||"")+(r.review_text?' · '+esc(r.review_text):'')+'</small>'+(flags.length?'<small>Automated flags: '+esc(flags.join(", "))+'</small>':'')+(r.seller_response?'<small>Seller response: '+esc(r.seller_response)+'</small>':'')+'</div><span class="chip '+statusClass(r.moderation_status)+'">'+esc(label(r.moderation_status))+'</span><div><small>Submitted</small><b>'+esc(r.submitted_at?new Date(r.submitted_at).toLocaleString():"—")+'</b></div><div class="actions">'+actions+'</div></div>';
  }).join(""):'<div class="empty">No verified marketplace reviews yet.</div>';
  reviewHost.querySelectorAll("[data-review-mod]").forEach(b=>b.onclick=async()=>{
    const status=b.dataset.reviewStatus;let note="";
    if(status==="hidden"||status==="rejected"){note=prompt("Record the reason for this moderation decision.","")||"";if(note.trim().length<3)return}
    else note=prompt("Optional moderation note for publishing.","")||"";
    b.disabled=true;try{await marketApi({action:"moderate_marketplace_review",id:b.dataset.reviewMod,status,note});await reloadMarketplace()}
    catch(err){alert(err.message||"Could not moderate review.")}finally{b.disabled=false}
  });

  metricHost.innerHTML=performance.length?performance.map(p=>{
    const trusted=p.trusted_badge?' ✓ Trusted':'';
    const reasons=Array.isArray(p.automated_reasons)?p.automated_reasons.join(" "):"";
    return '<div class="market-row"><div><b>'+esc(storeName(p.store_id))+'</b><small>'+esc(pretty(p.performance_level))+trusted+' · '+esc(p.total_orders||0)+' order(s), '+esc(p.completed_orders||0)+' completed</small><small>'+esc(reasons)+'</small></div><span class="chip">'+esc(Number(p.fulfillment_score||0).toFixed(0))+'/100 fulfilment</span><div><small>Cancellation / late / complaint</small><b>'+esc(Number(p.cancellation_rate||0).toFixed(2))+'% / '+esc(Number(p.late_delivery_rate||0).toFixed(2))+'% / '+esc(Number(p.complaint_order_rate||0).toFixed(2))+'%</b></div><div><small>Service score</small><b>'+esc(Number(p.service_score||0).toFixed(0))+'/100</b><small>Rating '+(p.overall_rating==null?'—':esc(Number(p.overall_rating).toFixed(2))+'/5')+'</small></div></div>';
  }).join(""):'<div class="empty">No seller performance records yet.</div>';

  const enfMap=new Map(enforcement.map(e=>[e.store_id,e]));
  enfHost.innerHTML=stores.length?stores.map(s=>{
    const e=enfMap.get(s.id)||{enforcement_status:"good_standing"};
    const active=e.enforcement_status!=="good_standing";
    return '<div class="market-row"><div><b>'+esc(s.store_name)+'</b><small>'+esc(e.reason_detail||"No active enforcement action.")+'</small>'+(e.ends_at?'<small>Scheduled end: '+esc(new Date(e.ends_at).toLocaleString())+'</small>':'')+'</div><span class="chip '+statusClass(e.enforcement_status)+'">'+esc(pretty(e.enforcement_status))+'</span><div><small>Store</small><b>'+esc(pretty(s.store_status))+'</b></div><div class="actions"><button data-enforce-store="'+s.id+'" data-enforce-status="warning">Warn</button><button data-enforce-store="'+s.id+'" data-enforce-status="restricted">Restrict</button><button data-enforce-store="'+s.id+'" data-enforce-status="suspended">Suspend</button>'+(active?'<button class="primary" data-enforce-store="'+s.id+'" data-enforce-status="good_standing">Restore</button>':'')+'</div></div>';
  }).join(""):'<div class="empty">No seller stores yet.</div>';
  enfHost.querySelectorAll("[data-enforce-store]").forEach(b=>b.onclick=async()=>{
    const status=b.dataset.enforceStatus;
    const reason=prompt(status==="good_standing"?"Why is this enforcement action being lifted?":"Record the evidence-based reason for this "+status+" action.","")||"";
    if(reason.trim().length<10)return;
    let ends_at="";
    if(status==="restricted"||status==="suspended"){ends_at=prompt("Optional end date/time (YYYY-MM-DD or leave blank for manual review).","")||""}
    if(!confirm("Confirm "+pretty(status)+" for this seller? Existing orders will remain visible."))return;
    b.disabled=true;try{await marketApi({action:"set_seller_enforcement",store_id:b.dataset.enforceStore,status,reason_code:"performance_or_policy",reason_detail:reason,ends_at});await reloadMarketplace()}
    catch(err){alert(err.message||"Could not update enforcement.")}finally{b.disabled=false}
  });

  appealHost.innerHTML=appeals.length?appeals.map(a=>{
    const actions=["submitted","under_review"].includes(a.status)
      ?'<button data-appeal="'+a.id+'" data-appeal-status="under_review">Start review</button><button data-appeal="'+a.id+'" data-appeal-status="upheld">Uphold</button><button data-appeal="'+a.id+'" data-appeal-status="partially_upheld">Partly uphold</button><button class="primary" data-appeal="'+a.id+'" data-appeal-status="overturned">Overturn</button>'
      :"";
    return '<div class="market-row"><div><b>'+esc(a.appeal_ref)+' · '+esc(storeName(a.store_id))+'</b><small>'+esc(a.subject)+'</small><small>'+esc(a.appeal_text)+'</small>'+(a.admin_note?'<small>Decision: '+esc(a.admin_note)+'</small>':'')+'</div><span class="chip '+statusClass(a.status)+'">'+esc(pretty(a.status))+'</span><div><small>Submitted</small><b>'+esc(a.submitted_at?new Date(a.submitted_at).toLocaleString():"—")+'</b></div><div class="actions">'+actions+'</div></div>';
  }).join(""):'<div class="empty">No seller appeals yet.</div>';
  appealHost.querySelectorAll("[data-appeal]").forEach(b=>b.onclick=async()=>{
    const status=b.dataset.appealStatus;let note="";
    if(status!=="under_review"){note=prompt("Write the reason for this appeal decision.","")||"";if(note.trim().length<10)return}
    b.disabled=true;try{await marketApi({action:"review_seller_appeal",id:b.dataset.appeal,status,note});await reloadMarketplace()}
    catch(err){alert(err.message||"Could not review appeal.")}finally{b.disabled=false}
  });
}

function renderMarketplaceDiscovery(){
  const host=$("sponsoredPlacementsList");if(!host)return;
  if(!canSellerReview()){host.innerHTML='<div class="empty">Your admin role does not include marketplace discovery controls.</div>';return}
  const products=(market.products||[]).filter(p=>p.product_status==="active"),stores=market.stores||[],placements=market.sponsored_placements||[];
  $("dSponsoredActive").textContent=(market.counts||{}).sponsored_active||0;
  const select=$("spProduct"),current=select.value;
  select.innerHTML='<option value="">Choose active seller product</option>'+products.map(p=>{
    const s=stores.find(x=>x.id===p.store_id);return '<option value="'+esc(p.id)+'">'+esc(p.name)+' — '+esc(s?.store_name||"Seller store")+'</option>'
  }).join("");
  if(products.some(p=>p.id===current))select.value=current;
  const productName=id=>products.find(p=>p.id===id)?.name||(market.products||[]).find(p=>p.id===id)?.name||"Seller product";
  const storeName=id=>stores.find(s=>s.id===id)?.store_name||"Seller store";
  host.innerHTML=placements.length?placements.map(x=>{
    const now=Date.now(),live=x.status==="active"&&new Date(x.starts_at).getTime()<=now&&new Date(x.ends_at).getTime()>now;
    const buttons=x.status==="active"?'<button data-sp-status="'+x.id+'" data-status="paused">Pause</button><button data-sp-status="'+x.id+'" data-status="ended">End</button>':'<button class="primary" data-sp-status="'+x.id+'" data-status="active">Activate</button>';
    return '<div class="market-row"><div><b>'+esc(productName(x.product_id))+' · '+esc(storeName(x.store_id))+'</b><small>'+esc(x.label||"Sponsored")+' · '+esc(x.disclosure_note||"Paid placement")+'</small><small>'+(x.category?'Category '+esc(x.category)+' · ':'')+(x.buyer_country_code?'Country '+esc(x.buyer_country_code)+' · ':'')+'Priority '+esc(x.priority||0)+'</small></div><span class="chip '+statusClass(live?"active":x.status)+'">'+esc(live?"Live":pretty(x.status))+'</span><div><small>Schedule</small><b>'+esc(new Date(x.starts_at).toLocaleString())+'</b><small>to '+esc(new Date(x.ends_at).toLocaleString())+'</small></div><div class="actions">'+buttons+'</div></div>'
  }).join(""):'<div class="empty">No sponsored placements. Organic search remains unaffected.</div>';
  host.querySelectorAll("[data-sp-status]").forEach(b=>b.onclick=async()=>{
    let note="";if(b.dataset.status==="rejected"){note=prompt("Why is this placement rejected?","")||"";if(!note)return}
    b.disabled=true;try{await marketApi({action:"set_sponsored_status",id:b.dataset.spStatus,status:b.dataset.status,note});await reloadMarketplace()}
    catch(err){alert(err.message||"Could not update sponsored placement.")}finally{b.disabled=false}
  });
}
if($("saveSponsored"))$("saveSponsored").onclick=async function(){
  const product_id=$("spProduct").value,starts_at=$("spStart").value,ends_at=$("spEnd").value;
  if(!product_id||!starts_at||!ends_at)return alert("Choose a product and a start/end time.");
  this.disabled=true;
  try{
    await marketApi({action:"save_sponsored_placement",product_id,category:$("spCategory").value.trim(),buyer_country_code:$("spCountry").value.trim().toUpperCase(),priority:$("spPriority").value,starts_at,ends_at,disclosure_note:$("spDisclosure").value.trim(),label:"Sponsored"});
    $("spProduct").value="";$("spCategory").value="";$("spCountry").value="";$("spPriority").value="0";$("spStart").value="";$("spEnd").value="";
    await reloadMarketplace();
  }catch(err){alert(err.message||"Could not create sponsored placement.")}finally{this.disabled=false}
};

function renderInventoryControl(){
  const host=$("inventoryAdminList"),rHost=$("inventoryReservationsList");if(!host||!rHost)return;
  const settings=market.inventory_settings||{reservation_minutes:120,expire_unpaid_orders:true},
    reservations=market.inventory_reservations||[],events=market.inventory_events||[],
    products=market.products||[],stores=market.stores||[],c=market.counts||{},now=Date.now();
  $("iActiveHolds").textContent=c.inventory_holds||0;
  $("iExpiringSoon").textContent=c.inventory_expiring_soon||0;
  $("iCommitted").textContent=c.inventory_committed||0;
  $("iRestored").textContent=c.inventory_restored||0;
  $("iWindow").textContent=(settings.reservation_minutes||120)+" minutes";
  $("inventoryMinutes").value=settings.reservation_minutes||120;

  const productName=id=>products.find(x=>x.id===id)?.name||"Seller product";
  const storeName=id=>stores.find(x=>x.id===id)?.store_name||"Seller store";
  rHost.innerHTML=reservations.length?reservations.slice(0,200).map(r=>{
    const expires=r.expires_at?new Date(r.expires_at):null;
    let timing="";
    if(r.status==="held"&&expires){
      const ms=expires.getTime()-now;
      timing=ms>0?"Expires "+expires.toLocaleString()+" · "+Math.max(1,Math.ceil(ms/60000))+" min left":"Expiry due";
    }else if(r.committed_at)timing="Committed "+new Date(r.committed_at).toLocaleString();
    else if(r.released_at)timing=pretty(r.status)+" "+new Date(r.released_at).toLocaleString();
    const reason=r.release_reason?'<small>'+esc(r.release_reason)+'</small>':"";
    return '<div class="market-row"><div><b>'+esc(productName(r.product_id))+'</b><small>'+esc(storeName(r.store_id))+' · '+esc(r.order_ref||"No order")+'</small>'+reason+'</div><span class="chip '+statusClass(r.status)+'">'+esc(pretty(r.status))+'</span><div><small>Quantity protected</small><b>'+esc(r.quantity)+' unit(s)</b></div><div><small>'+esc(timing||new Date(r.reserved_at).toLocaleString())+'</small></div></div>';
  }).join(""):'<div class="empty">No inventory reservations yet.</div>';

  host.innerHTML=events.length?events.slice(0,200).map(e=>{
    return '<div class="market-row"><div><b>'+esc(productName(e.product_id))+'</b><small>'+esc(storeName(e.store_id))+' · '+esc(e.order_ref||"No order")+'</small>'+(e.note?'<small>'+esc(e.note)+'</small>':'')+'</div><span class="chip '+statusClass(e.event_type)+'">'+esc(pretty(e.event_type))+'</span><div><b>'+esc(e.quantity)+' unit(s)</b><small>Stock '+esc(e.stock_before==null?"untracked":e.stock_before)+' → '+esc(e.stock_after==null?"untracked":e.stock_after)+'</small></div><div><small>'+esc(new Date(e.created_at).toLocaleString())+' · '+esc(pretty(e.actor_type||"system"))+'</small></div></div>';
  }).join(""):'<div class="empty">No inventory activity yet.</div>';
}
if($("saveInventorySettings"))$("saveInventorySettings").onclick=async function(){
  if(!isOwner())return alert("Only the Owner can change inventory settings.");
  const minutes=Math.trunc(Number($("inventoryMinutes").value));
  if(!Number.isFinite(minutes)||minutes<15||minutes>1440)return alert("Reservation window must be between 15 minutes and 24 hours.");
  this.disabled=true;
  try{await marketApi({action:"save_inventory_settings",reservation_minutes:minutes});await reloadMarketplace()}
  catch(err){alert(err.message||"Could not save inventory settings.")}
  finally{this.disabled=false}
};
if($("runInventoryExpiry"))$("runInventoryExpiry").onclick=async function(){
  if(!confirm("Run the inventory expiry check now? Only genuinely expired unpaid holds will be released."))return;
  this.disabled=true;
  try{
    const out=await marketApi({action:"run_inventory_expiry"});
    await reloadMarketplace();
    alert((out.expired_count||0)+" expired inventory hold(s) processed.");
  }catch(err){alert(err.message||"Could not run inventory expiry check.")}
  finally{this.disabled=false}
};

function renderSellerOrders(){
  const host=$("sellerOrdersList");if(!host)return;
  if(!canOrderReview()){host.innerHTML='<div class="empty">Your admin role does not include marketplace-order visibility.</div>';return}
  const stores=new Map((market.stores||[]).map(s=>[s.id,s]));
  const list=market.seller_orders||[];
  host.innerHTML=list.length?list.map(o=>{
    const st=stores.get(o.store_id);
    const total=o.total==null?"Pending quote":"GHS "+Number(o.total).toFixed(2);
    return '<div class="market-row"><div><b>'+esc(o.platform_order_ref||o.order_ref)+'</b><small>'+esc(st?.store_name||"Seller store")+' • '+esc(o.buyer_name||"Customer")+' • '+new Date(o.created_at).toLocaleString()+'</small><small>'+esc(o.delivery_location||"Delivery location pending")+'</small></div><span class="chip '+statusClass(o.order_status)+'">'+esc(label(o.order_status))+'</span><div><small>Payment</small><b>'+esc(label(o.payment_status))+'</b><small>'+esc(o.payment_method||"Not selected")+'</small></div><div><small>Seller total</small><b>'+esc(total)+'</b><small>'+esc(o.item_count||0)+' product line(s)</small></div></div>';
  }).join(""):'<div class="empty">No seller-routed marketplace orders yet.</div>';
}




function renderDeliveries(){
  const deliveries=market.deliveries||[],proofs=market.delivery_proofs||[],events=market.delivery_events||[];
  const orders=new Map((market.seller_orders||[]).map(o=>[o.id,o]));
  const stores=new Map((market.stores||[]).map(s=>[s.id,s]));
  $("dActive").textContent=(market.counts||{}).deliveries_active||0;
  $("dWaiting").textContent=(market.counts||{}).deliveries_waiting_confirmation||0;
  $("dProofs").textContent=proofs.length;
  $("dProofReview").textContent=proofs.filter(p=>p.review_status==="submitted").length;

  const host=$("adminDeliveriesList");
  if(!host)return;
  if(!canOrderReview()){host.innerHTML='<div class="empty">Your admin role does not include delivery review.</div>';return}
  host.innerHTML=deliveries.length?deliveries.map(d=>{
    const o=orders.get(d.seller_order_id)||{},store=stores.get(d.store_id)||{};
    const ps=proofs.filter(p=>p.delivery_id===d.id);
    const ev=events.filter(e=>e.delivery_id===d.id).slice(0,6);
    const proofHtml=ps.length?ps.map(p=>{
      const buttons='<button data-delivery-proof-view="'+p.id+'">View proof</button>'+
        (p.review_status==="submitted"?'<button data-delivery-proof-review="'+p.id+'" data-proof-status="verified">Verify</button><button data-delivery-proof-review="'+p.id+'" data-proof-status="rejected">Reject</button>':'');
      return '<div class="finance-row-note"><b>'+esc(pretty(p.proof_type))+'</b> · '+esc(pretty(p.review_status))+(p.recipient_name?' · Recipient '+esc(p.recipient_name):'')+(p.note?' · '+esc(p.note):'')+'<div class="actions" style="margin-top:6px">'+buttons+'</div></div>';
    }).join(""):'<div class="finance-row-note">No proof submitted yet.</div>';
    const timeline=ev.length?'<div style="margin-top:8px">'+ev.map(e=>'<div class="finance-row-note"><b>'+esc(pretty(e.status))+'</b> · '+esc(pretty(e.actor_type))+(e.note?' · '+esc(e.note):'')+' · '+new Date(e.occurred_at).toLocaleString()+'</div>').join("")+'</div>':'';
    const confirm=d.delivery_status==="delivered_pending_confirmation"?'<button class="primary" data-admin-confirm-delivery="'+d.id+'">Confirm after review</button>':'';
    const tracking=d.tracking_url?'<a href="'+esc(d.tracking_url)+'" target="_blank" rel="noopener">Courier tracking</a>':'';
    return '<div class="market-row"><div><b>'+esc(o.platform_order_ref||o.order_ref||"Seller order")+'</b><small>'+esc(store.store_name||"Seller store")+' · '+esc(o.order_ref||"")+'</small><small>'+esc(d.destination_text||"Destination not recorded")+'</small>'+tracking+proofHtml+timeline+'</div><span class="chip '+statusClass(d.delivery_status)+'">'+esc(pretty(d.delivery_status))+'</span><div><small>Method</small><b>'+esc(pretty(d.fulfilment_method))+'</b><small>'+esc(d.courier_name||"Courier not assigned")+(d.courier_reference?' · '+esc(d.courier_reference):'')+'</small></div><div><small>Delivery fee</small><b>'+fmtMoney(d.quoted_delivery_fee)+'</b><small>'+(d.eta_start_date||d.eta_end_date?'ETA '+esc(d.eta_start_date||"")+(d.eta_end_date?' → '+esc(d.eta_end_date):''):'ETA not recorded')+'</small></div><div class="actions">'+confirm+'</div></div>';
  }).join(""):'<div class="empty">No marketplace delivery records yet.</div>';

  host.querySelectorAll("[data-delivery-proof-view]").forEach(b=>b.onclick=async()=>{
    b.disabled=true;
    try{const out=await marketApi({action:"delivery_proof_url",proof_id:b.dataset.deliveryProofView});window.open(out.url,"_blank","noopener")}
    catch(err){alert(err.message)}finally{b.disabled=false}
  });
  host.querySelectorAll("[data-delivery-proof-review]").forEach(b=>b.onclick=async()=>{
    const status=b.dataset.proofStatus;
    let note="";
    if(status==="rejected"){note=prompt("Explain why this delivery proof is not acceptable.","")||"";if(!note)return}
    else note=prompt("Optional verification note.","")||"";
    b.disabled=true;
    try{await marketApi({action:"review_delivery_proof",proof_id:b.dataset.deliveryProofReview,status,note});await reloadMarketplace()}
    catch(err){alert(err.message)}finally{b.disabled=false}
  });
  host.querySelectorAll("[data-admin-confirm-delivery]").forEach(b=>b.onclick=async()=>{
    const note=prompt("Explain why RANOVA is confirming this delivery after reviewing the evidence.","")||"";
    if(!note)return;
    if(!confirm("Confirm this delivery on behalf of RANOVA? This will finalize the seller-order delivery record."))return;
    b.disabled=true;
    try{await marketApi({action:"admin_confirm_delivery",delivery_id:b.dataset.adminConfirmDelivery,note});await reloadMarketplace()}
    catch(err){alert(err.message)}finally{b.disabled=false}
  });
}

function renderCases(){
  const refunds=market.refunds||[],disputes=market.disputes||[],messages=market.dispute_messages||[],afterSales=market.after_sales_cases||[];
  const rOpen=refunds.filter(r=>!["refunded","rejected","cancelled"].includes(r.status)).length;
  const dOpen=disputes.filter(d=>!["resolved","closed"].includes(d.status)).length;
  const closed=refunds.filter(r=>["refunded","rejected","cancelled"].includes(r.status)).length+
    disputes.filter(d=>["resolved","closed"].includes(d.status)).length;
  $("cRefundsOpen").textContent=rOpen;$("cDisputesOpen").textContent=dOpen;if($("cAfterSalesOpen"))$("cAfterSalesOpen").textContent=afterSales.filter(x=>!["resolved","closed","declined"].includes(x.status)).length;$("cCasesClosed").textContent=closed;

  const aHost=$("adminAfterSalesList");
  if(aHost){
    aHost.innerHTML=afterSales.length?afterSales.map(c=>{
      const actions=[];
      if(!["resolved","closed","declined"].includes(c.status)){
        actions.push('<button data-after-action="under_review" data-after-id="'+c.id+'">Under review</button>');
        actions.push('<button data-after-action="accepted" data-after-id="'+c.id+'">Accept</button>');
        actions.push('<button data-after-action="declined" data-after-id="'+c.id+'">Decline</button>');
        actions.push('<button class="primary" data-after-action="resolved" data-after-id="'+c.id+'">Resolve</button>');
      }else if(c.status==="resolved")actions.push('<button data-after-action="closed" data-after-id="'+c.id+'">Close</button>');
      return '<div class="market-row"><div><b>'+esc(c.case_ref)+' • '+esc(pretty(c.case_type))+'</b><small>'+esc(pretty(c.reason_category))+' • '+esc(c.description)+'</small>'+(c.seller_response?'<small>Seller: '+esc(c.seller_response)+'</small>':'')+(c.resolution_note?'<small>RANOVA: '+esc(c.resolution_note)+'</small>':'')+'</div><span class="chip '+statusClass(c.status)+'">'+esc(label(c.status))+'</span><div><small>Seller order</small><b>'+esc(c.seller_order_id)+'</b><small>'+new Date(c.created_at).toLocaleString()+'</small></div><div class="actions">'+actions.join("")+'</div></div>';
    }).join(""):'<div class="empty">No cancellation or return cases yet.</div>';
    aHost.querySelectorAll("[data-after-action]").forEach(b=>b.onclick=async()=>{
      const decision=b.dataset.afterAction,note=prompt("Add the RANOVA review/resolution note.","")||"";
      if(["declined","resolved","closed"].includes(decision)&&!note)return;
      b.disabled=true;
      try{await marketApi({action:"review_after_sales",id:b.dataset.afterId,decision,note});await reloadMarketplace()}
      catch(err){alert(err.message)}finally{b.disabled=false}
    });
  }

  const rHost=$("adminRefundsList");
  rHost.innerHTML=refunds.length?refunds.map(r=>{
    const actions=[];
    if(["requested","under_review"].includes(r.status)){
      actions.push('<button data-refund-action="under_review" data-refund-id="'+r.id+'">Review</button>');
      if(canFinance())actions.push('<button class="primary" data-refund-action="approved" data-refund-id="'+r.id+'">Approve</button>');
      actions.push('<button data-refund-action="rejected" data-refund-id="'+r.id+'">Reject</button>');
    }
    if(r.status==="approved"&&canFinance()){
      actions.push('<button data-refund-action="processing" data-refund-id="'+r.id+'">Start refund</button>');
      actions.push('<button class="primary" data-refund-action="refunded" data-refund-id="'+r.id+'">Mark refunded</button>');
    }
    if(r.status==="processing"&&canFinance())actions.push('<button class="primary" data-refund-action="refunded" data-refund-id="'+r.id+'">Mark refunded</button>');
    return '<div class="market-row"><div><b>'+esc(r.refund_ref)+'</b><small>'+esc(pretty(r.reason_category))+' • '+esc(r.reason_detail)+'</small>'+(r.admin_note?'<small>RANOVA: '+esc(r.admin_note)+'</small>':'')+'</div><span class="chip '+statusClass(r.status)+'">'+esc(label(r.status))+'</span><div><small>Requested</small><b>'+fmtMoney(r.requested_amount)+'</b><small>'+(r.approved_amount!=null?'Approved '+fmtMoney(r.approved_amount):'Not approved yet')+'</small></div><div><small>Requested</small><b>'+new Date(r.requested_at).toLocaleString()+'</b>'+(r.refund_reference?'<small>Refund ref '+esc(r.refund_reference)+'</small>':'')+'</div><div class="actions">'+actions.join("")+'</div></div>';
  }).join(""):'<div class="empty">No marketplace refund cases yet.</div>';

  rHost.querySelectorAll("[data-refund-action]").forEach(b=>b.onclick=async()=>{
    const action=b.dataset.refundAction,r=refunds.find(x=>x.id===b.dataset.refundId);if(!r)return;
    let approved_amount="",refund_reference="",note="";
    if(action==="approved"){
      approved_amount=prompt("Approved refund amount (GHS)",String(r.approved_amount??r.requested_amount??""))||"";
      if(!approved_amount)return;
      note=prompt("Reason / review note","Approved after reviewing the order and case evidence.")||"";
    }else if(action==="refunded"){
      approved_amount=String(r.approved_amount??r.requested_amount??"");
      refund_reference=prompt("Enter the actual refund transaction/reference.","")||"";
      if(!refund_reference)return;
      note=prompt("Refund note","Refund sent and independently verified.")||"";
      if(!confirm("Confirm the refund has actually been sent?"))return;
    }else if(action==="rejected"){
      note=prompt("Why is this refund being rejected? This will be visible in the case record.","")||"";if(!note)return;
    }else{
      note=prompt(action==="processing"?"Processing note":"Review note","")||"";
    }
    b.disabled=true;
    try{
      await marketApi({action:"review_refund",id:r.id,status:action,approved_amount,refund_reference,note});
      await reloadMarketplace();
    }catch(err){alert(err.message)}finally{b.disabled=false}
  });

  const dHost=$("adminDisputesList");
  dHost.innerHTML=disputes.length?disputes.map(d=>{
    const thread=messages.filter(m=>m.dispute_id===d.id).map(m=>'<div style="margin-top:6px;padding:8px;border-radius:9px;background:#f7f9f8"><b style="font-size:8px">'+esc(pretty(m.sender_type))+'</b><small style="display:block;margin-top:2px">'+esc(m.message)+'</small><small>'+new Date(m.created_at).toLocaleString()+'</small></div>').join("");
    const actions=[];
    if(!["resolved","closed"].includes(d.status)){
      actions.push('<button data-dispute-action="under_review" data-dispute-id="'+d.id+'">Under review</button>');
      actions.push('<button data-dispute-action="awaiting_buyer" data-dispute-id="'+d.id+'">Ask buyer</button>');
      actions.push('<button data-dispute-action="awaiting_seller" data-dispute-id="'+d.id+'">Ask seller</button>');
      actions.push('<button data-dispute-message="'+d.id+'">Reply</button>');
      actions.push('<button class="primary" data-dispute-action="resolved" data-dispute-id="'+d.id+'">Resolve</button>');
    }else if(d.status==="resolved"){
      actions.push('<button data-dispute-action="closed" data-dispute-id="'+d.id+'">Close case</button>');
    }
    return '<div class="market-row" style="grid-template-columns:minmax(0,1.5fr) .55fr .8fr auto"><div><b>'+esc(d.dispute_ref)+' • '+esc(d.subject)+'</b><small>'+esc(pretty(d.category))+' • '+esc(d.description)+'</small>'+thread+(d.resolution_note?'<div class="finance-row-note"><b>Resolution:</b> '+esc(d.resolution_note)+'</div>':'')+'</div><span class="chip '+statusClass(d.status)+'">'+esc(label(d.status))+'</span><div><small>Resolution</small><b>'+esc(d.resolution?pretty(d.resolution):"Pending")+'</b><small>Opened '+new Date(d.opened_at).toLocaleString()+'</small></div><div class="actions">'+actions.join("")+'</div></div>';
  }).join(""):'<div class="empty">No marketplace disputes yet.</div>';

  dHost.querySelectorAll("[data-dispute-message]").forEach(b=>b.onclick=async()=>{
    const message=prompt("Write a message for the dispute record.","")||"";if(!message.trim())return;
    b.disabled=true;
    try{await marketApi({action:"admin_dispute_message",id:b.dataset.disputeMessage,message});await reloadMarketplace()}
    catch(err){alert(err.message)}finally{b.disabled=false}
  });
  dHost.querySelectorAll("[data-dispute-action]").forEach(b=>b.onclick=async()=>{
    const action=b.dataset.disputeAction,d=disputes.find(x=>x.id===b.dataset.disputeId);if(!d)return;
    let resolution="",note="";
    if(action==="resolved"||action==="closed"){
      resolution=action==="closed"?(d.resolution||"case_closed"):(prompt("Resolution code: buyer_refund, partial_refund, seller_favor, no_adjustment, or mutual_resolution","no_adjustment")||"");
      if(!resolution)return;
      note=prompt("Explain the decision clearly for both buyer and seller.",d.resolution_note||"")||"";if(!note)return;
    }else{
      note=prompt("Case note / message","")||"";
    }
    b.disabled=true;
    try{await marketApi({action:"review_dispute",id:d.id,status:action,resolution,note});await reloadMarketplace()}
    catch(err){alert(err.message)}finally{b.disabled=false}
  });
}

function renderSafetyRisk(){
  const flags=market.risk_flags||[],reports=market.safety_reports||[],c=market.counts||{};
  if(!$("riskFlagsList"))return;
  $("riskOpen").textContent=c.risk_flags_open||0;$("riskHigh").textContent=c.risk_high_open||0;$("reportsOpen").textContent=c.safety_reports_open||0;
  $("riskFlagsList").innerHTML=flags.length?flags.map(f=>{
    const actions=[];
    if(["open","under_review"].includes(f.status)){
      if(f.status==="open")actions.push('<button data-risk-action="under_review" data-risk-id="'+f.id+'">Review</button>');
      actions.push('<button data-risk-action="confirmed" data-risk-id="'+f.id+'">Confirm signal</button>');
      actions.push('<button data-risk-action="dismissed" data-risk-id="'+f.id+'">Dismiss</button>');
    }else if(f.status==="confirmed")actions.push('<button data-risk-action="resolved" data-risk-id="'+f.id+'">Resolve</button>');
    return '<div class="market-row"><div><b>'+esc(f.flag_ref)+' • '+esc(f.title)+'</b><small>'+esc(f.explanation)+'</small><small>Signal: '+esc(pretty(f.signal_code))+' • Source: '+esc(pretty(f.source))+'</small><small>Evidence: '+esc(JSON.stringify(f.evidence||{}))+'</small>'+(f.review_note?'<small>Review: '+esc(f.review_note)+'</small>':'')+'</div><span class="chip '+statusClass(f.severity)+'">'+esc(pretty(f.severity))+'</span><div><small>Subject</small><b>'+esc(pretty(f.subject_type))+'</b><small>'+new Date(f.created_at).toLocaleString()+'</small></div><div class="actions">'+actions.join("")+'</div></div>';
  }).join(""):'<div class="empty">No risk flags yet.</div>';
  $("riskFlagsList").querySelectorAll("[data-risk-action]").forEach(b=>b.onclick=async()=>{
    const status=b.dataset.riskAction,note=prompt(status==="dismissed"?"Why is this signal being dismissed?":"Add the evidence/review note.","")||"";
    if(["confirmed","dismissed","resolved"].includes(status)&&note.trim().length<5)return;
    b.disabled=true;try{await marketApi({action:"review_risk_flag",id:b.dataset.riskId,status,note});await reloadMarketplace()}catch(err){alert(err.message)}finally{b.disabled=false}
  });
  $("safetyReportsList").innerHTML=reports.length?reports.map(r=>{
    const actions=[];
    if(r.status==="open")actions.push('<button data-report-action="under_review" data-report-id="'+r.id+'">Review</button>');
    if(["open","under_review"].includes(r.status)){actions.push('<button data-report-action="resolved" data-report-id="'+r.id+'">Resolve</button>');actions.push('<button data-report-action="dismissed" data-report-id="'+r.id+'">Dismiss</button>')}
    return '<div class="market-row"><div><b>'+esc(r.report_ref)+' • '+esc(pretty(r.category))+'</b><small>'+esc(r.description)+'</small>'+(r.reported_message?'<div style="margin-top:7px;padding:8px;border-radius:9px;background:#f7f9f8"><b style="font-size:8px">Reported '+esc(pretty(r.reported_message.sender_role))+' message</b><small style="display:block;margin-top:3px">“'+esc(r.reported_message.body||"")+'”</small><small>'+new Date(r.reported_message.created_at).toLocaleString()+'</small></div>':'')+(r.admin_note?'<small>Admin: '+esc(r.admin_note)+'</small>':'')+'</div><span class="chip '+statusClass(r.status)+'">'+esc(label(r.status))+'</span><div><small>Message / conversation</small><b>'+esc(r.message_id||"—")+'</b><small>'+new Date(r.created_at).toLocaleString()+'</small></div><div class="actions">'+actions.join("")+'</div></div>';
  }).join(""):'<div class="empty">No user safety reports yet.</div>';
  $("safetyReportsList").querySelectorAll("[data-report-action]").forEach(b=>b.onclick=async()=>{
    const status=b.dataset.reportAction,note=prompt(status==="dismissed"?"Why is this report being dismissed?":"Add the safety review note.","")||"";
    if(["resolved","dismissed"].includes(status)&&note.trim().length<5)return;
    b.disabled=true;try{await marketApi({action:"review_safety_report",id:b.dataset.reportId,status,note});await reloadMarketplace()}catch(err){alert(err.message)}finally{b.disabled=false}
  });
}

function fmtMoney(v){return "GHS "+Number(v||0).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})}
function renderFinance(){
  const panel=$("finance");if(!panel)return;
  if(!canFinance())return;

  const c=market.counts||{},settings=market.finance_settings||{};
  $("fPaymentsDue").textContent=c.payments_due||0;
  $("fPayoutsPending").textContent=c.payouts_pending||0;
  $("fCommissionTotal").textContent=fmtMoney(c.commission_total||0);
  $("fPayoutsPaid").textContent=fmtMoney(c.payouts_paid_total||0);

  $("financeCommission").value=settings.default_commission_rate??0;
  $("financeHoldDays").value=settings.payout_hold_days??0;

  $("financeOwnerSettings").classList.toggle("hide",!isOwner());
  $("paymentAccountsCard").classList.toggle("hide",!isOwner());
  renderCountryRules();

  const accounts=market.payment_accounts||[];
  $("paymentAccountsList").innerHTML=accounts.length?accounts.map(a=>'<div class="market-row"><div><b>'+esc(a.payment_method)+' • '+esc(a.provider_name)+'</b><small>'+esc(a.account_name)+' • <span class="finance-ref">'+esc(a.account_reference)+'</span></small>'+(a.instructions?'<small>'+esc(a.instructions)+'</small>':'')+'</div><span class="chip '+(a.active?'status-approved':'status-paused')+'">'+(a.active?'Active':'Inactive')+'</span><div><small>Updated</small><b>'+new Date(a.updated_at).toLocaleString()+'</b></div><div class="actions"><button data-edit-pay-account="'+a.id+'">Edit</button><button data-toggle-pay-account="'+a.id+'" data-active="'+(!a.active)+'">'+(a.active?'Disable':'Enable')+'</button></div></div>').join(""):'<div class="empty">No customer payment destination has been added yet.</div>';

  $("paymentAccountsList").querySelectorAll("[data-edit-pay-account]").forEach(b=>b.onclick=()=>{
    const a=accounts.find(x=>x.id===b.dataset.editPayAccount);if(!a)return;
    $("payAccountId").value=a.id;$("payAccountMethod").value=a.payment_method;$("payAccountProvider").value=a.provider_name||"";$("payAccountName").value=a.account_name||"";$("payAccountReference").value=a.account_reference||"";$("payAccountInstructions").value=a.instructions||"";
    $("paymentAccountsCard").scrollIntoView({behavior:"smooth",block:"start"});
  });
  $("paymentAccountsList").querySelectorAll("[data-toggle-pay-account]").forEach(b=>b.onclick=async()=>{
    b.disabled=true;
    try{await marketApi({action:"set_payment_account_active",id:b.dataset.togglePayAccount,active:b.dataset.active==="true"});await reloadMarketplace()}
    catch(err){alert(err.message)}finally{b.disabled=false}
  });

  const payments=market.marketplace_orders||[];
  $("financePaymentsList").innerHTML=payments.length?payments.map(o=>{
    const due=o.status==="awaiting_payment"&&!["paid","confirmed","refunded"].includes(String(o.payment_status||"").toLowerCase());
    const actions=[];
    if(due){
      actions.push('<button class="primary" data-payment-action="confirmed" data-parent-id="'+o.id+'">Confirm paid</button>');
      actions.push('<button data-payment-action="failed" data-parent-id="'+o.id+'">Mark failed</button>');
    }else if(String(o.payment_status||"").toLowerCase()==="paid"){
      actions.push('<button data-payment-action="refunded" data-parent-id="'+o.id+'">Mark refunded</button>');
    }
    return '<div class="market-row"><div><b>'+esc(o.order_ref)+'</b><small>'+esc(o.customer_name||"Customer")+' • '+esc(o.payment_method||"No method")+' • '+new Date(o.created_at).toLocaleString()+'</small></div><span class="chip '+statusClass(o.payment_status)+'">'+esc(label(o.payment_status||"not_started"))+'</span><div><small>Order stage</small><b>'+esc(label(o.status))+'</b><small>'+esc(o.seller_order_count||0)+' seller order(s)</small></div><div><small>Total due</small><b class="finance-money">'+esc(o.total_payment==null?"Pending quote":fmtMoney(o.total_payment))+'</b></div><div class="actions">'+actions.join("")+'</div></div>';
  }).join(""):'<div class="empty">No marketplace customer payments yet.</div>';

  $("financePaymentsList").querySelectorAll("[data-payment-action]").forEach(b=>b.onclick=async()=>{
    const status=b.dataset.paymentAction;
    let ref="",note="";
    if(status==="confirmed"){
      ref=prompt("Enter the customer payment transaction/reference.","")||"";
      if(!ref)return;
      if(!confirm("Confirm that you independently verified this payment?"))return;
    }else{
      note=prompt(status==="refunded"?"Add the refund note/reference.":"Add a note for this payment status.","")||"";
      if(!note)return;
    }
    b.disabled=true;
    try{await marketApi({action:"set_payment_status",parent_order_id:b.dataset.parentId,status,payer_reference:ref,note});await reloadMarketplace()}
    catch(err){alert(err.message)}finally{b.disabled=false}
  });

  const payouts=market.payouts||[];
  const stores=new Map((market.stores||[]).map(s=>[s.id,s]));
  $("financePayoutsList").innerHTML=payouts.length?payouts.map(p=>{
    const st=stores.get(p.store_id),actions=[];
    if(isOwner()){
      if(["pending","held"].includes(p.payout_status))actions.push('<button data-payout-status="eligible" data-payout-id="'+p.id+'">Mark eligible</button>');
      if(p.payout_status==="eligible")actions.push('<button data-payout-status="processing" data-payout-id="'+p.id+'">Start payout</button>');
      if(["eligible","processing"].includes(p.payout_status))actions.push('<button class="primary" data-payout-status="paid" data-payout-id="'+p.id+'">Mark paid</button>');
      if(!["paid","cancelled"].includes(p.payout_status))actions.push('<button data-payout-status="held" data-payout-id="'+p.id+'">Hold</button>');
    }
    return '<div class="market-row"><div><b>'+esc(st?.store_name||p.seller_order_ref)+'</b><small>'+esc(p.platform_order_ref||p.seller_order_ref)+' • '+new Date(p.created_at).toLocaleString()+'</small></div><span class="chip '+statusClass(p.payout_status)+'">'+esc(label(p.payout_status))+'</span><div><small>Gross / commission</small><b>'+fmtMoney(p.gross_product_amount)+' / '+Number(p.commission_rate||0).toFixed(2)+'%</b><small>Commission '+fmtMoney(p.commission_amount)+'</small></div><div><small>Seller payout</small><b class="finance-money">'+fmtMoney(p.payout_amount)+'</b><small>'+(p.payout_reference?'Ref '+esc(p.payout_reference):'No payout reference yet')+'</small></div><div class="actions">'+actions.join("")+'</div></div>';
  }).join(""):'<div class="empty">No seller payouts have been created yet. Payouts are created when a customer payment is confirmed.</div>';

  $("financePayoutsList").querySelectorAll("[data-payout-status]").forEach(b=>b.onclick=async()=>{
    const status=b.dataset.payoutStatus;let payout_reference="",note="";
    if(status==="paid"){
      payout_reference=prompt("Enter the seller payout transaction/reference.","")||"";
      if(!payout_reference)return;
      if(!confirm("Confirm this seller payout has actually been sent?"))return;
    }else if(status==="held"){
      note=prompt("Why is this payout being held?","")||"";if(!note)return;
    }
    b.disabled=true;
    try{await marketApi({action:"set_payout_status",id:b.dataset.payoutId,status,payout_reference,note});await reloadMarketplace()}
    catch(err){alert(err.message)}finally{b.disabled=false}
  });
}

function countryOptions(selected="",allowAny=true){
  let html=allowAny?'<option value="">Any country</option>':'<option value="">Choose country</option>';
  html+=countryList.map(c=>'<option value="'+esc(c.code)+'"'+(c.code===selected?' selected':'')+'>'+esc(c.name)+'</option>').join("");
  return html;
}
function clearCountryRuleForm(){
  $("countryRuleId").value="";
  $("ruleStore").value="";
  $("rulePaymentMethod").value="";
  $("ruleSellerCountry").value="";
  $("ruleBuyerCountry").value="";
  $("ruleCommission").value="0";
  $("rulePaymentRate").value="0";
  $("ruleFixedFee").value="0";
  $("ruleFeePayer").value="platform";
  $("ruleSourceKind").value="owner_policy";
  $("ruleSourceName").value="";
  $("ruleSourceUrl").value="";
  $("ruleAutoUpdate").checked=false;
  $("ruleActive").checked=true;
  $("ruleChangeReason").value="";
}
function renderCountryRules(){
  const card=$("countryRulesCard");if(!card)return;
  const status=$("googleCountryStatus");
  status.textContent=googleCountryAvailable?"Google country lookup connected":"Google key not connected";
  status.className="chip "+(googleCountryAvailable?"status-approved":"status-under_review");

  const currentStore=$("ruleStore").value,currentSeller=$("ruleSellerCountry").value,currentBuyer=$("ruleBuyerCountry").value;
  $("ruleStore").innerHTML='<option value="">Any store</option>'+(market.stores||[]).map(s=>'<option value="'+esc(s.id)+'">'+esc(s.store_name)+(s.country_code?' • '+esc(countryMap[s.country_code]||s.country_code):'')+'</option>').join("");
  if(currentStore)$("ruleStore").value=currentStore;
  $("ruleSellerCountry").innerHTML=countryOptions(currentSeller,true);
  $("ruleBuyerCountry").innerHTML=countryOptions(currentBuyer,true);

  const rules=market.country_rules||[],stores=new Map((market.stores||[]).map(s=>[s.id,s]));
  $("countryRulesList").innerHTML=rules.length?rules.map(r=>{
    const store=stores.get(r.store_id);
    const scope=[
      store?store.store_name:"Any store",
      r.seller_country_code?(countryMap[r.seller_country_code]||r.seller_country_code)+" seller":"Any seller country",
      r.buyer_country_code?(countryMap[r.buyer_country_code]||r.buyer_country_code)+" buyer":"Any buyer country",
      r.payment_method||"Any payment method"
    ].join(" → ");
    const source=r.source_name||pretty(r.source_kind||"owner_policy");
    const sync=r.auto_update?(r.last_sync_status||"waiting"):"manual";
    const historical=!!r.effective_to;
    const stateLabel=historical?"Historical":r.active?"Active":"Inactive";
    const stateClass=historical?"":" "+(r.active?"status-approved":"status-paused");
    let actions="";
    if(isOwner()&&!historical){
      actions='<button data-edit-country-rule="'+r.id+'">Create next version</button><button data-toggle-country-rule="'+r.id+'" data-active="'+(!r.active)+'">'+(r.active?"Disable":"Enable")+'</button>';
    }
    const eff='v'+Number(r.rule_version||1)+' • effective '+(r.effective_from?new Date(r.effective_from).toLocaleString():"—")+(r.effective_to?' → '+new Date(r.effective_to).toLocaleString():"");
    const reason=r.change_reason?'<small>Why: '+esc(r.change_reason)+'</small>':'';
    const verified=r.source_verified_at?' • source checked '+new Date(r.source_verified_at).toLocaleString():'';
    return '<div class="market-row"><div><b>'+esc(scope)+'</b><small>'+esc(eff)+'</small><small>Source: '+esc(source)+(r.source_url?' • official URL configured':'')+verified+'</small><small>Sync: '+esc(sync)+(r.last_sync_error?' • '+esc(r.last_sync_error):'')+'</small>'+reason+'</div><span class="chip'+stateClass+'">'+stateLabel+'</span><div><small>Seller commission</small><b>'+Number(r.commission_rate||0).toFixed(2)+'%</b><small>Provider fee '+Number(r.payment_processing_rate||0).toFixed(2)+'% + '+fmtMoney(r.payment_fixed_fee||0)+'</small></div><div><small>Provider fee paid by</small><b>'+esc(pretty(r.payment_fee_payer||"platform"))+'</b><small>'+esc(pretty(r.source_kind||"owner_policy"))+'</small></div><div class="actions">'+actions+'</div></div>';
  }).join(""):'<div class="empty">No finance rules exist yet.</div>';

  $("countryRulesList").querySelectorAll("[data-edit-country-rule]").forEach(b=>b.onclick=()=>{
    const r=rules.find(x=>x.id===b.dataset.editCountryRule);if(!r)return;
    $("countryRuleId").value=r.id;
    $("ruleStore").value=r.store_id||"";
    $("rulePaymentMethod").value=r.payment_method||"";
    $("ruleSellerCountry").value=r.seller_country_code||"";
    $("ruleBuyerCountry").value=r.buyer_country_code||"";
    $("ruleCommission").value=r.commission_rate??0;
    $("rulePaymentRate").value=r.payment_processing_rate??0;
    $("ruleFixedFee").value=r.payment_fixed_fee??0;
    $("ruleFeePayer").value=r.payment_fee_payer||"platform";
    $("ruleSourceKind").value=r.source_kind||"owner_policy";
    $("ruleSourceName").value=r.source_name||"";
    $("ruleSourceUrl").value=r.source_url||"";
    $("ruleAutoUpdate").checked=!!r.auto_update;
    $("ruleActive").checked=r.active!==false;
    $("ruleChangeReason").value="";
    $("ruleChangeReason").placeholder="Required: explain why version "+Number(r.rule_version||1)+" is changing.";
    card.scrollIntoView({behavior:"smooth",block:"start"});
  });
  $("countryRulesList").querySelectorAll("[data-toggle-country-rule]").forEach(b=>b.onclick=async()=>{
    const active=b.dataset.active==="true";
    let reason="";
    if(!active){reason=prompt("Why are you disabling this finance rule? This reason will be kept in the audit history.","")||"";if(!reason)return}
    b.disabled=true;
    try{await marketApi({action:"set_country_rule_active",id:b.dataset.toggleCountryRule,active,reason});await reloadMarketplace()}
    catch(err){alert(err.message)}finally{b.disabled=false}
  });
}
function clearPaymentAccountForm(){
  $("payAccountId").value="";$("payAccountMethod").value="Mobile Money";$("payAccountProvider").value="";$("payAccountName").value="";$("payAccountReference").value="";$("payAccountInstructions").value="";
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


$("saveCountryRule").onclick=async()=>{
  if(!isOwner())return alert("Only the Owner can change country finance rules.");
  const b=$("saveCountryRule");
  if($("countryRuleId").value&&!$("ruleChangeReason").value.trim())return alert("Explain why this rule is changing. The reason will remain in the finance history.");
  b.disabled=true;
  try{
    await marketApi({
      action:"save_country_rule",
      id:$("countryRuleId").value,
      store_id:$("ruleStore").value,
      seller_country_code:$("ruleSellerCountry").value,
      buyer_country_code:$("ruleBuyerCountry").value,
      payment_method:$("rulePaymentMethod").value,
      commission_rate:$("ruleCommission").value,
      required_payment_percent:100,
      payment_processing_rate:$("rulePaymentRate").value,
      payment_fixed_fee:$("ruleFixedFee").value,
      payment_fee_payer:$("ruleFeePayer").value,
      source_kind:$("ruleSourceKind").value,
      source_name:$("ruleSourceName").value,
      source_url:$("ruleSourceUrl").value,
      auto_update:$("ruleAutoUpdate").checked,
      active:$("ruleActive").checked,
      change_reason:$("ruleChangeReason").value.trim()
    });
    clearCountryRuleForm();await reloadMarketplace();alert("Country finance rule saved.");
  }catch(err){alert(err.message)}finally{b.disabled=false}
};
$("clearCountryRule").onclick=clearCountryRuleForm;
$("syncCountryRules").onclick=async()=>{
  if(!isOwner())return alert("Only the Owner can run a rate sync.");
  const b=$("syncCountryRules");b.disabled=true;
  try{
    const res=await fetch(rateSyncEndpoint,{method:"POST",headers:{"Content-Type":"application/json","x-ranova-client":"ranova-site-v1"},body:JSON.stringify({force:true})});
    const out=await res.json().catch(()=>({}));
    if(!res.ok||!out.ok)throw new Error(out.error||"Rate sync failed.");
    await reloadMarketplace();
    const updated=(out.results||[]).filter(x=>x.status==="updated").length;
    const errors=(out.results||[]).filter(x=>x.status==="error").length;
    alert("Rate sync complete. Updated: "+updated+(errors?", errors: "+errors:"")+".");
  }catch(err){alert(err.message)}finally{b.disabled=false}
};
$("saveFinanceSettings").onclick=async()=>{
  if(!isOwner())return alert("Only the Owner can change finance settings.");
  const b=$("saveFinanceSettings");b.disabled=true;
  try{
    await marketApi({action:"save_finance_settings",default_commission_rate:$("financeCommission").value,payout_hold_days:$("financeHoldDays").value,change_reason:$("financeChangeReason").value.trim()});
    $("financeChangeReason").value="";await reloadMarketplace();alert("Finance settings saved.");
  }catch(err){alert(err.message)}finally{b.disabled=false}
};
$("savePaymentAccount").onclick=async()=>{
  if(!isOwner())return alert("Only the Owner can change payment destinations.");
  const b=$("savePaymentAccount");b.disabled=true;
  try{
    await marketApi({
      action:"save_payment_account",
      id:$("payAccountId").value,
      payment_method:$("payAccountMethod").value,
      provider_name:$("payAccountProvider").value,
      account_name:$("payAccountName").value,
      account_reference:$("payAccountReference").value,
      instructions:$("payAccountInstructions").value,
      active:true
    });
    clearPaymentAccountForm();await reloadMarketplace();alert("Payment destination saved.");
  }catch(err){alert(err.message)}finally{b.disabled=false}
};
$("clearPaymentAccount").onclick=clearPaymentAccountForm;
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