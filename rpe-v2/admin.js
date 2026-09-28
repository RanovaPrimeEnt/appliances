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
let selectedSellerChatId=null,sellerChatFilter="";

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
  renderSellerMessageCentre();
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
      <div class="card" style="box-shadow:none">
        <div class="card-head"><div><h2>Verification documents</h2><small style="display:block;color:var(--rpe-muted);margin-top:4px">Review the actual file before approving a stage. Required: business proof, authorized representative ID and fulfilment evidence.</small></div></div>
        <div class="body">
          <div class="detail-copy" style="margin-bottom:10px"><b style="color:var(--rpe-ink)">Required-document check</b><br>
            Business proof: <b>${docs.some(f=>f.document_type==="business_registration")?"Submitted":"Missing"}</b> ·
            Identity ID: <b>${docs.some(f=>f.document_type==="identity_document")?"Submitted":"Missing"}</b> ·
            Fulfilment evidence: <b>${docs.some(f=>f.document_type==="fulfilment_evidence")?"Submitted":"Missing"}</b>
          </div>
          <div class="docs">${docs.length?docs.map(f=>`<div class="doc-row"><div><b>${esc(label(f.document_type))}</b><small>${esc(f.original_filename||"Document")} • Submitted ${esc(f.created_at?new Date(f.created_at).toLocaleString():"—")} • <b>${esc(label(f.review_status))}</b>${f.review_note?" • "+esc(f.review_note):""}</small></div><div class="actions"><button data-doc-view="${f.id}">Open document</button><button data-doc-action="approved" data-doc-id="${f.id}" class="primary">Approve document</button><button data-doc-action="needs_information" data-doc-id="${f.id}">Request clearer info</button><button data-doc-action="rejected" data-doc-id="${f.id}">Reject</button></div></div>`).join(""):'<div class="empty">No verification documents submitted yet.</div>'}</div>
        </div>
      </div>
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
      if((market.payment_provider||{}).configured)actions.push('<button class="primary" data-provider-refund="'+r.id+'">Refund through Paystack</button>');
      else actions.push('<button class="primary" data-refund-action="refunded" data-refund-id="'+r.id+'">Record verified manual refund</button>');
    }
    if(r.status==="processing"&&canFinance()&&!(r.provider==="paystack"))actions.push('<button class="primary" data-refund-action="refunded" data-refund-id="'+r.id+'">Record refunded</button>');
    return '<div class="market-row"><div><b>'+esc(r.refund_ref)+'</b><small>'+esc(pretty(r.reason_category))+' • '+esc(r.reason_detail)+'</small>'+(r.admin_note?'<small>RANOVA: '+esc(r.admin_note)+'</small>':'')+'</div><span class="chip '+statusClass(r.status)+'">'+esc(label(r.status))+'</span><div><small>Requested</small><b>'+fmtMoney(r.requested_amount)+'</b><small>'+(r.approved_amount!=null?'Approved '+fmtMoney(r.approved_amount):'Not approved yet')+'</small></div><div><small>Requested</small><b>'+new Date(r.requested_at).toLocaleString()+'</b>'+(r.refund_reference?'<small>Refund ref '+esc(r.refund_reference)+'</small>':'')+'</div><div class="actions">'+actions.join("")+'</div></div>';
  }).join(""):'<div class="empty">No marketplace refund cases yet.</div>';

  rHost.querySelectorAll("[data-provider-refund]").forEach(b=>b.onclick=async()=>{
    const r=refunds.find(x=>x.id===b.dataset.providerRefund);if(!r)return;
    if(!confirm("Send the approved refund "+fmtMoney(r.approved_amount??r.requested_amount)+" back through the original Paystack transaction?"))return;
    b.disabled=true;
    try{await marketApi({action:"process_provider_refund",id:r.id});await reloadMarketplace()}
    catch(err){alert(err.message)}finally{b.disabled=false}
  });
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
  const provider=market.payment_provider||{configured:false,mode:"not_configured",name:"Paystack"};
  $("fProviderStatus").textContent=provider.configured?(provider.name+" · "+pretty(provider.mode)):"Not configured";
  $("fProviderStatus").style.color=provider.configured?"var(--rpe-green-700)":"#9a5c14";
  $("providerFinanceNotice").querySelector(".notice").innerHTML=provider.configured
    ?'<b>Protected settlement active:</b> '+esc(provider.name)+' is connected in '+esc(pretty(provider.mode))+' mode. Online customer payments are verified server-side; supplier payout remains pending until all release conditions pass.'
    :'<b>Protected settlement ready, provider not connected:</b> live online payment and automated supplier transfer are disabled until the Paystack secret is added to Supabase. Manual corporate-account confirmation remains auditable.';

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
      if(p.payout_status==="eligible"&&provider.configured)actions.push('<button class="primary" data-provider-payout="'+p.id+'">Pay seller securely</button>');
      if(p.payout_status==="eligible"&&!provider.configured)actions.push('<button class="primary" data-payout-status="paid" data-payout-id="'+p.id+'">Record verified manual payout</button>');
      if(!["paid","cancelled","processing"].includes(p.payout_status))actions.push('<button data-payout-status="held" data-payout-id="'+p.id+'">Hold</button>');
    }
    const providerLine=p.provider?'<small>'+esc(pretty(p.provider))+(p.provider_status?' · '+esc(pretty(p.provider_status)):'')+(p.provider_transfer_code?' · transfer '+esc(p.provider_transfer_code):'')+'</small>':'';
    return '<div class="market-row"><div><b>'+esc(st?.store_name||p.seller_order_ref)+'</b><small>'+esc(p.platform_order_ref||p.seller_order_ref)+' • '+new Date(p.created_at).toLocaleString()+'</small></div><span class="chip '+statusClass(p.payout_status)+'">'+esc(label(p.payout_status))+'</span><div><small>Gross / commission</small><b>'+fmtMoney(p.gross_product_amount)+' / '+Number(p.commission_rate||0).toFixed(2)+'%</b><small>Commission '+fmtMoney(p.commission_amount)+'</small></div><div><small>Seller payout</small><b class="finance-money">'+fmtMoney(p.payout_amount)+'</b><small>'+(p.payout_reference?'Ref '+esc(p.payout_reference):'Awaiting payout')+'</small>'+providerLine+'</div><div class="actions">'+actions.join("")+'</div></div>';
  }).join(""):'<div class="empty">No seller payouts have been created yet. Payouts are created when a customer payment is confirmed.</div>';

  $("financePayoutsList").querySelectorAll("[data-provider-payout]").forEach(b=>b.onclick=async()=>{
    const p=payouts.find(x=>x.id===b.dataset.providerPayout);if(!p)return;
    if(!confirm("Release "+fmtMoney(p.payout_amount)+" to this verified seller payout destination? RANOVA will re-check all buyer-protection conditions before sending."))return;
    b.disabled=true;
    try{await marketApi({action:"initiate_provider_payout",id:p.id});await reloadMarketplace()}
    catch(err){alert(err.message)}finally{b.disabled=false}
  });
  $("financePayoutsList").querySelectorAll("[data-payout-status]").forEach(b=>b.onclick=async()=>{
    const status=b.dataset.payoutStatus;let payout_reference="",note="";
    if(status==="paid"){
      payout_reference=prompt("Enter the independently verified corporate-bank payout transaction/reference.","")||"";
      if(!payout_reference)return;
      if(!confirm("Confirm this eligible seller payout has actually been sent from the approved RANOVA account?"))return;
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

  ["commissionSellerCountry","commissionBuyerCountry"].forEach(id=>{if(!$(id))return;const current=$(id).value||"GH";$(id).innerHTML=countryOptions(current,false);$(id).value=current;});
  if($("suggestCommission"))$("suggestCommission").hidden=!isOwner();
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

function storeControlButton(store,status,labelText,color,current,disabled=false){
  const active=store&&store.store_status===status;
  const opacity=active?1:.32;
  const shadow=active?"0 0 0 4px "+color+"26,0 6px 16px "+color+"45":"none";
  const cursor=disabled?"not-allowed":"pointer";
  const title=status==="suspended"?"Terminate / remove from customer marketplace":status==="paused"?"Temporary stop / investigation":"Approved / active selling";
  return '<button type="button" data-store-control="'+status+'" data-store-id="'+(store?.id||"")+'" title="'+title+'" '+(disabled?"disabled":"")+' style="min-height:40px;border:0;border-radius:12px;padding:8px 10px;background:'+color+';color:#fff;font-weight:950;font-size:11px;opacity:'+opacity+';box-shadow:'+shadow+';cursor:'+cursor+'">'+labelText+'</button>';
}
function ensureStoreRegistryModal(){
  let modal=document.getElementById("storeRegistryModal");
  if(modal)return modal;
  modal=document.createElement("div");
  modal.id="storeRegistryModal";
  modal.style.cssText="display:none;position:fixed;inset:0;z-index:250;background:rgba(4,20,17,.68);padding:18px;overflow:auto";
  modal.innerHTML='<div id="storeRegistryCard" style="width:min(980px,100%);margin:30px auto;background:#fff;border-radius:22px;box-shadow:0 24px 80px rgba(0,0,0,.28);overflow:hidden"></div>';
  modal.addEventListener("click",e=>{if(e.target===modal)modal.style.display="none"});
  document.body.appendChild(modal);
  return modal;
}
function openStoreRegistryDetail(ref){
  const app=(market.applications||[]).find(a=>a.application_ref===ref);
  const store=(market.stores||[]).find(x=>x.application_ref===ref);
  if(!app&&!store)return;
  const sellerId=store?.seller_id||app?.linked_user_id||null;
  const docs=(market.files||[]).filter(x=>x.application_ref===ref);
  const products=store?(market.products||[]).filter(x=>x.store_id===store.id):[];
  const orders=store?(market.seller_orders||[]).filter(x=>x.store_id===store.id):[];
  const reports=store?(market.safety_reports||[]).filter(x=>x.store_id===store.id):[];
  const flags=store?(market.risk_flags||[]).filter(x=>x.store_id===store.id):[];
  const reviews=store?(market.reviews||[]).filter(x=>x.store_id===store.id):[];
  const enforcement=store?(market.enforcement||[]).find(x=>x.store_id===store.id):null;
  const performance=store?(market.performance||[]).find(x=>x.store_id===store.id):null;
  const evidence=reports.flatMap(r=>(market.report_evidence||[]).filter(e=>e.report_id===r.id).map(e=>({...e,report_ref:r.report_ref})));
  const cases=store?(market.store_cases||[]).filter(x=>x.store_id===store.id):[];
  const thread=store?(market.admin_seller_threads||[]).find(x=>x.store_id===store.id):null;
  const officialMessages=thread?(market.admin_seller_messages||[]).filter(x=>x.thread_id===thread.id):[];
  const modal=ensureStoreRegistryModal(),card=document.getElementById("storeRegistryCard");
  const storeStatus=store?.store_status||"not_created";
  const sellerStatus=app?appStatus(app):"unknown";
  const docRows=docs.length?docs.map(d=>'<div style="padding:9px 0;border-bottom:1px solid #edf1ef"><b>'+esc(label(d.document_type))+'</b><div style="color:#708079;font-size:12px">'+esc(d.original_filename||"Document")+' · '+esc(label(d.review_status))+(d.review_note?' · '+esc(d.review_note):'')+'</div></div>').join(""):'<div style="color:#7a8983">No verification files.</div>';
  const productRows=products.length?products.slice(0,8).map(p=>'<div style="padding:8px 0;border-bottom:1px solid #edf1ef"><b>'+esc(p.name)+'</b><div style="font-size:12px;color:#708079">'+esc(label(p.product_status))+' · '+esc(p.stock_status||"")+(p.price!=null?' · GHS '+Number(p.price).toFixed(2):'')+'</div></div>').join(""):'<div style="color:#7a8983">No products yet.</div>';
  const reportRows=reports.length?reports.map(r=>{
    const ev=(market.report_evidence||[]).filter(e=>e.report_id===r.id);
    const evButtons=ev.length?ev.map(e=>'<button data-report-evidence="'+e.id+'" style="margin:5px 5px 0 0;border:1px solid #d8e3df;background:#fff;border-radius:9px;padding:6px 8px;font-weight:800">View '+esc(e.original_filename||"evidence")+'</button>').join(""):'<span style="display:block;margin-top:5px;color:#87938e">No evidence uploaded</span>';
    return '<div style="padding:12px;border:1px solid #e2e9e6;border-radius:12px;margin-bottom:9px">'+
      '<div style="display:flex;justify-content:space-between;gap:10px;align-items:start"><div><b>'+esc(r.report_ref)+' · '+esc(label(r.category))+'</b><small style="display:block;color:#718078">'+new Date(r.created_at).toLocaleString()+' · '+esc(label(r.severity||"medium"))+'</small></div><span class="chip '+statusClass(r.status)+'">'+esc(label(r.status))+'</span></div>'+
      '<p style="font-size:13px;line-height:1.55;margin:8px 0">'+esc(r.description||"")+'</p>'+
      '<div>'+evButtons+'</div>'+
      '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:9px">'+
        '<button data-report-status="under_review" data-report-id="'+r.id+'">Investigate</button>'+
        '<button data-report-status="awaiting_seller" data-report-id="'+r.id+'">Request seller response</button>'+
        '<button data-report-status="awaiting_customer" data-report-id="'+r.id+'">Request customer info</button>'+
        '<button data-report-status="resolved" data-report-id="'+r.id+'">Resolve</button>'+
        '<button data-report-status="dismissed" data-report-id="'+r.id+'">Dismiss</button>'+
      '</div></div>';
  }).join(""):'<div style="color:#7a8983">No customer reports for this store.</div>';
  const messageRows=officialMessages.length?officialMessages.map(m=>'<div style="padding:9px 11px;border-radius:12px;margin:7px 0;background:'+(m.sender_role==="admin"?"#edf7f3":"#fff2ec")+'"><b>'+(m.sender_role==="admin"?"RANOVA Admin":"Seller")+'</b><div style="margin-top:3px">'+esc(m.body)+'</div><small style="color:#718078">'+new Date(m.created_at).toLocaleString()+'</small></div>').join(""):'<div style="color:#7a8983">No official Admin ↔ Seller messages yet.</div>';
  card.innerHTML=
    '<div style="padding:20px 22px;background:#123d34;color:#fff;display:flex;justify-content:space-between;gap:12px;align-items:flex-start">'+
      '<div><div style="font-size:12px;opacity:.75">SELLER DATABASE RECORD</div><h2 style="margin:4px 0 5px;font-size:25px">'+esc(store?.store_name||app?.business_name||"Seller")+'</h2><div style="font-size:13px;opacity:.86">'+esc(ref||"")+'</div></div>'+
      '<button id="closeStoreRegistryModal" style="border:0;background:#ffffff22;color:#fff;border-radius:50%;width:38px;height:38px;font-size:22px;cursor:pointer">×</button>'+
    '</div>'+
    '<div style="padding:20px 22px">'+
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px;margin-bottom:16px">'+
        '<div class="detail-copy"><small>Store status</small><br><b>'+esc(label(storeStatus))+'</b></div>'+
        '<div class="detail-copy"><small>Seller verification</small><br><b>'+esc(label(sellerStatus))+'</b></div>'+
        '<div class="detail-copy"><small>Reports / risk</small><br><b>'+reports.length+' report(s) · '+flags.length+' risk flag(s)</b></div>'+
        '<div class="detail-copy"><small>Products / orders</small><br><b>'+products.length+' product(s) · '+orders.length+' order(s)</b></div>'+
      '</div>'+
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:14px">'+
        '<div class="card" style="box-shadow:none;margin:0"><div class="card-head"><h2>Application & business</h2></div><div class="body" style="font-size:13px;line-height:1.65">'+
          '<b>Business name:</b> '+esc(app?.business_name||store?.store_name||"—")+'<br>'+
          '<b>Location:</b> '+esc(store?.business_location||app?.business_location||"—")+'<br>'+
          '<b>Seller type:</b> '+esc(app?.supplier_type||"—")+'<br>'+
          '<b>Contact:</b> '+esc(app?.contact_person||"—")+'<br>'+
          '<b>Phone:</b> '+esc(app?.phone||store?.public_phone||"—")+'<br>'+
          '<b>Email:</b> '+esc(app?.email||store?.public_email||"—")+'<br>'+
          '<b>Categories:</b> '+esc(app?.categories||"—")+'<br>'+
          '<b>Years in business:</b> '+esc(app?.years_in_business==null?"—":app.years_in_business)+'<br>'+
          '<b>Registered:</b> '+(app?.has_business_registration?"Yes":"No / not declared")+'<br>'+
          '<b>Registration no.:</b> '+esc(app?.registration_number||"—")+'<br>'+
          '<b>Preferred fulfilment:</b> '+esc(app?.preferred_fulfilment||"—")+'<br>'+
          '<b>Business details:</b><br>'+esc(app?.business_details||store?.description||"—")+
        '</div></div>'+
        '<div class="card" style="box-shadow:none;margin:0"><div class="card-head"><h2>Store profile</h2></div><div class="body" style="font-size:13px;line-height:1.65">'+
          '<b>Store name:</b> '+esc(store?.store_name||"Not created yet")+'<br>'+
          '<b>Country:</b> '+esc(store?.country_name||store?.country_code||"—")+'<br>'+
          '<b>Public phone:</b> '+esc(store?.public_phone||"—")+'<br>'+
          '<b>Public email:</b> '+esc(store?.public_email||"—")+'<br>'+
          '<b>Tagline:</b> '+esc(store?.tagline||"—")+'<br>'+
          '<b>Fulfilment:</b> '+esc(store?.fulfilment_summary||"—")+'<br>'+
          '<b>Returns:</b> '+esc(store?.return_policy_summary||"—")+'<br>'+
          '<b>Minimum order:</b> '+esc(store?.minimum_order_note||"—")+'<br>'+
          '<b>Admin note:</b> '+esc(store?.moderation_note||"—")+
        '</div></div>'+
        '<div class="card" style="box-shadow:none;margin:0"><div class="card-head"><h2>Verification files</h2></div><div class="body">'+docRows+'</div></div>'+
        '<div class="card" style="box-shadow:none;margin:0"><div class="card-head"><h2>Products</h2></div><div class="body">'+productRows+(products.length>8?'<div style="padding-top:8px;color:#718078;font-size:12px">+'+(products.length-8)+' more product(s)</div>':'')+'</div></div>'+
        '<div class="card" style="box-shadow:none;margin:0"><div class="card-head"><h2>Trust & reports</h2></div><div class="body" style="font-size:13px;line-height:1.65">'+
          '<b>Published reviews:</b> '+reviews.filter(r=>r.moderation_status==="published").length+'<br>'+
          '<b>Performance level:</b> '+esc(label(performance?.performance_level||"not_available"))+'<br>'+
          '<b>Fulfilment score:</b> '+esc(performance?.fulfillment_score==null?"—":Number(performance.fulfillment_score).toFixed(0)+"/100")+'<br>'+
          '<b>Open safety reports:</b> '+reports.filter(r=>["open","under_review"].includes(r.status)).length+'<br>'+
          '<b>Open risk flags:</b> '+flags.filter(r=>["open","under_review"].includes(r.status)).length+'<br>'+
          '<b>Enforcement:</b> '+esc(label(enforcement?.enforcement_status||"good_standing"))+'<br>'+
          '<b>Reason:</b> '+esc(enforcement?.reason_detail||store?.moderation_note||"—")+
        '</div></div>'+
        '<div class="card" style="box-shadow:none;margin:0;grid-column:1/-1"><div class="card-head"><h2>Customer reports & evidence</h2></div><div class="body">'+reportRows+'</div></div>'+
        '<div class="card" style="box-shadow:none;margin:0;grid-column:1/-1"><div class="card-head"><h2>Official Admin ↔ Seller messages</h2></div><div class="body">'+messageRows+
          (store?'<textarea id="adminSellerMessage" class="review-note" style="margin-top:12px" placeholder="Write an official message to this seller…"></textarea><button id="sendAdminSellerMessage" class="primary" style="margin-top:8px;border:0;border-radius:10px;padding:10px 13px">Send official message</button>':'<div class="empty">Store must be created before official messaging is available.</div>')+
        '</div></div>'+
        '<div class=\"card\" style=\"box-shadow:none;margin:0\"><div class=\"card-head\"><h2>Control meaning</h2></div><div class=\"body\" style=\"font-size:13px;line-height:1.65\">'+
          '<b style="color:#c3262e">Red · Terminated</b><br>Removes the store and its products from customer-facing marketplace views. Records remain for audit and possible restoration.<br><br>'+
          '<b style="color:#9a7200">Yellow · Under investigation</b><br>Temporarily removes the store from customers while RANOVA investigates. Seller cannot republish it.<br><br>'+
          '<b style="color:#0d7a45">Green · Approved / Active</b><br>Restores selling and makes eligible active products visible to customers again.'+
        '</div></div>'+
      '</div>'+
    '</div>';
  modal.style.display="block";
  card.querySelectorAll("[data-report-evidence]").forEach(b=>b.onclick=async()=>{
    const win=window.open("about:blank","_blank");
    try{const out=await marketApi({action:"report_evidence_url",id:b.dataset.reportEvidence});if(win)win.location.href=out.url;else location.href=out.url}
    catch(err){if(win)win.close();alert(err.message)}
  });
  card.querySelectorAll("[data-report-status]").forEach(b=>b.onclick=async()=>{
    const status=b.dataset.reportStatus;
    let note="";
    if(["awaiting_seller","awaiting_customer","resolved","dismissed"].includes(status)){
      note=prompt("Add the review note that will be kept with this report:","")||"";
      if(!note.trim())return;
    }
    b.disabled=true;
    try{await marketApi({action:"set_store_report_status",id:b.dataset.reportId,status,note});await reloadMarketplace();openStoreRegistryDetail(ref)}
    catch(err){alert(err.message)}finally{b.disabled=false}
  });
  const sendOfficial=document.getElementById("sendAdminSellerMessage");
  if(sendOfficial)sendOfficial.onclick=async()=>{
    const box=document.getElementById("adminSellerMessage"),body=box.value.trim();
    if(body.length<2)return alert("Write a message first.");
    sendOfficial.disabled=true;
    try{await marketApi({action:"message_seller",store_id:store.id,body});await reloadMarketplace();openStoreRegistryDetail(ref)}
    catch(err){alert(err.message)}finally{sendOfficial.disabled=false}
  };
  document.getElementById("closeStoreRegistryModal").onclick=()=>modal.style.display="none";
}
function renderSellerMessageCentre(){
  const host=$("sellerMessageCentre");if(!host)return;
  if(!canSellerReview()){host.innerHTML='<div class="empty">Your admin role does not include seller messaging.</div>';return}
  if(selectedSellerChatId&&!(market.stores||[]).some(s=>s.id===selectedSellerChatId))selectedSellerChatId=null;
  host.classList.toggle("chat-open",!!selectedSellerChatId);
  host.innerHTML='<div class="seller-inbox"><div class="seller-inbox-head"><div class="seller-inbox-title"><h1>Seller messages</h1><button id="refreshSellerMessages" class="seller-refresh" type="button">Refresh</button></div><p>Official conversations with RANOVA stores</p><input id="sellerMessageSearch" class="seller-search" type="search" aria-label="Search seller conversations" placeholder="Search stores" value="'+esc(sellerChatFilter)+'"></div><div id="sellerConversationList" class="seller-conversation-list"></div></div><div id="sellerChatDetail" class="seller-chat"></div>';
  $("sellerMessageSearch").oninput=e=>{sellerChatFilter=e.target.value;renderSellerConversationList()};
  $("refreshSellerMessages").onclick=async e=>{const b=e.currentTarget;b.disabled=true;b.textContent="Refreshing…";try{await reloadMarketplace()}catch(err){b.textContent="Try again";b.disabled=false;alert(err.message||"Could not refresh messages.")}};
  renderSellerConversationList();renderSellerChatDetail(selectedSellerChatId);
}
function sellerChatMessages(store){
  const thread=(market.admin_seller_threads||[]).find(t=>t.store_id===store.id);
  return thread?(market.admin_seller_messages||[]).filter(m=>m.thread_id===thread.id).sort((a,b)=>new Date(a.created_at)-new Date(b.created_at)):[];
}
function sellerChatTime(value){const d=new Date(value);return Number.isNaN(d.getTime())?"":d.toLocaleTimeString([],{hour:"numeric",minute:"2-digit"})}
function sellerChatDate(value){const d=new Date(value);return Number.isNaN(d.getTime())?"":d.toLocaleDateString([],{year:"numeric",month:"short",day:"numeric"})}
function sellerChatReadKey(){return "ranova-admin-seller-read-"+(user?.id||"unknown")}
function sellerChatRead(){try{return JSON.parse(localStorage.getItem(sellerChatReadKey())||"{}")||{}}catch(e){return {}}}
function markSellerChatRead(storeId,messages){
  const latest=messages.filter(m=>m.sender_role==="seller").at(-1);if(!latest)return;
  const read=sellerChatRead(),stamp=Date.parse(latest.created_at)||0;
  if(stamp>Number(read[storeId]||0)){read[storeId]=stamp;try{localStorage.setItem(sellerChatReadKey(),JSON.stringify(read))}catch(e){}}
}
function sellerInitials(name){return String(name||"S").trim().split(/\s+/).slice(0,2).map(x=>x.charAt(0)).join("").toUpperCase()}
function sellerAvatar(store){
  const logo=String(store.logo_url||"");let safe="";
  try{const url=new URL(logo,location.href);if(logo&&["https:","http:"].includes(url.protocol))safe=url.href}catch(e){}
  return '<span class="seller-avatar" aria-hidden="true">'+esc(sellerInitials(store.store_name))+(safe?'<img src="'+esc(safe)+'" alt="" loading="lazy">':'')+'</span>';
}
function renderSellerConversationList(){
  const list=$("sellerConversationList");if(!list)return;
  const query=sellerChatFilter.trim().toLowerCase(),read=sellerChatRead();
  const stores=(market.stores||[]).filter(s=>!query||[s.store_name,s.business_location,s.application_ref].some(x=>String(x||"").toLowerCase().includes(query))).map(store=>{
    const messages=sellerChatMessages(store),last=messages.at(-1);
    const unread=messages.filter(m=>m.sender_role==="seller"&&(Date.parse(m.created_at)||0)>Number(read[store.id]||0)).length;
    return {store,last,unread};
  }).sort((a,b)=>(Date.parse(b.last?.created_at)||0)-(Date.parse(a.last?.created_at)||0)||String(a.store.store_name).localeCompare(String(b.store.store_name)));
  list.innerHTML=stores.length?stores.map(({store,last,unread})=>'<button type="button" class="seller-conversation'+(selectedSellerChatId===store.id?' active':'')+'" data-open-seller-chat="'+esc(store.id)+'" aria-label="Open conversation with '+esc(store.store_name)+(unread?', '+unread+' new on this device':'')+'">'+sellerAvatar(store)+'<span class="seller-conversation-main"><span class="seller-conversation-top"><strong>'+esc(store.store_name)+'</strong><time>'+esc(last?sellerChatTime(last.created_at):"")+'</time></span><span class="seller-conversation-bottom"><span>'+esc(last?(last.sender_role==="admin"?"You: ":"")+String(last.body||"").replace(/\s+/g," "):"Start an official conversation")+'</span>'+(unread?'<span class="seller-unread" title="New since opened on this device">'+unread+'</span>':'')+'</span></span></button>').join(""):'<div class="seller-list-empty">'+(query?'No stores match your search.':'No seller stores available yet.')+'</div>';
  list.querySelectorAll("[data-open-seller-chat]").forEach(b=>b.onclick=()=>{selectedSellerChatId=b.dataset.openSellerChat;renderSellerChatDetail(selectedSellerChatId);renderSellerConversationList();$("sellerMessageCentre").classList.add("chat-open")});
}
function renderSellerChatDetail(storeId){
  const box=$("sellerChatDetail");if(!box)return;
  const store=(market.stores||[]).find(s=>s.id===storeId);
  if(!store){box.innerHTML='<div class="seller-chat-placeholder">Select a store to read its official conversation.</div>';return}
  const messages=sellerChatMessages(store);markSellerChatRead(store.id,messages);
  let previousDay="";
  const bubbles=messages.map(m=>{
    const day=sellerChatDate(m.created_at),date=day&&day!==previousDay?'<div class="seller-chat-day">'+esc(day)+'</div>':'';previousDay=day;
    return date+'<div class="seller-chat-bubble '+(m.sender_role==="admin"?"outgoing":"incoming")+'"><p>'+esc(m.body)+'</p><time datetime="'+esc(m.created_at)+'">'+esc(sellerChatTime(m.created_at))+'</time></div>';
  }).join("");
  box.innerHTML='<header class="seller-chat-header"><button id="sellerChatBack" class="seller-chat-back" type="button" aria-label="Back to conversations">‹</button>'+sellerAvatar(store)+'<div class="seller-chat-heading"><strong>'+esc(store.store_name)+'</strong><small>Official RANOVA conversation · '+esc(label(store.store_status))+'</small></div></header><div id="sellerChatMessages" class="seller-chat-messages" aria-label="Messages with '+esc(store.store_name)+'">'+(bubbles||'<div class="seller-chat-intro"><b>No messages yet</b>Send the first official message to this store.</div>')+'</div><div id="sellerChatError" class="seller-chat-error" role="alert"></div><div class="seller-chat-composer"><textarea id="sellerChatInput" rows="1" aria-label="Message '+esc(store.store_name)+'" placeholder="Message '+esc(store.store_name)+'…"></textarea><button id="sellerChatSend" type="button">Send</button></div>';
  $("sellerChatMessages").scrollTop=$("sellerChatMessages").scrollHeight;
  $("sellerChatBack").onclick=()=>{selectedSellerChatId=null;$("sellerMessageCentre").classList.remove("chat-open");renderSellerConversationList();$("sellerMessageSearch").focus()};
  const send=async()=>{
    const input=$("sellerChatInput"),body=input.value.trim();if(body.length<2){input.focus();return}
    const button=$("sellerChatSend");button.disabled=true;$("sellerChatError").classList.remove("show");
    try{await marketApi({action:"message_seller",store_id:store.id,body});await reloadMarketplace()}
    catch(err){const error=$("sellerChatError");if(error){error.textContent=err.message||"Could not send the message. Please try again.";error.classList.add("show");button.disabled=false}}
  };
  $("sellerChatSend").onclick=send;
  $("sellerChatInput").onkeydown=e=>{if(e.key==="Enter"&&!e.shiftKey){e.preventDefault();send()}};
  renderSellerConversationList();
}

function renderSellerStores(){
  const host=$("sellerStoresList");if(!host)return;
  if(!canSellerReview()){host.innerHTML='<div class="empty">Your admin role does not include seller store management.</div>';return}

  const storesByRef=new Map((market.stores||[]).map(s=>[s.application_ref,s]));
  const storeOnly=(market.stores||[]).filter(s=>!(market.applications||[]).some(a=>a.application_ref===s.application_ref)).map(s=>({application_ref:s.application_ref,business_name:s.store_name,business_location:s.business_location,verification_status:"unknown"}));
  const records=[...(market.applications||[]),...storeOnly];
  const reportsByStore=new Map();
  (market.safety_reports||[]).forEach(r=>{if(r.store_id)reportsByStore.set(r.store_id,(reportsByStore.get(r.store_id)||0)+1)});
  const riskByStore=new Map();
  (market.risk_flags||[]).forEach(r=>{if(r.store_id&&["open","under_review"].includes(r.status))riskByStore.set(r.store_id,(riskByStore.get(r.store_id)||0)+1)});

  if(!records.length){host.innerHTML='<div class="empty">No seller applications or stores yet.</div>';return}
  host.innerHTML=
    '<div style="overflow:auto;border:1px solid #e1e8e5;border-radius:16px">'+
      '<div style="min-width:850px">'+
        '<div style="display:grid;grid-template-columns:1.3fr 1fr .55fr 1.7fr;gap:10px;padding:11px 13px;background:#f4f7f6;border-bottom:1px solid #e1e8e5;font-size:11px;font-weight:950;text-transform:uppercase;color:#667871">'+
          '<div>Name</div><div>Location</div><div>Reports</div><div>Store control</div>'+
        '</div>'+
        records.map(a=>{
          const store=storesByRef.get(a.application_ref);
          const st=store?.store_status||"not_created";
          const approved=appStatus(a)==="approved";
          const storeReports=store?(market.safety_reports||[]).filter(r=>r.store_id===store.id):[];
          const reportCount=storeReports.length;
          const reportKinds=[...new Set(storeReports.map(r=>label(r.category)))].slice(0,2);
          const riskCount=store?(riskByStore.get(store.id)||0):0;
          const disabled=!store||(!approved&&st!=="active");
          return '<div data-store-record="'+esc(a.application_ref)+'" style="display:grid;grid-template-columns:1.3fr 1fr .55fr 1.7fr;gap:10px;align-items:center;padding:13px;border-bottom:1px solid #edf1ef;cursor:pointer;background:#fff">'+
            '<div><b style="font-size:14px">'+esc(store?.store_name||a.business_name||"Seller")+'</b><small style="display:block;margin-top:4px;color:#708079">'+esc(a.application_ref||"")+' · '+esc(label(st))+'</small></div>'+
            '<div><b>'+esc(store?.business_location||a.business_location||"—")+'</b><small style="display:block;margin-top:4px;color:#708079">'+esc(store?.country_name||store?.country_code||"")+'</small></div>'+
            '<div><b>'+reportCount+' report'+(reportCount===1?"":"s")+'</b><small style="display:block;color:#708079">'+(reportKinds.length?esc(reportKinds.join(", ")):"No reports")+(riskCount?" · "+riskCount+" risk":"")+'</small></div>'+
            '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:7px">'+
              storeControlButton(store,"suspended","Red","#c62828",st==="suspended",!store)+
              storeControlButton(store,"paused","Yellow","#d19a00",st==="paused",!store)+
              storeControlButton(store,"active","Green","#16824b",st==="active",disabled)+
            '</div>'+
          '</div>';
        }).join("")+
      '</div>'+
    '</div>'+
    '<div style="margin-top:10px;color:#708079;font-size:12px">Click any seller row to open the complete database record. Status controls are audit logged; seller/application data is preserved even when a store is removed from customer view.</div>';

  host.querySelectorAll("[data-store-record]").forEach(row=>row.onclick=e=>{
    if(e.target.closest("[data-store-control]"))return;
    openStoreRegistryDetail(row.dataset.storeRecord);
  });
  host.querySelectorAll("[data-store-control]").forEach(b=>b.onclick=async e=>{
    e.stopPropagation();
    if(b.disabled||!b.dataset.storeId)return;
    const status=b.dataset.storeControl;
    let note="";
    if(status==="paused"){
      note=prompt("Reason for temporary investigation / yellow status:","")||"";
      if(!note.trim())return;
      if(!confirm("Place this store under investigation? It will disappear from the customer marketplace until Green is selected."))return;
    }else if(status==="suspended"){
      note=prompt("Reason for terminating / red status:","")||"";
      if(!note.trim())return;
      if(!confirm("Terminate this store from the customer marketplace? Its database, order history and products will be preserved for audit and possible restoration."))return;
    }else{
      note=prompt("Optional restoration/approval note:","Restored to approved selling status by RANOVA Admin.")||"Restored to approved selling status by RANOVA Admin.";
      if(!confirm("Approve / restore this store? Eligible active products will become visible to customers again."))return;
    }
    b.disabled=true;
    try{
      await marketApi({action:"set_store_status",id:b.dataset.storeId,status,note});
      await reloadMarketplace();
    }catch(err){alert(err.message)}finally{b.disabled=false}
  });
}



if($("suggestCommission")&&$("previewCommission")){
$("suggestCommission").onclick=()=>{
  if(!isOwner())return;
  clearCountryRuleForm();
  $("ruleSellerCountry").value="GH";$("ruleBuyerCountry").value="GH";
  $("ruleCommission").value="8.5";$("ruleSourceName").value="RANOVA Ghana commission example";
  $("ruleChangeReason").value="8.5% product-only Ghana commission approved by the owner on 2026-09-28. This form is an unsaved example.";
  $("ruleActive").checked=false;$("commissionMode").value="draft";
  $("commissionSellerCountry").value="GH";$("commissionBuyerCountry").value="GH";
  $("commissionPreviewStatus").textContent="8.5% example loaded for preview. The active Ghana policy is already 8.5%; this form does not change it. Enter a verified provider fee to estimate net earnings.";
  $("commissionPreviewResult").replaceChildren();
};
$("previewCommission").onclick=async()=>{
  const button=$("previewCommission");button.disabled=true;$("commissionPreviewResult").replaceChildren();
  $("commissionPreviewStatus").textContent="Calculating…";
  try{
    const draft=$("commissionMode").value==="draft";
    const result=await marketApi({action:"preview_commission",preview_draft:draft,
      store_id:$("ruleStore").value,seller_country_code:$("commissionSellerCountry").value,buyer_country_code:$("commissionBuyerCountry").value,
      currency:$("commissionCurrency").value,payment_method:$("commissionMethod").value,
      subtotal:$("commissionSubtotal").value,delivery_fee:$("commissionDelivery").value,
      commission_rate:$("ruleCommission").value,payment_processing_rate:$("rulePaymentRate").value,
      payment_fixed_fee:$("ruleFixedFee").value,payment_fee_payer:$("ruleFeePayer").value});
    const x=result.breakdown;
    $("commissionPreviewStatus").textContent=(result.draft?"Unsaved proposal":"Active policy")+" · "+result.rule_source+" · "+x.currency;
    const rows=[["Product subtotal",x.product_subtotal],["Delivery (no commission)",x.delivery_fee],["RANOVA commission ("+x.commission_rate+"%)",x.commission_amount],["Provider fee estimate — paid by "+pretty(x.provider_fee_payer),x.provider_fee_estimate],["Seller payout estimate",x.seller_payout_estimate],["Buyer total estimate",x.buyer_total_estimate],["RANOVA after provider fee, before other costs",x.platform_net_before_other_costs]];
    $("commissionPreviewResult").innerHTML='<table style="width:100%;border-collapse:collapse"><tbody>'+rows.map(([label,value])=>'<tr><th style="text-align:left;padding:8px;font-weight:500">'+esc(label)+'</th><td style="text-align:right;padding:8px;white-space:nowrap">'+esc(x.currency)+' '+Number(value).toFixed(2)+'</td></tr>').join("")+'</tbody></table><p>'+esc(x.settlement_note)+'</p>';
    if(x.commission_amount===0)$("commissionPreviewStatus").textContent+=" — RANOVA commission is currently zero.";
  }catch(e){$("commissionPreviewStatus").textContent=e.message||"Could not calculate earnings."}finally{button.disabled=false}
};
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
      currency:"GHS",
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
const refreshStoreRegistry=$("refreshStoreRegistry");
if(refreshStoreRegistry)refreshStoreRegistry.onclick=async()=>{
  refreshStoreRegistry.disabled=true;
  try{await reloadMarketplace()}catch(err){alert(err.message)}
  finally{refreshStoreRegistry.disabled=false}
};

(async()=>{
  const {data:{session:initial}}=await sb.auth.getSession();
  await checkSession(initial);
  sb.auth.onAuthStateChange((_e,s)=>setTimeout(()=>checkSession(s),0));
})();
})();
