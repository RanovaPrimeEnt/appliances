(function(){
"use strict";

var frame=document.getElementById("site");
if(!frame)return;

var API="https://igaerssbzobutlwvjfwt.supabase.co/rest/v1";
var KEY="sb_publishable_NMzJFpXOIJMEH3LW50Cs9g_Otc6tlYr";

function idoc(){
  try{return frame.contentDocument||frame.contentWindow.document}catch(e){return null}
}
function esc(v){
  return String(v==null?"":v).replace(/[&<>"']/g,function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c];
  });
}
function pretty(k){
  return String(k||"").replace(/_/g," ").replace(/\b\w/g,function(x){return x.toUpperCase()});
}
function value(v){
  if(typeof v==="boolean")return v?"Yes":"No";
  return String(v==null?"":v);
}
function imageOf(p){
  var a=(p.product_images||[]).slice();
  a.sort(function(x,y){
    var primary=(y.is_primary?1:0)-(x.is_primary?1:0);
    if(primary)return primary;
    return (x.sort_order||0)-(y.sort_order||0);
  });
  return a[0]&&a[0].image_url||"";
}
function spec(p,key,fallback){
  return p&&p.specifications&&p.specifications[key]||fallback||"";
}

function ensureSolarCategoryCard(d){
  if(!d)return null;
  installStyles(d);
  var categoryCards=d.querySelector(".category-cards");
  if(!categoryCards)return null;
  categoryCards.classList.add("rpeFourCategories");
  var card=d.getElementById("rpeSolarCategoryCard");
  if(!card){
    card=d.createElement("button");
    card.type="button";
    card.id="rpeSolarCategoryCard";
    card.className="category-card";
    card.innerHTML=
      '<div class="category-image" style="background:linear-gradient(145deg,#eaf4ef,#dbece5);display:grid;place-items:center">'+
      '<div style="text-align:center;padding:18px;color:#0d5b43"><div style="font-size:42px;line-height:1">☀</div><b style="display:block;margin-top:8px;font-size:13px">Solar Street Lights</b></div></div>'+
      '<div><small>OUTDOOR SOLAR</small><h3>Solar Street Lights</h3><span>2 series · 6 models</span></div>';
    card.onclick=function(){
      var target=d.getElementById("rpe-solar-street-lights");
      if(target)target.scrollIntoView({behavior:"smooth",block:"start"});
    };
    categoryCards.appendChild(card);
  }
  return card;
}

async function getSolarProducts(){
  var h={apikey:KEY};
  var cr=await fetch(API+"/categories?select=id,name,slug,description&slug=eq.solar-street-lights&active=eq.true&limit=1",{headers:h});
  if(!cr.ok)throw new Error("Unable to load category");
  var cats=await cr.json();
  if(!cats.length)return {category:null,products:[]};
  var cat=cats[0];
  var url=API+"/products?select=id,sku,name,slug,short_description,description,price,currency,stock_status,dimensions,specifications,product_images(image_url,is_primary,sort_order)&category_id=eq."+encodeURIComponent(cat.id)+"&active=eq.true&order=name.asc";
  var pr=await fetch(url,{headers:h});
  if(!pr.ok)throw new Error("Unable to load products");
  var raw=await pr.json(),seen={},unique=[];
  raw.forEach(function(p){
    if(!p.sku||seen[p.sku])return;
    seen[p.sku]=true;
    unique.push(p);
  });
  unique.sort(function(a,b){
    var as=Number(spec(a,"series_order",99)),bs=Number(spec(b,"series_order",99));
    if(as!==bs)return as-bs;
    return Number(spec(a,"power_order",999999))-Number(spec(b,"power_order",999999));
  });
  return {category:cat,products:unique};
}

function installStyles(d){
  if(d.getElementById("rpeSolarStyle"))return;
  var style=d.createElement("style");
  style.id="rpeSolarStyle";
  style.textContent=
  '#rpe-solar-street-lights{max-width:1200px;margin:44px auto 64px;padding:0 18px;color:#173d32;font-family:Inter,system-ui,-apple-system,"Segoe UI",Arial,sans-serif}'+
  '.rpeSolarHero{overflow:hidden;display:grid;grid-template-columns:1.08fr .92fr;min-height:355px;border-radius:28px;background:linear-gradient(135deg,#082f27,#0e5b43);box-shadow:0 22px 55px rgba(10,50,40,.16)}'+
  '.rpeSolarHeroCopy{padding:42px;display:flex;flex-direction:column;justify-content:center}.rpeSolarKicker{font-size:12px;font-weight:900;letter-spacing:.13em;color:#e0b44e;text-transform:uppercase}'+
  '.rpeSolarHero h2{margin:8px 0 12px;color:#fff;font:700 clamp(32px,5vw,56px)/1.02 Georgia,serif;letter-spacing:-.03em}.rpeSolarHero p{margin:0 0 22px;color:#d9e7e2;font-size:15px;line-height:1.65;max-width:590px}'+
  '.rpeSolarHeroBtns{display:flex;gap:10px;flex-wrap:wrap}.rpeSolarBtn{min-height:44px;border:0;border-radius:999px;padding:11px 17px;font-weight:850;font-size:13px;display:inline-flex;align-items:center;justify-content:center;text-decoration:none;cursor:pointer}.rpeSolarBtn.primary{background:#d4a33f;color:#092e26}.rpeSolarBtn.secondary{background:#ffffff14;color:#fff;border:1px solid #ffffff35}'+
  '.rpeSolarHeroMedia{background:#edf6ff;min-height:355px;display:grid;place-items:center;padding:16px}.rpeSolarHeroMedia img{width:100%;height:100%;max-height:430px;object-fit:contain;border-radius:20px}'+
  '.rpeSolarHead{display:flex;justify-content:space-between;align-items:end;gap:20px;margin:36px 0 16px}.rpeSolarHead h3{margin:0;font:700 30px/1.1 Georgia,serif}.rpeSolarHead p{margin:6px 0 0;color:#687b74;font-size:13px}.rpeSolarCount{font-size:12px;color:#61736d;background:#edf3f0;padding:8px 11px;border-radius:999px;font-weight:800;white-space:nowrap}'+
  '.rpeSolarSeries{margin:28px 0 38px}.rpeSolarSeriesHead{display:flex;justify-content:space-between;align-items:end;gap:16px;padding:0 2px 12px;border-bottom:1px solid #dfe8e4;margin-bottom:16px}.rpeSolarSeriesHead h4{margin:0;font:700 25px/1.15 Georgia,serif;color:#113e32}.rpeSolarSeriesHead p{margin:5px 0 0;color:#667972;font-size:12px;line-height:1.5;max-width:720px}.rpeSolarSeriesBadge{font-size:11px;font-weight:850;background:#f0f5f2;color:#0e5b43;border-radius:999px;padding:7px 10px;white-space:nowrap}'+
  '.rpeFourCategories{grid-template-columns:repeat(4,minmax(0,1fr))!important}.rpeFourCategories .category-card:last-child{grid-column:auto!important}.rpeFourCategories .category-image{height:220px!important}.rpeFourCategories .category-image img{width:100%;height:100%;object-fit:cover!important;object-position:center 24%;image-rendering:auto}'+
  '.rpeSolarGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px}.rpeSolarCard{background:#fff;border:1px solid #e0e8e4;border-radius:22px;overflow:hidden;box-shadow:0 10px 30px rgba(12,54,43,.07);display:flex;flex-direction:column}.rpeSolarImage{height:320px;background:#f6f8f7;display:grid;place-items:center;overflow:hidden;position:relative;cursor:zoom-in}.rpeSolarImage img{width:100%;height:100%;object-fit:contain;image-rendering:auto;transform:translateZ(0)}.rpeSolarImage:after{content:"Tap for HD view";position:absolute;right:10px;bottom:10px;background:#0d3329e6;color:#fff;border-radius:999px;padding:7px 10px;font-size:10px;font-weight:850;box-shadow:0 4px 14px #0002}'+
  '.rpeSolarBody{padding:16px;display:flex;flex-direction:column;flex:1}.rpeSolarSku{font-size:10px;color:#70827b;font-weight:800;letter-spacing:.05em}.rpeSolarCard h4{font-size:17px;margin:5px 0 8px;line-height:1.3}.rpeSolarDesc{font-size:12px;color:#667972;line-height:1.5;margin:0 0 12px}.rpeSolarSpecs{display:grid;gap:0;margin-bottom:15px}.rpeSolarSpec{display:flex;justify-content:space-between;gap:10px;font-size:11px;padding:6px 0;border-bottom:1px solid #edf1ef}.rpeSolarSpec span{color:#72837d}.rpeSolarSpec b{text-align:right}'+
  '.rpeSolarPrice{font-size:13px;font-weight:900;color:#0e5b43;margin-top:auto;margin-bottom:10px}.rpeSolarActions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.rpeSolarActions button,.rpeSolarActions a{border:0;border-radius:11px;min-height:42px;font-size:11px;font-weight:850;text-decoration:none;display:grid;place-items:center;cursor:pointer}.rpeSolarDetails{background:#eff4f2;color:#173d32}.rpeSolarCart{background:#0e5b43;color:#fff}'+
  '.rpeSolarNote{margin-top:14px;padding:12px 14px;border-radius:14px;background:#f7f4ec;color:#66766f;font-size:11px;line-height:1.55}.rpeSolarModal{position:fixed;inset:0;z-index:999999;background:#071f19a8;display:none;align-items:center;justify-content:center;padding:18px}.rpeSolarModal.show{display:flex}.rpeSolarModalBox{width:min(900px,100%);max-height:min(88vh,860px);overflow:auto;background:#fff;border-radius:24px;box-shadow:0 30px 80px #0005}'+
  '.rpeSolarModalTop{display:flex;justify-content:space-between;align-items:center;padding:18px 20px;border-bottom:1px solid #e5ece8;position:sticky;top:0;background:#fff;z-index:2}.rpeSolarClose{width:44px;height:44px;border-radius:50%;border:1px solid #e0e8e4;background:#fff;font-size:24px}.rpeSolarModalContent{display:grid;grid-template-columns:.9fr 1.1fr;gap:22px;padding:22px}.rpeSolarModalContent img{width:100%;max-height:520px;object-fit:contain;background:#f4f7f6;border-radius:18px}.rpeSolarModalContent h3{font:700 28px/1.12 Georgia,serif;margin:4px 0 8px}.rpeSolarModalContent p{font-size:13px;color:#61736d;line-height:1.6}'+
  '.rpeSolarSpecTable{border:1px solid #e3ebe7;border-radius:14px;overflow:hidden}.rpeSolarSpecRow{display:grid;grid-template-columns:42% 58%;font-size:12px;border-bottom:1px solid #e8efeb}.rpeSolarSpecRow:last-child{border-bottom:0}.rpeSolarSpecRow span,.rpeSolarSpecRow b{padding:9px 10px}.rpeSolarSpecRow span{background:#f4f7f5;color:#60736b}.rpeSolarSpecRow b{font-weight:700}'+
  '@media(max-width:980px){.rpeFourCategories{grid-template-columns:repeat(2,minmax(0,1fr))!important}.rpeSolarHero{grid-template-columns:1fr}.rpeSolarHeroCopy{padding:28px 22px}.rpeSolarHeroMedia{min-height:280px;order:-1}.rpeSolarGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.rpeSolarModalContent{grid-template-columns:1fr}.rpeSolarImage{height:290px}}'+
  '@media(max-width:620px){.rpeFourCategories{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important}.rpeFourCategories .category-image{height:150px!important}#rpe-solar-street-lights{padding:0 10px;margin:28px auto 50px}.rpeSolarGrid{grid-template-columns:1fr;gap:12px}.rpeSolarImage{height:auto;aspect-ratio:3/4}.rpeSolarBody{padding:14px}.rpeSolarCard h4{font-size:16px}.rpeSolarHero h2{font-size:34px}.rpeSolarHeroMedia{min-height:245px}.rpeSolarHead h3{font-size:24px}.rpeSolarCount{display:none}.rpeSolarSeriesHead{align-items:flex-start}.rpeSolarSeriesHead h4{font-size:21px}.rpeSolarSeriesBadge{font-size:10px}}'+
  '@media(max-width:380px){.rpeFourCategories{grid-template-columns:1fr!important}.rpeFourCategories .category-image{height:210px!important}}';
  d.head.appendChild(style);
}

function openDetails(d,modal,p){
  var specs=p.specifications||{},rows="";
  Object.keys(specs).forEach(function(k){
    if(k==="series"||k==="series_order"||k==="power_order")return;
    rows+='<div class="rpeSolarSpecRow"><span>'+esc(pretty(k))+'</span><b>'+esc(value(specs[k]))+'</b></div>';
  });
  if(p.dimensions){
    rows+='<div class="rpeSolarSpecRow"><span>Dimensions</span><b>'+esc(p.dimensions)+'</b></div>';
  }
  var pic=imageOf(p);
  var whats="Hello Ranova Prime Enterprise, I am interested in "+p.name+" ("+p.sku+"). Please confirm the current price and availability.";
  modal.querySelector(".rpeSolarModalContent").innerHTML=
    '<div>'+(pic?'<img src="'+pic+'" alt="'+esc(p.name)+'">':'')+'</div>'+
    '<div><span class="rpeSolarKicker">'+esc(p.sku)+'</span><h3>'+esc(p.name)+'</h3><p>'+esc(p.description||p.short_description||"")+'</p>'+
    '<div class="rpeSolarSpecTable">'+rows+'</div>'+
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">'+
    '<a class="rpeSolarBtn primary" href="../rpe-v2/?add='+encodeURIComponent(p.sku)+'" target="_top">Add to My RPE cart</a>'+
    '<a class="rpeSolarBtn" style="background:#edf3f0;color:#173d32" href="https://wa.me/233542846895?text='+encodeURIComponent(whats)+'" target="_blank" rel="noopener">WhatsApp RPE</a>'+
    '</div></div>';
  modal.classList.add("show");
  modal.querySelector(".rpeSolarClose").focus();
}

async function enhanceSolarStreetLights(){
  var d=idoc();
  if(!d)return;
  var categoryCard=ensureSolarCategoryCard(d);
  var nav=d.getElementById("navLinks");
  if(nav&&!d.getElementById("rpeMyAccountNav")){
    var account=d.createElement("a");
    account.id="rpeMyAccountNav";
    account.href="../rpe-v2/";
    account.target="_top";
    account.textContent="My RPE";
    nav.appendChild(account);
  }
  if(d.getElementById("rpe-solar-street-lights"))return;
  try{
    var data=await getSolarProducts(),ps=data.products||[];
    if(!data.category||!ps.length)return;
    installStyles(d);
    var hero=ps.find(function(p){return p.sku==="RPE-SOLAR-504-8K"})||ps[0];
    var heroPic=imageOf(hero);
    var section=d.createElement("section");
    section.id="rpe-solar-street-lights";
    section.innerHTML=
      '<div class="rpeSolarHero">'+
        '<div class="rpeSolarHeroCopy"><span class="rpeSolarKicker">RPE outdoor lighting</span><h2>Solar Street Lights</h2>'+
        '<p>Solar-powered outdoor lighting for streets, compounds, farms, parking areas and other outdoor spaces. Choose from clearly separated models based on their actual specifications.</p>'+
        '<div class="rpeSolarHeroBtns"><button class="rpeSolarBtn primary" id="rpeSolarBrowse">Browse '+ps.length+' models</button>'+
        '<a class="rpeSolarBtn secondary" href="https://wa.me/233542846895?text='+encodeURIComponent("Hello Ranova Prime Enterprise, I am interested in your Solar Street Lights.")+'" target="_blank" rel="noopener">Ask RPE</a></div></div>'+
        '<div class="rpeSolarHeroMedia">'+(heroPic?'<img src="'+heroPic+'" alt="Solar Street Lights category">':'')+'</div>'+
      '</div>'+
      '<div class="rpeSolarHead"><div><h3>Choose your solar street light</h3><p>Two product families are shown separately. Each family runs from the lower-capacity option to the higher-capacity option.</p></div><span class="rpeSolarCount">'+ps.length+' unique products</span></div>'+
      '<div id="rpeSolarGroups"></div>'+
      '<div class="rpeSolarNote">Prices and current availability are confirmed by RPE before purchase. The supplied 240 LED product sheet states a 50,000mAh battery capacity; RPE should confirm that specification before an order is finalised.</div>';

    var about=d.getElementById("about");
    var footer=d.querySelector("footer");
    if(about&&about.parentNode)about.parentNode.insertBefore(section,about);
    else if(footer&&footer.parentNode)footer.parentNode.insertBefore(section,footer);
    else d.body.appendChild(section);

    categoryCard=ensureSolarCategoryCard(d);
    if(categoryCard){
      categoryCard.innerHTML=
        '<div class="category-image">'+(heroPic?'<img src="'+heroPic+'" loading="eager" decoding="async" alt="Solar Street Lights">':'')+'</div>'+
        '<div><small>OUTDOOR SOLAR</small><h3>Solar Street Lights</h3><span>2 series · '+ps.length+' models</span></div>';
      categoryCard.onclick=function(){section.scrollIntoView({behavior:"smooth",block:"start"})};
    }

    var groupsRoot=section.querySelector("#rpeSolarGroups");
    var series=[
      {
        name:"Modular Series",
        description:"Segmented-head solar street lights, arranged from 96 LED to 240 LED so customers can move from the lower lighting configuration to the higher one.",
        items:ps.filter(function(p){return spec(p,"series")==="Modular Series"})
      },
      {
        name:"Full Panel Series",
        description:"High-density 504 LED panel models, arranged by battery capacity from 5000mAh to 8000mAh.",
        items:ps.filter(function(p){return spec(p,"series")==="Full Panel Series"})
      }
    ];
    series.forEach(function(group){
      if(!group.items.length)return;
      var wrap=d.createElement("section");
      wrap.className="rpeSolarSeries";
      wrap.innerHTML=
        '<div class="rpeSolarSeriesHead"><div><h4>'+esc(group.name)+'</h4><p>'+esc(group.description)+'</p></div>'+
        '<span class="rpeSolarSeriesBadge">'+group.items.length+' model'+(group.items.length===1?'':'s')+'</span></div>'+
        '<div class="rpeSolarGrid"></div>';
      var grid=wrap.querySelector(".rpeSolarGrid");
      group.items.forEach(function(p){
        var led=spec(p,"led_beads"),battery=spec(p,"battery_capacity"),working=spec(p,"working_time"),pic=imageOf(p);
        var card=d.createElement("article");
        card.className="rpeSolarCard";
        card.innerHTML=
          '<div class="rpeSolarImage">'+(pic?'<img src="'+pic+'" loading="lazy" decoding="async" alt="'+esc(p.name)+'">':'<span>Solar Street Light</span>')+'</div>'+
          '<div class="rpeSolarBody"><span class="rpeSolarSku">'+esc(p.sku)+'</span><h4>'+esc(p.name)+'</h4>'+
          '<p class="rpeSolarDesc">'+esc(p.short_description||"")+'</p>'+
          '<div class="rpeSolarSpecs">'+
            (led?'<div class="rpeSolarSpec"><span>LED</span><b>'+esc(led)+'</b></div>':'')+
            (battery?'<div class="rpeSolarSpec"><span>Battery</span><b>'+esc(battery)+'</b></div>':'')+
            (working?'<div class="rpeSolarSpec"><span>Working time</span><b>'+esc(working)+'</b></div>':'')+
          '</div>'+
          '<div class="rpeSolarPrice">'+(p.price==null?'Ask for price':'GHS '+Number(p.price).toFixed(2))+' · Confirm availability</div>'+
          '<div class="rpeSolarActions"><button class="rpeSolarDetails" type="button">View details</button>'+
          '<a class="rpeSolarCart" href="../rpe-v2/?add='+encodeURIComponent(p.sku)+'" target="_top">Add to cart</a></div></div>';
        card.querySelector(".rpeSolarDetails").onclick=function(){openDetails(d,modal,p)};
        card.querySelector(".rpeSolarImage").onclick=function(){openHd(p)};
        grid.appendChild(card);
      });
      groupsRoot.appendChild(wrap);
    });

    var modal=d.createElement("div");
    modal.className="rpeSolarModal";
    modal.innerHTML='<div class="rpeSolarModalBox" role="dialog" aria-modal="true" aria-label="Solar street light details"><div class="rpeSolarModalTop"><b>Product details</b><button class="rpeSolarClose" type="button" aria-label="Close">×</button></div><div class="rpeSolarModalContent"></div></div>';
    d.body.appendChild(modal);

    var hd=d.createElement("div");
    hd.className="rpeSolarHd";
    hd.innerHTML='<button class="rpeSolarHdClose" type="button" aria-label="Close HD image">×</button><img alt="Solar Street Light HD view">';
    d.body.appendChild(hd);
    function openHd(p){
      var src=imageOf(p); if(!src)return;
      var im=hd.querySelector("img");im.src=src;im.alt=p.name+" HD product view";
      hd.classList.add("show");hd.querySelector(".rpeSolarHdClose").focus();
    }
    hd.querySelector(".rpeSolarHdClose").onclick=function(){hd.classList.remove("show")};
    hd.onclick=function(e){if(e.target===hd)hd.classList.remove("show")};

    section.querySelector("#rpeSolarBrowse").onclick=function(){groupsRoot.scrollIntoView({behavior:"smooth",block:"start"})};
    modal.querySelector(".rpeSolarClose").onclick=function(){modal.classList.remove("show")};
    modal.onclick=function(e){if(e.target===modal)modal.classList.remove("show")};
    d.addEventListener("keydown",function(e){if(e.key==="Escape"){modal.classList.remove("show");hd.classList.remove("show")}});
  }catch(e){
    console.warn("Solar Street Lights section could not load",e);
    if(d&&!d.getElementById("rpe-solar-street-lights")){
      var fallback=d.createElement("section");
      fallback.id="rpe-solar-street-lights";
      fallback.innerHTML=
        '<div class="rpeSolarHero"><div class="rpeSolarHeroCopy"><span class="rpeSolarKicker">RPE outdoor lighting</span>'+
        '<h2>Solar Street Lights</h2><p>The solar-light catalogue is loading. Please keep this page open for a moment or refresh if your connection is slow.</p>'+
        '<div class="rpeSolarHeroBtns"><a class="rpeSolarBtn primary" href="https://wa.me/233542846895?text='+encodeURIComponent("Hello Ranova Prime Enterprise, I am interested in your Solar Street Lights.")+'" target="_blank" rel="noopener">Ask RPE</a></div></div>'+
        '<div class="rpeSolarHeroMedia" style="color:#0e5b43;font-weight:900;font-size:18px">Solar Street Lights</div></div>';
      var about=d.getElementById("about"),footer=d.querySelector("footer");
      if(about&&about.parentNode)about.parentNode.insertBefore(fallback,about);
      else if(footer&&footer.parentNode)footer.parentNode.insertBefore(fallback,footer);
      else d.body.appendChild(fallback);
      setTimeout(function(){fallback.remove();enhanceSolarStreetLights()},1800);
    }
  }
}

var solarBootAttempts=0;
function bootSolar(){
  solarBootAttempts++;
  var d=idoc();
  if(d){
    ensureSolarCategoryCard(d);
    enhanceSolarStreetLights();
    if(d.getElementById("rpe-solar-street-lights")&&d.getElementById("rpeSolarCategoryCard"))return;
  }
  if(solarBootAttempts<24)setTimeout(bootSolar,250);
}
frame.addEventListener("load",function(){solarBootAttempts=0;bootSolar()});
setTimeout(bootSolar,0);
window.__rpeSolarRefresh=bootSolar;
})();