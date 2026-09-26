(function(){
"use strict";
var frame=document.getElementById("site");
if(!frame)return;
var tries=0,timer=null;
function idoc(){try{return frame.contentDocument||frame.contentWindow.document}catch(e){return null}}
function escapeHtml(s){return String(s==null?"":s).replace(/[&<>"']/g,function(c){return{"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]})}
function addStyles(d){
  if(d.getElementById("rpeMarketplaceFoundationCss"))return;
  var l=d.createElement("link");l.id="rpeMarketplaceFoundationCss";l.rel="stylesheet";l.href="./marketplace-v1.css?v=20260926-1";d.head.appendChild(l);
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
  box.innerHTML='<a href="./rfq.html" target="_top">Request a Quote</a><a href="./supplier.html" target="_top">Sell on RANOVA</a>';
  host.appendChild(box);
}
function addHero(d){
  if(d.getElementById("rpeMarketHero"))return;
  var hero=d.querySelector(".hero");
  var products=d.getElementById("products");
  if(!hero&&!products)return;
  var sec=d.createElement("section");sec.id="rpeMarketHero";sec.className="rpe-market-hero";
  sec.innerHTML='<div class="container"><div class="rpe-market-hero-card"><div class="rpe-market-copy"><span class="rpe-market-kicker">RANOVA BUSINESS MARKETPLACE</span><h2>Wholesale sourcing built for Ghanaian businesses.</h2><p>Discover RANOVA products, request bulk quotations and source for your shop or business without relying on repeated trips and scattered product conversations. This marketplace is starting with RANOVA Prime Enterprise and is being built to support vetted suppliers as the network expands.</p><div class="rpe-market-actions"><button class="primary" id="rpeMarketBrowse" type="button">Browse wholesale products</button><a href="./rfq.html" target="_top">Request bulk quote</a><a href="./supplier.html" target="_top">Become a supplier</a></div></div><div class="rpe-market-aside"><div class="rpe-market-stat"><strong>Bulk buying first</strong><span>Ask for quantity pricing instead of guessing a retail price.</span></div><div class="rpe-market-stat"><strong>Direct product sourcing</strong><span>Search by name, category, camera or gallery image.</span></div><div class="rpe-market-stat"><strong>Built for local trade</strong><span>Ghana-focused buying, supplier onboarding and delivery workflows.</span></div></div></div></div>';
  (hero||products).insertAdjacentElement("afterend",sec);
  var b=d.getElementById("rpeMarketBrowse");if(b&&products)b.onclick=function(){products.scrollIntoView({behavior:"smooth",block:"start"})};
}
function addTrust(d){
  if(d.getElementById("rpeMarketTrust"))return;
  var anchor=d.getElementById("rpeMarketHero");if(!anchor)return;
  var sec=d.createElement("section");sec.id="rpeMarketTrust";sec.className="rpe-market-trust";
  sec.innerHTML='<div class="container"><div class="rpe-market-trust-grid"><div class="rpe-market-trust-item"><b>Real RANOVA catalogue</b><span>Existing products stay intact while wholesale tools are added around them.</span></div><div class="rpe-market-trust-item"><b>Bulk quotation</b><span>Business buyers can send quantity and delivery requirements before committing.</span></div><div class="rpe-market-trust-item"><b>Supplier onboarding</b><span>New suppliers apply first; marketplace verification will be introduced carefully.</span></div><div class="rpe-market-trust-item"><b>Mobile-first sourcing</b><span>Designed for traders and business buyers using phones and limited data.</span></div></div></div>';
  anchor.insertAdjacentElement("afterend",sec);
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
  addStyles(d);addNav(d);addHero(d);addTrust(d);addBusinessHub(d);decorateProducts(d);addSupplierCTA(d);
  var grid=d.getElementById("grid");
  if(grid&&!grid.__rpeMarketObserver){var o=new MutationObserver(function(){requestAnimationFrame(function(){decorateProducts(d)})});o.observe(grid,{childList:true,subtree:true});grid.__rpeMarketObserver=o}
  return true;
}
function boot(){tries++;if(enhance())return;if(tries<40)timer=setTimeout(boot,250)}
frame.addEventListener("load",function(){tries=0;clearTimeout(timer);setTimeout(boot,700)});
setTimeout(boot,900);
})();