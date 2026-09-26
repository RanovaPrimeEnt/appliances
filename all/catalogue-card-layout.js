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
    #grid .rpe-essential-price{display:inline-flex!important;align-items:center!important;width:max-content!important;max-width:100%!important;margin:4px 0 0!important;padding:5px 8px!important;border-radius:9px!important;background:#fff3df!important;border:1px solid #f3c77a!important;font-size:13px!important;line-height:1.35!important;color:#d97706!important;font-weight:900!important;box-shadow:0 2px 8px rgba(192,90,0,.08)!important}#grid .rpe-essential-price span{color:inherit!important}#grid .rpe-qty-wrap{display:grid!important;grid-template-columns:1fr auto!important;align-items:center!important;gap:8px!important;margin-top:6px!important;padding:8px 9px!important;border-radius:12px!important;background:linear-gradient(135deg,#f2fbf6 0%,#fff8e9 100%)!important;border:1px solid #d9eadf!important;box-shadow:0 5px 14px rgba(20,84,65,.07)!important}#grid .rpe-qty-copy{display:grid!important;gap:1px!important;min-width:0!important}#grid .rpe-qty-label{display:block!important;font-size:11px!important;line-height:1.2!important;font-weight:900!important;color:#164b3d!important}#grid .rpe-qty-hint{display:block!important;font-size:9px!important;line-height:1.25!important;color:#74837c!important;font-weight:700!important}#grid .rpe-qty-control{display:grid!important;grid-template-columns:34px 42px 34px!important;align-items:center!important;border:1px solid #cfded7!important;border-radius:12px!important;overflow:hidden!important;background:#fff!important;box-shadow:0 4px 10px rgba(13,62,49,.08)!important}#grid .rpe-qty-btn{display:grid!important;place-items:center!important;width:34px!important;height:34px!important;padding:0!important;margin:0!important;border:0!important;color:#fff!important;font-size:20px!important;line-height:1!important;font-weight:950!important;cursor:pointer!important;touch-action:manipulation!important;transition:transform .12s ease,filter .12s ease!important}#grid .rpe-qty-minus{background:#55746a!important}#grid .rpe-qty-plus{background:#d97706!important}#grid .rpe-qty-btn:hover{filter:brightness(1.04)!important}#grid .rpe-qty-btn:active{transform:scale(.93)!important;filter:brightness(.96)!important}#grid .rpe-qty-input{display:block!important;width:42px!important;height:34px!important;padding:0!important;margin:0!important;border:0!important;border-left:1px solid #e2eae6!important;border-right:1px solid #e2eae6!important;background:#fff!important;color:#123e33!important;text-align:center!important;font-size:14px!important;font-weight:950!important;outline:none!important;-moz-appearance:textfield!important}#grid .rpe-qty-input::-webkit-outer-spin-button,#grid .rpe-qty-input::-webkit-inner-spin-button{-webkit-appearance:none!important;margin:0!important}
    #grid .product-img{cursor:pointer!important}
    #grid .product-img img{cursor:pointer!important}
    #grid .product-info .rpe-market-product-meta,
    #grid .product-info .rpe-market-seller,
    #grid .product-info .rpe-bulk-quote,
    #grid .product-info .rpe-card-quick,
    #grid .product-info .rpe-status,
    #grid .product-info .rpe-model,
    #grid .product-info .product-actions{display:none!important}#grid .quick-view,#grid .quick-view-btn,#grid .quickview,#grid [class*="quick-view"],#grid [class*="quickview"]{display:none!important}
    #productModal .modal-info,
    #productModal .modal-info p,
    #productModal .modal-info li,
    #productModal .modal-info small,
    #productModal .modal-info span{font-size:max(12px,1em)!important}
    @media(max-width:620px){#grid .product{cursor:pointer!important;transition:transform .16s ease,box-shadow .16s ease!important}#grid .product:active{transform:scale(.985)!important;box-shadow:0 7px 18px rgba(13,62,49,.10)!important}
      #grid.product-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important}
      #grid .product-img{height:145px!important}
      #grid .product-info{padding:10px 9px 12px!important}
      #grid .rpe-essential-name{font-size:13px!important;line-height:1.25!important}
      #grid .rpe-essential-id{font-size:12px!important}
      #grid .rpe-essential-price{font-size:12px!important;padding:5px 7px!important}#grid .rpe-qty-wrap{grid-template-columns:1fr!important;gap:6px!important;padding:7px!important}#grid .rpe-qty-copy{text-align:center!important}#grid .rpe-qty-label{font-size:10px!important}#grid .rpe-qty-hint{font-size:8px!important}#grid .rpe-qty-control{grid-template-columns:32px 1fr 32px!important;width:100%!important}#grid .rpe-qty-btn{width:32px!important;height:31px!important;font-size:18px!important}#grid .rpe-qty-input{width:100%!important;height:31px!important;font-size:13px!important}
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
  var qtyKey="rpeQty:"+(id||p.name||p.id||"product");
  var savedQty=1;
  try{savedQty=Math.max(1,parseInt(w.localStorage.getItem(qtyKey)||"1",10)||1)}catch(e){}
  holder.innerHTML=
    '<h3 class="rpe-essential-name">'+esc(p.name||"Product")+'</h3>'+
    '<div class="rpe-essential-id">Product ID: '+esc(id)+'</div>'+
    '<div class="rpe-essential-price">Price: <span>GHS ______</span></div>'+
    '<div class="rpe-qty-wrap">'+
      '<div class="rpe-qty-copy"><span class="rpe-qty-label">Choose your quantity</span><span class="rpe-qty-hint">Add as many as you need</span></div>'+
      '<div class="rpe-qty-control" role="group" aria-label="Choose quantity for '+esc(p.name||"product")+'">'+
        '<button class="rpe-qty-btn rpe-qty-minus" type="button" aria-label="Decrease quantity">−</button>'+
        '<input class="rpe-qty-input" type="number" min="1" step="1" inputmode="numeric" value="'+savedQty+'" aria-label="Quantity">'+
        '<button class="rpe-qty-btn rpe-qty-plus" type="button" aria-label="Increase quantity">+</button>'+
      '</div>'+
    '</div>';

  var qtyInput=holder.querySelector(".rpe-qty-input");
  var qtyMinus=holder.querySelector(".rpe-qty-minus");
  var qtyPlus=holder.querySelector(".rpe-qty-plus");
  function saveQty(v){
    v=Math.max(1,parseInt(v,10)||1);
    if(qtyInput)qtyInput.value=String(v);
    try{w.localStorage.setItem(qtyKey,String(v))}catch(e){}
    card.dataset.quantity=String(v);
    return v;
  }
  function stopQtyEvent(e){e.stopPropagation()}
  if(qtyMinus){
    qtyMinus.addEventListener("click",function(e){stopQtyEvent(e);saveQty((parseInt(qtyInput.value,10)||1)-1)});
    qtyMinus.addEventListener("pointerdown",stopQtyEvent);
  }
  if(qtyPlus){
    qtyPlus.addEventListener("click",function(e){stopQtyEvent(e);saveQty((parseInt(qtyInput.value,10)||1)+1)});
    qtyPlus.addEventListener("pointerdown",stopQtyEvent);
  }
  var qtyRepeatTimer=null,qtyRepeatInterval=null;
  function stopQtyRepeat(){
    if(qtyRepeatTimer){clearTimeout(qtyRepeatTimer);qtyRepeatTimer=null}
    if(qtyRepeatInterval){clearInterval(qtyRepeatInterval);qtyRepeatInterval=null}
  }
  function startQtyRepeat(direction,e){
    stopQtyEvent(e);
    stopQtyRepeat();
    qtyRepeatTimer=setTimeout(function(){
      qtyRepeatInterval=setInterval(function(){
        var current=parseInt(qtyInput.value,10)||1;
        saveQty(current+direction);
      },90);
    },420);
  }
  function bindQtyRepeat(btn,direction){
    if(!btn)return;
    btn.addEventListener("pointerdown",function(e){startQtyRepeat(direction,e)});
    btn.addEventListener("pointerup",stopQtyRepeat);
    btn.addEventListener("pointercancel",stopQtyRepeat);
    btn.addEventListener("pointerleave",stopQtyRepeat);
  }
  bindQtyRepeat(qtyMinus,-1);
  bindQtyRepeat(qtyPlus,1);

  if(qtyInput){
    qtyInput.addEventListener("click",stopQtyEvent);
    qtyInput.addEventListener("pointerdown",stopQtyEvent);
    qtyInput.addEventListener("input",function(e){stopQtyEvent(e);if(this.value!==""&&Number(this.value)<1)this.value="1"});
    qtyInput.addEventListener("change",function(e){stopQtyEvent(e);saveQty(this.value)});
    qtyInput.addEventListener("blur",function(){saveQty(this.value)});
  }
  saveQty(savedQty);

  var imgWrap=card.querySelector(".product-img");
  var img=imgWrap&&imgWrap.querySelector("img");
  if(imgWrap){
    imgWrap.removeAttribute("role");
    imgWrap.removeAttribute("tabindex");
    imgWrap.removeAttribute("aria-label");
  }
  if(img){
    img.alt=p.name||img.alt||"Product";
    img.removeAttribute("title");
  }

  if(w.matchMedia&&w.matchMedia("(max-width:620px)").matches){
    card.setAttribute("role","button");
    card.setAttribute("tabindex","0");
    card.setAttribute("aria-label","Open "+(p.name||"product")+" details");
  }else{
    card.removeAttribute("role");
    card.removeAttribute("tabindex");
    card.removeAttribute("aria-label");
  }
  if(!card.__rpeEssentialCardClick){
    card.__rpeEssentialCardClick=true;
    card.addEventListener("click",function(e){
      if(!(w.matchMedia&&w.matchMedia("(max-width:620px)").matches))return;
      if(e.target&&e.target.closest&&e.target.closest("a,button,input,select,textarea,.rpe-qty-wrap"))return;
      try{if(typeof w.openProduct==="function")w.openProduct(p.id)}catch(err){}
    });
    card.addEventListener("keydown",function(e){
      if(!(w.matchMedia&&w.matchMedia("(max-width:620px)").matches))return;
      if(e.key==="Enter"||e.key===" "){
        e.preventDefault();
        try{if(typeof w.openProduct==="function")w.openProduct(p.id)}catch(err){}
      }
    });
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