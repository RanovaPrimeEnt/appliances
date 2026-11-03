"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const root=path.resolve(__dirname,"..");
const html=fs.readFileSync(path.join(root,"rpe-v2/index.html"),"utf8");
const app=fs.readFileSync(path.join(root,"rpe-v2/app.js"),"utf8");
const endpoint=fs.readFileSync(path.join(root,"rpe-v2/supabase/functions/ranova-order-status/index.ts"),"utf8");
new Function(app);
for(const tab of ["all","pay","ship","receive","returns"]){
  assert.match(html,new RegExp('class="pay-tab[^"]*" data-order-nav="'+tab+'"'),"To Pay header must route "+tab);
}
for(const tab of ["all","pay","ship","receive","completed","returns"]){
  assert.ok(html.includes('data-order-nav="'+tab+'" data-orders-tab="'+tab+'"'),"My Orders must route "+tab);
}
function extract(start,end){
  const a=app.indexOf(start),b=app.indexOf(end,a);
  assert.ok(a>=0&&b>a,"Missing function: "+start);
  return app.slice(a,b);
}
const ctx={
  orderFilter:null,
  panelPainted:{delete(){}},
  shown:null,
  showPanel(panel){this.shown=panel}
};
vm.createContext(ctx);
vm.runInContext(extract("function navigateCustomerOrdersTab(tab){",'document.addEventListener("click",e=>{'),ctx);
for(const [tab,panel,filter] of [
  ["all","ordersPanel",null],["pay","toPayPanel","awaiting_payment"],
  ["ship","ordersPanel","preparing"],["receive","ordersPanel","receive"],
  ["returns","ordersPanel","returns"],["completed","ordersPanel","delivered"]
]){
  ctx.shown=null;
  ctx.navigateCustomerOrdersTab(tab);
  assert.equal(ctx.shown,panel,tab+" panel");
  assert.equal(ctx.orderFilter,filter,tab+" filter");
}
vm.runInContext(extract("function marketplaceSellerOrderTab(child,parent){","async function loadMarketplaceOrderHistory(){"),ctx);
const unpaid={payment_status:"pending"};
const paid={payment_status:"paid"};
for(const [status,parent,expected] of [
  ["new",unpaid,"pay"],["confirmed",unpaid,"pay"],
  ["confirmed",paid,"ship"],["preparing",paid,"ship"],
  ["ready_for_dispatch",paid,"ship"],["dispatched",paid,"receive"],
  ["out_for_delivery",paid,"receive"],["delivered",paid,"completed"],
  ["return_requested",paid,"returns"],["refunded",paid,"returns"],
  ["cancelled",unpaid,"cancelled"]
]){
  assert.equal(ctx.marketplaceSellerOrderTab({order_status:status},parent),expected,status+" classification");
}
assert.match(endpoint,/if\(action==="buyer_history"\)/);
assert.match(endpoint,/if\(!user\)return response\(h,401/);
assert.match(endpoint,/\.eq\("buyer_user_id",user\.id\)/);
assert.match(app,/action:"buyer_history"/);
assert.match(app,/seenSellerRefs\.has\(o\.order_ref\)/,"Avoid duplicate seller orders across history and unpaid fallback");
assert.match(app,/pay-amount-warning/,"Flag inconsistent item pricing");
assert.match(app,/Order amounts differ\. Contact RANOVA before paying/,"Never initiate payment for inconsistent item amounts");
console.log("PASS customer order tabs: navigation, real seller status classification, buyer-scoped history, duplicate prevention and payment safety");
