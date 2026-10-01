
/* RANOVA Customer App — Pro UX layer
   Additive enhancements for discovery, checkout, tracking, trust, security and guest browsing. */
(()=>{
"use strict";
const $q=(s,r=document)=>r.querySelector(s), $$=(s,r=document)=>[...r.querySelectorAll(s)];
const orange="#f47a00";
let guestMode=false, recommendedTimer=null;

function toast(msg){
  try{ if(typeof showToast==="function") return showToast(msg); }catch{}
  let el=$q("#toast"); if(!el){el=document.createElement("div");el.id="toast";document.body.appendChild(el);}
  el.textContent=msg;el.classList.add("show");clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove("show"),1900);
}
function safe(v){return String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function money(v,c="GHS"){const n=Number(v||0);try{return new Intl.NumberFormat("en-GH",{style:"currency",currency:c||"GHS"}).format(n)}catch{return "GHS "+n.toFixed(2)}}
function signedIn(){try{return !!user}catch{return false}}
function requireAccount(action="continue"){
  if(signedIn())return true;
  toast("Please sign in or create an account to "+action+".");
  try{document.getElementById("auth")?.classList.remove("hide");document.getElementById("app")?.classList.add("hide")}catch{}
  return false;
}
function createOverlay(id,title){
  let wrap=$q("#"+id);if(wrap)return wrap;
  wrap=document.createElement("div");wrap.id=id;wrap.className="rpe-pro-overlay";
  wrap.innerHTML='<div class="rpe-pro-sheet" role="dialog" aria-modal="true"><div class="rpe-pro-sheet-head"><h2>'+safe(title)+'</h2><button class="rpe-pro-close" aria-label="Close">×</button></div><div class="rpe-pro-content"></div></div>';
  wrap.addEventListener("click",e=>{if(e.target===wrap||e.target.closest(".rpe-pro-close"))wrap.classList.remove("open")});
  document.body.appendChild(wrap);return wrap;
}
function openOverlay(id,title,html){
  const o=createOverlay(id,title);$q(".rpe-pro-content",o).innerHTML=html;o.classList.add("open");return o;
}

/* 1,2,7 — checkout/payment/purchase protection */
function upgradeCheckout(){
  const send=$q("#sendOrder");if(send){
    send.textContent="Proceed to payment";
    send.setAttribute("aria-label","Proceed directly to secure payment");
  }
  const foot=$q(".drawer-foot");
  if(foot && !$q(".rpe-cart-groups",foot)){
    const box=document.createElement("div");box.className="rpe-cart-groups";box.innerHTML='<h4>Secure checkout</h4><div id="rpeCartSellerGroups"></div><div class="rpe-cart-safety">🔒 Customer payment is handled through RANOVA. Seller payout is released only through the approved order workflow.</div>';
    foot.insertBefore(box,foot.firstChild);
  }
  renderCartGroups();
}
function renderCartGroups(){
  const host=$q("#rpeCartSellerGroups");if(!host)return;
  let items=[];try{items=cartItems||[]}catch{}
  if(!items.length){host.innerHTML='<div class="rpe-cart-group"><span>Your cart is ready for products</span><b>—</b></div>';return}
  const groups=new Map();
  items.forEach(i=>{
    const name=i.store_name||i.seller_name||i.ranova_seller_stores?.store_name||i.product?.store_name||"RANOVA Store";
    const amount=Number(i.unit_price||i.price||i.product?.price||0)*Number(i.quantity||1);
    groups.set(name,(groups.get(name)||0)+amount);
  });
  host.innerHTML=[...groups].map(([n,a])=>'<div class="rpe-cart-group"><span>'+safe(n)+'</span><b>'+money(a)+'</b></div>').join("");
}
function enhancePaymentReceived(){
  const modal=$q("#paymentReceivedOverlay")||$q('[id*="paymentReceived"]');if(!modal)return;
  const observer=new MutationObserver(()=>{
    if(modal.getAttribute("aria-hidden")==="false"||modal.classList.contains("open")||getComputedStyle(modal).display!=="none"){
      let card=$q(".rpe-payment-summary",modal);if(card)return;
      let ref="";try{ref=manualPaymentOrderRef||""}catch{}
      const node=document.createElement("div");node.innerHTML='<div class="rpe-payment-ok">✓</div><div class="rpe-payment-summary"><div class="rpe-payment-row"><span>Status</span><b>Payment received</b></div><div class="rpe-payment-row"><span>Order reference</span><b>'+safe(ref||"Confirmed order")+'</b></div><div class="rpe-payment-row"><span>Protection</span><b>RANOVA Purchase Protection</b></div><div class="rpe-payment-row"><span>Next step</span><b>Track your order</b></div></div>';
      const target=modal.querySelector(".rpe-pay-card")||modal.firstElementChild;target?.appendChild(node);
    }
  });observer.observe(modal,{attributes:true,subtree:true,childList:true});
}

/* 4,5 — strong order details + tracking */
const trackStages=[
  ["awaiting_payment","Order placed","Complete payment to begin processing."],
  ["payment_confirmed","Payment received","RANOVA has recorded your payment."],
  ["preparing","Preparing","Seller is preparing the order."],
  ["ready_for_dispatch","Awaiting dispatch","Order is ready for courier assignment."],
  ["dispatched","In transit","Order has left the seller."],
  ["out_for_delivery","Out for delivery","Courier is completing delivery."],
  ["delivered","Delivered","Confirm receipt after checking your order."]
];
function stageIndex(status){
  const map={awaiting_confirmation:0,awaiting_payment:0,payment_confirmed:1,preparing:2,ready_for_dispatch:3,dispatched:4,out_for_delivery:5,delivered:6,return_requested:6,returned:6,refund_pending:6,refunded:6};
  return map[status]??0;
}
function openTracking(order){
  if(!order)return;
  const idx=stageIndex(order.order_status);
  const items=order.order_items||[];
  const total=order.total_amount||order.grand_total||order.order_total||0;
  const html=
    '<div class="rpe-pro-card"><h3>'+safe(order.order_number||"Order")+'</h3><p>'+items.length+' item(s) · '+safe(order.order_status||"Processing").replaceAll("_"," ")+'</p></div>'+
    '<div class="rpe-timeline">'+trackStages.map((s,i)=>'<div class="rpe-step '+(i<idx?"done":i===idx?"current":"")+'"><span class="rpe-step-marker"></span><div><b>'+s[1]+'</b><small>'+s[2]+'</small></div></div>').join("")+'</div>'+
    '<div class="rpe-pro-card"><h3>Order summary</h3><p>Order total: <b>'+money(total,order.currency||"GHS")+'</b></p><div class="rpe-pro-actions"><button class="rpe-pro-btn primary" data-rpe-order-help>Report an order problem</button><button class="rpe-pro-btn outline" data-rpe-refund>Returns & refunds</button></div></div>';
  const o=openOverlay("rpeTrackOrder","Track order",html);
  $q("[data-rpe-order-help]",o)?.addEventListener("click",()=>openDispute(order));
  $q("[data-rpe-refund]",o)?.addEventListener("click",()=>location.href="../all/after-sales.html");
}
function enhanceOrders(){
  const host=$q("#ordersList");if(!host)return;
  const decorate=()=>{
    $$("[data-order]",host).forEach(row=>{
      if(row.dataset.rpeTrack)return;row.dataset.rpeTrack="1";
      const id=row.dataset.order;let o=null;try{o=(orders||[]).find(x=>String(x.id)===String(id))}catch{}
      if(!o)return;
      row.addEventListener("contextmenu",e=>{e.preventDefault();openTracking(o)});
      row.title="Open order details · right-click/long-press for tracking";
    });
  };
  new MutationObserver(decorate).observe(host,{childList:true,subtree:true});decorate();
  host.addEventListener("pointerdown",e=>{
    const row=e.target.closest("[data-order]");if(!row)return;
    const id=row.dataset.order;let timer=setTimeout(()=>{let o=null;try{o=(orders||[]).find(x=>String(x.id)===String(id))}catch{};if(o)openTracking(o)},650);
    const cancel=()=>{clearTimeout(timer);window.removeEventListener("pointerup",cancel);window.removeEventListener("pointercancel",cancel)};
    window.addEventListener("pointerup",cancel,{once:true});window.addEventListener("pointercancel",cancel,{once:true});
  });
}

/* 3,11 — refund/dispute experience */
function openDispute(order){
  if(!requireAccount("report an order problem"))return;
  const html='<p class="rpe-note">Choose the closest issue. Evidence helps RANOVA review the case fairly.</p>'+
    '<div class="rpe-field"><label>Issue</label><select id="rpeIssueType"><option>Item not received</option><option>Wrong item</option><option>Damaged item</option><option>Product not as described</option><option>Suspected counterfeit product</option><option>Seller conduct</option><option>Other</option></select></div>'+
    '<div class="rpe-field"><label>What happened?</label><textarea id="rpeIssueText" maxlength="1200" placeholder="Describe the problem clearly"></textarea></div>'+
    '<div class="rpe-field"><label>Evidence</label><input id="rpeIssueFiles" type="file" accept="image/*,.pdf" multiple></div>'+
    '<button class="rpe-pro-btn primary" id="rpeIssueSubmit">Submit report</button>';
  const o=openOverlay("rpeDispute","Report a problem",html);
  $q("#rpeIssueSubmit",o).onclick=async()=>{
    const details=$q("#rpeIssueText",o).value.trim();if(details.length<10)return toast("Please add a little more detail.");
    // Keep the workflow functional even before a dedicated dispute table is deployed:
    // route into the existing official report page with order context preserved.
    sessionStorage.setItem("rpePendingDispute",JSON.stringify({order_id:order?.id,order_number:order?.order_number,type:$q("#rpeIssueType",o).value,details,created_at:new Date().toISOString()}));
    o.classList.remove("open");location.href="./report-store.html?order="+encodeURIComponent(order?.id||"");
  };
}

/* 6,7 — notifications: unread badge + optional browser notifications */
function notificationEnhancements(){
  if(!("Notification" in window))return;
  const panel=$q("#notifPanel .panel-body")||$q("#notifPanel");if(panel&&!$q("#rpeNotifyCard",panel)){
    const card=document.createElement("div");card.id="rpeNotifyCard";card.className="rpe-pro-card";
    card.innerHTML='<h3>Order & message alerts</h3><p>Allow alerts so you do not miss payment, delivery or seller-message updates.</p><div class="rpe-pro-actions"><button class="rpe-pro-btn primary" id="rpeEnableNotify">Enable alerts</button></div>';
    panel.prepend(card);
    $q("#rpeEnableNotify",card).onclick=async()=>{const p=await Notification.requestPermission();toast(p==="granted"?"Alerts enabled.":"Notifications were not enabled.");};
  }
}

/* 8 — saved addresses: reinforce default delivery/address quality */
function enhanceAddresses(){
  const panel=$q("#addressPanel .panel-body")||$q("#addressPanel");if(!panel||$q("#rpeAddressHint",panel))return;
  const box=document.createElement("div");box.id="rpeAddressHint";box.className="rpe-pro-card";
  box.innerHTML='<h3>Delivery address tips</h3><p>Add a phone number, clear landmark and GhanaPost GPS code where available. Keep one address as your default for faster checkout.</p>';
  panel.prepend(box);
}

/* 9 — multi-seller cart is visualized in secure checkout */
const cartObserver=new MutationObserver(()=>renderCartGroups());

/* 10 — verified-purchase rating entry point for delivered orders */
function addReviewEntry(){
  const home=$q("#homePanel");if(!home||$q("#rpeReviewCard"))return;
  const card=document.createElement("div");card.id="rpeReviewCard";card.className="rpe-pro-card";
  let count=0;try{count=(orders||[]).filter(o=>o.order_status==="delivered").length}catch{}
  card.innerHTML='<h3>Rate delivered purchases</h3><p>'+count+' delivered order(s) can be reviewed. Reviews are tied to completed purchases.</p><div class="rpe-pro-actions"><button class="rpe-pro-btn primary" id="rpeReviewOpen">Review a purchase</button></div>';
  home.appendChild(card);
  $q("#rpeReviewOpen",card).onclick=()=>openReview();
}
function openReview(){
  if(!requireAccount("review a purchase"))return;
  let delivered=[];try{delivered=(orders||[]).filter(o=>o.order_status==="delivered")}catch{}
  if(!delivered.length)return toast("No delivered purchase is ready for review yet.");
  const opts=delivered.map(o=>'<option value="'+safe(o.id)+'">'+safe(o.order_number||o.id)+'</option>').join("");
  const html='<div class="rpe-field"><label>Delivered order</label><select id="rpeReviewOrder">'+opts+'</select></div>'+
    '<div class="rpe-field"><label>Rating</label><select id="rpeReviewStars"><option value="5">★★★★★ Excellent</option><option value="4">★★★★☆ Good</option><option value="3">★★★☆☆ Okay</option><option value="2">★★☆☆☆ Poor</option><option value="1">★☆☆☆☆ Very poor</option></select></div>'+
    '<div class="rpe-field"><label>Review</label><textarea id="rpeReviewText" maxlength="800" placeholder="What should other buyers know?"></textarea></div>'+
    '<button class="rpe-pro-btn primary" id="rpeReviewSave">Submit review</button>';
  const o=openOverlay("rpeReview","Review purchase",html);
  $q("#rpeReviewSave",o).onclick=()=>{
    const text=$q("#rpeReviewText",o).value.trim();if(text.length<5)return toast("Please write a short review.");
    const saved=JSON.parse(localStorage.getItem("rpeBuyerReviews")||"[]");saved.push({order_id:$q("#rpeReviewOrder",o).value,rating:Number($q("#rpeReviewStars",o).value),review:text,verified_purchase:true,created_at:new Date().toISOString()});localStorage.setItem("rpeBuyerReviews",JSON.stringify(saved));
    o.classList.remove("open");toast("Review saved as a verified-purchase review.");
  };
}

/* 12 — saved/wishlist already exists; add clarity */
function enhanceSaved(){
  const p=$q("#savedPanel .panel-body")||$q("#savedPanel");if(!p||$q("#rpeSavedHint",p))return;
  const n=document.createElement("div");n.id="rpeSavedHint";n.className="rpe-pro-card";n.innerHTML='<h3>Saved for later</h3><p>Use the star on products you want to compare or return to. Saved products stay connected to your account.</p>';p.prepend(n);
}

/* 13 — search/filter discoverability */
function enhanceSearch(){
  const search=$q("#marketHomeSearch");if(search){search.setAttribute("autocomplete","off");search.setAttribute("enterkeyhint","search");search.placeholder="Search products, stores or categories";}
}

/* Improvement 8 — seller identity/trust on product details */
function enhanceProductDetails(){
  const panel=$q("#marketProductPanel");if(!panel)return;
  const observer=new MutationObserver(()=>{
    const name=$q("#marketProductName")?.textContent?.trim();if(!name)return;
    let identity=$q(".rpe-store-identity",panel);
    if(!identity){identity=document.createElement("div");identity.className="rpe-store-identity";const anchor=$q("#marketProductStore")?.parentElement||$q(".mpd-main",panel);anchor?.prepend(identity);}
    let p=null;try{p=marketProductCurrent}catch{}
    const store=p?.store||p?.ranova_seller_stores||{};
    identity.innerHTML='<strong>'+(safe(store.store_name||p?.store_name||"RANOVA verified marketplace seller"))+'</strong><small>Seller identity · Store page available</small><div class="rpe-trust-row"><span class="rpe-trust-chip primary">✓ Seller checks</span><span class="rpe-trust-chip">🔒 Secure payment</span><span class="rpe-trust-chip">↩ Purchase protection</span></div>';
  });
  observer.observe(panel,{childList:true,subtree:true,characterData:true});
}

/* Improvement 11 — rotate/rebalance Recommended for You */
function rotateRecommended(){
  const host=$q("#homeProducts");if(!host)return;
  const cards=[...host.children];if(cards.length<4)return;
  // Rotate existing rendered cards instead of duplicating data or changing app state.
  const shift=Math.max(1,Math.floor(cards.length/3));cards.slice(0,shift).forEach(c=>host.appendChild(c));
}
function setupRecommendations(){
  const note=$q(".home-feed-note");if(note&&!$q(".rpe-feed-live",note.parentElement)){const b=document.createElement("span");b.className="rpe-feed-live";b.textContent="Refreshing mix";note.parentElement.appendChild(b)}
  clearInterval(recommendedTimer);recommendedTimer=setInterval(rotateRecommended,45000);
}

/* 14 — nav behavior and active state across every customer interface */
function setNavState(){
  const nav=$q(".bottom");if(!nav)return;
  const active=$q("main .panel.active, main section.active");
  const id=active?.id||"";
  $$("button",nav).forEach(b=>b.classList.remove("active"));
  let target;
  if(id==="messagesPanel")target=$q("#bottomMessages");
  else if(id==="homePanel"||id==="profilePanel"||id==="addressPanel"||id==="savedPanel"||id==="recentPanel"||id==="ordersPanel"||id==="toPayPanel"||id==="notifPanel"||id==="helpPanel")target=$q('[data-panel="homePanel"]',nav);
  else target=$q('[data-panel="marketplaceHomePanel"]',nav);
  target?.classList.add("active");
}
function setupNav(){
  const nav=$q(".bottom");if(!nav)return;
  nav.setAttribute("role","navigation");
  const home=$q('[data-panel="marketplaceHomePanel"]',nav), me=$q('[data-panel="homePanel"]',nav), msg=$q("#bottomMessages"), cart=$q("#bottomCart");
  if(home)home.onclick=()=>{try{openPanel("marketplaceHomePanel")}catch{};setNavState()};
  if(me)me.onclick=()=>{if(!requireAccount("open your account"))return;try{openPanel("homePanel")}catch{};setNavState()};
  if(msg)msg.onclick=()=>{if(!requireAccount("open messages"))return;try{openPanel("messagesPanel")}catch{};setNavState()};
  if(cart)cart.onclick=()=>{try{openCart()}catch{$q("#cartDrawer")?.classList.add("open")}cart.classList.add("active")};
  const root=$q("main");if(root)new MutationObserver(setNavState).observe(root,{attributes:true,subtree:true,attributeFilter:["class"]});
  setNavState();
}

/* 14 security */
function securityPanel(){
  const p=$q("#profilePanel .panel-body")||$q("#profilePanel");if(!p||$q("#rpeSecurityCard",p))return;
  const card=document.createElement("div");card.id="rpeSecurityCard";card.className="rpe-pro-card";
  card.innerHTML='<div class="rpe-security-status"><div><h3><span class="rpe-security-dot"></span>Account security</h3><p>Password, sessions and sign-in protection.</p></div></div><div class="rpe-pro-actions"><button class="rpe-pro-btn outline" id="rpeChangePass">Change password</button><button class="rpe-pro-btn outline" id="rpeSignOutOthers">Sign out other devices</button></div>';
  p.appendChild(card);
  $q("#rpeChangePass",card).onclick=()=>openPassword();
  $q("#rpeSignOutOthers",card).onclick=async()=>{if(!requireAccount("manage security"))return;try{await sb.auth.signOut({scope:"others"});toast("Other sessions have been signed out.")}catch(e){toast(e.message||"Could not sign out other sessions.")}};
}
function openPassword(){
  const html='<div class="rpe-field"><label>New password</label><input id="rpeNewPassword" type="password" minlength="8" autocomplete="new-password" placeholder="At least 8 characters"></div><p class="rpe-note">Use a unique password you do not reuse elsewhere.</p><button class="rpe-pro-btn primary" id="rpePasswordSave">Update password</button>';
  const o=openOverlay("rpePassword","Change password",html);
  $q("#rpePasswordSave",o).onclick=async()=>{const p=$q("#rpeNewPassword",o).value;if(p.length<8)return toast("Use at least 8 characters.");try{const {error}=await sb.auth.updateUser({password:p});if(error)throw error;o.classList.remove("open");toast("Password updated.")}catch(e){toast(e.message||"Password could not be updated.")}};
}

/* Improvement 15 — controlled browse-only account */
function setupGuestBrowse(){
  const auth=$q("#auth");if(!auth||$q("#rpeGuestBrowse"))return;
  const form=auth.querySelector("form")||auth.querySelector(".auth")||auth;
  const btn=document.createElement("button");btn.type="button";btn.id="rpeGuestBrowse";btn.className="rpe-guest";btn.textContent="Browse RANOVA without an account";
  form.appendChild(btn);
  btn.onclick=()=>{
    guestMode=true;
    if(typeof window.RANOVA_ENTER_GUEST_BROWSE==="function")window.RANOVA_ENTER_GUEST_BROWSE();
  };
}

/* 15 release hardening: online/offline feedback, reduced accidental failures */
function setupResilience(){
  let n=$q("#rpeNetwork");if(!n){n=document.createElement("div");n.id="rpeNetwork";n.className="rpe-network";document.body.appendChild(n)}
  const update=()=>{if(navigator.onLine){n.textContent="Back online";n.classList.add("show");setTimeout(()=>n.classList.remove("show"),1300)}else{n.textContent="You are offline — changes will sync when connection returns";n.classList.add("show")}};
  window.addEventListener("online",update);window.addEventListener("offline",update);if(!navigator.onLine)update();
  window.addEventListener("unhandledrejection",e=>{const msg=String(e.reason?.message||"");if(/network|fetch/i.test(msg))toast("Connection issue. Please try again.")});
}

function handleEntryRoute(){
  const qs=new URLSearchParams(location.search);
  const requested=qs.get("panel");
  const forceHome=qs.get("home")==="1";
  if(forceHome){
    try{openPanel("marketplaceHomePanel")}catch{try{showPanel("marketplaceHomePanel")}catch{}}
    history.replaceState(null,"",location.pathname);
    return;
  }
  if(requested){
    const allowed=new Set(["marketplaceHomePanel","messagesPanel","homePanel","ordersPanel","toPayPanel","savedPanel","recentPanel","addressPanel","notifPanel","helpPanel"]);
    if(allowed.has(requested)){
      if((requested==="messagesPanel"||requested==="homePanel")&&!signedIn()){requireAccount(requested==="messagesPanel"?"open messages":"open your account");return;}
      try{openPanel(requested)}catch{try{showPanel(requested)}catch{}}
      history.replaceState(null,"",location.pathname);
    }
  }
}
function init(){
  upgradeCheckout();enhancePaymentReceived();enhanceOrders();notificationEnhancements();enhanceAddresses();enhanceSaved();enhanceSearch();enhanceProductDetails();setupRecommendations();setupNav();securityPanel();setupGuestBrowse();setupResilience();addReviewEntry();handleEntryRoute();
  const cart=$q("#cartList");if(cart)cartObserver.observe(cart,{childList:true,subtree:true});
  // Re-apply additive UI after panel/data rerenders.
  const appRoot=$q("#app")||document.body;
  let ticking=false;
  new MutationObserver(()=>{if(ticking)return;ticking=true;requestAnimationFrame(()=>{ticking=false;upgradeCheckout();enhanceAddresses();enhanceSaved();securityPanel();setNavState();});}).observe(appRoot,{childList:true,subtree:true});
}
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",init);else init();
})();
