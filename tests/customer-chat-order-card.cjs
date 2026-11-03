"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const root=path.resolve(__dirname,"..");
const src=fs.readFileSync(path.join(root,"rpe-v2/app.js"),"utf8");
const api=fs.readFileSync(path.join(root,"rpe-v2/supabase/functions/ranova-order-status/index.ts"),"utf8");
const css=fs.readFileSync(path.join(root,"rpe-v2/customer-pro.css"),"utf8");
function extract(a,b){
  const start=src.indexOf(a),end=src.indexOf(b,start);
  assert.ok(start>=0&&end>start,"Missing card function boundary");
  return src.slice(start,end);
}
const card=extract("function customerConversationOrderCards(){","function renderMessageThread(");
const classify=extract("function marketplaceSellerOrderTab(child,parent){","async function loadMarketplaceOrderHistory(){");
const fixtures={
  user:{id:"buyer-a"},
  messageCurrent:{store:{id:"store-a",store_name:"A Shop"}},
  marketplaceHistoryError:"",
  marketplaceOrderHistory:[{order_ref:"PARENT-A",payment_status:"not_started",
    seller_orders:[
      {store_id:"store-a",order_ref:"ORDER-A",store_name:"A Shop",order_status:"new",
        items:[{product_name:"Kitchen Set",image_url:"https://example.org/a.png",quantity:1}],total:20,currency:"GHS"},
      {store_id:"store-b",order_ref:"ORDER-B",store_name:"B Shop",order_status:"new",
        items:[{product_name:"Private B Item"}],total:30,currency:"GHS"}
    ]}],
  toPayOrders:[
    {store_id:"store-a",order_ref:"ORDER-A",payment_status:"not_started",order_status:"new"},
    {store_id:"store-a",order_ref:"ORDER-C",payment_status:"not_started",order_status:"new",
      parent_order:{payment_status:"not_started"},items:[{product_name:"Soap",quantity:2}],total:12,currency:"GHS"},
    {store_id:"store-b",order_ref:"ORDER-D",payment_status:"not_started",order_status:"new",items:[]},
    {store_id:"store-a",order_ref:"ORDER-PAID",payment_status:"paid",order_status:"new",items:[]}
  ],
  toPayStores:[{id:"store-a",store_name:"A Shop"},{id:"store-b",store_name:"B Shop"}],
  esc:v=>String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[m])),
  money:(value,currency)=>currency+" "+Number(value).toFixed(2),
  statusLabel:value=>String(value||"Unknown")
};
const ctx=vm.createContext(fixtures);
vm.runInContext(classify+"\n"+card,ctx);
let markup=ctx.customerConversationOrderCards();
assert.match(markup,/ORDER-A/);
assert.match(markup,/ORDER-C/);
assert.match(markup,/Kitchen Set/);
assert.match(markup,/Review payment options/);
assert.doesNotMatch(markup,/ORDER-B|ORDER-D|ORDER-PAID|Private B Item/,"Never leak another store's order or show a paid order as unpaid");
assert.equal((markup.match(/class="msg-verified-order"/g)||[]).length,2,"Deduplicate history and payment feed");
ctx.messageCurrent={store:{id:"store-b",store_name:"B Shop"}};
markup=ctx.customerConversationOrderCards();
assert.match(markup,/ORDER-B/);
assert.match(markup,/ORDER-D/);
assert.doesNotMatch(markup,/ORDER-A|ORDER-C/);
ctx.user=null;
assert.equal(ctx.customerConversationOrderCards(),"","No authenticated buyer, no private cards");
ctx.user={id:"buyer-a"};
ctx.messageCurrent={store:{id:"store-a",store_name:"A Shop"}};
ctx.marketplaceHistoryError="Unavailable";
markup=ctx.customerConversationOrderCards();
assert.match(markup,/ORDER-C/,"Verified unpaid orders remain available when history endpoint is unavailable");
assert.doesNotMatch(markup,/Kitchen Set/,"Do not use stale history data after API failure");
ctx.toPayOrders[1].subtotal=50;
ctx.toPayOrders[1].items[0].line_total=12;
markup=ctx.customerConversationOrderCards();
assert.match(markup,/Amount to verify/,"Inconsistent order subtotal must not be presented as payable");
assert.match(markup,/Review order amount/,"Mismatched orders route to protected amount review");
ctx.toPayOrders[1].subtotal=null;
ctx.toPayOrders[1].items[0].line_total=null;
assert.match(src,/action:"start",store_id:storeId,subject:"Order: "/,"Checkout starts a relevant seller conversation");
assert.match(src,/orderedStoreIds=new Set\(/,"Checkout must derive sellers from selected products");
assert.match(src,/marketplaceHistoryLoadedAt=0;/,"A new checkout invalidates cached order history");
assert.match(src,/\$\("messageBack"\)\?\.click\(\)/,"Order actions must close full-screen chat");
assert.match(src,/loadToPayOrders\(\)\.then/,"Conversation refreshes verified unpaid orders");
assert.match(api,/order_ref:o\.order_ref,store_id:o\.store_id,store_name:/,"Buyer-scoped history returns seller store IDs");
assert.match(api,/\.eq\("buyer_user_id",user\.id\)/,"History must be account-scoped");
assert.match(api,/customer_name:p\.customer_name,delivery_location:p\.delivery_location/,"Only buyer-owned recipient and delivery context is returned");
assert.match(src,/parent\.customer_name\?/, "Recipient is shown only if recorded");
assert.match(src,/parent\.delivery_location\?/, "Delivery location is shown only if recorded");
assert.match(src,/Order awaiting payment · View order details/,"Conversation preview indicates a real unpaid order");
assert.match(src,/if\(messageConversations\.length\)renderMessageList\(\)/,"Conversation list previews refresh when payment orders load");
assert.match(css,/msg-verified-order/,"Order card must have mobile chat styling");
assert.doesNotMatch(card,/sender_role:"system"/,"Do not fabricate chat messages");
console.log("PASS buyer chat order cards: account/store isolation, real payment fallback, dedupe, checkout conversation, mobile styling");
