(function(){
"use strict";
var frame=document.getElementById("site");
if(!frame)return;
var tries=0,timer=null;
function idoc(){try{return frame.contentDocument||frame.contentWindow.document}catch(e){return null}}
function escapeHtml(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]})}
function addStyles(d){
  if(d.getElementById("rpeMarketplaceFoundationCss"))return;
  var l=d.createElement("link");l.id="rpeMarketplaceFoundationCss";l.rel="stylesheet";l.href="./marketplace-v1.css?v=20260926-2";d.head.appendChild(l);
}
function openRFQ(name){
  var url="./rfq.html";
  if(name)url+="?product="+encodeURIComponent(name);
  window.top.location.href=url;
}
function addNav(d){
  if(d.getElementById("rpeMarketNav"))return;
  var host=d.querySelector(".navlinks")||d.querySelector("header nav")||d.querySelector("nav");
  if(!host)return;
  var box=d.createElement("span");box.id="rpeMarketNav";box.className="rpe-market-navlinks";
  box.innerHTML='<a href="./rfq.html" target="_top">Request a Quote</a><a href="./order-status.html" target="_top">Track Order</a><a href="./supplier.html" target="_top">Sell on RANOVA</a>';
  host.appendChild(box);
}
function addHero(d){
  if(d.getElementById("rpeMarketHero"))return;
  var hero=d.querySelector(".hero");
  var products=d.getElementById("products");
  if(!hero&&!products)return;
  var sec=d.createElement("section");sec.id="rpeMarketHero";sec.className="rpe-market-hero";
  sec.innerHTML='<div class="container"><div class="rpe-market-hero-card"><div class="rpe-market-copy"><span class="rpe-market-kicker">RANOVA MARKETPLACE</span><h2>Shop products from trusted stores.</h2><p>Search, compare and order products from RANOVA sellers in one marketplace.</p><div class="rpe-market-actions"><button class="primary" id="rpeMarketBrowse" type="button">Browse products</button><a href="./rfq.html" target="_top">Bulk orders</a><a href="./supplier.html" target="_top">Sell on RANOVA</a></div></div><div class="rpe-market-aside"><div class="rpe-market-stat"><strong>Verified sellers</strong><span>Approved stores can sell through RANOVA.</span></div><div class="rpe-market-stat"><strong>Easy discovery</strong><span>Search by name, category or image.</span></div><div class="rpe-market-stat"><strong>Protected checkout</strong><span>Orders stay inside the RANOVA buying flow.</span></div></div></div></div>';
  (hero||products).insertAdjacentElement("afterend",sec);
  var b=d.getElementById("rpeMarketBrowse");if(b&&products)b.onclick=function(){products.scrollIntoView({behavior:"smooth",block:"start"})};
}
function addTrust(d){
  if(d.getElementById("rpeMarketTrust"))return;
  var anchor=d.getElementById("rpeMarketHero");if(!anchor)return;
  var sec=d.createElement("section");sec.id="rpeMarketTrust";sec.className="rpe-market-trust";
  sec.innerHTML='<div class="container"><div class="rpe-market-trust-grid"><div class="rpe-market-trust-item"><b>Verified sellers</b><span>Shop from approved RANOVA stores.</span></div><div class="rpe-market-trust-item"><b>Buyer protection</b><span>Use the secure RANOVA order flow.</span></div><div class="rpe-market-trust-item"><b>Order tracking</b><span>Follow your order from confirmation to delivery.</span></div><div class="rpe-market-trust-item"><b>Bulk orders</b><span>Request quantity pricing when you need more.</span></div></div></div>';
  anchor.insertAdjacentElement("afterend",sec);
}

function addSellerMarketplace(d){
  if(d.getElementById("rpeSellerMarketplace"))return;
  var anchor=d.getElementById("rpeMarketTrust")||d.getElementById("rpeMarketHero");
  if(!anchor)return;

  var sec=d.createElement("section");
  sec.id="rpeSellerMarketplace";
  sec.className="rpe-seller-marketplace";
  sec.innerHTML='<div class="container"><div class="rpe-business-head"><div><span class="eyebrow">VERIFIED MARKETPLACE SELLERS</span><h2>More stores, one RANOVA marketplace</h2></div><p>Approved sellers appear here only after RANOVA verification and product moderation.</p></div><div id="rpeSellerStoreGrid" class="rpe-seller-store-grid"></div><div id="rpeSellerProductShelf" class="rpe-seller-product-shelf"></div></div>';
  anchor.insertAdjacentElement("afterend",sec);

  var base="https://igaerssbzobutlwvjfwt.supabase.co/rest/v1/";
  var key="sb_publishable_NMzJFpXOIJMEH3LW50Cs9g_Otc6tlYr";
  var headers={apikey:key,Authorization:"Bearer "+key};

  Promise.all([
    fetch(base+"ranova_seller_stores?select=id,store_name,slug,tagline,logo_url,banner_url,business_location&store_status=eq.active&order=created_at.desc&limit=12",{headers:headers}).then(function(r){return r.ok?r.json():[]}),
    fetch(base+"ranova_seller_products?select=id,store_id,name,category,short_description,price,currency,moq,stock_status,primary_image_url&product_status=eq.active&order=created_at.desc&limit=12",{headers:headers}).then(function(r){return r.ok?r.json():[]})
  ]).then(function(rows){
    var stores=Array.isArray(rows[0])?rows[0]:[];
    var products=Array.isArray(rows[1])?rows[1]:[];
    if(!stores.length){sec.remove();return}
    var storeMap={};stores.forEach(function(x){storeMap[x.id]=x});

    var storeGrid=d.getElementById("rpeSellerStoreGrid");
    storeGrid.innerHTML=stores.map(function(st){
      return '<a class="rpe-seller-store-card" href="./seller-store.html?store='+encodeURIComponent(st.slug)+'" target="_top">'+
        '<div class="rpe-seller-store-media">'+
          (st.banner_url?'<img class="banner" src="'+escapeHtml(st.banner_url)+'" alt="" loading="lazy">':'')+
          '<div class="logo">'+(st.logo_url?'<img src="'+escapeHtml(st.logo_url)+'" alt="" loading="lazy">':escapeHtml((st.store_name||"R").charAt(0)))+'</div>'+
        '</div>'+
        '<div class="rpe-seller-store-copy"><span class="rpe-verified-chip">✓ Verified seller</span><h3>'+escapeHtml(st.store_name)+'</h3><p>'+escapeHtml(st.tagline||st.business_location||"RANOVA marketplace seller")+'</p><em>Visit store →</em></div>'+
      '</a>';
    }).join("");

    var sellerProducts=products.filter(function(p){return storeMap[p.store_id]}).slice(0,8);
    var shelf=d.getElementById("rpeSellerProductShelf");
    if(!sellerProducts.length){shelf.remove();return}
    shelf.innerHTML='<div class="rpe-seller-shelf-head"><h3>New from verified sellers</h3><span>Seller products are reviewed before going live.</span></div><div class="rpe-seller-product-grid">'+sellerProducts.map(function(p){
      var st=storeMap[p.store_id];
      var price=p.price==null?"Ask seller for price":"GHS "+Number(p.price).toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2});
      return '<a class="rpe-seller-product-card" href="./seller-store.html?store='+encodeURIComponent(st.slug)+'" target="_top">'+
        '<div class="image">'+(p.primary_image_url?'<img src="'+escapeHtml(p.primary_image_url)+'" alt="'+escapeHtml(p.name)+'" loading="lazy">':'')+'</div>'+
        '<div class="copy"><small>'+escapeHtml(st.store_name)+'</small><h4>'+escapeHtml(p.name)+'</h4><p>'+escapeHtml(p.short_description||p.category||"")+'</p><div><b>'+escapeHtml(price)+'</b><span>MOQ '+escapeHtml(p.moq||1)+'</span></div></div>'+
      '</a>';
    }).join("")+'</div>';
  }).catch(function(){sec.remove()});
}

function addBusinessHub(d){
  if(d.getElementById("rpeBusinessHub"))return;
  var products=d.getElementById("products");if(!products)return;
  var sec=d.createElement("section");sec.id="rpeBusinessHub";sec.className="rpe-business-hub";
  sec.innerHTML='<div class="container"><div class="rpe-business-head"><div><span class="eyebrow">BUSINESS TOOLS</span><h2>Source smarter, not harder</h2></div><p>RANOVA is moving beyond a normal catalogue. These tools give business buyers and future suppliers a clearer path to trade.</p></div><div class="rpe-business-grid"><a class="rpe-business-card" href="./rfq.html" target="_top"><span class="rpe-business-icon">₵</span><h3>Request bulk pricing</h3><p>Tell us the product, quantity, destination and timing so the order can be quoted properly.</p><em>Start an RFQ →</em></a><a class="rpe-business-card" href="#products"><span class="rpe-business-icon">◎</span><h3>Find products fast</h3><p>Use text search, category browsing, camera search or gallery upload to locate products.</p><em>Browse catalogue →</em></a><a class="rpe-business-card" href="./supplier.html" target="_top"><span class="rpe-business-icon">✓</span><h3>Apply as a supplier</h3><p>Wholesalers, manufacturers, importers and distributors can register interest in joining.</p><em>Supplier application →</em></a><a class="rpe-business-card" href="./shipping-returns.html" target="_top"><span class="rpe-business-icon">↗</span><h3>Plan delivery</h3><p>Review the current delivery and returns information while regional logistics tools are developed.</p><em>Delivery information →</em></a></div><div class="rpe-market-note"><b>Marketplace status:</b> RANOVA Prime Enterprise is currently the active catalogue supplier. Third-party supplier verification, protected payments and integrated regional transport will only be presented as live after the required operational systems are in place.</div></div>';
  products.parentNode.insertBefore(sec,products);
}
function productForCard(card,ps){
  var title=(card.querySelector("h3")||card.querySelector("b"));
  var name=title?title.textContent.trim():"";
  if(!name)return null;
  var low=name.toLowerCase();
  return ps.find(function(p){return String(p.name||"").trim().toLowerCase()===low})||ps.find(function(p){var n=String(p.name||"").toLowerCase();return n.indexOf(low)!==-1||low.indexOf(n)!==-1})||null;
}
function decorateProducts(d){
  var w=frame.contentWindow,ps=[];try{ps=w.PRODUCTS||[]}catch(e){}
  var grid=d.getElementById("grid");if(!grid)return;
  [].slice.call(grid.querySelectorAll(".product")).forEach(function(card){
    if(card.dataset.marketV1==="1")return;
    var p=productForCard(card,ps);
    var name=p&&p.name?p.name:(card.querySelector("h3")?card.querySelector("h3").textContent.trim():"Product");
    var info=card.querySelector(".product-info")||card;
    var meta=d.createElement("div");meta.className="rpe-market-product-meta";
    meta.innerHTML='<span class="rpe-market-chip">Bulk orders welcome</span><span class="rpe-market-chip supplier">RANOVA catalogue</span>';
    var seller=d.createElement("div");seller.className="rpe-market-seller";seller.innerHTML='<span>Sold by <b>RANOVA Prime Enterprise</b></span><span>Ghana</span>';
    var quick=card.querySelector(".rpe-card-quick");
    info.appendChild(meta);info.appendChild(seller);
    var a=d.createElement("a");a.className="rpe-bulk-quote";a.href="./rfq.html?product="+encodeURIComponent(name);a.target="_top";a.textContent="Request bulk quote";a.setAttribute("aria-label","Request a bulk quotation for "+name);
    if(quick)quick.appendChild(a);else info.appendChild(a);
    card.dataset.marketV1="1";
  });
}
function addSupplierCTA(d){
  if(d.getElementById("rpeSupplierCTA"))return;
  var footer=d.querySelector("footer");if(!footer)return;
  var sec=d.createElement("section");sec.id="rpeSupplierCTA";sec.className="rpe-market-supplier-cta";
  sec.innerHTML='<div class="container"><div class="rpe-market-supplier-card"><div><h2>Want to sell wholesale on RANOVA?</h2><p>We are preparing the platform for vetted wholesalers, importers, manufacturers, distributors and producers. Applications can be submitted now for future onboarding and verification.</p></div><a href="./supplier.html" target="_top">Apply as a supplier</a></div></div>';
  footer.parentNode.insertBefore(sec,footer);
}
function enhance(){
  var d=idoc();if(!d||!d.body)return false;
  addStyles(d);addNav(d);addHero(d);addTrust(d);addSellerMarketplace(d);addBusinessHub(d);decorateProducts(d);addSupplierCTA(d);
  var grid=d.getElementById("grid");
  if(grid&&!grid.__rpeMarketObserver){var o=new MutationObserver(function(){requestAnimationFrame(function(){decorateProducts(d)})});o.observe(grid,{childList:true,subtree:true});grid.__rpeMarketObserver=o}
  return true;
}
function boot(){tries++;if(enhance())return;if(tries<40)timer=setTimeout(boot,250)}
frame.addEventListener("load",function(){tries=0;clearTimeout(timer);setTimeout(boot,700)});
setTimeout(boot,900);
})();