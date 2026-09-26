(function(){
"use strict";

var frame=document.getElementById("site");
if(!frame)return;

var API="https://igaerssbzobutlwvjfwt.supabase.co/rest/v1";
var KEY="sb_publishable_NMzJFpXOIJMEH3LW50Cs9g_Otc6tlYr";
var integrating=null;

function idoc(){
  try{return frame.contentDocument||frame.contentWindow.document}catch(e){return null}
}
function spec(p,key,fallback){
  return p&&p.specifications&&p.specifications[key]!=null?p.specifications[key]:(fallback||"");
}
function imageOf(p){
  var imgs=(p.product_images||[]).slice().sort(function(a,b){
    var primary=(b.is_primary?1:0)-(a.is_primary?1:0);
    return primary||((a.sort_order||0)-(b.sort_order||0));
  });
  return imgs[0]&&imgs[0].image_url||"";
}
function seriesRank(p){
  var n=Number(spec(p,"series_order",99));
  return isFinite(n)?n:99;
}
function powerRank(p){
  var n=Number(spec(p,"power_order",999999));
  return isFinite(n)?n:999999;
}
function cleanDescription(p){
  var series=spec(p,"series","");
  var bits=[];
  if(series)bits.push(series);
  if(p.short_description)bits.push(p.short_description);
  var battery=spec(p,"battery_capacity","");
  var working=spec(p,"working_time","");
  if(battery)bits.push("Battery: "+battery+".");
  if(working)bits.push("Working time: "+working+".");
  return bits.join(" ");
}

function ensureSolarCategory(d){
  if(!d)return false;
  var FALLBACK_SOLAR_IMAGE="./images/solar-category-cover.svg";

  var cards=d.querySelector(".category-cards");
  if(!cards)return false;
  cards.classList.add("rpeFourCategories");

  var card=d.getElementById("rpeSolarCategoryCard");
  if(!card){
    card=d.createElement("button");
    card.type="button";
    card.id="rpeSolarCategoryCard";
    card.className="category-card";
    card.innerHTML=
      '<div class="category-image"><img src="'+FALLBACK_SOLAR_IMAGE+'" loading="eager" decoding="async" alt="Solar Street Lights" onerror="this.onerror=null;this.src=\'./images/solar-category-cover.svg\'"></div>'+
      '<div><small>OUTDOOR SOLAR</small><h3>Solar Street Lights</h3><span>2 series · 6 models</span></div>';
    cards.insertBefore(card,d.getElementById("rpeLightingCategoryCard"));
  }
  card.onclick=function(){
    try{
      if(frame.contentWindow.setActiveCategory)frame.contentWindow.setActiveCategory("Solar Street Lights");
    }catch(e){}
    var target=d.getElementById("products");
    if(target)target.scrollIntoView({behavior:"smooth",block:"start"});
    integrateSolarProducts();
  };

  var filters=d.querySelector(".filters");
  if(filters&&!d.getElementById("rpeSolarFilter")){
    var filter=d.createElement("button");
    filter.id="rpeSolarFilter";
    filter.type="button";
    filter.className="filter";
    filter.dataset.cat="Solar Street Lights";
    filter.textContent="Solar Lights";
    filter.onclick=function(){
      integrateSolarProducts().then(function(){
        try{
          if(frame.contentWindow.setActiveCategory)frame.contentWindow.setActiveCategory("Solar Street Lights");
        }catch(e){}
      });
    };
    filters.insertBefore(filter,filters.querySelector('[data-cat="Lighting & Fans"]'));
  }

  [].slice.call(d.querySelectorAll(".stats div")).forEach(function(box){
    var label=box.querySelector("span"),strong=box.querySelector("strong");
    if(label&&strong&&/Main categories/i.test(label.textContent))strong.textContent="5";
    if(label&&strong&&/Catalogue items/i.test(label.textContent)&&/^\s*36\+?\s*$/.test(strong.textContent))strong.textContent=String((frame.contentWindow.PRODUCTS||[]).length||84);
  });

  return true;
}

function installUi(d,products,totalCount){
  if(!d)return;
  ensureSolarCategory(d);

  // Remove the former oversized standalone solar section. Solar now lives in the main catalogue.
  var old=d.getElementById("rpe-solar-street-lights");
  if(old)old.remove();
  var oldStyle=d.getElementById("rpeSolarStyle");
  if(oldStyle)oldStyle.remove();

  if(!d.getElementById("rpeSolarCatalogueStyle")){
    var st=d.createElement("style");
    st.id="rpeSolarCatalogueStyle";
    st.textContent=`.category-cards.rpeFourCategories{
  grid-template-columns:repeat(5,minmax(0,1fr))!important;
  gap:18px!important;
  align-items:stretch;
}
.category-cards.rpeFourCategories .category-card{
  min-width:0!important;
  overflow:hidden!important;
  border-radius:22px!important;
  background:#fbfaf7!important;
  display:flex!important;
  flex-direction:column!important;
  transition:transform .22s ease,box-shadow .22s ease!important;
}
.category-cards.rpeFourCategories .category-card:hover{
  transform:translateY(-4px);
  box-shadow:0 14px 32px rgba(8,47,39,.10)!important;
}
.category-cards.rpeFourCategories .category-card:last-child{
  grid-column:auto!important;
}
.category-cards.rpeFourCategories .category-image{
  width:100%!important;
  height:auto!important;
  aspect-ratio:16/10!important;
  overflow:hidden!important;
  background:#f1f5f3!important;
  border-radius:0!important;
  display:block!important;
  flex:0 0 auto!important;
}
.category-cards.rpeFourCategories .category-image img{
  display:block!important;
  width:100%!important;
  height:100%!important;
  max-width:none!important;
  object-fit:cover!important;
  background:#f1f5f3!important;
  image-rendering:auto!important;
  transition:transform .28s ease!important;
}
.category-cards.rpeFourCategories .category-card>div:last-child{
  padding:18px 20px 20px!important;
  display:block!important;
  flex:1 1 auto!important;
}
.category-cards.rpeFourCategories .category-card h3{
  font-size:clamp(20px,1.7vw,25px)!important;
  line-height:1.15!important;
  margin:7px 0 8px!important;
}
.category-cards.rpeFourCategories .category-card span{
  line-height:1.4!important;
}
.category-cards.rpeFourCategories .category-card:nth-child(1) .category-image img{
  transform:scale(1.12);
  object-position:center 50%!important;
}
.category-cards.rpeFourCategories .category-card:nth-child(2) .category-image img{
  transform:scale(1.04);
  object-position:center 48%!important;
}
.category-cards.rpeFourCategories .category-card:nth-child(3) .category-image img{
  transform:scale(1.05);
  object-position:center 48%!important;
}
#rpeSolarCategoryCard .category-image img{
  transform:scale(1.08);
  object-position:center 15%!important;
}
.category-cards.rpeFourCategories .category-card:hover .category-image img{
  transform:scale(1.09);
}
.category-cards.rpeFourCategories .category-card:nth-child(1):hover .category-image img{
  transform:scale(1.16);
}
#rpeSolarCategoryCard:hover .category-image img{
  transform:scale(1.12);
}
@media(max-width:1180px){
  .category-cards.rpeFourCategories{
    grid-template-columns:repeat(2,minmax(0,1fr))!important;
    gap:16px!important;
  }
  .category-cards.rpeFourCategories .category-image{
    aspect-ratio:16/9!important;
  }
  .category-cards.rpeFourCategories .category-card h3{
    font-size:24px!important;
  }
}
@media(max-width:700px){
  .category-cards.rpeFourCategories{
    grid-template-columns:1fr!important;
    gap:16px!important;
    margin-top:22px!important;
  }
  .category-cards.rpeFourCategories .category-card:last-child{
    grid-column:auto!important;
  }
  .category-cards.rpeFourCategories .category-image{
    aspect-ratio:16/9!important;
    min-height:190px!important;
    max-height:240px!important;
  }
  .category-cards.rpeFourCategories .category-card>div:last-child{
    padding:17px 18px 19px!important;
  }
  .category-cards.rpeFourCategories .category-card h3{
    font-size:22px!important;
  }
  .category-cards.rpeFourCategories .category-card small{
    font-size:10px!important;
    letter-spacing:1.25px!important;
  }
  .category-cards.rpeFourCategories .category-card span{
    font-size:12px!important;
  }
  .category-cards.rpeFourCategories .category-card:nth-child(1) .category-image img{
    transform:scale(1.08);
    object-position:center 50%!important;
  }
  .category-cards.rpeFourCategories .category-card:nth-child(2) .category-image img{
    transform:scale(1.02);
    object-position:center 49%!important;
  }
  .category-cards.rpeFourCategories .category-card:nth-child(3) .category-image img{
    transform:scale(1.03);
    object-position:center 48%!important;
  }
  #rpeSolarCategoryCard .category-image img{
    transform:scale(1.05);
    object-position:center 14%!important;
  }
  .category-cards.rpeFourCategories .category-card:hover,
  .category-cards.rpeFourCategories .category-card:active{
    transform:none!important;
  }
  .category-cards.rpeFourCategories .category-card:hover .category-image img{
    transform:scale(1.03);
  }
  .category-cards.rpeFourCategories .category-card:nth-child(1):hover .category-image img{
    transform:scale(1.08);
  }
  #rpeSolarCategoryCard:hover .category-image img{
    transform:scale(1.05);
  }
}
@media(max-width:420px){
  .category-cards.rpeFourCategories{
    gap:14px!important;
  }
  .category-cards.rpeFourCategories .category-image{
    aspect-ratio:16/10!important;
    min-height:180px!important;
    max-height:215px!important;
  }
  .category-cards.rpeFourCategories .category-card{
    border-radius:18px!important;
  }
  .category-cards.rpeFourCategories .category-card>div:last-child{
    padding:15px 16px 17px!important;
  }
  .category-cards.rpeFourCategories .category-card h3{
    font-size:20px!important;
  }
}`;
    d.head.appendChild(st);

    var responsiveFix=d.createElement("style");
    responsiveFix.id="rpeCategoryResponsiveFix";
    responsiveFix.textContent=
      '.category-cards.rpeFourCategories{grid-template-columns:repeat(5,minmax(0,1fr))!important;gap:18px!important;align-items:stretch}'+
      '.category-cards.rpeFourCategories .category-card{min-width:0!important;overflow:hidden!important;border-radius:22px!important;background:#fbfaf7!important;display:flex!important;flex-direction:column!important;transition:transform .22s ease,box-shadow .22s ease!important}'+
      '.category-cards.rpeFourCategories .category-card:hover{transform:translateY(-4px);box-shadow:0 14px 32px rgba(8,47,39,.10)!important}'+
      '.category-cards.rpeFourCategories .category-card:last-child{grid-column:auto!important}'+
      '.category-cards.rpeFourCategories .category-image{width:100%!important;height:230px!important;overflow:hidden!important;background:#f3f5f4!important;display:flex!important;align-items:center!important;justify-content:center!important;border-radius:0!important;flex:0 0 auto!important}'+
      '.category-cards.rpeFourCategories .category-image img{display:block!important;width:100%!important;height:100%!important;max-width:none!important;object-fit:cover!important;object-position:center!important;image-rendering:auto!important;transition:transform .28s ease!important}'+
      '.category-cards.rpeFourCategories .category-card>div:last-child{padding:18px 20px 20px!important;display:block!important;flex:1 1 auto!important}'+
      '.category-cards.rpeFourCategories .category-card h3{font-size:clamp(20px,1.7vw,25px)!important;line-height:1.15!important;margin:7px 0 8px!important}'+
      '.category-cards.rpeFourCategories .category-card:nth-child(1) .category-image img{object-fit:contain!important;object-position:center center!important;transform:scale(.94)!important;background:#f3f5f4!important}'+
      '.category-cards.rpeFourCategories .category-card:nth-child(2) .category-image img{object-fit:cover!important;object-position:center 48%!important;transform:scale(1.02)!important}'+
      '.category-cards.rpeFourCategories .category-card:nth-child(3) .category-image img{object-fit:contain!important;object-position:center center!important;transform:scale(.96)!important;background:#f3f5f4!important}'+
      '#rpeSolarCategoryCard .category-image img{object-fit:contain!important;object-position:center center!important;transform:scale(.92)!important;background:#f3f5f4!important}'+
      '.category-cards.rpeFourCategories .category-card:nth-child(1):hover .category-image img{transform:scale(.97)!important}'+
      '.category-cards.rpeFourCategories .category-card:nth-child(2):hover .category-image img{transform:scale(1.05)!important}'+
      '.category-cards.rpeFourCategories .category-card:nth-child(3):hover .category-image img{transform:scale(.99)!important}'+
      '#rpeSolarCategoryCard:hover .category-image img{transform:scale(.95)!important}'+
      '@media(max-width:1180px){.category-cards.rpeFourCategories{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:16px!important}.category-cards.rpeFourCategories .category-image{height:220px!important}.category-cards.rpeFourCategories .category-card h3{font-size:24px!important}}'+
      '@media(max-width:700px){.category-cards.rpeFourCategories{grid-template-columns:1fr!important;gap:16px!important;margin-top:22px!important}.category-cards.rpeFourCategories .category-card:last-child{grid-column:auto!important}.category-cards.rpeFourCategories .category-image{height:210px!important}.category-cards.rpeFourCategories .category-card>div:last-child{padding:17px 18px 19px!important}.category-cards.rpeFourCategories .category-card h3{font-size:22px!important}.category-cards.rpeFourCategories .category-card small{font-size:10px!important;letter-spacing:1.25px!important}.category-cards.rpeFourCategories .category-card span{font-size:12px!important}.category-cards.rpeFourCategories .category-card:hover,.category-cards.rpeFourCategories .category-card:active{transform:none!important;box-shadow:none!important}.category-cards.rpeFourCategories .category-card:nth-child(1) .category-image img,.category-cards.rpeFourCategories .category-card:nth-child(3) .category-image img,#rpeSolarCategoryCard .category-image img{object-fit:contain!important;object-position:center center!important;transform:scale(.95)!important}.category-cards.rpeFourCategories .category-card:nth-child(2) .category-image img{object-fit:cover!important;object-position:center 48%!important;transform:scale(1.01)!important}}'+
      '@media(max-width:420px){.category-cards.rpeFourCategories{gap:14px!important}.category-cards.rpeFourCategories .category-image{height:195px!important}.category-cards.rpeFourCategories .category-card{border-radius:18px!important}.category-cards.rpeFourCategories .category-card>div:last-child{padding:15px 16px 17px!important}.category-cards.rpeFourCategories .category-card h3{font-size:20px!important}}';
    d.head.appendChild(responsiveFix);
  }

  if(!d.getElementById("rpeLightingCardStyle")){
    var lightingStyle=d.createElement("style");
    lightingStyle.id="rpeLightingCardStyle";
    lightingStyle.textContent='#rpeLightingCategoryCard .category-image img{object-fit:cover!important;object-position:center 8%!important;transform:none!important}' +
      '@media(max-width:700px){#rpeLightingCategoryCard .category-image img{object-position:center 6%!important}}';
    d.head.appendChild(lightingStyle);
  }

  var hero=products.find(function(p){return p.sku==="RPE-SOLAR-504-8K"})||products[products.length-1];
  var heroPic=hero?imageOf(hero):"";
  var fallbackSolarPic="./images/solar-category-cover.svg";

  var cards=d.querySelector(".category-cards");
  if(cards){
    cards.classList.add("rpeFourCategories");
    var card=d.getElementById("rpeSolarCategoryCard");
    if(!card){
      card=d.createElement("button");
      card.type="button";
      card.id="rpeSolarCategoryCard";
      card.className="category-card";
      cards.insertBefore(card,d.getElementById("rpeLightingCategoryCard"));
    }
    card.innerHTML=
      '<div class="category-image">'+
      '<img src="'+(heroPic||fallbackSolarPic)+'" loading="eager" decoding="async" alt="Solar Street Lights" onerror="this.onerror=null;this.src=\''+fallbackSolarPic+'\'">'+
      '</div><div><small>OUTDOOR SOLAR</small><h3>Solar Street Lights</h3><span>2 series · '+products.length+' models</span></div>';
    card.onclick=function(){
      try{frame.contentWindow.setActiveCategory("Solar Street Lights")}catch(e){}
      var target=d.getElementById("products");
      if(target)target.scrollIntoView({behavior:"smooth",block:"start"});
    };
  }

  var filters=d.querySelector(".filters");
  if(filters&&!d.getElementById("rpeSolarFilter")){
    var filter=d.createElement("button");
    filter.id="rpeSolarFilter";
    filter.type="button";
    filter.className="filter";
    filter.dataset.cat="Solar Street Lights";
    filter.textContent="Solar Lights";
    filter.onclick=function(){
      try{frame.contentWindow.setActiveCategory("Solar Street Lights")}catch(e){}
    };
    filters.insertBefore(filter,filters.querySelector('[data-cat="Lighting & Fans"]'));
  }

  // Correct the catalogue summary from three to four categories.
  [].slice.call(d.querySelectorAll(".stats div")).forEach(function(box){
    var label=box.querySelector("span"),strong=box.querySelector("strong");
    if(label&&strong&&/Main categories/i.test(label.textContent))strong.textContent="5";
    if(label&&strong&&/Catalogue items/i.test(label.textContent))strong.textContent=String(totalCount||84);
  });
}

async function fetchSolar(){
  var h={apikey:KEY};
  var cr=await fetch(API+"/categories?select=id&slug=eq.solar-street-lights&active=eq.true&limit=1",{headers:h});
  if(!cr.ok)throw new Error("Solar category unavailable");
  var cats=await cr.json();
  if(!cats.length)return [];
  var url=API+"/products?select=id,sku,name,short_description,description,dimensions,specifications,product_images(image_url,is_primary,sort_order)&category_id=eq."+encodeURIComponent(cats[0].id)+"&active=eq.true";
  var pr=await fetch(url,{headers:h});
  if(!pr.ok)throw new Error("Solar products unavailable");
  var rows=await pr.json(),seen={},unique=[];
  rows.forEach(function(p){
    if(!p.sku||seen[p.sku])return;
    seen[p.sku]=1;
    unique.push(p);
  });
  unique.sort(function(a,b){
    return seriesRank(a)-seriesRank(b)||powerRank(a)-powerRank(b);
  });
  return unique;
}

async function integrateSolarProducts(){
  if(integrating)return integrating;
  integrating=(async function(){
    var d=idoc(),w;
    try{w=frame.contentWindow}catch(e){return false}
    if(!d||!w)return false;

    ensureSolarCategory(d);
    var solar=await fetchSolar();
    if(!solar.length)return false;

    var catalogue=w.PRODUCTS;
    if(!Array.isArray(catalogue))return false;

    var bySku={};
    catalogue.forEach(function(p){if(p.rpeSku)bySku[p.rpeSku]=p});

    solar.forEach(function(p,i){
      var native={
        id:90001+i,
        name:p.name,
        category:"Solar Street Lights",
        description:cleanDescription(p),
        image:imageOf(p),
        rpeSku:p.sku,
        rpeModel:p.sku,
        rpeSeries:spec(p,"series",""),
        rpePowerOrder:powerRank(p),
        rpeSpecifications:p.specifications||{},
        rpeDimensions:p.dimensions||""
      };
      if(bySku[p.sku]){
        Object.assign(bySku[p.sku],native);
      }else{
        catalogue.push(native);
        bySku[p.sku]=native;
      }
    });

    var expectedSolarSkus=["RPE-SOLAR-096","RPE-SOLAR-144","RPE-SOLAR-192","RPE-SOLAR-240","RPE-SOLAR-504-5K","RPE-SOLAR-504-8K"];
    var mergedSkus={};catalogue.forEach(function(x){if(x.rpeSku)mergedSkus[x.rpeSku]=1});
    var missing=expectedSolarSkus.filter(function(x){return !mergedSkus[x]});
    if(missing.length)console.warn("Missing solar catalogue products:",missing);
    installUi(d,solar,catalogue.length);

    // Re-render the existing product section. Search, selection, WhatsApp and modal behavior stay native.
    if(typeof w.render==="function")w.render();
    return true;
  })().catch(function(e){
    console.warn("Solar products could not be added to the main catalogue",e);
    return false;
  }).finally(function(){integrating=null});
  return integrating;
}

window.__rpeSolarIntegrate=integrateSolarProducts;

// Keep the fourth category present even if the solar API is slow or temporarily unavailable.
var rpeSolarBootCount=0;
function bootSolarCategory(){
  rpeSolarBootCount++;
  var d=idoc();
  if(d)ensureSolarCategory(d);
  integrateSolarProducts();
  if(rpeSolarBootCount<20&&(!d||!d.getElementById("rpeSolarCategoryCard"))){
    setTimeout(bootSolarCategory,250);
  }
}
frame.addEventListener("load",function(){
  rpeSolarBootCount=0;
  setTimeout(bootSolarCategory,0);
});
setTimeout(bootSolarCategory,100);

})();
