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
  '.rpeSolarGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.rpeSolarCard{background:#fff;border:1px solid #e0e8e4;border-radius:20px;overflow:hidden;box-shadow:0 8px 24px rgba(12,54,43,.05);display:flex;flex-direction:column}.rpeSolarImage{height:235px;background:#f3f7f5;display:grid;place-items:center;overflow:hidden}.rpeSolarImage img{width:100%;height:100%;object-fit:contain}'+
  '.rpeSolarBody{padding:16px;display:flex;flex-direction:column;flex:1}.rpeSolarSku{font-size:10px;color:#70827b;font-weight:800;letter-spacing:.05em}.rpeSolarCard h4{font-size:17px;margin:5px 0 8px;line-height:1.3}.rpeSolarDesc{font-size:12px;color:#667972;line-height:1.5;margin:0 0 12px}.rpeSolarSpecs{display:grid;gap:0;margin-bottom:15px}.rpeSolarSpec{display:flex;justify-content:space-between;gap:10px;font-size:11px;padding:6px 0;border-bottom:1px solid #edf1ef}.rpeSolarSpec span{color:#72837d}.rpeSolarSpec b{text-align:right}'+
  '.rpeSolarPrice{font-size:13px;font-weight:900;color:#0e5b43;margin-top:auto;margin-bottom:10px}.rpeSolarActions{display:grid;grid-template-columns:1fr 1fr;gap:8px}.rpeSolarActions button,.rpeSolarActions a{border:0;border-radius:11px;min-height:42px;font-size:11px;font-weight:850;text-decoration:none;display:grid;place-items:center;cursor:pointer}.rpeSolarDetails{background:#eff4f2;color:#173d32}.rpeSolarCart{background:#0e5b43;color:#fff}'+
  '.rpeSolarNote{margin-top:14px;padding:12px 14px;border-radius:14px;background:#f7f4ec;color:#66766f;font-size:11px;line-height:1.55}.rpeSolarModal{position:fixed;inset:0;z-index:999999;background:#071f19a8;display:none;align-items:center;justify-content:center;padding:18px}.rpeSolarModal.show{display:flex}.rpeSolarModalBox{width:min(900px,100%);max-height:min(88vh,860px);overflow:auto;background:#fff;border-radius:24px;box-shadow:0 30px 80px #0005}'+
  '.rpeSolarModalTop{display:flex;justify-content:space-between;align-items:center;padding:18px 20px;border-bottom:1px solid #e5ece8;position:sticky;top:0;background:#fff;z-index:2}.rpeSolarClose{width:44px;height:44px;border-radius:50%;border:1px solid #e0e8e4;background:#fff;font-size:24px}.rpeSolarModalContent{display:grid;grid-template-columns:.9fr 1.1fr;gap:22px;padding:22px}.rpeSolarModalContent img{width:100%;max-height:520px;object-fit:contain;background:#f4f7f6;border-radius:18px}.rpeSolarModalContent h3{font:700 28px/1.12 Georgia,serif;margin:4px 0 8px}.rpeSolarModalContent p{font-size:13px;color:#61736d;line-height:1.6}'+
  '.rpeSolarSpecTable{border:1px solid #e3ebe7;border-radius:14px;overflow:hidden}.rpeSolarSpecRow{display:grid;grid-template-columns:42% 58%;font-size:12px;border-bottom:1px solid #e8efeb}.rpeSolarSpecRow:last-child{border-bottom:0}.rpeSolarSpecRow span,.rpeSolarSpecRow b{padding:9px 10px}.rpeSolarSpecRow span{background:#f4f7f5;color:#60736b}.rpeSolarSpecRow b{font-weight:700}'+
  '@media(max-width:800px){.rpeSolarHero{grid-template-columns:1fr}.rpeSolarHeroCopy{padding:28px 22px}.rpeSolarHeroMedia{min-height:250px;order:-1}.rpeSolarGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.rpeSolarModalContent{grid-template-columns:1fr}.rpeSolarImage{height:200px}}'+
  '@media(max-width:480px){#rpe-solar-street-lights{padding:0 10px;margin:28px auto 50px}.rpeSolarGrid{grid-template-columns:1fr 1fr;gap:9px}.rpeSolarImage{height:165px}.rpeSolarBody{padding:11px}.rpeSolarCard h4{font-size:14px}.rpeSolarDesc{display:none}.rpeSolarActions{grid-template-columns:1fr}.rpeSolarHero h2{font-size:34px}.rpeSolarHeroMedia{min-height:220px}.rpeSolarHead h3{font-size:24px}.rpeSolarSpec{font-size:10px}.rpeSolarCount{display:none}}';
  d.head.appendChild(style);
}

function openDetails(d,modal,p){
  var specs=p.specifications||{},rows="";
  Object.keys(specs).forEach(function(k){
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
  if(!d||d.getElementById("rpe-solar-street-lights"))return;
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
      '<div class="rpeSolarHead"><div><h3>Choose your solar street light</h3><p>Repeated images are merged; only products with genuinely different specifications appear separately.</p></div><span class="rpeSolarCount">'+ps.length+' unique products</span></div>'+
      '<div class="rpeSolarGrid" id="rpeSolarGrid"></div>'+
      '<div class="rpeSolarNote">Prices and current availability are confirmed by RPE before purchase. The supplied 240 LED product sheet states a 50,000mAh battery capacity; RPE should confirm that specification before an order is finalised.</div>';

    var footer=d.querySelector("footer");
    if(footer&&footer.parentNode)footer.parentNode.insertBefore(section,footer);
    else d.body.appendChild(section);

    var grid=section.querySelector("#rpeSolarGrid");
    ps.forEach(function(p){
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
      grid.appendChild(card);
    });

    var modal=d.createElement("div");
    modal.className="rpeSolarModal";
    modal.innerHTML='<div class="rpeSolarModalBox" role="dialog" aria-modal="true" aria-label="Solar street light details"><div class="rpeSolarModalTop"><b>Product details</b><button class="rpeSolarClose" type="button" aria-label="Close">×</button></div><div class="rpeSolarModalContent"></div></div>';
    d.body.appendChild(modal);

    grid.querySelectorAll(".rpeSolarCard").forEach(function(card,i){
      var btn=card.querySelector(".rpeSolarDetails");
      btn.onclick=function(){openDetails(d,modal,ps[i])};
    });
    section.querySelector("#rpeSolarBrowse").onclick=function(){grid.scrollIntoView({behavior:"smooth",block:"start"})};
    modal.querySelector(".rpeSolarClose").onclick=function(){modal.classList.remove("show")};
    modal.onclick=function(e){if(e.target===modal)modal.classList.remove("show")};
    d.addEventListener("keydown",function(e){if(e.key==="Escape")modal.classList.remove("show")});
  }catch(e){
    console.warn("Solar Street Lights section could not load",e);
  }
}

frame.addEventListener("load",enhanceSolarStreetLights);
try{
  if(frame.contentDocument&&frame.contentDocument.readyState==="complete")enhanceSolarStreetLights();
}catch(e){}
})();