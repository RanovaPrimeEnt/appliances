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
function installUi(d,products){
  if(!d)return;

  // Remove the former oversized standalone solar section. Solar now lives in the main catalogue.
  var old=d.getElementById("rpe-solar-street-lights");
  if(old)old.remove();
  var oldStyle=d.getElementById("rpeSolarStyle");
  if(oldStyle)oldStyle.remove();

  if(!d.getElementById("rpeSolarCatalogueStyle")){
    var st=d.createElement("style");
    st.id="rpeSolarCatalogueStyle";
    st.textContent=
      '.category-cards.rpeFourCategories{grid-template-columns:repeat(4,minmax(0,1fr))!important;gap:22px!important}'+
      '.category-cards.rpeFourCategories .category-card{overflow:hidden!important;border-radius:24px!important;transition:transform .25s ease,box-shadow .25s ease!important;background:#fbfaf7!important}'+
      '.category-cards.rpeFourCategories .category-card:hover{transform:translateY(-4px);box-shadow:0 16px 34px rgba(8,47,39,.10)!important}'+
      '.category-cards.rpeFourCategories .category-card:last-child{grid-column:auto!important}'+
      '.category-cards.rpeFourCategories .category-image{height:230px!important;width:100%!important;overflow:hidden!important;background:#edf2ef!important;border-radius:0!important;display:block!important}'+
      '.category-cards.rpeFourCategories .category-image img{display:block!important;width:100%!important;height:100%!important;max-width:none!important;object-fit:cover!important;object-position:center!important;background:#edf2ef!important;image-rendering:auto!important;transition:transform .35s ease!important}'+
      '.category-cards.rpeFourCategories .category-card:hover .category-image img{transform:scale(1.05)}'+
      '.category-cards.rpeFourCategories .category-card:nth-child(1) .category-image img{transform:scale(1.28);object-position:center 48%!important}'+
      '.category-cards.rpeFourCategories .category-card:nth-child(1):hover .category-image img{transform:scale(1.34)}'+
      '.category-cards.rpeFourCategories .category-card:nth-child(2) .category-image img{transform:scale(1.10);object-position:center 46%!important}'+
      '.category-cards.rpeFourCategories .category-card:nth-child(2):hover .category-image img{transform:scale(1.15)}'+
      '.category-cards.rpeFourCategories .category-card:nth-child(3) .category-image img{transform:scale(1.12);object-position:center 48%!important}'+
      '.category-cards.rpeFourCategories .category-card:nth-child(3):hover .category-image img{transform:scale(1.17)}'+
      '#rpeSolarCategoryCard .category-image img{object-fit:cover!important;object-position:center 18%!important;transform:scale(1.22)}'+
      '#rpeSolarCategoryCard:hover .category-image img{transform:scale(1.28)}'+
      '@media(max-width:1100px){.category-cards.rpeFourCategories{gap:16px!important}.category-cards.rpeFourCategories .category-image{height:205px!important}}'+
      '@media(max-width:980px){.category-cards.rpeFourCategories{grid-template-columns:repeat(2,minmax(0,1fr))!important}.category-cards.rpeFourCategories .category-image{height:240px!important}}'+
      '@media(max-width:620px){.category-cards.rpeFourCategories{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important}.category-cards.rpeFourCategories .category-image{height:165px!important}.category-cards.rpeFourCategories .category-card:nth-child(1) .category-image img{transform:scale(1.24)}#rpeSolarCategoryCard .category-image img{transform:scale(1.17);object-position:center 16%!important}}'+
      '@media(max-width:420px){.category-cards.rpeFourCategories{grid-template-columns:1fr!important}.category-cards.rpeFourCategories .category-image{height:230px!important}#rpeSolarCategoryCard .category-image img{transform:scale(1.20)}}';
    d.head.appendChild(st);
  }

  var hero=products.find(function(p){return p.sku==="RPE-SOLAR-504-8K"})||products[products.length-1];
  var heroPic=hero?imageOf(hero):"";

  var cards=d.querySelector(".category-cards");
  if(cards){
    cards.classList.add("rpeFourCategories");
    var card=d.getElementById("rpeSolarCategoryCard");
    if(!card){
      card=d.createElement("button");
      card.type="button";
      card.id="rpeSolarCategoryCard";
      card.className="category-card";
      cards.appendChild(card);
    }
    card.innerHTML=
      '<div class="category-image">'+
      (heroPic?'<img src="'+heroPic+'" loading="eager" decoding="async" alt="Solar Street Lights">':'')+
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
    filters.appendChild(filter);
  }

  // Correct the catalogue summary from three to four categories.
  [].slice.call(d.querySelectorAll(".stats div")).forEach(function(box){
    var label=box.querySelector("span"),strong=box.querySelector("strong");
    if(label&&strong&&/Main categories/i.test(label.textContent))strong.textContent="4";
    if(label&&strong&&/Catalogue items/i.test(label.textContent)&&/^\s*36\+?\s*$/.test(strong.textContent))strong.textContent="42+";
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

    installUi(d,solar);

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

// Fallback for very fast iframe loads or mobile cache/timing differences.
frame.addEventListener("load",function(){
  setTimeout(function(){integrateSolarProducts()},0);
});
setTimeout(function(){
  try{
    if(frame.contentDocument&&frame.contentDocument.readyState==="complete")integrateSolarProducts();
  }catch(e){}
},150);

})();