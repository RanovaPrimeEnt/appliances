import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const ALLOWED_ORIGIN="https://ranovaprimeent.github.io";

const admin=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});

function headers(origin:string|null){
  const allow=origin===ALLOWED_ORIGIN||origin?.startsWith("http://localhost")?origin:ALLOWED_ORIGIN;
  return {
    "Content-Type":"application/json",
    "Access-Control-Allow-Origin":allow||ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers":"content-type,x-ranova-client,authorization,apikey",
    "Access-Control-Allow-Methods":"POST,OPTIONS"
  };
}
function clean(v:any,max=1200){return String(v??"").trim().slice(0,max)}
function response(h:Record<string,string>,status:number,payload:any){
  return new Response(JSON.stringify(payload),{status,headers:h});
}
async function getAdmin(req:Request){
  const auth=req.headers.get("authorization")||"";
  if(!auth.startsWith("Bearer "))return null;
  const token=auth.slice(7);
  const {data:{user},error}=await admin.auth.getUser(token);
  if(error||!user)return null;
  const {data:row}=await admin.from("admin_users").select("role").eq("user_id",user.id).maybeSingle();
  if(!row)return null;
  return {user,role:row.role};
}
function canSellerReview(role:string){return role==="owner"||role==="manager"}
function canProductReview(role:string){return role==="owner"||role==="manager"||role==="catalogue"}
function canOrderReview(role:string){return role==="owner"||role==="manager"||role==="orders"}
function canFinance(role:string){return role==="owner"||role==="manager"}
function isOwner(role:string){return role==="owner"}
async function log(adminUserId:string,action:string,entityType:string,entityId:string|null,metadata:any={}){
  await admin.from("admin_activity").insert({
    admin_user_id:adminUserId,action,entity_type:entityType,entity_id:entityId,metadata
  });
}
async function emailForUser(userId:string){
  const {data:{user}}=await admin.auth.admin.getUserById(userId);
  return user?.email||null;
}
async function queueNotice(recipient_type:string,recipient_user_id:string|null,recipient_email:string|null,customer_order_id:string|null,seller_order_id:string|null,notification_type:string,title:string,message:string,metadata:any={},action_url:string|null=null,dedupe_key:string|null=null){
  let emailRequested=!!recipient_email;
  if(recipient_type==="buyer"&&recipient_user_id){
    const {data:pref}=await admin.from("ranova_buyer_preferences").select("email_order_updates").eq("user_id",recipient_user_id).maybeSingle();
    if(pref?.email_order_updates===false)emailRequested=false;
  }
  const payload:any={
    recipient_type,recipient_user_id,recipient_email,customer_order_id,seller_order_id,
    notification_type,notification_category:"transactional",title,message,metadata,
    in_app_visible:true,email_requested:emailRequested,email_status:emailRequested?"queued":"not_requested",
    action_url
  };
  if(dedupe_key)payload.dedupe_key=dedupe_key;
  const q=await admin.from("ranova_marketplace_notifications").insert(payload);
  if(q.error&&!(dedupe_key&&String(q.error.code||"")==="23505"))throw q.error;
}
async function notifyBuyer(order:any,type:string,title:string,message:string,metadata:any={}){
  await queueNotice("buyer",order.buyer_user_id||null,order.customer_email||null,order.id,null,type,title,message,metadata,
    order.order_ref?"/appliances/all/order-status.html?ref="+encodeURIComponent(order.order_ref):null,
    order.id?type+":"+order.id:null);
}
async function notifyOrderSellers(order:any,type:string,title:string,message:string,metadata:any={}){
  const {data:children}=await admin.from("ranova_seller_orders").select("id,seller_id").eq("parent_order_id",order.id);
  for(const child of children||[]){
    const email=await emailForUser(child.seller_id);
    await queueNotice("seller",child.seller_id,email,order.id,child.id,type,title,message,metadata,
      "/appliances/all/seller-dashboard.html",type+":"+child.id);
  }
}

async function sellerApproved(userId:string){
  const {data:acc}=await admin.from("ranova_seller_accounts").select("application_ref").eq("user_id",userId).maybeSingle();
  if(!acc)return false;
  const {data:app}=await admin.from("ranova_seller_applications").select("verification_status,status").eq("application_ref",acc.application_ref).maybeSingle();
  return String(app?.verification_status||app?.status||"").toLowerCase()==="approved";
}
function accepted(v:any){
  return ["approved","complete","verified"].includes(String(v||"").toLowerCase());
}
async function dashboard(role:string){
  const out:any={ok:true,role,applications:[],files:[],stores:[],products:[],seller_orders:[],marketplace_orders:[],finance_settings:null,payment_accounts:[],payouts:[],payments:[],country_rules:[],refunds:[],disputes:[],dispute_messages:[],deliveries:[],delivery_proofs:[],delivery_events:[],reviews:[],trust_metrics:[],performance:[],enforcement:[],enforcement_events:[],appeals:[],sponsored_placements:[],inventory_settings:null,inventory_reservations:[],inventory_events:[],counts:{}};
  if(canSellerReview(role)){
    const [{data:apps},{data:files},{data:accounts}]=await Promise.all([
      admin.from("ranova_seller_applications")
        .select("application_ref,business_name,contact_person,phone,email,business_location,supplier_type,categories,business_details,years_in_business,sales_channels,has_business_registration,registration_number,preferred_fulfilment,status,verification_status,business_info_status,business_documents_status,identity_status,fulfilment_status,store_setup_status,verification_notes,created_at,updated_at,reviewed_at,reviewed_by")
        .order("created_at",{ascending:false}).limit(250),
      admin.from("ranova_seller_verification_files")
        .select("id,seller_id,application_ref,document_type,original_filename,review_status,review_note,created_at,reviewed_at,reviewed_by")
        .order("created_at",{ascending:false}).limit(1000),
      admin.from("ranova_seller_accounts").select("user_id,application_ref,created_at")
    ]);
    const accountMap=new Map((accounts||[]).map((x:any)=>[x.application_ref,x]));
    out.applications=(apps||[]).map((a:any)=>({...a,linked_user_id:accountMap.get(a.application_ref)?.user_id||null}));
    out.files=files||[];
    const [{data:reviews},{data:trustMetrics},{data:performance},{data:enforcement},{data:enforcementEvents},{data:appeals},{data:sponsoredPlacements}]=await Promise.all([
      admin.from("ranova_marketplace_reviews")
        .select("id,review_ref,customer_order_id,seller_order_id,store_id,seller_id,buyer_display_name,overall_rating,product_rating,service_rating,delivery_rating,review_title,review_text,recommend,verified_purchase,moderation_status,moderation_flags,moderation_note,submitted_at,published_at,moderated_at,moderated_by,seller_response,seller_responded_at")
        .order("submitted_at",{ascending:false}).limit(1000),
      admin.from("ranova_seller_trust_metrics")
        .select("*").order("updated_at",{ascending:false}).limit(500),
      admin.from("ranova_seller_performance").select("*").order("calculated_at",{ascending:false}).limit(500),
      admin.from("ranova_seller_enforcement").select("*").order("updated_at",{ascending:false}).limit(500),
      admin.from("ranova_seller_enforcement_events").select("*").order("created_at",{ascending:false}).limit(1000),
      admin.from("ranova_seller_appeals").select("*").order("submitted_at",{ascending:false}).limit(500),
      admin.from("ranova_marketplace_sponsored_placements").select("*").order("created_at",{ascending:false}).limit(500)
    ]);
    out.reviews=reviews||[];
    out.trust_metrics=trustMetrics||[];
    out.performance=performance||[];
    out.enforcement=enforcement||[];
    out.enforcement_events=enforcementEvents||[];
    out.appeals=appeals||[];
    out.sponsored_placements=sponsoredPlacements||[];
  }

  if(canOrderReview(role)){
    const {data:sellerOrders}=await admin.from("ranova_seller_orders")
      .select("id,order_ref,platform_order_ref,parent_order_id,seller_id,store_id,buyer_name,buyer_phone,buyer_email,delivery_location,payment_method,items,item_count,subtotal,delivery_fee,total,currency,payment_status,order_status,buyer_note,seller_note,created_at,updated_at")
      .order("created_at",{ascending:false}).limit(500);
    out.seller_orders=sellerOrders||[];
    const [{data:deliveries},{data:proofs},{data:events}]=await Promise.all([
      admin.from("ranova_order_deliveries")
        .select("*").order("updated_at",{ascending:false}).limit(500),
      admin.from("ranova_delivery_proofs")
        .select("id,delivery_id,seller_order_id,proof_type,storage_path,recipient_name,note,uploaded_by_type,uploaded_by_user_id,captured_at,review_status,review_note,reviewed_at,reviewed_by,created_at")
        .order("created_at",{ascending:false}).limit(1000),
      admin.from("ranova_delivery_events")
        .select("id,delivery_id,seller_order_id,status,actor_type,actor_user_id,note,location_text,metadata,occurred_at")
        .order("occurred_at",{ascending:false}).limit(2000)
    ]);
    out.deliveries=deliveries||[];
    out.delivery_proofs=proofs||[];
    out.delivery_events=events||[];
  }

  if(canSellerReview(role)||canProductReview(role)){
    const [{data:stores},{data:products}]=await Promise.all([
      admin.from("ranova_seller_stores")
        .select("id,seller_id,application_ref,store_name,slug,tagline,description,logo_url,banner_url,public_phone,public_email,business_location,country_code,country_name,store_status,moderation_note,created_at,updated_at,moderated_at,moderated_by")
        .order("created_at",{ascending:false}).limit(300),
      canProductReview(role)
        ? admin.from("ranova_seller_products")
            .select("id,seller_id,store_id,name,slug,sku,category,short_description,description,price,currency,moq,stock_quantity,stock_status,unit_label,primary_image_url,image_urls,product_status,moderation_note,created_at,updated_at,moderated_at,moderated_by")
            .order("created_at",{ascending:false}).limit(1000)
        : Promise.resolve({data:[] as any[]})
    ]);
    out.stores=stores||[];
    out.products=products||[];
  }

  if(canFinance(role)){
    const [{data:settings},{data:accounts},{data:payouts},{data:payments},{data:marketplaceOrders},{data:countryRules}]=await Promise.all([
      admin.from("ranova_marketplace_finance_settings").select("*").eq("id",1).maybeSingle(),
      admin.from("ranova_marketplace_payment_accounts").select("*").order("created_at",{ascending:false}),
      admin.from("ranova_seller_payouts").select("*").order("created_at",{ascending:false}).limit(500),
      admin.from("ranova_marketplace_payments").select("*").order("created_at",{ascending:false}).limit(500),
      admin.from("ranova_customer_orders")
        .select("id,order_ref,customer_name,customer_phone,customer_email,delivery_location,buyer_country_code,buyer_country_name,payment_method,product_total,delivery_fee,total_payment,payment_processing_rate,payment_processing_fee,payment_fee_payer,status,payment_status,order_source,seller_order_count,created_at")
        .neq("order_source","ranova_catalogue")
        .order("created_at",{ascending:false})
        .limit(500),
      admin.from("ranova_marketplace_country_rules")
        .select("*").order("effective_from",{ascending:false}).limit(500)
    ]);
    out.finance_settings=settings||{id:1,default_commission_rate:0,payout_hold_days:0,currency:"GHS"};
    out.payment_accounts=accounts||[];
    out.payouts=payouts||[];
    out.payments=payments||[];
    out.marketplace_orders=marketplaceOrders||[];
    out.country_rules=countryRules||[];
  }


  if(canOrderReview(role)||canFinance(role)){
    const [{data:inventorySettings},{data:inventoryReservations},{data:inventoryEvents}]=await Promise.all([
      admin.from("ranova_inventory_settings").select("*").eq("id",1).maybeSingle(),
      admin.from("ranova_inventory_reservations").select("*").order("reserved_at",{ascending:false}).limit(1000),
      admin.from("ranova_inventory_events").select("*").order("created_at",{ascending:false}).limit(2000)
    ]);
    out.inventory_settings=inventorySettings||{id:1,reservation_minutes:120,expire_unpaid_orders:true};
    out.inventory_reservations=inventoryReservations||[];
    out.inventory_events=inventoryEvents||[];
    const [{data:refunds},{data:disputes}]=await Promise.all([
      admin.from("ranova_marketplace_refunds").select("*").order("requested_at",{ascending:false}).limit(500),
      admin.from("ranova_marketplace_disputes").select("*").order("opened_at",{ascending:false}).limit(500)
    ]);
    out.refunds=refunds||[];
    out.disputes=disputes||[];
    const ids=out.disputes.map((d:any)=>d.id);
    if(ids.length){
      const {data:messages}=await admin.from("ranova_marketplace_dispute_messages")
        .select("id,dispute_id,sender_type,sender_user_id,message,created_at")
        .in("dispute_id",ids).order("created_at",{ascending:true}).limit(2000);
      out.dispute_messages=messages||[];
    }
  }

  out.counts={
    seller_applications:out.applications.length,
    seller_pending:out.applications.filter((a:any)=>!["approved","rejected","suspended"].includes(String(a.verification_status||a.status||"").toLowerCase())).length,
    seller_approved:out.applications.filter((a:any)=>String(a.verification_status||a.status||"").toLowerCase()==="approved").length,
    documents_pending:out.files.filter((f:any)=>["submitted","under_review"].includes(String(f.review_status||"").toLowerCase())).length,
    products_pending:out.products.filter((p:any)=>p.product_status==="pending_review").length,
    active_seller_products:out.products.filter((p:any)=>p.product_status==="active").length,
    active_stores:out.stores.filter((s:any)=>s.store_status==="active").length,
    seller_orders:out.seller_orders.length,
    seller_orders_open:out.seller_orders.filter((o:any)=>!["delivered","cancelled","returned"].includes(o.order_status)).length,
    payouts_pending:out.payouts.filter((p:any)=>["pending","eligible","held","processing"].includes(p.payout_status)).length,
    payouts_paid_total:out.payouts.filter((p:any)=>p.payout_status==="paid").reduce((s:number,p:any)=>s+Number(p.payout_amount||0),0),
    commission_total:out.payouts.reduce((s:number,p:any)=>s+Number(p.commission_amount||0),0),
    payments_due:out.marketplace_orders.filter((o:any)=>o.status==="awaiting_payment"&&!["paid","confirmed","refunded"].includes(String(o.payment_status||"").toLowerCase())).length,
    refunds_open:out.refunds.filter((r:any)=>!["refunded","rejected","cancelled"].includes(r.status)).length,
    disputes_open:out.disputes.filter((d:any)=>!["resolved","closed"].includes(d.status)).length,
    deliveries_active:out.deliveries.filter((d:any)=>!["delivered_confirmed","returned","cancelled"].includes(d.delivery_status)).length,
    deliveries_waiting_confirmation:out.deliveries.filter((d:any)=>d.delivery_status==="delivered_pending_confirmation").length,
    reviews_pending:out.reviews.filter((r:any)=>r.moderation_status==="pending").length,
    reviews_published:out.reviews.filter((r:any)=>r.moderation_status==="published").length,
    reviews_hidden:out.reviews.filter((r:any)=>r.moderation_status==="hidden").length,
    seller_watchlist:out.performance.filter((p:any)=>p.performance_level==="watchlist").length,
    seller_trusted:out.performance.filter((p:any)=>p.trusted_badge===true).length,
    seller_restricted:out.enforcement.filter((e:any)=>e.enforcement_status==="restricted").length,
    seller_suspended:out.enforcement.filter((e:any)=>e.enforcement_status==="suspended").length,
    appeals_open:out.appeals.filter((x:any)=>["submitted","under_review"].includes(x.status)).length,
    sponsored_active:out.sponsored_placements.filter((x:any)=>x.status==="active"&&new Date(x.starts_at).getTime()<=Date.now()&&new Date(x.ends_at).getTime()>Date.now()).length,
    inventory_holds:out.inventory_reservations.filter((x:any)=>x.status==="held"&&(!x.expires_at||new Date(x.expires_at).getTime()>Date.now())).length,
    inventory_expiring_soon:out.inventory_reservations.filter((x:any)=>x.status==="held"&&x.expires_at&&new Date(x.expires_at).getTime()>Date.now()&&new Date(x.expires_at).getTime()<=Date.now()+30*60*1000).length,
    inventory_committed:out.inventory_reservations.filter((x:any)=>x.status==="committed").length,
    inventory_restored:out.inventory_reservations.filter((x:any)=>x.status==="restored").length
  };
  return out;
}

Deno.serve(async(req:Request)=>{
  const h=headers(req.headers.get("origin"));
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:h});
  if(req.method!=="POST")return response(h,405,{ok:false,error:"Method not allowed"});
  if(req.headers.get("x-ranova-client")!=="ranova-site-v1")return response(h,403,{ok:false,error:"Invalid client"});

  const actor=await getAdmin(req);
  if(!actor)return response(h,403,{ok:false,error:"Authorized RANOVA admin access is required."});

  let b:any={};
  try{b=await req.json()}catch{}
  const action=clean(b.action,60)||"dashboard";

  try{
    if(action==="dashboard")return response(h,200,await dashboard(actor.role));

    if(action==="save_inventory_settings"){
      if(!isOwner(actor.role))return response(h,403,{ok:false,error:"Only the Owner can change inventory reservation settings."});
      const minutes=Math.trunc(Number(b.reservation_minutes));
      if(!Number.isFinite(minutes)||minutes<15||minutes>1440)return response(h,400,{ok:false,error:"Reservation duration must be between 15 minutes and 24 hours."});
      const {error}=await admin.from("ranova_inventory_settings").upsert({id:1,reservation_minutes:minutes,expire_unpaid_orders:true,updated_at:new Date().toISOString(),updated_by:actor.user.id});
      if(error)throw error;
      await log(actor.user.id,"inventory_settings_updated","inventory_settings","1",{reservation_minutes:minutes,expire_unpaid_orders:true});
      return response(h,200,{ok:true,reservation_minutes:minutes,expire_unpaid_orders:true});
    }

    if(action==="run_inventory_expiry"){
      if(!canOrderReview(actor.role)&&!canFinance(actor.role))return response(h,403,{ok:false,error:"Order or finance permission is required."});
      const {data,error}=await admin.rpc("ranova_expire_inventory_reservations");
      if(error)throw error;
      const expiredCount=Number(data||0);
      await log(actor.user.id,"inventory_expiry_run","inventory_reservations",null,{expired_count:expiredCount});
      return response(h,200,{ok:true,expired_count:expiredCount});
    }

    if(action==="document_url"){
      if(!canSellerReview(actor.role))return response(h,403,{ok:false,error:"Seller-review permission is required."});
      const id=clean(b.id,80);
      const {data:file}=await admin.from("ranova_seller_verification_files").select("id,storage_path,original_filename").eq("id",id).maybeSingle();
      if(!file)return response(h,404,{ok:false,error:"Verification document not found."});
      const {data:signed,error}=await admin.storage.from("seller-verification").createSignedUrl(file.storage_path,600);
      if(error||!signed?.signedUrl)return response(h,500,{ok:false,error:"Could not create a secure document link."});
      await log(actor.user.id,"seller_document_viewed","seller_verification_file",id,{original_filename:file.original_filename});
      return response(h,200,{ok:true,url:signed.signedUrl,expires_in:600,filename:file.original_filename});
    }

    if(action==="review_document"){
      if(!canSellerReview(actor.role))return response(h,403,{ok:false,error:"Seller-review permission is required."});
      const id=clean(b.id,80),status=clean(b.status,40),note=clean(b.note,1200);
      if(!["approved","rejected","needs_information","under_review"].includes(status))return response(h,400,{ok:false,error:"Invalid document review status."});
      const {data:file}=await admin.from("ranova_seller_verification_files").select("id,application_ref,document_type").eq("id",id).maybeSingle();
      if(!file)return response(h,404,{ok:false,error:"Verification document not found."});
      const now=new Date().toISOString();
      const {error}=await admin.from("ranova_seller_verification_files").update({
        review_status:status,review_note:note||null,reviewed_at:now,reviewed_by:actor.user.id
      }).eq("id",id);
      if(error)throw error;

      const stageMap:any={business_registration:"business_documents_status",identity_document:"identity_status",fulfilment_evidence:"fulfilment_status"};
      const field=stageMap[file.document_type];
      if(field){
        const stageStatus=status==="rejected"?"needs_information":status;
        const appPatch:any={
          [field]:stageStatus,
          verification_status:stageStatus==="needs_information"?"needs_information":"in_progress",
          updated_at:now
        };
        if(note)appPatch.verification_notes=note;
        await admin.from("ranova_seller_applications").update(appPatch).eq("application_ref",file.application_ref);
      }
      await log(actor.user.id,"seller_document_reviewed","seller_verification_file",id,{status,note,application_ref:file.application_ref,document_type:file.document_type});
      return response(h,200,{ok:true});
    }

    if(action==="set_seller_stage"){
      if(!canSellerReview(actor.role))return response(h,403,{ok:false,error:"Seller-review permission is required."});
      const ref=clean(b.application_ref,80).toUpperCase(),stage=clean(b.stage,60),status=clean(b.status,40),note=clean(b.note,1200);
      const allowedStages=["business_info_status","business_documents_status","identity_status","fulfilment_status"];
      const allowedStatuses=["not_started","in_progress","under_review","needs_information","approved","rejected","complete","verified"];
      if(!allowedStages.includes(stage)||!allowedStatuses.includes(status))return response(h,400,{ok:false,error:"Invalid verification stage update."});
      const patch:any={[stage]:status,updated_at:new Date().toISOString()};
      if(note)patch.verification_notes=note;
      if(status==="needs_information"||status==="rejected")patch.verification_status="needs_information";
      else patch.verification_status="in_progress";
      const {error}=await admin.from("ranova_seller_applications").update(patch).eq("application_ref",ref);
      if(error)throw error;
      await log(actor.user.id,"seller_stage_updated","seller_application",ref,{stage,status,note});
      return response(h,200,{ok:true});
    }

    if(action==="review_seller"){
      if(!canSellerReview(actor.role))return response(h,403,{ok:false,error:"Seller-review permission is required."});
      const ref=clean(b.application_ref,80).toUpperCase(),decision=clean(b.decision,40),note=clean(b.note,1600);
      if(!["approved","rejected","needs_information","under_review","suspended"].includes(decision))return response(h,400,{ok:false,error:"Invalid seller decision."});
      const {data:app}=await admin.from("ranova_seller_applications").select("*").eq("application_ref",ref).maybeSingle();
      if(!app)return response(h,404,{ok:false,error:"Seller application not found."});
      if(decision==="approved"){
        if(!accepted(app.business_info_status)||!accepted(app.business_documents_status)||!accepted(app.identity_status)||!accepted(app.fulfilment_status)){
          return response(h,400,{ok:false,error:"Approve the business information, documents, identity and fulfilment stages before approving this seller."});
        }
      }
      if(["rejected","needs_information","suspended"].includes(decision)&&!note){
        return response(h,400,{ok:false,error:"Add a review note explaining this decision."});
      }
      const now=new Date().toISOString();
      let status=decision;
      let storeSetup=app.store_setup_status;
      if(decision==="needs_information")status="under_review";
      if(decision==="approved"&&String(storeSetup||"").toLowerCase()==="locked")storeSetup="in_progress";
      if(["rejected","suspended"].includes(decision))storeSetup="locked";
      const sellerNote=decision==="approved"
        ? (note||"Seller verification approved. Store Builder is now available.")
        : (note||app.verification_notes||null);
      const {error}=await admin.from("ranova_seller_applications").update({
        status,
        verification_status:decision,
        store_setup_status:storeSetup,
        verification_notes:sellerNote,
        reviewed_at:now,
        reviewed_by:actor.user.id,
        updated_at:now
      }).eq("application_ref",ref);
      if(error)throw error;

      if(["rejected","suspended"].includes(decision)){
        await admin.from("ranova_seller_stores").update({
          store_status:"suspended",
          moderation_note:note,
          moderated_at:now,
          moderated_by:actor.user.id,
          updated_at:now
        }).eq("application_ref",ref);
      }
      await log(actor.user.id,"seller_reviewed","seller_application",ref,{decision,note});
      return response(h,200,{ok:true});
    }

    if(action==="review_product"){
      if(!canProductReview(actor.role))return response(h,403,{ok:false,error:"Catalogue moderation permission is required."});
      const id=clean(b.id,80),decision=clean(b.decision,30),note=clean(b.note,1200);
      if(!["approved","rejected","paused"].includes(decision))return response(h,400,{ok:false,error:"Invalid product decision."});
      const {data:p}=await admin.from("ranova_seller_products").select("*").eq("id",id).maybeSingle();
      if(!p)return response(h,404,{ok:false,error:"Seller product not found."});
      if(decision==="approved"){
        if(!(await sellerApproved(p.seller_id)))return response(h,400,{ok:false,error:"This seller is not currently approved."});
        if(!p.primary_image_url||!p.description)return response(h,400,{ok:false,error:"The product needs a main image and full description before approval."});
      }
      if(decision==="rejected"&&!note)return response(h,400,{ok:false,error:"Add a moderation note explaining why the product was rejected."});
      const next=decision==="approved"?"active":decision==="rejected"?"rejected":"paused";
      const now=new Date().toISOString();
      const {error}=await admin.from("ranova_seller_products").update({
        product_status:next,
        moderation_note:note||null,
        moderated_at:now,
        moderated_by:actor.user.id,
        updated_at:now
      }).eq("id",id);
      if(error)throw error;
      await log(actor.user.id,"seller_product_moderated","seller_product",id,{decision,next_status:next,note,name:p.name,seller_id:p.seller_id});
      return response(h,200,{ok:true});
    }

    if(action==="set_store_status"){
      if(!canSellerReview(actor.role))return response(h,403,{ok:false,error:"Seller-review permission is required."});
      const id=clean(b.id,80),status=clean(b.status,30),note=clean(b.note,1200);
      if(!["active","paused","suspended"].includes(status))return response(h,400,{ok:false,error:"Invalid store status."});
      const {data:store}=await admin.from("ranova_seller_stores").select("*").eq("id",id).maybeSingle();
      if(!store)return response(h,404,{ok:false,error:"Seller store not found."});
      if(status==="active"&&!(await sellerApproved(store.seller_id)))return response(h,400,{ok:false,error:"The seller must be approved before the store can be activated."});
      if(status==="suspended"&&!note)return response(h,400,{ok:false,error:"Add a reason before suspending a store."});
      const now=new Date().toISOString();
      const {error}=await admin.from("ranova_seller_stores").update({
        store_status:status,
        moderation_note:note||null,
        moderated_at:now,
        moderated_by:actor.user.id,
        updated_at:now
      }).eq("id",id);
      if(error)throw error;
      await log(actor.user.id,"seller_store_status_changed","seller_store",id,{status,note,store_name:store.store_name});
      return response(h,200,{ok:true});
    }


    if(action==="save_finance_settings"){
      if(!isOwner(actor.role))return response(h,403,{ok:false,error:"Only the Owner can change marketplace finance settings."});
      const rate=Number(b.default_commission_rate);
      const hold=Math.trunc(Number(b.payout_hold_days||0));
      const reason=clean(b.change_reason,700)||"Fallback commission updated in Finance settings";
      if(!Number.isFinite(rate)||rate<0||rate>100)return response(h,400,{ok:false,error:"Fallback commission must be between 0 and 100."});
      if(!Number.isFinite(hold)||hold<0||hold>90)return response(h,400,{ok:false,error:"Payout hold days must be between 0 and 90."});
      const now=new Date().toISOString();

      const {data:globalRule,error:globalErr}=await admin.from("ranova_marketplace_country_rules")
        .select("*")
        .is("store_id",null).is("seller_country_code",null).is("buyer_country_code",null).is("payment_method",null)
        .eq("active",true).is("effective_to",null).maybeSingle();
      if(globalErr)throw globalErr;

      if(globalRule&&Number(globalRule.commission_rate||0)!==Number(rate.toFixed(2))){
        const nextPayload:any={
          ...globalRule,
          id:undefined,
          commission_rate:Number(rate.toFixed(2)),
          active:false,
          rule_version:Number(globalRule.rule_version||1)+1,
          supersedes_rule_id:globalRule.id,
          effective_from:now,
          effective_to:null,
          change_reason:reason,
          created_at:undefined,
          updated_at:now,
          updated_by:actor.user.id
        };
        delete nextPayload.id;delete nextPayload.created_at;
        const {data:newRule,error:insertErr}=await admin.from("ranova_marketplace_country_rules").insert(nextPayload).select("*").single();
        if(insertErr)throw insertErr;
        const {error:archiveErr}=await admin.from("ranova_marketplace_country_rules").update({
          active:false,effective_to:now,updated_at:now,updated_by:actor.user.id
        }).eq("id",globalRule.id);
        if(archiveErr){
          await admin.from("ranova_marketplace_country_rules").delete().eq("id",newRule.id);
          throw archiveErr;
        }
        const {error:activateErr}=await admin.from("ranova_marketplace_country_rules").update({
          active:true,updated_at:now,updated_by:actor.user.id
        }).eq("id",newRule.id);
        if(activateErr){
          await admin.from("ranova_marketplace_country_rules").update({active:true,effective_to:null}).eq("id",globalRule.id);
          await admin.from("ranova_marketplace_country_rules").delete().eq("id",newRule.id);
          throw activateErr;
        }
        await log(actor.user.id,"fallback_commission_versioned","marketplace_country_rule",newRule.id,{
          supersedes_rule_id:globalRule.id,old_rate:globalRule.commission_rate,new_rate:Number(rate.toFixed(2)),reason
        });
      }

      const {error}=await admin.from("ranova_marketplace_finance_settings").upsert({
        id:1,
        default_commission_rate:Number(rate.toFixed(2)),
        payout_hold_days:hold,
        currency:"GHS",
        updated_at:now,
        updated_by:actor.user.id
      });
      if(error)throw error;
      await log(actor.user.id,"finance_settings_updated","marketplace_finance_settings","1",{default_commission_rate:Number(rate.toFixed(2)),payout_hold_days:hold,reason});
      return response(h,200,{ok:true});
    }

    if(action==="save_payment_account"){
      if(!isOwner(actor.role))return response(h,403,{ok:false,error:"Only the Owner can change customer payment destinations."});
      const id=clean(b.id,80);
      const payment_method=clean(b.payment_method,40);
      const provider_name=clean(b.provider_name,120);
      const account_name=clean(b.account_name,160);
      const account_reference=clean(b.account_reference,160);
      const instructions=clean(b.instructions,800);
      if(!["Mobile Money","Bank Transfer"].includes(payment_method)||!provider_name||!account_name||!account_reference){
        return response(h,400,{ok:false,error:"Complete the payment method, provider, account name and account reference."});
      }
      const payload:any={
        payment_method,provider_name,account_name,account_reference,
        instructions:instructions||null,
        active:b.active!==false,
        updated_at:new Date().toISOString(),
        updated_by:actor.user.id
      };
      let q;
      if(id){
        q=await admin.from("ranova_marketplace_payment_accounts").update(payload).eq("id",id).select("*").maybeSingle();
      }else{
        q=await admin.from("ranova_marketplace_payment_accounts").insert(payload).select("*").single();
      }
      if(q.error)throw q.error;
      await log(actor.user.id,"payment_account_saved","marketplace_payment_account",q.data?.id||id,{payment_method,provider_name,active:payload.active});
      return response(h,200,{ok:true,account:q.data});
    }

    if(action==="set_payment_account_active"){
      if(!isOwner(actor.role))return response(h,403,{ok:false,error:"Only the Owner can change customer payment destinations."});
      const id=clean(b.id,80);
      const active=!!b.active;
      const {error}=await admin.from("ranova_marketplace_payment_accounts").update({
        active,updated_at:new Date().toISOString(),updated_by:actor.user.id
      }).eq("id",id);
      if(error)throw error;
      await log(actor.user.id,"payment_account_status_changed","marketplace_payment_account",id,{active});
      return response(h,200,{ok:true});
    }

    if(action==="set_payment_status"){
      if(!canFinance(actor.role))return response(h,403,{ok:false,error:"Finance permission is required."});
      const parentId=clean(b.parent_order_id,80);
      const status=clean(b.status,40);
      const payer_reference=clean(b.payer_reference,180);
      const note=clean(b.note,1000);
      if(!["pending","confirmed","failed","refunded","partially_refunded"].includes(status))return response(h,400,{ok:false,error:"Invalid payment status."});
      const {data:order}=await admin.from("ranova_customer_orders").select("*").eq("id",parentId).maybeSingle();
      if(!order)return response(h,404,{ok:false,error:"Marketplace order not found."});
      if(status==="confirmed"&&order.total_payment===null)return response(h,400,{ok:false,error:"The final order total must be set before confirming payment."});
      if(status==="confirmed"&&["expired","released"].includes(String(order.inventory_status||""))){
        return response(h,409,{ok:false,error:"The stock reservation for this order is no longer valid. The buyer must place a new order so current stock is checked again before payment is confirmed."});
      }
      const now=new Date().toISOString();
      if(status==="confirmed"&&order.inventory_status==="held"){
        const {error:inventoryErr}=await admin.rpc("ranova_commit_order_inventory",{p_order_ref:order.order_ref});
        if(inventoryErr)return response(h,409,{ok:false,error:inventoryErr.message||"Inventory reservation could not be committed. Recheck stock before confirming payment."});
      }
      const ledgerStatus=status==="confirmed"?"confirmed":status;
      const {error:payErr}=await admin.from("ranova_marketplace_payments").upsert({
        parent_order_id:order.id,
        order_ref:order.order_ref,
        amount:order.total_payment,
        currency:"GHS",
        payment_method:order.payment_method,
        payment_status:ledgerStatus,
        payer_reference:payer_reference||null,
        admin_note:note||null,
        confirmed_at:status==="confirmed"?now:null,
        confirmed_by:status==="confirmed"?actor.user.id:null,
        updated_at:now
      },{onConflict:"parent_order_id"});
      if(payErr)throw payErr;

      const customerStatus=status==="confirmed"?"paid":status==="pending"?"pending":status;
      const {error:masterErr}=await admin.from("ranova_customer_orders").update({payment_status:customerStatus}).eq("id",order.id);
      if(masterErr)throw masterErr;

      const childStatus=status==="confirmed"?"paid":status==="pending"?"pending":status==="partially_refunded"?"refunded":status;
      const {data:children,error:childErr}=await admin.from("ranova_seller_orders")
        .update({payment_status:childStatus,updated_at:now})
        .eq("parent_order_id",order.id)
        .select("*");
      if(childErr)throw childErr;

      if(status==="confirmed"){
        const {data:settings}=await admin.from("ranova_marketplace_finance_settings").select("*").eq("id",1).maybeSingle();
        const defaultRate=Number(settings?.default_commission_rate||0);
        const holdDays=Math.max(0,Math.trunc(Number(settings?.payout_hold_days||0)));
        const eligibleAt=new Date(Date.now()+holdDays*86400000).toISOString();
        for(const child of children||[]){
          if(child.subtotal===null)continue;
          const {data:profile}=await admin.from("ranova_seller_finance_profiles")
            .select("commission_rate_override").eq("seller_id",child.seller_id).maybeSingle();
          const snapshotRate=child.commission_rate_snapshot;
          const rate=snapshotRate==null
            ?(profile?.commission_rate_override==null?defaultRate:Number(profile.commission_rate_override))
            :Number(snapshotRate);
          const gross=Number(child.subtotal||0);
          const delivery=Number(child.delivery_fee||0);
          const commission=Number((gross*rate/100).toFixed(2));
          const paymentRate=Number(child.payment_processing_rate_snapshot||0);
          const paymentFixed=Number(child.payment_fixed_fee_snapshot||0);
          const paymentFee=Number((Number(child.total||0)*paymentRate/100+paymentFixed).toFixed(2));
          const paymentPayer=child.payment_fee_payer_snapshot||"platform";
          const sellerPaymentDeduction=paymentPayer==="seller"?paymentFee:0;
          const payout=Number((gross-commission+delivery-sellerPaymentDeduction).toFixed(2));
          const {data:existingPayout}=await admin.from("ranova_seller_payouts")
            .select("id").eq("seller_order_id",child.id).maybeSingle();
          if(!existingPayout){
            const {error:payoutErr}=await admin.from("ranova_seller_payouts").insert({
              seller_order_id:child.id,
              seller_id:child.seller_id,
              store_id:child.store_id,
              platform_order_ref:child.platform_order_ref,
              seller_order_ref:child.order_ref,
              gross_product_amount:gross,
              delivery_fee:delivery,
              commission_rate:rate,
              commission_amount:commission,
              payment_processing_rate:paymentRate,
              payment_processing_fee:paymentFee,
              payment_fee_payer:paymentPayer,
              adjustment_amount:0,
              payout_amount:payout,
              currency:"GHS",
              country_rule_id:child.country_rule_id||null,
              seller_country_code:child.seller_country_code||null,
              buyer_country_code:child.buyer_country_code||null,
              payout_status:"pending",
              eligible_at:eligibleAt,
              updated_at:now
            });
            if(payoutErr)throw payoutErr;
          }
        }
      }

      if(["refunded","partially_refunded"].includes(status)){
        await admin.from("ranova_seller_payouts").update({
          payout_status:"held",
          payout_note:note||"Payment refund requires payout review.",
          updated_at:now
        }).eq("platform_order_ref",order.order_ref).neq("payout_status","paid");
      }
      const paymentTitle=status==="confirmed"?"RANOVA payment confirmed":status==="failed"?"RANOVA payment issue":status==="refunded"?"RANOVA payment refunded":status==="partially_refunded"?"RANOVA partial refund recorded":"RANOVA payment update";
      const paymentMessage="Payment for order "+order.order_ref+" is now "+status.replace(/_/g," ")+(payer_reference?". Reference: "+payer_reference+".":"")+(note?" "+note:"");
      await notifyBuyer(order,"payment_"+status,paymentTitle,paymentMessage,{status,payer_reference});
      await notifyOrderSellers(order,"payment_"+status,paymentTitle,paymentMessage,{status,payer_reference});
      await log(actor.user.id,"marketplace_payment_status_changed","marketplace_order",order.id,{status,payer_reference,note});
      return response(h,200,{ok:true});
    }

    if(action==="set_payout_status"){
      if(!isOwner(actor.role))return response(h,403,{ok:false,error:"Only the Owner can release or mark seller payouts as paid."});
      const id=clean(b.id,80);
      const status=clean(b.status,30);
      const payout_reference=clean(b.payout_reference,180);
      const note=clean(b.note,1000);
      if(!["eligible","held","processing","paid","cancelled"].includes(status))return response(h,400,{ok:false,error:"Invalid payout status."});
      const {data:p}=await admin.from("ranova_seller_payouts").select("*").eq("id",id).maybeSingle();
      if(!p)return response(h,404,{ok:false,error:"Payout not found."});
      if(status==="paid"&&!payout_reference)return response(h,400,{ok:false,error:"Enter the payout transaction/reference before marking this payout paid."});
      if(["eligible","processing","paid"].includes(status)){
        const {data:delivery}=await admin.from("ranova_order_deliveries").select("delivery_status,delivered_at")
          .eq("seller_order_id",p.seller_order_id).maybeSingle();
        if(!delivery||delivery.delivery_status!=="delivered_confirmed"){
          return response(h,409,{ok:false,error:"Seller payout cannot be released before delivery is confirmed by the buyer or RANOVA."});
        }
        if(p.eligible_at&&new Date(p.eligible_at).getTime()>Date.now()){
          return response(h,409,{ok:false,error:"The payout hold period has not finished yet."});
        }
        const {data:so}=await admin.from("ranova_seller_orders").select("parent_order_id").eq("id",p.seller_order_id).maybeSingle();
        if(so?.parent_order_id){
          const [{data:refunds},{data:disputes}]=await Promise.all([
            admin.from("ranova_marketplace_refunds").select("id").eq("customer_order_id",so.parent_order_id)
              .in("status",["requested","under_review","approved","processing"]).limit(1),
            admin.from("ranova_marketplace_disputes").select("id").eq("customer_order_id",so.parent_order_id)
              .in("status",["open","awaiting_buyer","awaiting_seller","under_review"]).limit(1)
          ]);
          if(refunds?.length||disputes?.length)return response(h,409,{ok:false,error:"This payout is held because an open refund or dispute is still being reviewed."});
        }
      }
      const now=new Date().toISOString();
      const {error}=await admin.from("ranova_seller_payouts").update({
        payout_status:status,
        payout_reference:payout_reference||p.payout_reference||null,
        payout_note:note||p.payout_note||null,
        paid_at:status==="paid"?now:p.paid_at,
        paid_by:status==="paid"?actor.user.id:p.paid_by,
        updated_at:now
      }).eq("id",id);
      if(error)throw error;
      await log(actor.user.id,"seller_payout_status_changed","seller_payout",id,{status,payout_reference,note});
      return response(h,200,{ok:true});
    }


    if(action==="save_country_rule"){
      if(!isOwner(actor.role))return response(h,403,{ok:false,error:"Only the Owner can change country finance rules."});
      const id=clean(b.id,80);
      const store_id=clean(b.store_id,80)||null;
      const seller_country_code=clean(b.seller_country_code,2).toUpperCase()||null;
      const buyer_country_code=clean(b.buyer_country_code,2).toUpperCase()||null;
      const payment_method=clean(b.payment_method,40)||null;
      const commission_rate=Number(b.commission_rate);
      const required_payment_percent=Number(b.required_payment_percent==null?100:b.required_payment_percent);
      const payment_processing_rate=Number(b.payment_processing_rate||0);
      const payment_fixed_fee=Number(b.payment_fixed_fee||0);
      const payment_fee_payer=clean(b.payment_fee_payer,20)||"platform";
      const source_name=clean(b.source_name,180);
      const source_url=clean(b.source_url,1000);
      const source_kind=clean(b.source_kind,40)||"owner_policy";
      const auto_update=!!b.auto_update;
      const change_reason=clean(b.change_reason,700);
      const desiredActive=b.active!==false;

      if(seller_country_code&&!/^[A-Z]{2}$/.test(seller_country_code))return response(h,400,{ok:false,error:"Invalid seller country code."});
      if(buyer_country_code&&!/^[A-Z]{2}$/.test(buyer_country_code))return response(h,400,{ok:false,error:"Invalid buyer country code."});
      if(payment_method&&!["Mobile Money","Bank Transfer"].includes(payment_method))return response(h,400,{ok:false,error:"Invalid payment method."});
      if(!Number.isFinite(commission_rate)||commission_rate<0||commission_rate>100)return response(h,400,{ok:false,error:"Commission must be between 0 and 100."});
      if(!Number.isFinite(required_payment_percent)||required_payment_percent<0||required_payment_percent>100)return response(h,400,{ok:false,error:"Required payment percentage must be between 0 and 100."});
      if(!Number.isFinite(payment_processing_rate)||payment_processing_rate<0||payment_processing_rate>100)return response(h,400,{ok:false,error:"Payment processing percentage must be between 0 and 100."});
      if(!Number.isFinite(payment_fixed_fee)||payment_fixed_fee<0)return response(h,400,{ok:false,error:"Fixed payment fee cannot be negative."});
      if(!["platform","buyer","seller"].includes(payment_fee_payer))return response(h,400,{ok:false,error:"Invalid payment-fee payer."});
      if(!["owner_policy","payment_provider","tax_authority","other_official"].includes(source_kind))return response(h,400,{ok:false,error:"Invalid source type."});
      if(auto_update&&(!source_url||source_kind==="owner_policy"))return response(h,400,{ok:false,error:"Automatic updates require an official external source URL and non-owner source type."});

      const now=new Date().toISOString();
      const basePayload:any={
        store_id,
        seller_country_code,
        buyer_country_code,
        payment_method,
        commission_rate:Number(commission_rate.toFixed(2)),
        required_payment_percent:Number(required_payment_percent.toFixed(2)),
        payment_processing_rate:Number(payment_processing_rate.toFixed(2)),
        payment_fixed_fee:Number(payment_fixed_fee.toFixed(2)),
        payment_fee_payer,
        currency:"GHS",
        source_name:source_name||null,
        source_url:source_url||null,
        source_kind,
        auto_update,
        effective_from:b.effective_from?new Date(b.effective_from).toISOString():now,
        updated_at:now,
        updated_by:actor.user.id
      };

      let saved:any=null;
      if(id){
        const {data:old,error:oldErr}=await admin.from("ranova_marketplace_country_rules").select("*").eq("id",id).maybeSingle();
        if(oldErr)throw oldErr;
        if(!old)return response(h,404,{ok:false,error:"Finance rule not found."});
        if(old.effective_to)return response(h,409,{ok:false,error:"Historical rule versions cannot be edited. Create a new rule for that scope instead."});
        if(!change_reason)return response(h,400,{ok:false,error:"Explain why this finance rule is changing. The reason is kept in the audit history."});
        const sameScope=(old.store_id||null)===(store_id||null)
          &&(old.seller_country_code||null)===(seller_country_code||null)
          &&(old.buyer_country_code||null)===(buyer_country_code||null)
          &&(old.payment_method||null)===(payment_method||null);
        if(!sameScope)return response(h,400,{ok:false,error:"To change the store/country/payment scope, create a new rule instead of rewriting this rule's history."});

        const nextPayload:any={
          ...basePayload,
          active:false,
          rule_version:Number(old.rule_version||1)+1,
          supersedes_rule_id:old.id,
          effective_to:null,
          change_reason
        };
        const {data:newRule,error:insertErr}=await admin.from("ranova_marketplace_country_rules").insert(nextPayload).select("*").single();
        if(insertErr)throw insertErr;

        const {error:archiveErr}=await admin.from("ranova_marketplace_country_rules").update({
          active:false,
          effective_to:now,
          updated_at:now,
          updated_by:actor.user.id,
          last_sync_status:old.auto_update?"superseded":"manual_superseded"
        }).eq("id",old.id);
        if(archiveErr){
          await admin.from("ranova_marketplace_country_rules").delete().eq("id",newRule.id);
          throw archiveErr;
        }

        if(desiredActive){
          const {data:activated,error:activateErr}=await admin.from("ranova_marketplace_country_rules").update({
            active:true,updated_at:now,updated_by:actor.user.id
          }).eq("id",newRule.id).select("*").single();
          if(activateErr){
            await admin.from("ranova_marketplace_country_rules").update({
              active:true,effective_to:null,updated_at:now,updated_by:actor.user.id
            }).eq("id",old.id);
            await admin.from("ranova_marketplace_country_rules").delete().eq("id",newRule.id);
            throw activateErr;
          }
          saved=activated;
        }else saved=newRule;

        await log(actor.user.id,"country_finance_rule_versioned","marketplace_country_rule",saved.id,{
          supersedes_rule_id:old.id,
          old_version:old.rule_version||1,
          new_version:saved.rule_version,
          change_reason,
          commission_rate,
          payment_processing_rate,
          payment_fixed_fee,
          payment_fee_payer,
          source_kind,
          auto_update
        });
      }else{
        const payload:any={
          ...basePayload,
          active:desiredActive,
          rule_version:1,
          supersedes_rule_id:null,
          effective_to:null,
          change_reason:change_reason||"Initial rule"
        };
        const q=await admin.from("ranova_marketplace_country_rules").insert(payload).select("*").single();
        if(q.error){
          if(String(q.error.message||"").toLowerCase().includes("duplicate"))return response(h,409,{ok:false,error:"An active rule already exists for that same store/country/payment scope. Edit that rule to create the next version."});
          throw q.error;
        }
        saved=q.data;
        await log(actor.user.id,"country_finance_rule_created","marketplace_country_rule",saved.id,{
          change_reason:payload.change_reason,
          store_id,seller_country_code,buyer_country_code,payment_method,
          commission_rate,payment_processing_rate,payment_fixed_fee,payment_fee_payer,source_kind,auto_update
        });
      }

      if(!store_id&&!seller_country_code&&!buyer_country_code&&!payment_method&&desiredActive){
        await admin.from("ranova_marketplace_finance_settings").update({
          default_commission_rate:Number(commission_rate.toFixed(2)),
          updated_at:now,
          updated_by:actor.user.id
        }).eq("id",1);
      }
      return response(h,200,{ok:true,rule:saved});
    }

    if(action==="set_country_rule_active"){
      if(!isOwner(actor.role))return response(h,403,{ok:false,error:"Only the Owner can change country finance rules."});
      const id=clean(b.id,80);
      const active=!!b.active;
      const reason=clean(b.reason,700);
      const {data:rule,error:readErr}=await admin.from("ranova_marketplace_country_rules").select("*").eq("id",id).maybeSingle();
      if(readErr)throw readErr;
      if(!rule)return response(h,404,{ok:false,error:"Finance rule not found."});
      if(active&&rule.effective_to)return response(h,409,{ok:false,error:"Historical rule versions cannot be reactivated. Create a new version instead."});
      if(!active&&!reason)return response(h,400,{ok:false,error:"Explain why this rule is being disabled."});
      const now=new Date().toISOString();
      const patch:any={active,updated_at:now,updated_by:actor.user.id};
      if(!active){
        patch.effective_to=now;
        patch.change_reason=reason||rule.change_reason||"Rule disabled";
      }
      const {error}=await admin.from("ranova_marketplace_country_rules").update(patch).eq("id",id);
      if(error)throw error;
      await log(actor.user.id,"country_finance_rule_status_changed","marketplace_country_rule",id,{active,reason});
      return response(h,200,{ok:true});
    }



    if(action==="delivery_proof_url"){
      if(!canOrderReview(actor.role))return response(h,403,{ok:false,error:"Order permission is required."});
      const proofId=clean(b.proof_id,80);
      const {data:proof}=await admin.from("ranova_delivery_proofs").select("id,storage_path").eq("id",proofId).maybeSingle();
      if(!proof?.storage_path)return response(h,404,{ok:false,error:"Delivery proof not found."});
      const {data,error}=await admin.storage.from("ranova-delivery-proof").createSignedUrl(proof.storage_path,600);
      if(error||!data?.signedUrl)throw new Error("Could not open delivery proof.");
      await log(actor.user.id,"delivery_proof_viewed","delivery_proof",proofId,{});
      return response(h,200,{ok:true,url:data.signedUrl,expires_in:600});
    }

    if(action==="review_delivery_proof"){
      if(!canOrderReview(actor.role))return response(h,403,{ok:false,error:"Order permission is required."});
      const proofId=clean(b.proof_id,80),status=clean(b.status,30),note=clean(b.note,1200);
      if(!["verified","rejected"].includes(status))return response(h,400,{ok:false,error:"Invalid proof review status."});
      if(status==="rejected"&&!note)return response(h,400,{ok:false,error:"Explain why the proof is being rejected."});
      const {data:proof}=await admin.from("ranova_delivery_proofs").select("*").eq("id",proofId).maybeSingle();
      if(!proof)return response(h,404,{ok:false,error:"Delivery proof not found."});
      const now=new Date().toISOString();
      const {error}=await admin.from("ranova_delivery_proofs").update({
        review_status:status,review_note:note||null,reviewed_at:now,reviewed_by:actor.user.id
      }).eq("id",proofId);
      if(error)throw error;
      if(status==="verified"){
        await admin.from("ranova_order_deliveries").update({
          proof_verified:true,proof_verified_at:now,proof_verified_by:actor.user.id,updated_at:now
        }).eq("id",proof.delivery_id);
      }else{
        const {count}=await admin.from("ranova_delivery_proofs").select("id",{count:"exact",head:true})
          .eq("delivery_id",proof.delivery_id).eq("review_status","verified").neq("id",proofId);
        if(!count)await admin.from("ranova_order_deliveries").update({
          proof_verified:false,proof_verified_at:null,proof_verified_by:null,updated_at:now
        }).eq("id",proof.delivery_id);
      }
      await admin.from("ranova_delivery_events").insert({
        delivery_id:proof.delivery_id,seller_order_id:proof.seller_order_id,status:"proof_"+status,
        actor_type:"admin",actor_user_id:actor.user.id,note:note||("Delivery proof "+status+".")
      });
      await log(actor.user.id,"delivery_proof_reviewed","delivery_proof",proofId,{status,note});
      return response(h,200,{ok:true});
    }

    if(action==="admin_confirm_delivery"){
      if(!canOrderReview(actor.role))return response(h,403,{ok:false,error:"Order permission is required."});
      const deliveryId=clean(b.delivery_id,80),note=clean(b.note,1800);
      if(!note)return response(h,400,{ok:false,error:"Explain why RANOVA is confirming this delivery."});
      const {data:delivery}=await admin.from("ranova_order_deliveries").select("*").eq("id",deliveryId).maybeSingle();
      if(!delivery)return response(h,404,{ok:false,error:"Delivery record not found."});
      if(delivery.delivery_status!=="delivered_pending_confirmation")return response(h,409,{ok:false,error:"Only a delivery awaiting confirmation can be confirmed by RANOVA."});
      const {data:proofs}=await admin.from("ranova_delivery_proofs").select("*").eq("delivery_id",delivery.id).neq("review_status","rejected");
      if(delivery.proof_required&&!(proofs||[]).length)return response(h,409,{ok:false,error:"A valid delivery proof must be present before RANOVA can confirm delivery."});

      const {data:child}=await admin.from("ranova_seller_orders").select("*").eq("id",delivery.seller_order_id).maybeSingle();
      if(!child)return response(h,404,{ok:false,error:"Seller order not found."});
      const {data:order}=await admin.from("ranova_customer_orders").select("*").eq("id",child.parent_order_id).maybeSingle();
      if(!order)return response(h,404,{ok:false,error:"Customer order not found."});
      const now=new Date().toISOString();

      const {error}=await admin.from("ranova_order_deliveries").update({
        delivery_status:"delivered_confirmed",admin_confirmed_at:now,delivered_at:now,
        proof_verified:true,proof_verified_at:now,proof_verified_by:actor.user.id,
        delivery_note:note,updated_at:now
      }).eq("id",delivery.id);
      if(error)throw error;
      if((proofs||[]).length){
        await admin.from("ranova_delivery_proofs").update({
          review_status:"verified",review_note:note,reviewed_at:now,reviewed_by:actor.user.id
        }).eq("delivery_id",delivery.id).eq("review_status","submitted");
      }
      await admin.from("ranova_seller_orders").update({order_status:"delivered",updated_at:now}).eq("id",child.id);
      await admin.from("ranova_delivery_events").insert({
        delivery_id:delivery.id,seller_order_id:child.id,status:"delivered_confirmed",
        actor_type:"admin",actor_user_id:actor.user.id,note
      });

      const {data:children}=await admin.from("ranova_seller_orders").select("order_status").eq("parent_order_id",order.id);
      const terminal=(children||[]).every((x:any)=>["delivered","cancelled"].includes(x.order_status));
      const anyDelivered=(children||[]).some((x:any)=>x.order_status==="delivered");
      if(terminal&&anyDelivered)await admin.from("ranova_customer_orders").update({status:"delivered"}).eq("id",order.id);

      await notifyBuyer(order,"delivery_confirmed","RANOVA confirmed delivery",
        "RANOVA confirmed delivery for seller order "+child.order_ref+". Reason: "+note,
        {seller_order_ref:child.order_ref,delivery_id:delivery.id});
      await notifyOrderSellers(order,"delivery_confirmed","RANOVA confirmed a delivery",
        "RANOVA confirmed delivery for seller order "+child.order_ref+".",{seller_order_ref:child.order_ref,delivery_id:delivery.id});
      await log(actor.user.id,"delivery_confirmed_by_admin","order_delivery",delivery.id,{seller_order_ref:child.order_ref,note});
      return response(h,200,{ok:true});
    }

    if(action==="review_refund"){
      if(!canOrderReview(actor.role)&&!canFinance(actor.role))return response(h,403,{ok:false,error:"Order-support permission is required."});
      const id=clean(b.id,80),status=clean(b.status,40),note=clean(b.note,1500);
      const approvedRaw=b.approved_amount;
      const refund_reference=clean(b.refund_reference,180);
      if(!["under_review","approved","rejected","processing","refunded","cancelled"].includes(status))return response(h,400,{ok:false,error:"Invalid refund status."});
      if(["approved","processing","refunded"].includes(status)&&!canFinance(actor.role))return response(h,403,{ok:false,error:"Finance permission is required for refund approval or payment."});
      const {data:r}=await admin.from("ranova_marketplace_refunds").select("*").eq("id",id).maybeSingle();
      if(!r)return response(h,404,{ok:false,error:"Refund request not found."});
      const {data:order}=await admin.from("ranova_customer_orders").select("*").eq("id",r.customer_order_id).maybeSingle();
      if(!order)return response(h,404,{ok:false,error:"Order not found."});
      const maxAmount=Number(order.total_payment||0);
      let approved=r.approved_amount;
      if(["approved","processing","refunded"].includes(status)){
        approved=approvedRaw===null||approvedRaw===undefined||approvedRaw===""?Number(r.requested_amount||0):Number(approvedRaw);
        if(!Number.isFinite(approved)||approved<=0||approved>Number(r.requested_amount||maxAmount)||approved>maxAmount)return response(h,400,{ok:false,error:"Approved refund cannot exceed the requested amount or recorded payment."});
      }
      if(["rejected","cancelled"].includes(status)&&!note)return response(h,400,{ok:false,error:"Add a reason for this decision."});
      if(status==="refunded"&&!refund_reference)return response(h,400,{ok:false,error:"Enter the refund transaction/reference before marking refunded."});

      const now=new Date().toISOString();
      const patch:any={
        status,approved_amount:approved,admin_note:note||r.admin_note||null,
        reviewed_at:["approved","rejected","processing","refunded","cancelled"].includes(status)?now:r.reviewed_at,
        reviewed_by:["approved","rejected","processing","refunded","cancelled"].includes(status)?actor.user.id:r.reviewed_by,
        refund_reference:refund_reference||r.refund_reference||null,
        refunded_at:status==="refunded"?now:r.refunded_at,
        updated_at:now
      };
      const {error}=await admin.from("ranova_marketplace_refunds").update(patch).eq("id",id);
      if(error)throw error;

      if(status==="refunded"){
        const finalStatus=Number(approved)>=maxAmount?"refunded":"partially_refunded";
        await admin.from("ranova_marketplace_payments").update({
          payment_status:finalStatus,admin_note:note||"Refund processed.",updated_at:now
        }).eq("parent_order_id",order.id);
        await admin.from("ranova_customer_orders").update({payment_status:finalStatus}).eq("id",order.id);
        await admin.from("ranova_seller_payouts").update({
          payout_status:"held",
          payout_note:"Refund "+r.refund_ref+" processed. Review settlement before release.",
          updated_at:now
        }).eq("platform_order_ref",order.order_ref).neq("payout_status","paid");
      }else if(["requested","under_review","approved","processing"].includes(status)){
        await admin.from("ranova_seller_payouts").update({
          payout_status:"held",payout_note:"Held for refund request "+r.refund_ref+".",updated_at:now
        }).eq("platform_order_ref",order.order_ref).in("payout_status",["pending","eligible","processing"]);
      }

      const msg="Refund "+r.refund_ref+" for order "+order.order_ref+" is now "+status.replace(/_/g," ")+".";
      await notifyBuyer(order,"refund_status","RANOVA refund update",msg,{refund_ref:r.refund_ref,status,approved_amount:approved,refund_reference});
      await notifyOrderSellers(order,"refund_status","RANOVA refund update",msg,{refund_ref:r.refund_ref,status,approved_amount:approved});
      await log(actor.user.id,"refund_reviewed","marketplace_refund",id,{status,approved_amount:approved,refund_reference,note});
      return response(h,200,{ok:true});
    }

    if(action==="review_dispute"){
      if(!canOrderReview(actor.role)&&!canFinance(actor.role))return response(h,403,{ok:false,error:"Order-support permission is required."});
      const id=clean(b.id,80),status=clean(b.status,40),resolution=clean(b.resolution,60),note=clean(b.note,1800);
      if(!["awaiting_buyer","awaiting_seller","under_review","resolved","closed"].includes(status))return response(h,400,{ok:false,error:"Invalid dispute status."});
      const allowedResolutions=["buyer_refund","partial_refund","seller_favor","no_adjustment","mutual_resolution","case_closed"];
      if(["resolved","closed"].includes(status)&&(!resolution||!note))return response(h,400,{ok:false,error:"A final resolution and explanation are required."});
      if(["resolved","closed"].includes(status)&&!allowedResolutions.includes(resolution))return response(h,400,{ok:false,error:"Choose a valid dispute resolution."});
      const {data:d}=await admin.from("ranova_marketplace_disputes").select("*").eq("id",id).maybeSingle();
      if(!d)return response(h,404,{ok:false,error:"Dispute not found."});
      const {data:order}=await admin.from("ranova_customer_orders").select("*").eq("id",d.customer_order_id).maybeSingle();
      if(!order)return response(h,404,{ok:false,error:"Order not found."});
      const now=new Date().toISOString();
      const {error}=await admin.from("ranova_marketplace_disputes").update({
        status,
        resolution:resolution||d.resolution||null,
        resolution_note:note||d.resolution_note||null,
        resolved_at:["resolved","closed"].includes(status)?now:d.resolved_at,
        resolved_by:["resolved","closed"].includes(status)?actor.user.id:d.resolved_by,
        updated_at:now
      }).eq("id",id);
      if(error)throw error;
      if(note){
        await admin.from("ranova_marketplace_dispute_messages").insert({
          dispute_id:d.id,sender_type:"admin",sender_user_id:actor.user.id,message:note
        });
      }
      const msg=["resolved","closed"].includes(status)
        ?"Dispute "+d.dispute_ref+" has been "+status.replace(/_/g," ")+": "+note
        :"Dispute "+d.dispute_ref+" is now "+status.replace(/_/g," ")+".";
      await notifyBuyer(order,"dispute_status","RANOVA dispute update",msg,{dispute_ref:d.dispute_ref,status,resolution});
      await notifyOrderSellers(order,"dispute_status","RANOVA dispute update",msg,{dispute_ref:d.dispute_ref,status,resolution});
      await log(actor.user.id,"dispute_reviewed","marketplace_dispute",id,{status,resolution,note});
      return response(h,200,{ok:true});
    }

    if(action==="admin_dispute_message"){
      if(!canOrderReview(actor.role)&&!canFinance(actor.role))return response(h,403,{ok:false,error:"Order-support permission is required."});
      const id=clean(b.id,80),message=clean(b.message,2000);
      if(message.length<2)return response(h,400,{ok:false,error:"Enter a message."});
      const {data:d}=await admin.from("ranova_marketplace_disputes").select("*").eq("id",id).maybeSingle();
      if(!d)return response(h,404,{ok:false,error:"Dispute not found."});
      const {data:order}=await admin.from("ranova_customer_orders").select("*").eq("id",d.customer_order_id).maybeSingle();
      if(!order)return response(h,404,{ok:false,error:"Order not found."});
      await admin.from("ranova_marketplace_dispute_messages").insert({
        dispute_id:d.id,sender_type:"admin",sender_user_id:actor.user.id,message
      });
      await admin.from("ranova_marketplace_disputes").update({status:"under_review",updated_at:new Date().toISOString()}).eq("id",id);
      await notifyBuyer(order,"dispute_message","RANOVA replied to your dispute","RANOVA added a message to dispute "+d.dispute_ref+".",{dispute_ref:d.dispute_ref});
      await notifyOrderSellers(order,"dispute_message","RANOVA replied to a dispute","RANOVA added a message to dispute "+d.dispute_ref+".",{dispute_ref:d.dispute_ref});
      await log(actor.user.id,"dispute_message_added","marketplace_dispute",id,{message});
      return response(h,200,{ok:true});
    }

    if(action==="save_sponsored_placement"){
      if(!canSellerReview(actor.role))return response(h,403,{ok:false,error:"Seller-review permission is required."});
      const productId=clean(b.product_id,80),category=clean(b.category,120),country=clean(b.buyer_country_code,2).toUpperCase();
      const starts=clean(b.starts_at,60),ends=clean(b.ends_at,60),label=clean(b.label,40)||"Sponsored";
      const disclosure=clean(b.disclosure_note,500)||"Paid placement. Organic ranking is calculated separately.";
      const priority=Math.max(0,Math.min(10,Math.trunc(Number(b.priority||0))));
      if(!productId||!starts||!ends)return response(h,400,{ok:false,error:"Product, start time and end time are required."});
      const startDate=new Date(starts),endDate=new Date(ends);
      if(!Number.isFinite(startDate.getTime())||!Number.isFinite(endDate.getTime())||endDate<=startDate)return response(h,400,{ok:false,error:"Use a valid sponsored placement time range."});
      const {data:p}=await admin.from("ranova_seller_products").select("id,store_id,product_status").eq("id",productId).maybeSingle();
      if(!p)return response(h,404,{ok:false,error:"Seller product not found."});
      if(p.product_status!=="active")return response(h,409,{ok:false,error:"Only an active approved product can be sponsored."});
      const id=clean(b.id,80);
      const payload:any={product_id:p.id,store_id:p.store_id,label,category:category||null,buyer_country_code:country||null,
        starts_at:startDate.toISOString(),ends_at:endDate.toISOString(),priority,status:"active",disclosure_note:disclosure,
        approved_by:actor.user.id,approved_at:new Date().toISOString(),updated_at:new Date().toISOString()};
      let error:any=null;
      if(id){({error}=await admin.from("ranova_marketplace_sponsored_placements").update(payload).eq("id",id))}
      else {({error}=await admin.from("ranova_marketplace_sponsored_placements").insert(payload))}
      if(error)throw error;
      await log(actor.user.id,"sponsored_placement_saved","seller_product",p.id,{placement_id:id||null,category:category||null,buyer_country_code:country||null,starts_at:payload.starts_at,ends_at:payload.ends_at,priority});
      return response(h,200,{ok:true});
    }

    if(action==="set_sponsored_status"){
      if(!canSellerReview(actor.role))return response(h,403,{ok:false,error:"Seller-review permission is required."});
      const id=clean(b.id,80),status=clean(b.status,30),note=clean(b.note,500);
      if(!["active","paused","ended","rejected"].includes(status))return response(h,400,{ok:false,error:"Invalid sponsored placement status."});
      if(status==="rejected"&&note.length<3)return response(h,400,{ok:false,error:"Add a rejection reason."});
      const {data:x}=await admin.from("ranova_marketplace_sponsored_placements").select("*").eq("id",id).maybeSingle();
      if(!x)return response(h,404,{ok:false,error:"Sponsored placement not found."});
      const patch:any={status,updated_at:new Date().toISOString()};
      if(status==="active"){patch.approved_by=actor.user.id;patch.approved_at=new Date().toISOString()}
      if(note)patch.disclosure_note=(x.disclosure_note||"Paid placement. Organic ranking is calculated separately.")+" Admin note: "+note;
      const {error}=await admin.from("ranova_marketplace_sponsored_placements").update(patch).eq("id",id);if(error)throw error;
      await log(actor.user.id,"sponsored_placement_status","sponsored_placement",id,{status,note});
      return response(h,200,{ok:true});
    }

    if(action==="set_seller_enforcement"){
      if(!canSellerReview(actor.role))return response(h,403,{ok:false,error:"Seller-review permission is required."});
      const storeId=clean(b.store_id,80),status=clean(b.status,30),reasonCode=clean(b.reason_code,80),reason=clean(b.reason_detail,2000);
      const endsAt=clean(b.ends_at,60);
      if(!["warning","restricted","suspended","good_standing"].includes(status))return response(h,400,{ok:false,error:"Invalid enforcement status."});
      if(reason.length<10)return response(h,400,{ok:false,error:"A clear written reason is required for every enforcement change."});
      const {data:store}=await admin.from("ranova_seller_stores").select("id,seller_id,store_name").eq("id",storeId).maybeSingle();
      if(!store)return response(h,404,{ok:false,error:"Seller store not found."});
      const {data:current}=await admin.from("ranova_seller_enforcement").select("*").eq("store_id",store.id).maybeSingle();
      const previous=current?.enforcement_status||"good_standing";
      const now=new Date().toISOString();
      const payload:any={store_id:store.id,seller_id:store.seller_id,enforcement_status:status,reason_code:reasonCode||null,reason_detail:reason,updated_at:now};
      if(status==="good_standing"){
        payload.lifted_by=actor.user.id;payload.lifted_at=now;payload.lift_reason=reason;payload.ends_at=null;
      }else{
        payload.imposed_by=actor.user.id;payload.imposed_at=now;payload.starts_at=now;payload.ends_at=endsAt||null;
        payload.lifted_by=null;payload.lifted_at=null;payload.lift_reason=null;
      }
      const {error}=await admin.from("ranova_seller_enforcement").upsert(payload,{onConflict:"store_id"});
      if(error)throw error;
      const actionName=status==="good_standing"?"restored":status;
      await admin.from("ranova_seller_enforcement_events").insert({
        store_id:store.id,seller_id:store.seller_id,action:actionName,reason_code:reasonCode||null,reason_detail:reason,
        previous_status:previous,new_status:status,actor_type:"admin",actor_user_id:actor.user.id,
        metadata:{ends_at:endsAt||null}
      });
      if(status==="suspended"){
        await admin.from("ranova_seller_stores").update({store_status:"suspended",moderation_note:reason,moderated_at:now,moderated_by:actor.user.id}).eq("id",store.id);
      }else if(previous==="suspended"&&status==="good_standing"){
        await admin.from("ranova_seller_stores").update({store_status:"paused",moderation_note:reason,moderated_at:now,moderated_by:actor.user.id}).eq("id",store.id);
      }
      await log(actor.user.id,"seller_enforcement_changed","seller_store",store.id,{previous,status,reason_code:reasonCode,reason,ends_at:endsAt||null});
      return response(h,200,{ok:true});
    }

    if(action==="review_seller_appeal"){
      if(!canSellerReview(actor.role))return response(h,403,{ok:false,error:"Seller-review permission is required."});
      const id=clean(b.id,80),status=clean(b.status,40),note=clean(b.note,2000);
      if(!["under_review","upheld","partially_upheld","overturned","closed"].includes(status))return response(h,400,{ok:false,error:"Invalid appeal status."});
      if(["upheld","partially_upheld","overturned","closed"].includes(status)&&note.length<10)return response(h,400,{ok:false,error:"A written appeal decision is required."});
      const {data:appeal}=await admin.from("ranova_seller_appeals").select("*").eq("id",id).maybeSingle();
      if(!appeal)return response(h,404,{ok:false,error:"Appeal not found."});
      const now=new Date().toISOString();
      const {error}=await admin.from("ranova_seller_appeals").update({
        status,admin_note:note||appeal.admin_note||null,reviewed_at:status==="under_review"?appeal.reviewed_at:now,
        reviewed_by:actor.user.id,updated_at:now
      }).eq("id",id);
      if(error)throw error;
      if(status==="overturned"){
        const {data:current}=await admin.from("ranova_seller_enforcement").select("enforcement_status").eq("store_id",appeal.store_id).maybeSingle();
        await admin.from("ranova_seller_enforcement").update({
          enforcement_status:"good_standing",lifted_by:actor.user.id,lifted_at:now,lift_reason:"Appeal overturned: "+note,updated_at:now,ends_at:null
        }).eq("store_id",appeal.store_id);
        await admin.from("ranova_seller_enforcement_events").insert({
          store_id:appeal.store_id,seller_id:appeal.seller_id,action:"restored",reason_code:"appeal_overturned",
          reason_detail:note,previous_status:current?.enforcement_status||null,new_status:"good_standing",
          actor_type:"admin",actor_user_id:actor.user.id,metadata:{appeal_ref:appeal.appeal_ref}
        });
        const {data:st}=await admin.from("ranova_seller_stores").select("store_status").eq("id",appeal.store_id).maybeSingle();
        if(st?.store_status==="suspended")await admin.from("ranova_seller_stores").update({store_status:"paused",moderation_note:"Restored after appeal. Seller may republish after review.",moderated_at:now,moderated_by:actor.user.id}).eq("id",appeal.store_id);
      }
      await log(actor.user.id,"seller_appeal_reviewed","seller_appeal",id,{status,note,appeal_ref:appeal.appeal_ref});
      return response(h,200,{ok:true});
    }

    if(action==="moderate_marketplace_review"){
      if(!canSellerReview(actor.role))return response(h,403,{ok:false,error:"Seller-review permission is required."});
      const id=clean(b.id,80),status=clean(b.status,30),note=clean(b.note,1800);
      if(!["published","hidden","rejected"].includes(status))return response(h,400,{ok:false,error:"Invalid review moderation status."});
      if(["hidden","rejected"].includes(status)&&note.length<3)return response(h,400,{ok:false,error:"Add a reason before hiding or rejecting a review."});
      const {data:r}=await admin.from("ranova_marketplace_reviews").select("*").eq("id",id).maybeSingle();
      if(!r)return response(h,404,{ok:false,error:"Review not found."});
      const now=new Date().toISOString();
      const patch:any={
        moderation_status:status,
        moderation_note:note||null,
        moderated_at:now,
        moderated_by:actor.user.id,
        updated_at:now
      };
      if(status==="published")patch.published_at=r.published_at||now;
      const {error}=await admin.from("ranova_marketplace_reviews").update(patch).eq("id",id);
      if(error)throw error;
      await admin.from("ranova_review_moderation_events").insert({
        review_id:id,actor_type:"admin",actor_user_id:actor.user.id,
        action:status==="published"?(r.moderation_status==="hidden"?"restored":"published"):status,
        reason:note||("Review marked "+status+"."),
        metadata:{previous_status:r.moderation_status}
      });
      await admin.rpc("ranova_refresh_seller_trust_metrics",{p_store_id:r.store_id});
      await log(actor.user.id,"marketplace_review_moderated","marketplace_review",id,{review_ref:r.review_ref,status,note,previous_status:r.moderation_status});
      return response(h,200,{ok:true});
    }

    return response(h,400,{ok:false,error:"Unknown moderation action."});
  }catch(e){
    console.error(e);
    return response(h,500,{ok:false,error:"Marketplace moderation request could not be completed."});
  }
});