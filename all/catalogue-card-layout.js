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
    #grid .rpe-essential-price{display:inline-flex!important;align-items:center!important;width:max-content!important;max-width:100%!important;margin:4px 0 0!important;padding:5px 8px!important;border-radius:9px!important;background:#fff3df!important;border:1px solid #f3c77a!important;font-size:13px!important;line-height:1.35!important;color:#d97706!important;font-weight:900!important;box-shadow:0 2px 8px rgba(192,90,0,.08)!important}#grid .rpe-essential-price span{color:inherit!important}#grid .rpe-qty-wrap{display:grid!important;grid-template-columns:1fr auto!important;align-items:center!important;gap:8px!important;margin-top:6px!important;padding:8px 9px!important;border-radius:12px!important;background:linear-gradient(135deg,#f2fbf6 0%,#fff8e9 100%)!important;border:1px solid #d9eadf!important;box-shadow:0 5px 14px rgba(20,84,65,.07)!important}#grid .rpe-qty-copy{display:grid!important;gap:1px!important;min-width:0!important}#grid .rpe-qty-label{display:block!important;font-size:11px!important;line-height:1.2!important;font-weight:900!important;color:#164b3d!important}#grid .rpe-qty-hint{display:block!important;font-size:9px!important;line-height:1.25!important;color:#74837c!important;font-weight:700!important}#grid .rpe-qty-control{display:grid!important;grid-template-columns:34px 42px 34px!important;align-items:center!important;border:1px solid #cfded7!important;border-radius:12px!important;overflow:hidden!important;background:#fff!important;box-shadow:0 4px 10px rgba(13,62,49,.08)!important}#grid .rpe-qty-btn{display:grid!important;place-items:center!important;width:34px!important;height:34px!important;padding:0!important;margin:0!important;border:0!important;color:#fff!important;font-size:20px!important;line-height:1!important;font-weight:950!important;cursor:pointer!important;touch-action:manipulation!important;transition:transform .12s ease,filter .12s ease!important}#grid .rpe-qty-minus{background:#55746a!important}#grid .rpe-qty-plus{background:#d97706!important}#grid .rpe-qty-btn:hover{filter:brightness(1.04)!important}#grid .rpe-qty-btn:active{transform:scale(.93)!important;filter:brightness(.96)!important}#grid .rpe-qty-input{display:block!important;width:42px!important;height:34px!important;padding:0!important;margin:0!important;border:0!important;border-left:1px solid #e2eae6!important;border-right:1px solid #e2eae6!important;background:#fff!important;color:#123e33!important;text-align:center!important;font-size:14px!important;font-weight:950!important;outline:none!important;-moz-appearance:textfield!important}#grid .rpe-qty-input::-webkit-outer-spin-button,#grid .rpe-qty-input::-webkit-inner-spin-button{-webkit-appearance:none!important;margin:0!important}#grid .rpe-qty-wrap{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;margin-top:7px!important;padding:7px 0 0!important;border-top:1px solid #edf1ef!important;border-radius:0!important;background:transparent!important;border-left:0!important;border-right:0!important;border-bottom:0!important;box-shadow:none!important}#grid .rpe-qty-copy{display:grid!important;gap:1px!important;min-width:0!important}#grid .rpe-qty-label{font-size:10px!important;font-weight:850!important;color:#6c7973!important}#grid .rpe-qty-hint{font-size:8px!important;color:#9aa39f!important;font-weight:650!important}#grid .rpe-qty-control{display:grid!important;grid-template-columns:34px 38px 34px!important;gap:6px!important;align-items:center!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;overflow:visible!important}#grid .rpe-qty-btn{display:grid!important;place-items:center!important;width:34px!important;height:34px!important;border:0!important;border-radius:9px!important;background:#f2f4f3!important;color:#293d36!important;font-size:22px!important;font-weight:500!important;box-shadow:none!important;transition:background .12s ease,transform .12s ease!important}#grid .rpe-qty-minus,#grid .rpe-qty-plus{background:#f2f4f3!important;color:#293d36!important}#grid .rpe-qty-btn:hover{background:#e8ecea!important;filter:none!important}#grid .rpe-qty-btn:active{background:#dde4e0!important;transform:scale(.94)!important;filter:none!important}#grid .rpe-qty-input{display:block!important;width:38px!important;height:34px!important;padding:0!important;border:0!important;background:transparent!important;color:#111!important;text-align:center!important;font-size:16px!important;font-weight:800!important;box-shadow:none!important}
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
      #grid .rpe-essential-price{font-size:12px!important;padding:5px 7px!important}#grid .rpe-qty-wrap{display:flex!important;grid-template-columns:none!important;gap:5px!important;padding:6px 0 0!important}#grid .rpe-qty-copy{display:none!important}#grid .rpe-qty-control{grid-template-columns:30px 34px 30px!important;gap:4px!important;width:auto!important;margin-left:auto!important}#grid .rpe-qty-btn{width:30px!important;height:30px!important;font-size:20px!important}#grid .rpe-qty-input{width:34px!important;height:30px!important;font-size:15px!important}#grid .rpe-qty-wrap{grid-template-columns:1fr!important;gap:6px!important;padding:7px!important}#grid .rpe-qty-copy{text-align:center!important}#grid .rpe-qty-label{font-size:10px!important}#grid .rpe-qty-hint{font-size:8px!important}#grid .rpe-qty-control{grid-template-columns:32px 1fr 32px!important;width:100%!important}#grid .rpe-qty-btn{width:32px!important;height:31px!important;font-size:18px!important}#grid .rpe-qty-input{width:100%!important;height:31px!important;font-size:13px!important}
    }
    @media(min-width:621px){
      #grid .rpe-essential-name{font-size:15px!important}
    }

    #grid .rpe-order-summary{display:grid!important;gap:7px!important;margin-top:8px!important;padding-top:8px!important;border-top:1px solid #edf1ef!important}
    #grid .rpe-order-row{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:8px!important;min-width:0!important}
    #grid .rpe-order-label{font-size:10px!important;color:#7d8b85!important;font-weight:750!important;white-space:nowrap!important}
    #grid .rpe-order-value{font-size:11px!important;color:#263f37!important;font-weight:850!important;text-align:right!important;min-width:0!important}
    #grid .rpe-selected-count{color:#d95f17!important}
    #grid .rpe-product-total{font-size:14px!important;color:#f05a21!important;font-weight:950!important}
    #grid .rpe-delivery-fee{font-size:10px!important;color:#5e7068!important;font-weight:850!important}
    #grid .rpe-location-select{display:block!important;min-width:0!important;max-width:122px!important;height:30px!important;border:0!important;background:#f7f8f7!important;color:#485a53!important;border-radius:8px!important;padding:0 24px 0 8px!important;font-size:9px!important;font-weight:750!important;outline:none!important;cursor:pointer!important}
    #grid .rpe-order-now{display:flex!important;align-items:center!important;justify-content:center!important;width:100%!important;min-height:40px!important;margin-top:3px!important;border:0!important;border-radius:999px!important;background:#ff5a2d!important;color:#fff!important;font-size:12px!important;font-weight:950!important;letter-spacing:.01em!important;cursor:pointer!important;box-shadow:0 7px 16px rgba(255,90,45,.18)!important;transition:transform .12s ease,opacity .12s ease!important}
    #grid .rpe-order-now:active{transform:scale(.985)!important}
    #grid .rpe-order-now[disabled]{opacity:.45!important;cursor:not-allowed!important;box-shadow:none!important}
    #grid .rpe-payment-section{display:grid!important;gap:7px!important;margin-top:8px!important;padding-top:8px!important;border-top:1px solid #edf1ef!important}
    #grid .rpe-payment-title{font-size:10px!important;font-weight:900!important;color:#50645c!important}
    #grid .rpe-payment-methods{display:grid!important;gap:6px!important}
    #grid .rpe-payment-option{display:grid!important;grid-template-columns:24px 1fr!important;gap:8px!important;align-items:center!important;padding:8px!important;border:1px solid #e1e8e4!important;border-radius:10px!important;background:#fff!important;cursor:pointer!important}
    #grid .rpe-payment-option.active{border-color:#ff8a55!important;background:#fff7f2!important;box-shadow:0 4px 12px rgba(255,90,45,.08)!important}
    #grid .rpe-payment-radio{width:18px!important;height:18px!important;border:2px solid #cdd8d3!important;border-radius:50%!important;display:grid!important;place-items:center!important}
    #grid .rpe-payment-option.active .rpe-payment-radio{border-color:#ff5a2d!important}
    #grid .rpe-payment-option.active .rpe-payment-radio:after{content:""!important;width:8px!important;height:8px!important;border-radius:50%!important;background:#ff5a2d!important}
    #grid .rpe-payment-name{display:block!important;font-size:10px!important;font-weight:900!important;color:#263f37!important}
    #grid .rpe-payment-desc{display:block!important;margin-top:1px!important;font-size:8px!important;color:#8a9892!important;font-weight:650!important}
    #grid .rpe-grand-total{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:8px!important;margin-top:8px!important;padding-top:8px!important;border-top:1px solid #edf1ef!important}
    #grid .rpe-grand-total-label{font-size:10px!important;color:#576a62!important;font-weight:850!important}
    #grid .rpe-grand-total-value{font-size:16px!important;color:#f05a21!important;font-weight:950!important}
    #grid .rpe-checkout-note{font-size:8px!important;line-height:1.35!important;color:#8a9892!important}
    #grid .rpe-order-now.request-price{background:#0e5b43!important}
    @media(max-width:620px){
      #grid .rpe-qty-wrap{display:flex!important;gap:4px!important;padding:6px 0 0!important}
      #grid .rpe-qty-copy{display:none!important}
      #grid .rpe-qty-control{grid-template-columns:29px 32px 29px!important;gap:3px!important;width:auto!important;margin-left:auto!important}
      #grid .rpe-qty-btn{width:29px!important;height:29px!important;font-size:19px!important}
      #grid .rpe-qty-input{width:32px!important;height:29px!important;font-size:14px!important}
      #grid .rpe-order-summary{gap:6px!important;margin-top:7px!important;padding-top:7px!important}
      #grid .rpe-order-label{font-size:8px!important}
      #grid .rpe-order-value{font-size:9px!important}
      #grid .rpe-product-total{font-size:12px!important}
      #grid .rpe-location-select{max-width:92px!important;width:92px!important;height:28px!important;font-size:8px!important;padding-left:6px!important}
      #grid .rpe-delivery-fee{font-size:8px!important}
      #grid .rpe-order-now{min-height:36px!important;font-size:10px!important}
    }
  `;
  d.head.appendChild(s);
}
function getUnitPrice(p){
  var candidates=[p&&p.price,p&&p.unitPrice,p&&p.rpePrice,p&&p.salePrice,p&&p.amount];
  for(var i=0;i<candidates.length;i++){
    var raw=candidates[i];
    if(raw==null||raw==="")continue;
    var n=parseFloat(String(raw).replace(/[^0-9.]/g,""));
    if(isFinite(n)&&n>0)return n;
  }
  return 0;
}
function money(v){
  return "GHS "+Number(v||0).toFixed(2);
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

  var unitPrice=getUnitPrice(p);
  var priceDisplay=unitPrice>0?money(unitPrice):"GHS ______";
  var qtyKey="rpeQty:"+(id||p.name||p.id||"product");
  var locationKey="rpeDeliveryLocation";
  var savedQty=0;
  var savedLocation="Accra, Ghana";
  try{
    savedQty=Math.max(0,parseInt(w.localStorage.getItem(qtyKey)||"0",10)||0);
    savedLocation=w.localStorage.getItem(locationKey)||savedLocation;
  }catch(e){}

  var locations=["Accra, Ghana","Tema, Ghana","Kumasi, Ghana","Takoradi, Ghana","Cape Coast, Ghana","Tamale, Ghana","Other location"];
  var options=locations.map(function(loc){
    return '<option value="'+esc(loc)+'"'+(loc===savedLocation?' selected':'')+'>'+esc(loc)+'</option>';
  }).join("");

  holder.innerHTML=
    '<h3 class="rpe-essential-name">'+esc(p.name||"Product")+'</h3>'+
    '<div class="rpe-essential-id">Product ID: '+esc(id)+'</div>'+
    '<div class="rpe-essential-price">Price: <span>'+esc(priceDisplay)+'</span></div>'+
    '<div class="rpe-qty-wrap">'+
      '<div class="rpe-qty-copy"><span class="rpe-qty-label">Quantity</span><span class="rpe-qty-hint">Choose how many you want</span></div>'+
      '<div class="rpe-qty-control" role="group" aria-label="Choose quantity for '+esc(p.name||"product")+'">'+
        '<button class="rpe-qty-btn rpe-qty-minus" type="button" aria-label="Decrease quantity">−</button>'+
        '<input class="rpe-qty-input" type="number" min="0" step="1" inputmode="numeric" value="'+savedQty+'" aria-label="Quantity">'+
        '<button class="rpe-qty-btn rpe-qty-plus" type="button" aria-label="Increase quantity">+</button>'+
      '</div>'+
    '</div>'+
    '<div class="rpe-order-summary">'+
      '<div class="rpe-order-row"><span class="rpe-order-label">Selected</span><span class="rpe-order-value"><span class="rpe-selected-count">'+savedQty+'</span> item(s)</span></div>'+
      '<div class="rpe-order-row"><span class="rpe-order-label">Deliver to</span><select class="rpe-location-select" aria-label="Delivery location">'+options+'</select></div>'+
      '<div class="rpe-order-row"><span class="rpe-order-label">Product total</span><span class="rpe-order-value rpe-product-total">'+money(unitPrice*savedQty)+'</span></div>'+
      '<div class="rpe-order-row"><span class="rpe-order-label">Delivery fee</span><span class="rpe-order-value rpe-delivery-fee">To be confirmed</span></div>'+
      '<div class="rpe-grand-total"><span class="rpe-grand-total-label">Total payment</span><span class="rpe-grand-total-value">'+money(unitPrice*savedQty)+'</span></div>'+
      '<div class="rpe-payment-section">'+
        '<div class="rpe-payment-title">Payment Method</div>'+
        '<div class="rpe-payment-methods">'+
          '<button type="button" class="rpe-payment-option" data-method="Mobile Money"><span class="rpe-payment-radio"></span><span><span class="rpe-payment-name">Mobile Money</span><span class="rpe-payment-desc">MTN MoMo, Telecel Cash or AT Money</span></span></button>'+
          '<button type="button" class="rpe-payment-option" data-method="Card"><span class="rpe-payment-radio"></span><span><span class="rpe-payment-name">Visa / Mastercard</span><span class="rpe-payment-desc">Secure card payment</span></span></button>'+
          '<button type="button" class="rpe-payment-option" data-method="Bank Transfer"><span class="rpe-payment-radio"></span><span><span class="rpe-payment-name">Bank Transfer</span><span class="rpe-payment-desc">Recommended for large or bulk orders</span></span></button>'+
        '</div>'+
        '<div class="rpe-checkout-note">Secure payment will be activated after a verified payment gateway is connected. No card or Mobile Money PIN is collected on this page.</div>'+
      '</div>'+
      '<button class="rpe-order-now'+(unitPrice>0?'':' request-price')+'" type="button" disabled>'+(unitPrice>0?'Proceed to Payment':'Request Final Price')+'</button>'+
    '</div>';

  var qtyInput=holder.querySelector(".rpe-qty-input");
  var qtyMinus=holder.querySelector(".rpe-qty-minus");
  var qtyPlus=holder.querySelector(".rpe-qty-plus");
  var selectedCount=holder.querySelector(".rpe-selected-count");
  var totalEl=holder.querySelector(".rpe-product-total");
  var locationSelect=holder.querySelector(".rpe-location-select");
  var orderBtn=holder.querySelector(".rpe-order-now");
  var grandTotalEl=holder.querySelector(".rpe-grand-total-value");
  var paymentOptions=[].slice.call(holder.querySelectorAll(".rpe-payment-option"));
  var selectedPayment="";

  function stopQtyEvent(e){e.stopPropagation()}
  function refreshOrderSummary(v){
    v=Math.max(0,parseInt(v,10)||0);
    if(qtyInput)qtyInput.value=String(v);
    if(selectedCount)selectedCount.textContent=String(v);
    if(totalEl)totalEl.textContent=money(unitPrice*v);
    if(grandTotalEl)grandTotalEl.textContent=money(unitPrice*v);
    if(orderBtn)orderBtn.disabled=(v<1||!selectedPayment);
    card.dataset.quantity=String(v);
    try{w.localStorage.setItem(qtyKey,String(v))}catch(e){}
    return v;
  }

  if(qtyMinus){
    qtyMinus.addEventListener("click",function(e){stopQtyEvent(e);refreshOrderSummary((parseInt(qtyInput.value,10)||0)-1)});
  }
  if(qtyPlus){
    qtyPlus.addEventListener("click",function(e){stopQtyEvent(e);refreshOrderSummary((parseInt(qtyInput.value,10)||0)+1)});
  }



  if(qtyInput){
    qtyInput.addEventListener("click",stopQtyEvent);
    qtyInput.addEventListener("pointerdown",stopQtyEvent);
    qtyInput.addEventListener("input",function(e){
      stopQtyEvent(e);
      if(this.value!==""&&Number(this.value)<0)this.value="0";
      refreshOrderSummary(this.value);
    });
    qtyInput.addEventListener("change",function(e){stopQtyEvent(e);refreshOrderSummary(this.value)});
  }

  if(locationSelect){
    locationSelect.addEventListener("click",stopQtyEvent);
    locationSelect.addEventListener("pointerdown",stopQtyEvent);
    locationSelect.addEventListener("change",function(e){
      stopQtyEvent(e);
      try{w.localStorage.setItem(locationKey,this.value)}catch(err){}
    });
  }

  paymentOptions.forEach(function(option){
    option.addEventListener("click",function(e){
      stopQtyEvent(e);
      selectedPayment=this.getAttribute("data-method")||"";
      paymentOptions.forEach(function(x){x.classList.toggle("active",x===option)});
      var qty=Math.max(0,parseInt(qtyInput&&qtyInput.value,10)||0);
      if(orderBtn)orderBtn.disabled=(qty<1||!selectedPayment);
    });
    option.addEventListener("pointerdown",stopQtyEvent);
  });

  if(orderBtn){
    orderBtn.addEventListener("click",function(e){
      stopQtyEvent(e);
      var qty=Math.max(0,parseInt(qtyInput&&qtyInput.value,10)||0);
      if(qty<1||!selectedPayment)return;
      var destination=locationSelect?locationSelect.value:"Accra, Ghana";
      var msg;
      if(unitPrice>0){
        msg="Hello Ranova Prime Enterprise, I am ready to proceed with payment for "+qty+" × "+(p.name||"Product")+(id?" ("+id+")":"")+
          ". Product total: "+money(unitPrice*qty)+". Delivery location: "+destination+
          ". Preferred payment method: "+selectedPayment+". Please confirm the delivery fee and send the secure payment step.";
      }else{
        msg="Hello Ranova Prime Enterprise, I want "+qty+" × "+(p.name||"Product")+(id?" ("+id+")":"")+
          ". Delivery location: "+destination+". Preferred payment method: "+selectedPayment+
          ". Please confirm the current unit price, bulk price if available, delivery fee and availability so I can proceed to payment.";
      }
      var url="https://wa.me/233542846895?text="+encodeURIComponent(msg);
      try{w.top.location.href=url}catch(err){w.location.href=url}
    });
  }

  refreshOrderSummary(savedQty);

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
      if(e.target&&e.target.closest&&e.target.closest("a,button,input,select,textarea,.rpe-qty-wrap,.rpe-order-summary"))return;
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