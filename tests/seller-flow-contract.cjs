const fs=require("node:fs");
const path=require("node:path");
const assert=require("node:assert/strict");
const root=path.resolve(__dirname,"..");
const read=p=>fs.readFileSync(path.join(root,p),"utf8");
const has=(src,needle,label)=>assert.ok(src.includes(needle),label+" missing: "+needle);

const sellerStartHtml=read("rpe-v2/seller-start.html");
const sellerStartJs=read("rpe-v2/seller-start.js");
const sellerCenter=read("all/seller-center.html");
const buyerApp=read("rpe-v2/app.js");
const adminApp=read("rpe-v2/admin.js");
const sellerStoreFn=read("rpe-v2/supabase/functions/ranova-seller-store/index.ts");

has(sellerStartHtml,'placeholder="Town, City e.g. Adum, Kumasi"',"Town/City registration guidance");
has(sellerStartJs,"Enter your business location as Town, City. Example: Adum, Kumasi.","Town/City validation");
has(sellerStartJs,"continueSeller(pending.ref,true)","new seller document-onboarding route");

for(const type of ["business_registration","identity_document","fulfilment_evidence"]){
  has(sellerCenter,type,"required seller document "+type);
}
has(sellerCenter,"Please fill this part","missing-document guidance");
has(sellerCenter,'id="documentSubmitSuccess"',"post-submit success interface");
has(sellerCenter,'id="sellerStatusOverview"',"status-aware Seller Center");
has(sellerCenter,"DO YOU WANT TO UPDATE ANY DOCUMENT?","approved seller document-update state");
has(sellerCenter,"Your documents are now under review","pending Admin-review screen");
has(sellerCenter,'id="checkSellerReviewStatus"',"pending seller review-status action");
has(sellerCenter,"Your Store Has Been Approved","approved-store screen");
has(sellerCenter,"ACCESS RANOVA SELLER CENTER","approved Seller Center access");
has(sellerCenter,"OPEN RANOVA SELLER DASHBOARD","approved Seller Center dashboard CTA");
assert.ok(!sellerCenter.includes('["business_registration","identity_document","location_proof","fulfilment_evidence"].every'),"Optional location proof must not block approved seller access");


has(buyerApp,'class="home-store-location">⌖ ',"buyer Me recommendation product location");
has(buyerApp,'class="market-product-location">⌖ ',"marketplace product location");
has(buyerApp,"storeLocationLabel(store)","store location source");

has(adminApp,"sellerRequiredDocSummary","Admin required-document summary");
has(adminApp,"business_location","Admin seller business location");
has(adminApp,"Required documents","Admin document completeness label");

has(sellerStoreFn,'clean(seller.application.business_location,180)||clean(existing?.business_location,180)||clean(b.business_location,180)',"registered business location authority");

console.log("PASS seller-flow contract: registration → documents → review → approval → marketplace location");

// Seller account isolation: each authenticated seller must work only in its own store/application.
const sellerStoreFnIsolation=read("rpe-v2/supabase/functions/ranova-seller-store/index.ts");
has(sellerStoreFnIsolation,'seller_id:"eq."+userId,application_ref:"eq."+seller.application_ref',"seller dashboard store lookup is account/application scoped");
has(sellerStoreFnIsolation,'seller_id:"eq."+user.id,application_ref:"eq."+seller.application_ref',"seller store writes are account/application scoped");
const sellerCenterIsolation=read("all/seller-center.html");
assert.ok(!sellerCenterIsolation.includes('savedPhone=sessionStorage.getItem("ranovaSellerApplicationPhone")'),"seller account isolation: Seller Center must not inherit a previous seller phone from browser session");
