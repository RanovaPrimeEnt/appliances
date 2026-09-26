(function(){
"use strict";

var frame=document.getElementById("site");
if(!frame)return;

var RPE_PHONE="233542846895";
var bootCount=0;
var bootTimer=null;

function idoc(){
  try{return frame.contentDocument||frame.contentWindow.document}catch(e){return null}
}
function iwin(){
  try{return frame.contentWindow}catch(e){return null}
}
function products(){
  var w=iwin();
  try{return (w&&Array.isArray(w.PRODUCTS))?w.PRODUCTS:[]}catch(e){return[]}
}
function esc(v){
  return String(v==null?"":v).replace(/[&<>"']/g,function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c];
  });
}
function whatsappHref(p){
  var id=p.rpeSku||p.id||"";
  var msg="Hello Ranova Prime Enterprise, I am interested in "+p.name+(id?" ("+id+")":"")+". Please confirm the current price, availability, delivery information and important specifications.";
  return "https://wa.me/"+RPE_PHONE+"?text="+encodeURIComponent(msg);
}
function getProductForCard(card,ps){
  if(!card)return null;
  var h=card.querySelector("h3");
  if(!h)return null;
  var name=h.textContent.trim();
  return ps.find(function(p){return p.name===name})||null;
}
function installStyles(d){
  if(d.getElementById("rpeFriendlyStyle"))return;
  var st=d.createElement("style");
  st.id="rpeFriendlyStyle";
  st.textContent=
  '.rpe-skip-link{position:fixed;left:12px;top:-60px;z-index:1000000;background:#0d3329;color:#fff;padding:10px 14px;border-radius:0 0 10px 10px;font-weight:850;text-decoration:none;transition:top .18s}.rpe-skip-link:focus{top:0}'+
  '.rpe-how{padding:34px 0 18px;background:#fff}.rpe-how-card{border:1px solid #dfe7e3;border-radius:24px;background:linear-gradient(135deg,#f8f5ed,#fff);padding:24px;box-shadow:0 10px 32px rgba(10,48,38,.05)}.rpe-how-head{display:flex;justify-content:space-between;gap:20px;align-items:end;margin-bottom:18px}.rpe-how-head h2{margin:5px 0 0;color:#103d31}.rpe-how-head p{max-width:520px;margin:0;color:#657972;font-size:12px;line-height:1.6}.rpe-how-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.rpe-how-step{display:flex;gap:12px;align-items:flex-start;background:#fff;border:1px solid #e1e8e5;border-radius:16px;padding:15px}.rpe-how-num{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:#0e5b43;color:#fff;font-weight:900;flex:none}.rpe-how-step b{display:block;color:#173d32;font-size:13px}.rpe-how-step span{display:block;margin-top:4px;color:#6e8079;font-size:11px;line-height:1.5}.rpe-how-actions{display:flex;gap:9px;flex-wrap:wrap;margin-top:16px}.rpe-how-actions a,.rpe-how-actions button{min-height:44px;border-radius:12px;border:1px solid #d7e2dd;background:#fff;color:#173d32;padding:10px 14px;font-weight:850;font-size:11px;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}.rpe-how-actions .primary{background:#0e5b43;color:#fff;border-color:#0e5b43}'+
  '.filters.rpe-sticky-filters{position:sticky!important;top:74px!important;z-index:120!important;background:rgba(255,255,255,.96)!important;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);padding:9px 4px!important;margin-left:-4px!important;margin-right:-4px!important;overflow-x:auto!important;white-space:nowrap!important;scrollbar-width:none;box-shadow:0 8px 18px rgba(8,46,36,.04)}.filters.rpe-sticky-filters::-webkit-scrollbar{display:none}.filters.rpe-sticky-filters button{min-height:40px}'+
  '.rpe-search-host{position:relative!important}.rpe-search-suggest{position:absolute;left:0;right:0;top:calc(100% + 8px);z-index:5000;background:#fff;border:1px solid #dbe5e0;border-radius:16px;box-shadow:0 18px 44px rgba(6,40,31,.16);padding:6px;display:none;max-height:360px;overflow:auto}.rpe-search-suggest.show{display:block}.rpe-search-option{width:100%;border:0;background:#fff;color:#173d32;display:grid;grid-template-columns:52px 1fr;gap:10px;text-align:left;padding:8px;border-radius:11px;cursor:pointer;align-items:center}.rpe-search-option:hover,.rpe-search-option.active{background:#eff5f2}.rpe-search-option img{width:52px;height:52px;object-fit:contain;background:#f5f7f6;border-radius:9px}.rpe-search-option b{display:block;font-size:11px;line-height:1.3}.rpe-search-option small{display:block;margin-top:3px;color:#74857f;font-size:9px}.rpe-search-empty{padding:16px;text-align:center;color:#74857f;font-size:11px}'+
  '.rpe-card-quick{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:10px}.rpe-card-quick a,.rpe-card-quick button{min-height:38px;border-radius:10px;border:1px solid #dce6e1;font-size:10px;font-weight:850;display:flex;align-items:center;justify-content:center;gap:5px;text-decoration:none;cursor:pointer}.rpe-wa-card{background:#0e5b43!important;color:#fff!important;border-color:#0e5b43!important}.rpe-compare-card{background:#f5f7f6!important;color:#173d32!important}.rpe-compare-card[aria-pressed="true"]{background:#e9f2ee!important;border-color:#0e5b43!important;color:#0e5b43!important}'+
  '.rpe-compare-bar{position:fixed;left:50%;bottom:22px;transform:translate(-50%,120px);z-index:9450;background:#0d3329;color:#fff;border-radius:999px;padding:8px 9px 8px 15px;display:flex;align-items:center;gap:10px;box-shadow:0 16px 38px rgba(3,31,23,.28);opacity:0;pointer-events:none;transition:.22s}.rpe-compare-bar.show{transform:translate(-50%,0);opacity:1;pointer-events:auto}.rpe-compare-bar span{font-size:11px;font-weight:800}.rpe-compare-bar button{min-height:38px;border:0;border-radius:999px;padding:8px 13px;font-size:10px;font-weight:900;cursor:pointer}.rpe-compare-open{background:#e0b45d;color:#0d3329}.rpe-compare-clear{background:#ffffff15;color:#fff}'+
  '.rpe-compare-backdrop{position:fixed;inset:0;background:rgba(4,26,20,.58);z-index:9900;display:none;padding:18px}.rpe-compare-backdrop.open{display:flex;align-items:center;justify-content:center}.rpe-compare-panel{width:min(1060px,100%);max-height:88vh;overflow:auto;background:#fff;border-radius:24px;box-shadow:0 30px 80px rgba(0,0,0,.22)}.rpe-compare-head{position:sticky;top:0;background:#fff;z-index:3;display:flex;justify-content:space-between;align-items:center;padding:18px 20px;border-bottom:1px solid #e2eae6}.rpe-compare-head h3{margin:0;color:#173d32}.rpe-compare-close{width:42px;height:42px;border:0;border-radius:50%;background:#eef3f0;font-size:23px;cursor:pointer}.rpe-compare-scroll{overflow-x:auto;padding:18px}.rpe-compare-table{display:grid;gap:0;min-width:720px;border:1px solid #e1e9e5;border-radius:16px;overflow:hidden}.rpe-compare-row{display:grid;grid-template-columns:150px repeat(var(--compare-count),minmax(180px,1fr));border-bottom:1px solid #e6ece9}.rpe-compare-row:last-child{border-bottom:0}.rpe-compare-row>div{padding:11px;border-right:1px solid #e6ece9;font-size:11px;line-height:1.45}.rpe-compare-row>div:last-child{border-right:0}.rpe-compare-label{background:#f4f7f5;font-weight:850;color:#52675f}.rpe-compare-product{padding:14px!important}.rpe-compare-product img{width:100%;height:140px;object-fit:contain;background:#f6f8f7;border-radius:12px}.rpe-compare-product b{display:block;margin-top:9px;color:#173d32;line-height:1.3}.rpe-compare-product small{display:block;color:#75867f;margin-top:4px}.rpe-compare-product a{display:inline-flex;margin-top:9px;min-height:36px;align-items:center;padding:0 10px;border-radius:9px;text-decoration:none;background:#0e5b43;color:#fff;font-size:9px;font-weight:850}'+
  '.rpe-backtop{position:fixed;right:18px;bottom:82px;z-index:9300;width:44px;height:44px;border:1px solid #dce6e1;border-radius:50%;background:#fff;color:#173d32;box-shadow:0 10px 28px rgba(5,34,26,.14);font-size:20px;display:grid;place-items:center;cursor:pointer;opacity:0;transform:translateY(10px);pointer-events:none;transition:.2s}.rpe-backtop.show{opacity:1;transform:none;pointer-events:auto}'+
  '.rpe-image-zoom{position:fixed;inset:0;z-index:1000000;background:rgba(2,18,13,.96);display:none;align-items:center;justify-content:center;padding:18px}.rpe-image-zoom.open{display:flex}.rpe-image-zoom img{max-width:96vw;max-height:92vh;width:auto;height:auto;object-fit:contain;border-radius:14px;box-shadow:0 26px 80px rgba(0,0,0,.48);background:#fff}.rpe-image-zoom button{position:fixed;right:18px;top:18px;width:46px;height:46px;border:1px solid #ffffff44;border-radius:50%;background:#173d32;color:#fff;font-size:26px;cursor:pointer}.rpe-image-zoom-note{position:fixed;left:50%;bottom:18px;transform:translateX(-50%);color:#dbe8e3;background:#0b2f27;padding:8px 12px;border-radius:999px;font-size:10px;font-weight:750;white-space:nowrap}'+
  'a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,summary:focus-visible{outline:3px solid #c99a3b!important;outline-offset:3px!important}.rpe-card-quick a,.rpe-card-quick button,.rpe-how-actions a,.rpe-how-actions button,.rpe-backtop,.rpe-compare-close{touch-action:manipulation}'+
  '@media(max-width:900px){.rpe-how-grid{grid-template-columns:1fr}.rpe-how-head{align-items:flex-start;flex-direction:column}.rpe-compare-bar{bottom:82px}}'+
  '@media(max-width:620px){.filters.rpe-sticky-filters{top:62px!important;padding:7px 2px!important}.rpe-how{padding:22px 0 10px}.rpe-how-card{padding:17px;border-radius:19px}.rpe-how-actions{display:grid;grid-template-columns:1fr 1fr}.rpe-how-actions .primary{grid-column:1/-1}.rpe-card-quick{grid-template-columns:1fr 1fr}.rpe-card-quick a,.rpe-card-quick button{min-height:42px}.rpe-backtop{right:14px;bottom:86px}.rpe-compare-backdrop{padding:0}.rpe-compare-panel{width:100%;max-height:94vh;border-radius:22px 22px 0 0;align-self:flex-end}.rpe-compare-product img{height:110px}}'+
  '.rpe-category-shell{position:relative;width:100%;margin:18px 0 8px;padding:0 48px}.category-cards.rpe-category-carousel{display:flex!important;grid-template-columns:none!important;gap:18px!important;overflow-x:auto!important;overflow-y:hidden!important;scroll-snap-type:x mandatory!important;scroll-behavior:smooth!important;-webkit-overflow-scrolling:touch!important;overscroll-behavior-x:contain!important;touch-action:pan-x!important;padding:10px 2px 18px!important;margin:0!important;scrollbar-width:none!important}.category-cards.rpe-category-carousel::-webkit-scrollbar{display:none!important}.category-cards.rpe-category-carousel .category-card,.category-cards.rpe-category-carousel .category-card:last-child{flex:0 0 156px!important;width:156px!important;min-width:156px!important;max-width:156px!important;grid-column:auto!important;scroll-snap-align:start!important;overflow:visible!important;border:0!important;background:transparent!important;box-shadow:none!important;padding:0!important;display:flex!important;flex-direction:column!important;align-items:center!important;text-align:center!important;transform:none!important}.category-cards.rpe-category-carousel .category-card:hover{transform:translateY(-3px)!important;box-shadow:none!important}.category-cards.rpe-category-carousel .category-image{width:132px!important;height:132px!important;aspect-ratio:1/1!important;min-height:132px!important;max-height:132px!important;border-radius:50%!important;background:#fff!important;border:1px solid #edf0ee!important;box-shadow:0 10px 26px rgba(12,54,43,.10)!important;display:flex!important;align-items:center!important;justify-content:center!important;overflow:hidden!important;margin:0 auto 12px!important}.category-cards.rpe-category-carousel .category-image img{width:88%!important;height:88%!important;max-width:88%!important;object-fit:contain!important;object-position:center!important;transform:none!important;background:transparent!important;border-radius:0!important;transition:transform .22s ease!important}.category-cards.rpe-category-carousel .category-card:hover .category-image img{transform:scale(1.05)!important}.category-cards.rpe-category-carousel .category-card>div:last-child{padding:0!important;display:block!important;width:100%!important}.category-cards.rpe-category-carousel .category-card small,.category-cards.rpe-category-carousel .category-card span{display:none!important}.category-cards.rpe-category-carousel .category-card h3{margin:0!important;font-family:system-ui,-apple-system,"Segoe UI",Arial,sans-serif!important;font-size:14px!important;line-height:1.28!important;font-weight:750!important;color:#173d32!important;text-align:center!important}.rpe-category-arrow{position:absolute;top:54px;z-index:20;width:46px;height:46px;border-radius:50%;border:1px solid #dde6e1;background:#fff;color:#173d32;box-shadow:0 8px 24px rgba(9,45,35,.12);display:grid;place-items:center;font-size:25px;line-height:1;cursor:pointer;transition:.18s}.rpe-category-arrow:hover{background:#0e5b43;color:#fff;border-color:#0e5b43}.rpe-category-arrow:disabled{opacity:.28;cursor:default}.rpe-category-prev{left:0}.rpe-category-next{right:0}.rpe-category-subtitle{margin:5px 0 0!important;color:#73827d!important;font-size:13px!important;line-height:1.45!important}.rpe-category-section-title{margin-bottom:0!important}'+
  '@media(max-width:700px){.rpe-category-shell{padding:0 34px;margin-top:12px}.category-cards.rpe-category-carousel{gap:12px!important;padding:8px 0 14px!important}.category-cards.rpe-category-carousel .category-card,.category-cards.rpe-category-carousel .category-card:last-child{flex-basis:108px!important;width:108px!important;min-width:108px!important;max-width:108px!important}.category-cards.rpe-category-carousel .category-image{width:92px!important;height:92px!important;min-height:92px!important;max-height:92px!important;margin-bottom:9px!important}.category-cards.rpe-category-carousel .category-card h3{font-size:12px!important;line-height:1.22!important}.rpe-category-arrow{top:33px;width:38px;height:38px;font-size:22px}.rpe-category-prev{left:-2px}.rpe-category-next{right:-2px}.rpe-category-subtitle{font-size:12px!important}}'+
  '@media(max-width:400px){.rpe-category-shell{padding:0 30px}.category-cards.rpe-category-carousel .category-card,.category-cards.rpe-category-carousel .category-card:last-child{flex-basis:102px!important;width:102px!important;min-width:102px!important;max-width:102px!important}.category-cards.rpe-category-carousel .category-image{width:86px!important;height:86px!important;min-height:86px!important;max-height:86px!important}.category-cards.rpe-category-carousel .category-card h3{font-size:11px!important}.rpe-category-arrow{width:36px;height:36px;top:31px}}'+
  '@media(prefers-reduced-motion:reduce){html:focus-within{scroll-behavior:auto!important}.rpe-compare-bar,.rpe-backtop,.rpe-skip-link,.rpe-search-option,.rpe-category-arrow{transition:none!important}.category-cards.rpe-category-carousel{scroll-behavior:auto!important}}';
  d.head.appendChild(st);
}
function showToast(d,msg){
  var t=d.getElementById("rpeFriendlyToast");
  if(!t){
    t=d.createElement("div");
    t.id="rpeFriendlyToast";
    t.setAttribute("role","status");
    t.style.cssText="position:fixed;left:50%;bottom:138px;transform:translateX(-50%);z-index:100000;background:#102f27;color:#fff;padding:10px 14px;border-radius:999px;font:700 11px/1.2 system-ui;box-shadow:0 10px 26px rgba(0,0,0,.18);opacity:0;transition:.18s;pointer-events:none";
    d.body.appendChild(t);
  }
  t.textContent=msg;
  t.style.opacity="1";
  clearTimeout(t.__timer);
  t.__timer=setTimeout(function(){t.style.opacity="0"},1800);
}
function installSkip(d){
  if(d.getElementById("rpeSkip"))return;
  var a=d.createElement("a");
  a.id="rpeSkip";
  a.className="rpe-skip-link";
  a.href="#products";
  a.textContent="Skip to products";
  d.body.insertBefore(a,d.body.firstChild);
}
function installHow(d){
  if(d.getElementById("rpeHow"))return;
  var productsSection=d.getElementById("products");
  if(!productsSection)return;
  var anchor=d.getElementById("rpeShopStrip")||productsSection;
  var sec=d.createElement("section");
  sec.id="rpeHow";
  sec.className="rpe-how";
  sec.innerHTML=
    '<div class="container"><div class="rpe-how-card">'+
      '<div class="rpe-how-head"><div><span class="eyebrow">SIMPLE SHOPPING</span><h2>How to order from RPE</h2></div><p>You do not need to guess prices or stock. Choose what you want and RPE confirms the current details before the order is finalized.</p></div>'+
      '<div class="rpe-how-grid">'+
        '<div class="rpe-how-step"><span class="rpe-how-num">1</span><div><b>Find your product</b><span>Search, browse a category, or use the camera/gallery product finder.</span></div></div>'+
        '<div class="rpe-how-step"><span class="rpe-how-num">2</span><div><b>Build your selection</b><span>Choose one or several products, save favourites, or compare similar options.</span></div></div>'+
        '<div class="rpe-how-step"><span class="rpe-how-num">3</span><div><b>Send your request</b><span>RPE confirms price, availability, delivery arrangements and important specifications.</span></div></div>'+
      '</div>'+
      '<div class="rpe-how-actions"><button class="primary" id="rpeHowBrowse" type="button">Browse products</button><a href="../rpe-v2/" target="_top">Open My RPE</a><button id="rpeHowHelp" type="button">Need help?</button></div>'+
    '</div></div>';
  anchor.parentNode.insertBefore(sec,anchor);
  sec.querySelector("#rpeHowBrowse").onclick=function(){productsSection.scrollIntoView({behavior:"smooth",block:"start"})};
  sec.querySelector("#rpeHowHelp").onclick=function(){
    var faq=d.getElementById("rpeFaq");
    if(faq)faq.scrollIntoView({behavior:"smooth",block:"start"});
    else showToast(d,"Help is available in the FAQ section below.");
  };
}

function installCategoryCarousel(d){
  var cards=d.querySelector(".category-cards");
  if(!cards)return false;

  cards.classList.add("rpe-category-carousel");

  // Keep the heading simple as the catalogue grows.
  var section=cards.closest("section")||cards.parentElement;
  if(section){
    var heading=section.querySelector("h2");
    if(heading){
      heading.textContent="Shop by Category";
      heading.classList.add("rpe-category-section-title");
      var next=heading.nextElementSibling;
      if(next&&/^(P|DIV)$/i.test(next.tagName)&&!next.classList.contains("rpe-category-shell")){
        if(next.textContent.trim()) {
          next.textContent="Swipe or use the arrows to explore all product categories.";
          next.classList.add("rpe-category-subtitle");
        }
      }
    }
  }

  var shell=cards.parentElement;
  if(!shell||!shell.classList.contains("rpe-category-shell")){
    shell=d.createElement("div");
    shell.className="rpe-category-shell";
    cards.parentNode.insertBefore(shell,cards);
    shell.appendChild(cards);

    var prev=d.createElement("button");
    prev.type="button";
    prev.className="rpe-category-arrow rpe-category-prev";
    prev.setAttribute("aria-label","Previous product categories");
    prev.innerHTML="&#8249;";

    var nextBtn=d.createElement("button");
    nextBtn.type="button";
    nextBtn.className="rpe-category-arrow rpe-category-next";
    nextBtn.setAttribute("aria-label","Next product categories");
    nextBtn.innerHTML="&#8250;";

    shell.insertBefore(prev,cards);
    shell.appendChild(nextBtn);

    function step(){
      var first=cards.querySelector(".category-card");
      return first?Math.max(120,first.getBoundingClientRect().width+18):180;
    }
    function updateArrows(){
      var max=Math.max(0,cards.scrollWidth-cards.clientWidth-2);
      prev.disabled=cards.scrollLeft<=2;
      nextBtn.disabled=cards.scrollLeft>=max;
    }
    prev.onclick=function(){cards.scrollBy({left:-step()*2,behavior:"smooth"})};
    nextBtn.onclick=function(){cards.scrollBy({left:step()*2,behavior:"smooth"})};
    cards.addEventListener("scroll",function(){requestAnimationFrame(updateArrows)},{passive:true});
    window.addEventListener("resize",updateArrows,{passive:true});
    setTimeout(updateArrows,50);
    setTimeout(updateArrows,800);
    var catObserver=new MutationObserver(function(){
      [].slice.call(cards.querySelectorAll(".category-card img")).forEach(function(img){
        img.loading="lazy";img.decoding="async";
      });
      requestAnimationFrame(updateArrows);
    });
    catObserver.observe(cards,{childList:true,subtree:false});

    // Keyboard users can move through the row as well.
    cards.addEventListener("keydown",function(e){
      if(e.key==="ArrowRight"){cards.scrollBy({left:step(),behavior:"smooth"})}
      if(e.key==="ArrowLeft"){cards.scrollBy({left:-step(),behavior:"smooth"})}
    });
  }

  // Reapply clean image fitting to any category cards added later.
  [].slice.call(cards.querySelectorAll(".category-card img")).forEach(function(img){
    img.loading="lazy";
    img.decoding="async";
  });

  return true;
}

function installStickyFilters(d){
  var filters=d.querySelector(".filters");
  if(filters)filters.classList.add("rpe-sticky-filters");
}
function installSearch(d,w,ps){
  var input=d.getElementById("search");
  if(!input||d.getElementById("rpeSearchSuggest"))return;
  input.setAttribute("autocomplete","off");
  input.setAttribute("aria-autocomplete","list");
  input.setAttribute("aria-controls","rpeSearchSuggest");
  input.placeholder="Search product, category or model";
  var host=input.parentElement;
  if(!host)return;
  host.classList.add("rpe-search-host");
  var box=d.createElement("div");
  box.id="rpeSearchSuggest";
  box.className="rpe-search-suggest";
  box.setAttribute("role","listbox");
  host.appendChild(box);
  var active=-1,current=[];
  function hay(p){
    return [p.name,p.category,p.description,p.rpeSku,p.rpeModel].filter(Boolean).join(" ").toLowerCase();
  }
  function close(){box.classList.remove("show");active=-1}
  function choose(p){
    input.value=p.name;
    try{if(typeof w.setActiveCategory==="function")w.setActiveCategory("All")}catch(e){}
    input.dispatchEvent(new Event("input",{bubbles:true}));
    close();
    var grid=d.getElementById("grid");
    if(grid)grid.scrollIntoView({behavior:"smooth",block:"start"});
    setTimeout(function(){try{if(typeof w.openProduct==="function")w.openProduct(p.id)}catch(e){}},90);
  }
  function render(){
    var q=input.value.trim().toLowerCase();
    active=-1;
    if(q.length<2){close();box.innerHTML="";return}
    current=ps.filter(function(p){return hay(p).indexOf(q)!==-1}).slice(0,6);
    box.innerHTML="";
    if(!current.length){
      box.innerHTML='<div class="rpe-search-empty">No close suggestion. Keep typing or try a category name.</div>';
      box.classList.add("show");return;
    }
    current.forEach(function(p,i){
      var b=d.createElement("button");
      b.type="button";b.className="rpe-search-option";b.setAttribute("role","option");
      b.innerHTML='<img src="'+esc(p.image)+'" loading="lazy" decoding="async" alt=""><span><b>'+esc(p.name)+'</b><small>'+esc(p.category)+(p.rpeModel?" • "+esc(p.rpeModel):"")+'</small></span>';
      b.onclick=function(e){e.preventDefault();choose(p)};
      box.appendChild(b);
    });
    box.classList.add("show");
  }
  input.addEventListener("input",render);
  input.addEventListener("focus",function(){if(input.value.trim().length>=2)render()});
  input.addEventListener("keydown",function(e){
    if(!box.classList.contains("show")||!current.length)return;
    var opts=[].slice.call(box.querySelectorAll(".rpe-search-option"));
    if(e.key==="ArrowDown"){e.preventDefault();active=(active+1)%opts.length}
    else if(e.key==="ArrowUp"){e.preventDefault();active=(active-1+opts.length)%opts.length}
    else if(e.key==="Enter"&&active>=0){e.preventDefault();choose(current[active]);return}
    else if(e.key==="Escape"){close();return}else return;
    opts.forEach(function(x,i){x.classList.toggle("active",i===active)});
  });
  d.addEventListener("click",function(e){if(!host.contains(e.target))close()});
}

function installImageZoom(d){
  if(d.getElementById("rpeImageZoom"))return;
  var z=d.createElement("div");
  z.id="rpeImageZoom";
  z.className="rpe-image-zoom";
  z.setAttribute("role","dialog");
  z.setAttribute("aria-modal","true");
  z.setAttribute("aria-label","Enlarged product image");
  z.innerHTML='<button type="button" aria-label="Close enlarged image">×</button><img alt=""><span class="rpe-image-zoom-note">Tap outside the image to close</span>';
  d.body.appendChild(z);
  var zi=z.querySelector("img"),close=z.querySelector("button");
  function hide(){z.classList.remove("open");zi.removeAttribute("src");d.body.style.overflow=""}
  close.onclick=hide;
  z.onclick=function(e){if(e.target===z)hide()};
  d.addEventListener("keydown",function(e){if(e.key==="Escape"&&z.classList.contains("open"))hide()});
  d.addEventListener("click",function(e){
    var img=e.target&&e.target.closest?e.target.closest("#productModal img"):null;
    if(!img||!img.src)return;
    zi.src=img.src;zi.alt=img.alt||"Product image";z.classList.add("open");d.body.style.overflow="hidden";setTimeout(function(){close.focus()},0);
  });
}
function installBackTop(d,w){
  if(d.getElementById("rpeBackTop"))return;
  var b=d.createElement("button");
  b.id="rpeBackTop";b.className="rpe-backtop";b.type="button";b.setAttribute("aria-label","Back to top");b.textContent="↑";
  d.body.appendChild(b);
  b.onclick=function(){w.scrollTo({top:0,behavior:"smooth"})};
  function update(){b.classList.toggle("show",(w.scrollY||d.documentElement.scrollTop||0)>850)}
  w.addEventListener("scroll",update,{passive:true});update();
}
function installCompareAndCardActions(d,w,ps,grid){
  if(!grid)return;
  var compareIds=[];
  var compareCategory="";
  var bar=d.getElementById("rpeCompareBar");
  if(!bar){
    bar=d.createElement("div");
    bar.id="rpeCompareBar";bar.className="rpe-compare-bar";bar.innerHTML='<span id="rpeCompareText">0 selected</span><button id="rpeCompareOpen" class="rpe-compare-open" type="button">Compare</button><button id="rpeCompareClear" class="rpe-compare-clear" type="button">Clear</button>';
    d.body.appendChild(bar);
  }
  var backdrop=d.getElementById("rpeCompareBackdrop");
  if(!backdrop){
    backdrop=d.createElement("div");
    backdrop.id="rpeCompareBackdrop";backdrop.className="rpe-compare-backdrop";
    backdrop.innerHTML='<section class="rpe-compare-panel" role="dialog" aria-modal="true" aria-labelledby="rpeCompareTitle"><div class="rpe-compare-head"><div><small style="color:#75867f">SIDE-BY-SIDE</small><h3 id="rpeCompareTitle">Compare products</h3></div><button id="rpeCompareClose" class="rpe-compare-close" type="button" aria-label="Close comparison">×</button></div><div id="rpeCompareScroll" class="rpe-compare-scroll"></div></section>';
    d.body.appendChild(backdrop);
  }
  function byId(id){return ps.find(function(p){return String(p.id)===String(id)})}
  function specVal(p,key){
    return p&&p.rpeSpecifications&&p.rpeSpecifications[key]!=null?String(p.rpeSpecifications[key]):"Not listed";
  }
  function updateButtons(){
    [].slice.call(grid.querySelectorAll(".rpe-compare-card")).forEach(function(b){
      var on=compareIds.indexOf(String(b.dataset.id))!==-1;
      b.setAttribute("aria-pressed",on?"true":"false");
      b.textContent=on?"✓ Comparing":"Compare";
    });
    var text=d.getElementById("rpeCompareText");
    if(text)text.textContent=compareIds.length+" selected";
    bar.classList.toggle("show",compareIds.length>0);
  }
  function clear(){
    compareIds=[];compareCategory="";updateButtons();
  }
  function toggle(p){
    var id=String(p.id),idx=compareIds.indexOf(id);
    if(idx!==-1){compareIds.splice(idx,1);if(!compareIds.length)compareCategory="";updateButtons();return}
    if(compareIds.length>=3){showToast(d,"You can compare up to 3 products.");return}
    if(compareIds.length&&p.category!==compareCategory){showToast(d,"Compare products from the same category for a clearer result.");return}
    if(!compareIds.length)compareCategory=p.category;
    compareIds.push(id);updateButtons();
    if(compareIds.length===1)showToast(d,"Choose one more "+p.category+" product to compare.");
  }
  function row(label,items){
    return '<div class="rpe-compare-row" style="--compare-count:'+items.length+'"><div class="rpe-compare-label">'+esc(label)+'</div>'+items.map(function(v){return '<div>'+v+'</div>'}).join("")+'</div>';
  }
  function open(){
    var items=compareIds.map(byId).filter(Boolean);
    if(items.length<2){showToast(d,"Choose at least 2 products to compare.");return}
    var html='<div class="rpe-compare-table">';
    html+=row("Product",items.map(function(p){return '<div class="rpe-compare-product"><img src="'+esc(p.image)+'" alt=""><b>'+esc(p.name)+'</b><small>'+esc(p.category)+'</small><a href="'+whatsappHref(p)+'" target="_blank" rel="noopener">Ask on WhatsApp</a></div>'}));
    html+=row("Product ID / Model",items.map(function(p){return esc(p.rpeSku||p.rpeModel||p.id)}));
    html+=row("Series",items.map(function(p){return esc(specVal(p,"series"))}));
    html+=row("LED",items.map(function(p){return esc(specVal(p,"led_beads"))}));
    html+=row("Battery",items.map(function(p){return esc(specVal(p,"battery_capacity"))}));
    html+=row("Solar panel",items.map(function(p){return esc(specVal(p,"solar_panel"))}));
    html+=row("Working time",items.map(function(p){return esc(specVal(p,"working_time"))}));
    html+=row("Dimensions",items.map(function(p){return esc(p.rpeDimensions||"Not listed")}));
    html+=row("Key details",items.map(function(p){return esc(p.description||"Contact RPE for details.")}));
    html+=row("Price",items.map(function(){return "Ask for price"}));
    html+=row("Availability",items.map(function(){return "Confirm with RPE"}));
    html+="</div>";
    d.getElementById("rpeCompareScroll").innerHTML=html;
    backdrop.classList.add("open");d.body.style.overflow="hidden";
    setTimeout(function(){d.getElementById("rpeCompareClose").focus()},0);
  }
  function close(){backdrop.classList.remove("open");d.body.style.overflow=""}
  d.getElementById("rpeCompareOpen").onclick=open;
  d.getElementById("rpeCompareClear").onclick=clear;
  d.getElementById("rpeCompareClose").onclick=close;
  backdrop.addEventListener("click",function(e){if(e.target===backdrop)close()});
  d.addEventListener("keydown",function(e){if(e.key==="Escape"&&backdrop.classList.contains("open"))close()});
  function decorate(){
    [].slice.call(grid.querySelectorAll(".product")).forEach(function(card){
      var p=getProductForCard(card,ps);if(!p)return;
      var img=card.querySelector("img");
      if(img){img.loading="lazy";img.decoding="async";if(!img.alt)img.alt=p.name;img.setAttribute("fetchpriority","low")}
      var row=card.querySelector(".rpe-card-quick");
      if(!row){
        row=d.createElement("div");row.className="rpe-card-quick";
        var wa=d.createElement("a");wa.className="rpe-wa-card";wa.href=whatsappHref(p);wa.target="_blank";wa.rel="noopener";wa.textContent="WhatsApp";
        wa.setAttribute("aria-label","Ask RPE about "+p.name+" on WhatsApp");wa.onclick=function(e){e.stopPropagation()};
        var cmp=d.createElement("button");cmp.type="button";cmp.className="rpe-compare-card";cmp.dataset.id=String(p.id);cmp.textContent="Compare";cmp.setAttribute("aria-pressed","false");
        cmp.setAttribute("aria-label","Compare "+p.name);cmp.onclick=function(e){e.stopPropagation();toggle(p)};
        row.appendChild(wa);row.appendChild(cmp);card.appendChild(row);
      }
    });
    updateButtons();
  }
  decorate();
  var obs=new MutationObserver(function(){requestAnimationFrame(decorate)});
  obs.observe(grid,{childList:true,subtree:true});
}
function enhance(){
  var d=idoc(),w=iwin(),ps=products();
  if(!d||!w||!d.body||!ps.length)return false;
  installStyles(d);
  installSkip(d);
  installHow(d);
  installCategoryCarousel(d);
  installStickyFilters(d);
  installSearch(d,w,ps);
  installBackTop(d,w);
  installImageZoom(d);
  var grid=d.getElementById("grid");
  if(grid&&!d.getElementById("rpeCompareBar"))installCompareAndCardActions(d,w,ps,grid);
  return true;
}
function boot(){
  bootCount++;
  if(enhance())return;
  if(bootCount<30)bootTimer=setTimeout(boot,250);
}
frame.addEventListener("load",function(){bootCount=0;clearTimeout(bootTimer);setTimeout(boot,350)});
setTimeout(boot,500);

})();