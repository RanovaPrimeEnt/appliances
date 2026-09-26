(function(){
"use strict";
var frame=document.getElementById("site");
if(!frame)return;

function esc(v){
  return String(v==null?"":v).replace(/[&<>"']/g,function(c){
    return {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c];
  });
}
function getDoc(){
  try{return frame.contentDocument||frame.contentWindow.document}catch(e){return null}
}
function getWin(){
  try{return frame.contentWindow}catch(e){return null}
}
function getProducts(){
  var w=getWin();
  try{return w&&Array.isArray(w.PRODUCTS)?w.PRODUCTS:[]}catch(e){return[]}
}
function productForCard(card,products){
  var title=card.querySelector("h3");
  var name=title?title.textContent.trim():"";
  if(!name)return null;
  return products.find(function(p){return String(p.name||"").trim()===name})||
         products.find(function(p){return String(p.name||"").trim().toLowerCase()===name.toLowerCase()})||
         null;
}
function installStyle(d){
  if(d.getElementById("rpeEssentialCardStyle"))return;
  var s=d.createElement("style");
  s.id="rpeEssentialCardStyle";
  s.textContent=`
    #grid .product{overflow:hidden!important}
    #grid .product-info{padding:12px 12px 14px!important}
    #grid .product-info>*{display:none!important}
    #grid .product-info>.rpe-essential-card{display:grid!important;gap:5px!important}
    #grid .rpe-essential-name{display:block!important;margin:0!important;font-size:14px!important;line-height:1.28!important;font-weight:800!important;color:#163c32!important;min-width:0!important;overflow-wrap:anywhere!important}
    #grid .rpe-essential-id{display:block!important;margin:0!important;font-size:12px!important;line-height:1.35!important;color:#667870!important;font-weight:650!important;overflow-wrap:anywhere!important}
    #grid .rpe-essential-price{display:block!important;margin:2px 0 0!important;font-size:13px!important;line-height:1.35!important;color:#0d5f49!important;font-weight:850!important}
    #grid .product-img{cursor:pointer!important}
    #grid .product-img img{cursor:pointer!important}
    #grid .product-info .rpe-market-product-meta,
    #grid .product-info .rpe-market-seller,
    #grid .product-info .rpe-bulk-quote,
    #grid .product-info .rpe-card-quick,
    #grid .product-info .rpe-status,
    #grid .product-info .rpe-model,
    #grid .product-info .product-actions{display:none!important}
    #productModal .modal-info,
    #productModal .modal-info p,
    #productModal .modal-info li,
    #productModal .modal-info small,
    #productModal .modal-info span{font-size:max(12px,1em)!important}
    @media(max-width:620px){
      #grid.product-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important}
      #grid .product-img{height:145px!important}
      #grid .product-info{padding:10px 9px 12px!important}
      #grid .rpe-essential-name{font-size:13px!important;line-height:1.25!important}
      #grid .rpe-essential-id{font-size:12px!important}
      #grid .rpe-essential-price{font-size:12px!important}
    }
    @media(min-width:621px){
      #grid .rpe-essential-name{font-size:15px!important}
    }
  `;
  d.head.appendChild(s);
}
function decorateCard(card,p,w){
  var info=card.querySelector(".product-info");
  if(!info||!p)return;
  var id=p.rpeSku||p.rpeModel||p.id||"";
  var holder=info.querySelector(".rpe-essential-card");
  if(!holder){
    holder=info.ownerDocument.createElement("div");
    holder.className="rpe-essential-card";
    info.appendChild(holder);
  }
  holder.innerHTML=
    '<h3 class="rpe-essential-name">'+esc(p.name||"Product")+'</h3>'+
    '<div class="rpe-essential-id">Product ID: '+esc(id)+'</div>'+
    '<div class="rpe-essential-price">Price: <span>GHS ______</span></div>';

  var imgWrap=card.querySelector(".product-img");
  var img=imgWrap&&imgWrap.querySelector("img");
  if(imgWrap){
    imgWrap.setAttribute("role","button");
    imgWrap.setAttribute("tabindex","0");
    imgWrap.setAttribute("aria-label","View details for "+(p.name||"product"));
    if(!imgWrap.__rpeEssentialClick){
      imgWrap.__rpeEssentialClick=true;
      imgWrap.addEventListener("click",function(e){
        if(e.target&&e.target.closest&&e.target.closest("button,a"))return;
        try{if(typeof w.openProduct==="function")w.openProduct(p.id)}catch(err){}
      });
      imgWrap.addEventListener("keydown",function(e){
        if(e.key==="Enter"||e.key===" "){e.preventDefault();try{if(typeof w.openProduct==="function")w.openProduct(p.id)}catch(err){}}
      });
    }
  }
  if(img){
    img.alt=p.name||img.alt||"Product";
    img.title="Click to view full product details";
  }
}
function apply(){
  var d=getDoc(),w=getWin();
  if(!d||!w)return false;
  installStyle(d);
  var grid=d.getElementById("grid");
  if(!grid)return false;
  var ps=getProducts();
  [].slice.call(grid.querySelectorAll(".product")).forEach(function(card){
    var p=productForCard(card,ps);
    if(p)decorateCard(card,p,w);
  });
  if(!grid.__rpeEssentialObserver){
    var queued=false;
    var observer=new MutationObserver(function(){
      if(queued)return;
      queued=true;
      requestAnimationFrame(function(){queued=false;apply()});
    });
    observer.observe(grid,{childList:true,subtree:true});
    grid.__rpeEssentialObserver=observer;
  }
  return true;
}
function boot(){
  var tries=0;
  function run(){
    if(apply())return;
    if(++tries<60)setTimeout(run,250);
  }
  run();
}
frame.addEventListener("load",function(){setTimeout(boot,500)});
setTimeout(boot,900);
})();