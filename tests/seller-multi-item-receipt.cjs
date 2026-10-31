"use strict";
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const vm=require("node:vm");
const root=path.resolve(__dirname,"..");
const dashboard=fs.readFileSync(path.join(root,"all/seller-dashboard.html"),"utf8");
const placeOrder=fs.readFileSync(path.join(root,"rpe-v2/supabase/functions/ranova-place-order/index.ts"),"utf8");
assert.ok(!placeOrder.includes("return out.slice(0,100)"),"Never truncate checkout lines silently");
assert.match(placeOrder,/b\.items\.length>100/, "Oversized checkout must be rejected explicitly");
assert.match(placeOrder,/so no products are omitted/, "Oversized checkout error must explain the limit");


// Backend contract: one child seller order per store in a marketplace checkout.
// One child order keeps every item in the corresponding store's group.
for(const line of ["const storeIds=[...new Set(sellerItems.map(x=>x.store_id))]",
                   "for(const storeId of storeIds)",
                   "const group=sellerItems.filter(x=>x.store_id===storeId)",
                   "items:group.map(x=>({",
                   "image_url:x.primary_image_url"]){
  assert.ok(placeOrder.includes(line),"Seller order grouping/snapshot contract missing: "+line);
}
const begin=dashboard.indexOf("function sellerOrderedPhotoUrl(item)");
const end=dashboard.indexOf("\nfunction renderMyOrders(){",begin);
assert.ok(begin>=0&&end>begin,"Receipt functions must be present");
const helpers=dashboard.slice(begin,end);
const esc=v=>String(v==null?"":v).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
const money=v=>v==null||v===""?"Ask for price":"GHC "+Number(v).toFixed(2);
const ctx={
  SUPABASE_URL:"https://example.supabase.co",
  clean:v=>String(v==null?"":v),
  esc,
  pretty:v=>String(v||"").replace(/_/g," "),
  money,
  sellerFinanceBreakdown:(o,sub,fee)=>({
    gross:Number(sub),delivery:Number(fee),commissionRate:Number(o.commission_rate_snapshot||0),
    commission:Number((Number(sub)*Number(o.commission_rate_snapshot||0)/100).toFixed(2)),
    sellerFee:0,payout:Number((Number(sub)*(1-Number(o.commission_rate_snapshot||0)/100)+Number(fee)).toFixed(2))
  })
};
vm.createContext(ctx);
vm.runInContext(helpers,ctx,{timeout:1000});
const base={
  order_ref:"RPE-TEST-S1",platform_order_ref:"RPE-TEST",
  buyer_name:"Sample Buyer",buyer_phone:"",delivery_location:"Test location",
  order_status:"new",payment_status:"not_started",payment_method:"Mobile Money",
  subtotal:300,delivery_fee:15,total:315,currency:"GHS",commission_rate_snapshot:5,
  created_at:"2026-10-31T00:00:00.000Z",
  items:[
    {product_name:"Blue Bowl",sku:"BOWL-1",quantity:2,unit_price:30,line_total:60,image_url:"https://example.supabase.co/storage/v1/object/public/seller-store-assets/bowl.jpg"},
    {product_name:"White Cup",quantity:4,unit_price:20,line_total:80,image_url:"https://example.supabase.co/storage/v1/object/public/seller-store-assets/cup.jpg"},
    {product_name:"Wooden Plate",quantity:2,unit_price:80,line_total:160,image_url:null}
  ]
};
const html=ctx.sellerOrderPrintHtml(base);
assert.match(html,/RPE-TEST-S1/);
assert.match(html,/RPE-TEST/);
for(const name of ["Blue Bowl","White Cup","Wooden Plate"])assert.match(html,new RegExp(name));
assert.equal((html.match(/<tr><td class="image-cell">/g)||[]).length,3,"each ordered product must have its own row");
assert.match(html,/Qty/);assert.match(html,/Unit price/);assert.match(html,/Line total/);
assert.match(html,/GHC 315\.00/);
assert.match(html,/Payment not confirmed/);
assert.match(html,/not a tax invoice or independent proof of payment/);
assert.match(html,/Image unavailable/);
assert.match(html,/bowl\.jpg/);
assert.doesNotMatch(html,/stock\.jpg|placeholder-photo/);
assert.equal(ctx.sellerOrderTotalUnits(base.items),8,"unit count must include every ordered quantity");
assert.equal(ctx.sellerOrderCopyText(base).split("\n").filter(x=>/^\d+\. /.test(x)).length,3,"copy all lines");

// Long orders remain one receipt even if the card folds the first five lines.
const many={...base,items:Array.from({length:80},(_,i)=>({
  product_name:"Item "+String(i+1).padStart(3,"0"),
  quantity:i+1,unit_price:1,line_total:i+1,image_url:null
})),subtotal:3240,total:3255};
const longPrint=ctx.sellerOrderPrintHtml(many);
assert.equal((longPrint.match(/<tr><td class="image-cell">/g)||[]).length,80);
assert.match(longPrint,/Item 080/);
const collapsed=ctx.sellerOrderItemCardHtml(many.items);
assert.match(collapsed,/Show all 80 ordered items/);
assert.match(collapsed,/Item 080/);
assert.equal(ctx.sellerOrderTotalUnits(many.items),3240);

// Never invent prices or mix photo sources; HTML-escape untrusted product names.
const unknown={...base,items:[{product_name:"<script>alert(1)</script>",quantity:1,unit_price:null,line_total:null,image_url:"https://evil.example/photo.jpg"}],subtotal:null,total:null};
const unpriced=ctx.sellerOrderPrintHtml(unknown);
assert.doesNotMatch(unpriced,/<script>alert/);
assert.match(unpriced,/&lt;script&gt;/);
assert.match(unpriced,/Pending quote/);
assert.doesNotMatch(unpriced,/evil\.example/);
assert.match(unpriced,/Image unavailable/);
assert.match(ctx.sellerOrderPrintHtml({...base,payment_status:"paid"}),/Payment recorded/);
assert.match(ctx.sellerOrderPrintHtml({...base,subtotal:301}),/recorded order subtotal differs/);
console.log("PASS seller multi-item receipts: store grouping, snapshots, 80 items, totals, missing values, image restrictions, payment disclosure and escaping");
