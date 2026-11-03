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
for(const tab of ["all","pay","ship","receive","returns","review"]){
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
  activePanelId:"homePanel",
  renders:0,
  window:{scrollTo(){}},
  // Invoked as plain functions by app code, so do not rely on a bound 'this'.
  renderCustomerOrderView:null,
  showPanel:null,
  closeCustomerOrderMenus() {}
};
ctx.renderCustomerOrderView=()=>{ctx.renders++};
ctx.showPanel=panel=>{ctx.shown=panel};
vm.createContext(ctx);
vm.runInContext(extract("function navigateCustomerOrdersTab(tab){",'document.addEventListener("click",e=>{'),ctx);
for(const [tab,panel,filter] of [
  ["all","toPayPanel",null],["pay","toPayPanel","awaiting_payment"],
  ["ship","toPayPanel","preparing"],["receive","toPayPanel","receive"],
  ["returns","toPayPanel","returns"],["completed","toPayPanel","delivered"],
  ["review","toPayPanel","review"]
]){
  ctx.shown=null;
  ctx.navigateCustomerOrdersTab(tab);
  assert.equal(ctx.shown,panel,tab+" panel");
  assert.equal(ctx.orderFilter,filter,tab+" filter");
}
ctx.activePanelId="toPayPanel";
ctx.shown=null;
ctx.navigateCustomerOrdersTab("ship");
assert.equal(ctx.shown,null,"Switch tabs within the same screen, without opening a new panel");
assert.equal(ctx.orderFilter,"preparing","Switching tabs must update the status filter");
assert.equal(ctx.renders,1,"Switching tabs must repaint the order list");
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
assert.match(endpoint,/review_eligible:reviewEligible\.has\(o\.id\)/,"Reviews require backend delivery confirmation");
assert.match(html,/id="payHistoryOrders"/,"One screen must render historic orders under the persistent header");
assert.match(app,/renderOrders\(historyHost\)/,"Order history replaces content rather than navigating away");
assert.match(app,/action:"buyer_history"/);
assert.match(app,/seenSellerRefs\.has\(o\.order_ref\)/,"Avoid duplicate seller orders across history and unpaid fallback");
assert.match(app,/pay-amount-warning/,"Flag inconsistent item pricing");
assert.match(app,/Order amounts differ\. Contact RANOVA before paying/,"Never initiate payment for inconsistent item amounts");
assert.match(app,/class="pay-unit-row"/,"Price and quantity must share a compact product row");
assert.match(app,/<details class="pay-protection">/,"Buyer protection details must be expandable without losing the disclosure");
assert.match(app,/Payment is confirmed only after RANOVA verification/,"Never claim an unpaid order is paid");
assert.match(app,/class="pay-amount-warning"/,"Mismatched order totals must keep the warning visible");
assert.match(app,/data-pay-help/,"Order help stays available");
assert.match(app,/data-pay-address/,"Address access stays available");
assert.match(app,/data-pay-now/,"Payment action remains wired");
assert.match(html,/id="orderFilterButton"/,"Order filter control must be accessible");
assert.match(html,/id="orderMoreButton"/,"Order options control must be accessible");
assert.match(html,/data-order-sort="newest"/,"Newest-first sorting must exist");
assert.match(html,/data-order-sort="oldest"/,"Oldest-first sorting must exist");
assert.match(html,/data-order-refresh/,"Order refresh must exist");
assert.match(html,/data-order-clear-search/,"Search can be cleared");
assert.match(app,/function toggleCustomerOrderMenu\(which\)/,"Header menus must open");
assert.match(app,/function closeCustomerOrderMenus\(\)/,"Header menus must close");
assert.match(app,/customerOrderSort==="oldest"/,"Order list supports chronological sorting");
assert.match(app,/This order is still recorded/,"Close must never falsely cancel or silently hide an order");
assert.doesNotMatch(app,/card\.style\.display="none"/,"No silent hiding of active orders");
assert.match(app,/return \["paid","confirmed"\]\.includes\(payment\)\?"ship":"pay"/,
  "Unpaid preparing orders must not be classified as To Ship");
assert.match(html,/data-order-nav="review"/,"Eligible review tab must exist");
assert.match(app,/data-write-review/,"Review cards must expose a real review action");
assert.match(app,/\.\.\/all\/order-status\.html\?ref=/,"Review action opens existing verified review flow");
assert.match(app,/customerOrderSort==="oldest"\?\[\.\.\.rows\]\.reverse\(\):rows/,"Unpaid order list must respect sort");
assert.match(app,/data-order-clear-search/,"Clear search must work");
assert.match(app,/data-order-refresh/,"Refresh menu must fetch current orders");
assert.match(app,/cards\.sort\(\(a,b\)=>customerOrderSort==="oldest"/,"Mixed seller orders must sort by timestamp");
assert.match(app,/cards\.map\(card=>card\.html\)/,"Sorted seller and catalogue cards must render");
assert.match(app,/timestamp:child\.created_at\|\|parent\.created_at/,"Seller orders preserve real order dates");
assert.match(app,/timestamp:o\.created_at/,"Legacy orders preserve order dates");
console.log("PASS customer order tabs: navigation, real seller status classification, buyer-scoped history, duplicate prevention and payment safety");
