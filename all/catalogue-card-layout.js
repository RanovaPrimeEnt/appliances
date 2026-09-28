(function(){
"use strict";
var frame=document.getElementById("site");
var ORDER_ENDPOINT="https://igaerssbzobutlwvjfwt.supabase.co/functions/v1/ranova-place-order";
var PAYMENT_ENDPOINT="https://igaerssbzobutlwvjfwt.supabase.co/functions/v1/ranova-payment-gateway";
var SUPABASE_REST="https://igaerssbzobutlwvjfwt.supabase.co/rest/v1/";
var SUPABASE_KEY="sb_publishable_NMzJFpXOIJMEH3LW50Cs9g_Otc6tlYr";
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
function norm(v){return String(v==null?"":v).toLowerCase().replace(/[^a-z0-9]+/g," ").trim()}
async function syncLiveSellerPrices(){
  try{
    var r=await fetch(SUPABASE_REST+"ranova_seller_products?select=id,name,sku,price,product_status&product_status=eq.active&limit=1000",{headers:{apikey:SUPABASE_KEY,Authorization:"Bearer "+SUPABASE_KEY},cache:"no-store"});
    if(!r.ok)return;
    var rows=await r.json(),byName={},bySku={};
    (Array.isArray(rows)?rows:[]).forEach(function(x){if(x&&x.name)byName[norm(x.name)]=x;if(x&&x.sku)bySku[norm(x.sku)]=x});
    var ps=getProducts();
    ps.forEach(function(p){
      var sku=norm(p&& (p.rpeSku||p.sku||p.rpeModel||""));
      var row=(sku&&bySku[sku])||byName[norm(p&&p.name)];
      if(row)p.price=row.price==null?null:Number(row.price);
    });
    var d=getDoc();if(!d)return;
    [].slice.call(d.querySelectorAll("#grid .product")).forEach(function(card){
      var p=productForCard(card,ps);if(!p)return;
      var unit=getUnitPrice(p),price=card.querySelector(".rpe-price-value"),q=Math.max(0,parseInt(card.dataset.quantity||"0",10)||0);
      card.dataset.rpeUnitPrice=String(unit||0);
      if(price)price.textContent=unit>0?money(unit):"GHS ______";
      var total=card.querySelector(".rpe-product-total"),grand=card.querySelector(".rpe-grand-total-value");
      if(total)total.textContent=money(unit*q);if(grand)grand.textContent=money(unit*q);
    });
  }catch(e){}
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
    #grid .rpe-essential-price{display:inline-flex!important;align-items:center!important;width:max-content!important;max-width:100%!important;margin:4px 0 0!important;padding:5px 8px!important;border-radius:9px!important;background:#ff5a2d!important;border:1px solid #ff5a2d!important;box-shadow:0 2px 8px rgba(255,90,45,.14)!important}.rpe-price-label{display:inline!important;color:#fff!important;font-size:13px!important;font-weight:900!important;letter-spacing:0!important}.rpe-price-label:after{content:": "!important}.rpe-price-value{display:inline!important;color:#fff!important;font-size:13px!important;font-weight:900!important;letter-spacing:0!important;white-space:nowrap!important}#grid .rpe-qty-wrap{display:grid!important;grid-template-columns:1fr auto!important;align-items:center!important;gap:8px!important;margin-top:6px!important;padding:8px 9px!important;border-radius:12px!important;background:linear-gradient(135deg,#f2fbf6 0%,#fff8e9 100%)!important;border:1px solid #d9eadf!important;box-shadow:0 5px 14px rgba(20,84,65,.07)!important}#grid .rpe-qty-copy{display:grid!important;gap:1px!important;min-width:0!important}#grid .rpe-qty-label{display:block!important;font-size:11px!important;line-height:1.2!important;font-weight:900!important;color:#164b3d!important}#grid .rpe-qty-hint{display:block!important;font-size:9px!important;line-height:1.25!important;color:#74837c!important;font-weight:700!important}#grid .rpe-qty-control{display:grid!important;grid-template-columns:34px 42px 34px!important;align-items:center!important;border:1px solid #cfded7!important;border-radius:12px!important;overflow:hidden!important;background:#fff!important;box-shadow:0 4px 10px rgba(13,62,49,.08)!important}#grid .rpe-qty-btn{display:grid!important;place-items:center!important;width:34px!important;height:34px!important;padding:0!important;margin:0!important;border:0!important;color:#fff!important;font-size:20px!important;line-height:1!important;font-weight:950!important;cursor:pointer!important;touch-action:manipulation!important;transition:transform .12s ease,filter .12s ease!important}#grid .rpe-qty-minus{background:#55746a!important}#grid .rpe-qty-plus{background:#d97706!important}#grid .rpe-qty-btn:hover{filter:brightness(1.04)!important}#grid .rpe-qty-btn:active{transform:scale(.93)!important;filter:brightness(.96)!important}#grid .rpe-qty-input{display:block!important;width:42px!important;height:34px!important;padding:0!important;margin:0!important;border:0!important;border-left:1px solid #e2eae6!important;border-right:1px solid #e2eae6!important;background:#fff!important;color:#123e33!important;text-align:center!important;font-size:14px!important;font-weight:950!important;outline:none!important;-moz-appearance:textfield!important}#grid .rpe-qty-input::-webkit-outer-spin-button,#grid .rpe-qty-input::-webkit-inner-spin-button{-webkit-appearance:none!important;margin:0!important}#grid .rpe-qty-wrap{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:10px!important;margin-top:7px!important;padding:7px 0 0!important;border-top:1px solid #edf1ef!important;border-radius:0!important;background:transparent!important;border-left:0!important;border-right:0!important;border-bottom:0!important;box-shadow:none!important}#grid .rpe-qty-copy{display:grid!important;gap:1px!important;min-width:0!important}#grid .rpe-qty-label{font-size:10px!important;font-weight:850!important;color:#6c7973!important}#grid .rpe-qty-hint{font-size:8px!important;color:#9aa39f!important;font-weight:650!important}#grid .rpe-qty-control{display:grid!important;grid-template-columns:34px 38px 34px!important;gap:6px!important;align-items:center!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important;overflow:visible!important}#grid .rpe-qty-btn{display:grid!important;place-items:center!important;width:34px!important;height:34px!important;border:0!important;border-radius:9px!important;background:#f2f4f3!important;color:#293d36!important;font-size:22px!important;font-weight:500!important;box-shadow:none!important;transition:background .12s ease,transform .12s ease!important}#grid .rpe-qty-minus,#grid .rpe-qty-plus{background:#f2f4f3!important;color:#293d36!important}#grid .rpe-qty-btn:hover{background:#e8ecea!important;filter:none!important}#grid .rpe-qty-btn:active{background:#dde4e0!important;transform:scale(.94)!important;filter:none!important}#grid .rpe-qty-input{display:block!important;width:38px!important;height:34px!important;padding:0!important;border:0!important;background:transparent!important;color:#111!important;text-align:center!important;font-size:16px!important;font-weight:800!important;box-shadow:none!important}
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
      #grid .rpe-essential-price{padding:5px 7px!important}.rpe-price-label{font-size:12px!important}.rpe-price-value{font-size:12px!important}#grid .rpe-qty-wrap{display:flex!important;grid-template-columns:none!important;gap:5px!important;padding:6px 0 0!important}#grid .rpe-qty-copy{display:none!important}#grid .rpe-qty-control{grid-template-columns:30px 34px 30px!important;gap:4px!important;width:auto!important;margin-left:auto!important}#grid .rpe-qty-btn{width:30px!important;height:30px!important;font-size:20px!important}#grid .rpe-qty-input{width:34px!important;height:30px!important;font-size:15px!important}#grid .rpe-qty-wrap{grid-template-columns:1fr!important;gap:6px!important;padding:7px!important}#grid .rpe-qty-copy{text-align:center!important}#grid .rpe-qty-label{font-size:10px!important}#grid .rpe-qty-hint{font-size:8px!important}#grid .rpe-qty-control{grid-template-columns:32px 1fr 32px!important;width:100%!important}#grid .rpe-qty-btn{width:32px!important;height:31px!important;font-size:18px!important}#grid .rpe-qty-input{width:100%!important;height:31px!important;font-size:13px!important}
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
    #grid .rpe-order-now[disabled]{opacity:1!important;background:#ff5a2d!important;color:#fff!important;cursor:not-allowed!important;box-shadow:0 7px 16px rgba(255,90,45,.18)!important}
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
    .rpe-checkout-modal{position:fixed!important;inset:0!important;z-index:999999!important;background:rgba(8,31,25,.48)!important;display:none!important;align-items:center!important;justify-content:center!important;padding:16px!important;box-sizing:border-box!important}
    .rpe-checkout-modal.open{display:flex!important}
    .rpe-checkout-sheet{width:min(430px,100%)!important;max-height:90vh!important;overflow:auto!important;background:#fff!important;border-radius:22px!important;padding:18px!important;box-shadow:0 24px 70px rgba(5,32,24,.28)!important;box-sizing:border-box!important}
    .rpe-checkout-head{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;margin-bottom:14px!important}
    .rpe-checkout-head h3{margin:0!important;color:#173d32!important;font-size:18px!important}
    .rpe-checkout-close{width:34px!important;height:34px!important;border:0!important;border-radius:50%!important;background:#f1f4f2!important;color:#173d32!important;font-size:20px!important;cursor:pointer!important}
    .rpe-checkout-product{padding:14px!important;border-radius:16px!important;background:#0b8f5a!important;margin-bottom:14px!important;border:0!important;box-shadow:0 8px 20px rgba(11,143,90,.22)!important}
    .rpe-checkout-product b{display:block!important;font-size:16px!important;color:#fff!important;font-weight:900!important;line-height:1.35!important}
    .rpe-checkout-product span{display:block!important;margin-top:4px!important;font-size:15px!important;color:#fff!important;font-weight:750!important;line-height:1.35!important}
.rpe-checkout-items{display:grid!important;gap:10px!important;margin-bottom:14px!important}
    .rpe-checkout-item{display:grid!important;grid-template-columns:1fr auto!important;gap:12px!important;align-items:center!important;padding:14px!important;border:0!important;border-radius:16px!important;background:#0b8f5a!important;box-shadow:0 8px 20px rgba(11,143,90,.20)!important}
    .rpe-checkout-item b{display:block!important;font-size:16px!important;color:#fff!important;line-height:1.3!important;font-weight:900!important}
    .rpe-checkout-item small{display:block!important;margin-top:4px!important;font-size:15px!important;color:#fff!important;line-height:1.35!important;font-weight:700!important}
    .rpe-checkout-item-qty{font-size:16px!important;font-weight:950!important;color:#fff!important;white-space:nowrap!important}
    .rpe-checkout-payment{display:grid!important;gap:10px!important;margin:18px 0!important}
    .rpe-checkout-payment-title{font-size:15px!important;font-weight:900!important;color:#173d32!important;letter-spacing:-.01em!important}
    .rpe-checkout-pay-option{display:grid!important;grid-template-columns:24px 1fr!important;gap:12px!important;align-items:center!important;padding:14px 15px!important;border:1px solid #d8e1dd!important;border-radius:16px!important;background:#fff!important;cursor:pointer!important;text-align:left!important;box-shadow:0 5px 14px rgba(20,84,65,.06)!important;transition:border-color .18s ease,box-shadow .18s ease,transform .18s ease,background .18s ease!important}
    .rpe-checkout-pay-option:hover{transform:translateY(-1px)!important;box-shadow:0 8px 20px rgba(20,84,65,.09)!important}
    .rpe-checkout-pay-option.active{border:1.5px solid #ff5a2d!important;background:#fff8f4!important;box-shadow:0 8px 20px rgba(255,90,45,.12)!important}
    .rpe-checkout-pay-radio{width:20px!important;height:20px!important;border:2px solid #c9d5d0!important;border-radius:50%!important;display:grid!important;place-items:center!important;background:#fff!important}
    .rpe-checkout-pay-option.active .rpe-checkout-pay-radio{border-color:#ff5a2d!important}
    .rpe-checkout-pay-option.active .rpe-checkout-pay-radio:after{content:""!important;width:9px!important;height:9px!important;border-radius:50%!important;background:#ff5a2d!important}
    .rpe-checkout-pay-option b{display:block!important;font-size:15px!important;color:#173d32!important;font-weight:900!important;line-height:1.25!important}
    .rpe-checkout-pay-option small{display:block!important;margin-top:4px!important;font-size:12px!important;color:#7b8a84!important;line-height:1.35!important}
    .rpe-payment-details{margin-top:2px!important;padding:14px!important;border-radius:16px!important;background:#f8fbfa!important;border:1px solid #e3ebe7!important}
    .rpe-checkout-field{display:grid!important;gap:7px!important;margin-top:13px!important}
    .rpe-checkout-field:first-child{margin-top:0!important}
    .rpe-checkout-field label{font-size:14px!important;font-weight:900!important;color:#304c43!important;letter-spacing:-.01em!important}
    .rpe-checkout-field input,.rpe-checkout-field select{width:100%!important;height:52px!important;border:1px solid #d7e0dc!important;border-radius:14px!important;padding:0 14px!important;box-sizing:border-box!important;font-size:15px!important;font-weight:600!important;outline:none!important;background:#fff!important;color:#213d34!important;box-shadow:0 3px 10px rgba(20,84,65,.04)!important;transition:border-color .18s ease,box-shadow .18s ease!important}
    .rpe-checkout-field input::placeholder{color:#9aa7a1!important;font-weight:500!important}
    .rpe-checkout-field input:focus,.rpe-checkout-field select:focus{border-color:#ff7a52!important;box-shadow:0 0 0 3px rgba(255,90,45,.10)!important}
    .rpe-checkout-field small{font-size:11px!important;line-height:1.45!important;color:#74837c!important;margin-top:1px!important}
    .rpe-checkout-summary{display:grid!important;gap:10px!important;margin:16px 0!important;padding:16px!important;border-radius:16px!important;background:#ff5a2d!important;border:0!important;box-shadow:0 10px 24px rgba(255,90,45,.24)!important}
    .rpe-checkout-summary-row{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:14px!important;font-size:15px!important;line-height:1.35!important;color:#fff!important;font-weight:800!important}
    .rpe-checkout-summary-row span{color:#fff!important;font-size:15px!important;font-weight:800!important}
    .rpe-checkout-summary-row strong{color:#fff!important;text-align:right!important;font-size:16px!important;font-weight:950!important}
    .rpe-checkout-submit{width:100%!important;min-height:54px!important;border:0!important;border-radius:16px!important;background:#ff5a2d!important;color:#fff!important;font-size:16px!important;font-weight:950!important;cursor:pointer!important;box-shadow:0 10px 22px rgba(255,90,45,.24)!important;letter-spacing:.01em!important;transition:transform .18s ease,box-shadow .18s ease!important}
    .rpe-checkout-submit:hover{transform:translateY(-1px)!important;box-shadow:0 12px 26px rgba(255,90,45,.28)!important}
    .rpe-checkout-submit[disabled]{opacity:.55!important;cursor:wait!important}
    .rpe-checkout-status{margin-top:12px!important;font-size:11px!important;line-height:1.5!important;color:#6e7d77!important}
    .rpe-order-success{display:grid!important;gap:10px!important;text-align:center!important;padding:10px 2px!important}
    .rpe-order-success-mark{width:54px!important;height:54px!important;border-radius:50%!important;background:#e9f7ef!important;color:#0e6b45!important;display:grid!important;place-items:center!important;margin:0 auto!important;font-size:26px!important;font-weight:950!important}
    .rpe-order-ref{padding:10px!important;border-radius:10px!important;background:#f3f6f4!important;color:#173d32!important;font-size:14px!important;font-weight:950!important;letter-spacing:.03em!important}
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
function ensureCheckoutModal(d,w){
  var modal=d.getElementById("rpeCheckoutModal");
  if(modal)return modal;
  modal=d.createElement("div");
  modal.id="rpeCheckoutModal";
  modal.className="rpe-checkout-modal";
  modal.innerHTML=
    '<div class="rpe-checkout-sheet" role="dialog" aria-modal="true" aria-label="Complete order">'+
      '<div class="rpe-checkout-head"><h3>Complete your order</h3><button class="rpe-checkout-close" type="button" aria-label="Close">×</button></div>'+
      '<div class="rpe-checkout-body"></div>'+
    '</div>';
  d.body.appendChild(modal);
  var close=modal.querySelector(".rpe-checkout-close");
  if(close)close.onclick=function(){modal.classList.remove("open")};
  modal.addEventListener("click",function(e){if(e.target===modal)modal.classList.remove("open")});
  return modal;
}
function collectSelectedItems(d){
  var items=[];
  [].slice.call(d.querySelectorAll("#grid .product")).forEach(function(card){
    var q=Math.max(0,parseInt(card.dataset.quantity||"0",10)||0);
    if(q<1)return;
    var unit=parseFloat(card.dataset.rpeUnitPrice||"0")||0;
    items.push({
      product_id:card.dataset.rpeProductId||"",
      product_name:card.dataset.rpeProductName||"Product",
      quantity:q,
      unit_price:unit,
      line_total:unit>0?unit*q:0
    });
  });
  return items;
}
function combinedTotal(items){
  if(!items.length||!items.every(function(x){return Number(x.unit_price)>0}))return null;
  return items.reduce(function(sum,x){return sum+(Number(x.unit_price)||0)*(Number(x.quantity)||0)},0);
}
function openCheckout(d,w,data){
  var modal=ensureCheckoutModal(d,w);
  var body=modal.querySelector(".rpe-checkout-body");
  if(!body)return;
  var items=Array.isArray(data.items)?data.items:[];
  var totalQty=items.reduce(function(sum,x){return sum+(Number(x.quantity)||0)},0);
  var combined=combinedTotal(items);
  var selectedPayment="";
  var itemHtml=items.map(function(item){
    return '<div class="rpe-checkout-item"><span><b>'+esc(item.product_name)+'</b><small>'+esc(item.product_id||"")+(item.unit_price>0?' · '+money(item.unit_price)+' each':' · Price to be confirmed')+'</small></span><span class="rpe-checkout-item-qty">× '+item.quantity+'</span></div>';
  }).join("");

  body.innerHTML=
    '<div class="rpe-checkout-items">'+itemHtml+'</div>'+
    '<div class="rpe-checkout-summary">'+
      '<div class="rpe-checkout-summary-row"><span>Products</span><strong>'+items.length+'</strong></div>'+
      '<div class="rpe-checkout-summary-row"><span>Total quantity</span><strong>'+totalQty+' item(s)</strong></div>'+
      '<div class="rpe-checkout-summary-row"><span>Deliver to</span><strong>'+esc(data.delivery_location)+'</strong></div>'+
      '<div class="rpe-checkout-summary-row"><span>Product total</span><strong>'+(combined===null?'To be confirmed':money(combined))+'</strong></div>'+
      '<div class="rpe-checkout-summary-row"><span>Delivery fee</span><strong>To be confirmed</strong></div>'+
    '</div>'+
    '<div class="rpe-checkout-payment">'+
      '<div class="rpe-checkout-payment-title">Choose payment method</div>'+
      '<button type="button" class="rpe-checkout-pay-option" data-method="Mobile Money"><span class="rpe-checkout-pay-radio"></span><span><b>Mobile Money</b><small>MTN MoMo, Telecel Cash or AT Money</small></span></button>'+
      '<button type="button" class="rpe-checkout-pay-option" data-method="Bank Transfer"><span class="rpe-checkout-pay-radio"></span><span><b>Bank Transfer</b><small>Secure bank transfer through RANOVA</small></span></button>'+
    '</div>'+
    '<div class="rpe-payment-details rpe-momo-details" style="display:none">'+
      '<div class="rpe-checkout-field"><label>Mobile Money network</label><select class="rpe-momo-network"><option value="">Choose network</option><option value="mtn">MTN Mobile Money</option><option value="vod">Telecel Cash</option><option value="atl">ATMoney / AirtelTigo Money</option></select></div>'+
      '<div class="rpe-checkout-field"><label>Mobile Money number</label><input class="rpe-momo-phone" type="tel" inputmode="tel" placeholder="e.g. 024 000 0000"><small style="color:#6e7d77;font-size:9px">The authorization prompt will be sent to this number when payment is opened.</small></div>'+
    '</div>'+
    '<div class="rpe-payment-details rpe-bank-details" style="display:none">'+
      '<div class="rpe-checkout-field"><label>Your bank</label><select class="rpe-bank-select"><option value="">Loading Ghana banks…</option></select></div>'+
      '<div class="rpe-checkout-field"><label>Your bank account number</label><input class="rpe-bank-account" type="text" inputmode="numeric" placeholder="Account number"></div>'+
      '<div class="rpe-checkout-status rpe-bank-name-status" style="margin:8px 0 0;background:#f4f8f6;padding:10px;border-radius:10px">Enter the bank account number. RANOVA will verify the registered account name. This is for identity confirmation only; RANOVA will not collect your bank PIN.</div>'+
    '</div>'+
    '<div class="rpe-checkout-field"><label>Your name</label><input class="rpe-customer-name" type="text" autocomplete="name" placeholder="Full name"></div>'+
    '<div class="rpe-checkout-field"><label>Phone number</label><input class="rpe-customer-phone" type="tel" autocomplete="tel" placeholder="e.g. 024 000 0000"></div>'+
    '<div class="rpe-checkout-field"><label>Email</label><input class="rpe-customer-email" type="email" autocomplete="email" placeholder="For payment and receipt"></div>'+
    '<button class="rpe-checkout-submit" type="button" disabled>Place Order</button>'+
    '<div class="rpe-checkout-status">Choose a payment method, then place the combined order. Payment account details remain private until confirmation.</div>';

  var submit=body.querySelector(".rpe-checkout-submit");
  var status=body.querySelector(".rpe-checkout-status");
  var payOptions=[].slice.call(body.querySelectorAll(".rpe-checkout-pay-option"));
  payOptions.forEach(function(option){
    option.onclick=function(){
      selectedPayment=this.getAttribute("data-method")||"";
      payOptions.forEach(function(x){x.classList.toggle("active",x===option)});
      var momo=body.querySelector(".rpe-momo-details"),bank=body.querySelector(".rpe-bank-details");
      if(momo)momo.style.display=selectedPayment==="Mobile Money"?"block":"none";
      if(bank)bank.style.display=selectedPayment==="Bank Transfer"?"block":"none";
      if(selectedPayment==="Bank Transfer")loadGhanaBanks();
      if(submit)submit.disabled=!selectedPayment;
    };
  });


  var bankSelect=body.querySelector(".rpe-bank-select");
  var bankAccount=body.querySelector(".rpe-bank-account");
  var nameInput=body.querySelector(".rpe-customer-name");
  var bankNameStatus=body.querySelector(".rpe-bank-name-status");
  var banksLoaded=false,resolveTimer=null;

  async function paymentHelper(action,extra){
    var r=await fetch(PAYMENT_ENDPOINT,{method:"POST",headers:{"Content-Type":"application/json","x-ranova-client":"ranova-site-v1"},body:JSON.stringify(Object.assign({action:action},extra||{}))});
    var o=await r.json().catch(function(){return{}});
    if(!r.ok||!o.ok)throw new Error(o.error||"Payment verification request failed.");
    return o;
  }
  async function loadGhanaBanks(){
    if(banksLoaded||!bankSelect)return;
    bankSelect.innerHTML='<option value="">Loading Ghana banks…</option>';
    try{
      var out=await paymentHelper("list_ghana_banks");
      bankSelect.innerHTML='<option value="">Choose bank</option>'+out.banks.map(function(b){return '<option value="'+esc(b.code)+'">'+esc(b.name)+'</option>'}).join("");
      banksLoaded=true;
      if(bankNameStatus)bankNameStatus.textContent="Enter your account number and RANOVA will verify the registered account name.";
    }catch(e){
      var fallback=[
        "Absa Bank Ghana","Access Bank Ghana","Agricultural Development Bank","CalBank",
        "Consolidated Bank Ghana","Ecobank Ghana","Fidelity Bank Ghana","First Atlantic Bank",
        "First National Bank Ghana","GCB Bank","Guaranty Trust Bank Ghana","National Investment Bank",
        "OmniBSIC Bank","Prudential Bank","Republic Bank Ghana","Stanbic Bank Ghana",
        "Standard Chartered Bank Ghana","United Bank for Africa Ghana","Zenith Bank Ghana"
      ];
      bankSelect.innerHTML='<option value="">Choose bank</option>'+fallback.map(function(name){return '<option value="manual:'+esc(name)+'">'+esc(name)+'</option>'}).join("");
      banksLoaded=true;
      if(bankNameStatus)bankNameStatus.textContent="Bank list is available. Automatic account-name verification will activate when the secure Paystack connection is added.";
    }
  }
  async function resolveBankName(){
    if(!bankSelect||!bankAccount||!nameInput)return;
    var bankCode=bankSelect.value,account=cleanInput(bankAccount);
    if(!bankCode||account.length<6)return;
    if(bankCode.indexOf("manual:")===0){
      nameInput.readOnly=false;
      if(bankNameStatus)bankNameStatus.textContent="Enter the account-holder name manually for now. Automatic verification will switch on when the secure Paystack connection is added.";
      return;
    }
    if(bankNameStatus)bankNameStatus.textContent="Checking account name…";
    try{
      var out=await paymentHelper("resolve_bank_account",{bank_code:bankCode,account_number:account});
      nameInput.value=out.account_name||"";
      nameInput.readOnly=!!out.account_name;
      if(bankNameStatus)bankNameStatus.textContent=out.account_name?"Verified account name: "+out.account_name:"Account name could not be verified.";
    }catch(e){
      nameInput.readOnly=false;
      if(bankNameStatus)bankNameStatus.textContent=e.message||"Could not verify the account name.";
    }
  }
  if(bankSelect)bankSelect.addEventListener("change",function(){if(resolveTimer)clearTimeout(resolveTimer);resolveTimer=setTimeout(resolveBankName,250)});
  if(bankAccount)bankAccount.addEventListener("input",function(){nameInput.readOnly=false;if(resolveTimer)clearTimeout(resolveTimer);resolveTimer=setTimeout(resolveBankName,650)});

  if(submit)submit.onclick=async function(){
    var name=cleanInput(body.querySelector(".rpe-customer-name"));
    var phone=cleanInput(body.querySelector(".rpe-customer-phone"));
    var email=cleanInput(body.querySelector(".rpe-customer-email"));
    var momoNetwork=cleanInput(body.querySelector(".rpe-momo-network"));
    var momoPhone=cleanInput(body.querySelector(".rpe-momo-phone"));
    if(!selectedPayment){if(status)status.textContent="Please choose Mobile Money or Bank Transfer.";return}
    if(!name||!phone||!email){if(status)status.textContent="Please enter your name, phone number and email.";return}
    if(selectedPayment==="Mobile Money"&&(!momoNetwork||!momoPhone)){if(status)status.textContent="Choose your Mobile Money network and enter the MoMo number that should receive the authorization prompt.";return}
    submit.disabled=true;submit.textContent="Placing Order…";
    if(status)status.textContent="Saving your combined order securely…";
    try{
      var res=await fetch(ORDER_ENDPOINT,{
        method:"POST",
        headers:{"Content-Type":"application/json","x-ranova-client":"ranova-site-v1"},
        body:JSON.stringify({
          customer_name:name,
          customer_phone:phone,
          customer_email:email,
          delivery_location:data.delivery_location,
          payment_method:selectedPayment,
          payment_network:selectedPayment==="Mobile Money"?momoNetwork:"bank_transfer",
          payment_phone:selectedPayment==="Mobile Money"?momoPhone:"",
          items:items
        })
      });
      var out=await res.json().catch(function(){return{}});
      if(!res.ok||!out.ok)throw new Error(out.error||"Could not place order.");
      body.innerHTML=
        '<div class="rpe-order-success">'+
          '<div class="rpe-order-success-mark">✓</div>'+
          '<h3 style="margin:0;color:#173d32">Order placed</h3>'+
          '<p style="margin:0;color:#718078;font-size:11px;line-height:1.5">'+items.length+' product(s) have been combined into one RANOVA order.</p>'+
          '<div class="rpe-order-ref">'+esc(out.order_ref||"Order received")+'</div>'+
          '<div class="rpe-checkout-summary-row"><span>Total quantity</span><strong>'+totalQty+' item(s)</strong></div>'+
          '<div class="rpe-checkout-summary-row"><span>Payment method</span><strong>'+esc(selectedPayment)+'</strong></div>'+
          '<div class="rpe-checkout-summary-row"><span>Payment status</span><strong>Not started</strong></div>'+
          '<div class="rpe-checkout-summary-row"><span>Order status</span><strong>Awaiting confirmation</strong></div>'+
          '<p style="margin:0;color:#718078;font-size:10px;line-height:1.5">Your payment choice is saved with this combined order. Secure payment instructions remain private until confirmation.</p>'+
          '<button class="rpe-checkout-submit rpe-checkout-done" type="button">Done</button>'+
        '</div>';
      items.forEach(function(item){
        [].slice.call(d.querySelectorAll("#grid .product")).forEach(function(card){
          if(card.dataset.rpeProductId===String(item.product_id||"")){
            card.dataset.quantity="0";
            var input=card.querySelector(".rpe-qty-input");
            var count=card.querySelector(".rpe-selected-count");
            var total=card.querySelector(".rpe-product-total");
            var grand=card.querySelector(".rpe-grand-total-value");
            var btn=card.querySelector(".rpe-order-now");
            if(input)input.value="0";if(count)count.textContent="0";if(total)total.textContent=money(0);if(grand)grand.textContent=money(0);if(btn)btn.disabled=true;
            try{w.localStorage.setItem("rpeQty:"+(item.product_id||item.product_name||"product"),"0")}catch(e){}
          }
        });
      });
      var done=body.querySelector(".rpe-checkout-done");
      if(done)done.onclick=function(){modal.classList.remove("open")};
    }catch(err){
      submit.disabled=false;submit.textContent="Place Order";
      if(status)status.textContent=err&&err.message?err.message:"Could not place the order. Please try again.";
    }
  };
  modal.classList.add("open");
}
function cleanInput(el){return el?String(el.value||"").trim():""}
function decorateCard(card,p,w){
  var info=card.querySelector(".product-info");
  if(!info||!p)return;
  if(card.__rpeEssentialReady)return;
  card.__rpeEssentialReady=true;

  var id=p.rpeSku||p.rpeModel||p.id||"";
  var holder=info.querySelector(".rpe-essential-card");
  if(!holder){
    holder=info.ownerDocument.createElement("div");
    holder.className="rpe-essential-card";
    info.appendChild(holder);
  }
  if(!holder){card.__rpeEssentialReady=false;return;}

  var unitPrice=getUnitPrice(p);
  var priceDisplay=unitPrice>0?money(unitPrice):"GHS ______";
  var locationKey="rpeDeliveryLocation";
  var savedQty=0;
  var savedLocation="Accra, Ghana";
  try{
    savedLocation=w.localStorage.getItem(locationKey)||savedLocation;
  }catch(e){}

  var locations=["Accra, Ghana","Tema, Ghana","Kumasi, Ghana","Takoradi, Ghana","Cape Coast, Ghana","Tamale, Ghana","Other location"];
  var options=locations.map(function(loc){
    return '<option value="'+esc(loc)+'"'+(loc===savedLocation?' selected':'')+'>'+esc(loc)+'</option>';
  }).join("");

  holder.innerHTML=
    '<h3 class="rpe-essential-name">'+esc(p.name||"Product")+'</h3>'+
    '<div class="rpe-essential-id">Product ID: '+esc(id)+'</div>'+
    '<div class="rpe-essential-price"><span class="rpe-price-label">Price</span><span class="rpe-price-value">'+esc(priceDisplay)+'</span></div>'+
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
      '<button class="rpe-order-now" type="button"'+(savedQty<1?' disabled':'')+'>Order Now</button>'+
    '</div>';

  var qtyInput=holder.querySelector(".rpe-qty-input");
  var qtyMinus=holder.querySelector(".rpe-qty-minus");
  var qtyPlus=holder.querySelector(".rpe-qty-plus");
  var selectedCount=holder.querySelector(".rpe-selected-count");
  var totalEl=holder.querySelector(".rpe-product-total");
  var locationSelect=holder.querySelector(".rpe-location-select");
  var orderBtn=holder.querySelector(".rpe-order-now");
  var grandTotalEl=holder.querySelector(".rpe-grand-total-value");

  function stopQtyEvent(e){e.stopPropagation()}
  function refreshOrderSummary(v){
    v=Math.max(0,parseInt(v,10)||0);
    var currentUnitPrice=getUnitPrice(p);
    if(qtyInput)qtyInput.value=String(v);
    if(selectedCount)selectedCount.textContent=String(v);
    if(totalEl)totalEl.textContent=money(currentUnitPrice*v);
    if(grandTotalEl)grandTotalEl.textContent=money(currentUnitPrice*v);
    if(orderBtn)orderBtn.disabled=(v<1);
    card.dataset.quantity=String(v);
    card.dataset.rpeUnitPrice=String(currentUnitPrice||0);
    return v;
  }

  if(qtyMinus){
    qtyMinus.addEventListener("click",function(e){e.preventDefault();stopQtyEvent(e);var current=parseInt(qtyInput&&qtyInput.value,10);if(!Number.isFinite(current))current=0;refreshOrderSummary(Math.max(0,current-1))});
  }
  if(qtyPlus){
    qtyPlus.addEventListener("click",function(e){e.preventDefault();stopQtyEvent(e);var current=parseInt(qtyInput&&qtyInput.value,10);if(!Number.isFinite(current))current=0;refreshOrderSummary(current+1)});
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

  card.dataset.rpeProductId=String(id||"");
  card.dataset.rpeProductName=String(p.name||"Product");
  card.dataset.rpeUnitPrice=String(getUnitPrice(p)||0);

  if(orderBtn){
    orderBtn.addEventListener("click",function(e){
      stopQtyEvent(e);
      var qty=Math.max(0,parseInt(qtyInput&&qtyInput.value,10)||0);
      if(qty<1)return;
      var items=collectSelectedItems(holder.ownerDocument);
      if(!items.length)return;
      var destination=locationSelect?locationSelect.value:"Accra, Ghana";
      openCheckout(holder.ownerDocument,w,{items:items,delivery_location:destination});
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
    observer.observe(grid,{childList:true,subtree:false});
    grid.__rpeEssentialObserver=observer;
  }
  return true;
}
function boot(){
  var tries=0;
  function run(){
    if(apply()){syncLiveSellerPrices();return}
    if(++tries<60)setTimeout(run,250);
  }
  run();
}
frame.addEventListener("load",function(){setTimeout(boot,500)});
setTimeout(boot,900);
setInterval(function(){if(document.visibilityState!=="hidden")syncLiveSellerPrices()},10000);
document.addEventListener("visibilitychange",function(){if(document.visibilityState==="visible")syncLiveSellerPrices()});
window.addEventListener("focus",syncLiveSellerPrices);
})();