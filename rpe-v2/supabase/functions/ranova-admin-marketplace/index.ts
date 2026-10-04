import { sellerAccessApproved } from "../_shared/seller-approval.ts";
import { assertSettlementCurrency, selectCommissionRule, commissionBreakdown } from "../_shared/commission.ts";
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const PAYSTACK_SECRET_KEY=Deno.env.get("PAYSTACK_SECRET_KEY")||"";
const HUBTEL_CLIENT_ID=Deno.env.get("HUBTEL_CLIENT_ID")||"";
const HUBTEL_CLIENT_SECRET=Deno.env.get("HUBTEL_CLIENT_SECRET")||"";
const HUBTEL_MERCHANT_ID=Deno.env.get("HUBTEL_MERCHANT_ID")||"";
const HUBTEL_READY=!!(HUBTEL_CLIENT_ID&&HUBTEL_CLIENT_SECRET&&HUBTEL_MERCHANT_ID);
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
async function paystack(path:string,init:RequestInit={}){
  if(!PAYSTACK_SECRET_KEY)throw new Error("PAYSTACK_NOT_CONFIGURED");
  const r=await fetch("https://api.paystack.co"+path,{...init,headers:{
    "Authorization":"Bearer "+PAYSTACK_SECRET_KEY,
    "Content-Type":"application/json",
    ...(init.headers||{})
  }});
  const o=await r.json().catch(()=>({}));
  if(!r.ok||o?.status===false)throw new Error(o?.message||"Paystack request failed.");
  return o;
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
  const {data:app}=await admin.from("ranova_seller_applications").select("verification_status,status,reviewed_at").eq("application_ref",acc.application_ref).maybeSingle();
  const {data:store}=await admin.from("ranova_seller_stores").select("store_status,moderated_by,moderated_at").eq("seller_id",userId).eq("application_ref",acc.application_ref).maybeSingle();
  return sellerAccessApproved(app,store);
}
function accepted(v:any){
  return ["approved","complete","verified"].includes(String(v||"").toLowerCase());
}
async function dashboard(role:string){
  const out:any={ok:true,role,payment_provider:HUBTEL_READY?{name:"Hubtel",configured:false,mode:"credentials_received_activation_pending",primary:true,credentials_present:true}:{name:"Hubtel",configured:false,mode:"awaiting_credentials",primary:true,credentials_present:false,paystack_fallback_configured:!!PAYSTACK_SECRET_KEY},applications:[],files:[],stores:[],products:[],seller_orders:[],marketplace_orders:[],finance_settings:null,payment_accounts:[],payouts:[],payments:[],country_rules:[],reconciliation_runs:[],reconciliation_issues:[],finance_snapshots:[],refunds:[],disputes:[],dispute_messages:[],deliveries:[],delivery_proofs:[],delivery_events:[],reviews:[],trust_metrics:[],performance:[],enforcement:[],enforcement_events:[],appeals:[],sponsored_placements:[],inventory_settings:null,inventory_reservations:[],inventory_events:[],after_sales_cases:[],after_sales_events:[],risk_flags:[],safety_reports:[],report_evidence:[],store_cases:[],admin_seller_threads:[],admin_seller_messages:[],risk_review_events:[],counts:{}};
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

    const [{data:reportEvidence},{data:storeCases},{data:adminThreads},{data:adminMessages}]=await Promise.all([
      admin.from("ranova_report_evidence").select("*").order("created_at",{ascending:false}).limit(2000),
      admin.from("ranova_store_cases").select("*").order("created_at",{ascending:false}).limit(1000),
      admin.from("ranova_admin_seller_threads").select("*").order("updated_at",{ascending:false}).limit(500),
      admin.from("ranova_admin_seller_messages").select("*").order("created_at",{ascending:true}).limit(3000)
    ]);
    out.report_evidence=reportEvidence||[];
    out.store_cases=storeCases||[];
    out.admin_seller_threads=adminThreads||[];
    const {data:sellerNotices}=await admin.from("ranova_marketplace_notifications").select("id,notification_type,metadata,read_at,created_at")
      .eq("recipient_type","seller").in("notification_type",["admin_message","seller_more_information","seller_review_under_review","seller_review_needs_information","seller_review_approved","seller_review_rejected","seller_review_suspended"]).order("created_at",{ascending:false}).limit(3000);
    out.seller_notice_receipts=sellerNotices||[];
    out.admin_seller_messages=await Promise.all((adminMessages||[]).map(async(m:any)=>({
      ...m,seller_seen_at:(sellerNotices||[]).find((n:any)=>String(n.metadata?.message_id||"")===String(m.id))?.read_at||null,media_url:m.storage_path?(await admin.storage.from("admin-seller-media").createSignedUrl(m.storage_path,3600)).data?.signedUrl||null:null
    })));
    if(!(out.safety_reports||[]).length){
      const [{data:sr},{data:rf}]=await Promise.all([
        admin.from("ranova_safety_reports").select("*").order("created_at",{ascending:false}).limit(1500),
        admin.from("ranova_risk_flags").select("*").order("created_at",{ascending:false}).limit(1500)
      ]);
      out.safety_reports=sr||[];
      out.risk_flags=rf||[];
    }
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
    const [{data:afterCases},{data:afterEvents}]=await Promise.all([
      admin.from("ranova_after_sales_cases").select("*").order("created_at",{ascending:false}).limit(1000),
      admin.from("ranova_after_sales_events").select("*").order("created_at",{ascending:false}).limit(2000)
    ]);
    out.after_sales_cases=afterCases||[];
    out.after_sales_events=afterEvents||[];
    const [{data:riskFlags},{data:safetyReports},{data:riskEvents}]=await Promise.all([
      admin.from("ranova_risk_flags").select("*").order("created_at",{ascending:false}).limit(1500),
      admin.from("ranova_safety_reports").select("*").order("created_at",{ascending:false}).limit(1500),
      admin.from("ranova_risk_review_events").select("*").order("created_at",{ascending:false}).limit(3000)
    ]);
    out.risk_flags=riskFlags||[];
    const reportedMessageIds=(safetyReports||[]).map((x:any)=>x.message_id).filter(Boolean);
    let reportedMessages:any[]=[];
    if(reportedMessageIds.length){
      const {data:rm}=await admin.from("ranova_messages").select("id,conversation_id,sender_user_id,sender_role,message_type,body,created_at").in("id",reportedMessageIds);
      reportedMessages=rm||[];
    }
    out.safety_reports=(safetyReports||[]).map((r:any)=>({...r,reported_message:reportedMessages.find((m:any)=>m.id===r.message_id)||null}));
    out.risk_review_events=riskEvents||[];
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
    const [{data:reconRuns},{data:reconIssues},{data:financeSnapshots}]=await Promise.all([
      admin.from("ranova_finance_reconciliation_runs").select("*").order("started_at",{ascending:false}).limit(50),
      admin.from("ranova_finance_reconciliation_issues").select("*").order("last_seen_at",{ascending:false}).limit(300),
      admin.from("ranova_finance_daily_snapshots").select("*").order("snapshot_date",{ascending:false}).limit(90)
    ]);
    out.reconciliation_runs=reconRuns||[];
    out.reconciliation_issues=reconIssues||[];
    out.finance_snapshots=financeSnapshots||[];
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
    inventory_restored:out.inventory_reservations.filter((x:any)=>x.status==="restored").length,
    after_sales_open:out.after_sales_cases.filter((x:any)=>!["resolved","closed","declined"].includes(x.status)).length,
    risk_flags_open:out.risk_flags.filter((x:any)=>["open","under_review"].includes(x.status)).length,
    safety_reports_open:out.safety_reports.filter((x:any)=>["open","under_review"].includes(x.status)).length,
    risk_high_open:out.risk_flags.filter((x:any)=>["open","under_review"].includes(x.status)&&x.severity==="high").length
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


    if(action==="report_evidence_url"){
      if(!canSellerReview(actor.role))return response(h,403,{ok:false,error:"Seller-review permission is required."});
      const id=clean(b.id,80);
      const {data:file}=await admin.from("ranova_report_evidence").select("id,report_id,storage_path,original_filename").eq("id",id).maybeSingle();
      if(!file)return response(h,404,{ok:false,error:"Report evidence not found."});
      const {data:signed,error}=await admin.storage.from("report-evidence").createSignedUrl(file.storage_path,600);
      if(error||!signed?.signedUrl)return response(h,500,{ok:false,error:"Could not create a secure evidence link."});
      await log(actor.user.id,"report_evidence_viewed","report_evidence",id,{report_id:file.report_id,original_filename:file.original_filename});
      return response(h,200,{ok:true,url:signed.signedUrl,expires_in:600,filename:file.original_filename});
    }

    if(action==="set_store_report_status"){
      if(!canSellerReview(actor.role))return response(h,403,{ok:false,error:"Seller-review permission is required."});
      const id=clean(b.id,80),status=clean(b.status,40),note=clean(b.note,1800);
      if(!["open","under_review","awaiting_seller","awaiting_customer","resolved","dismissed"].includes(status))return response(h,400,{ok:false,error:"Invalid report status."});
      if(["resolved","dismissed","awaiting_seller","awaiting_customer"].includes(status)&&!note)return response(h,400,{ok:false,error:"Add a review note for this status change."});
      const {data:report}=await admin.from("ranova_safety_reports").select("*").eq("id",id).maybeSingle();
      if(!report)return response(h,404,{ok:false,error:"Report not found."});
      const now=new Date().toISOString();
      const {error}=await admin.from("ranova_safety_reports").update({status,admin_note:note||report.admin_note||null,reviewed_by:actor.user.id,reviewed_at:now,updated_at:now}).eq("id",id);
      if(error)throw error;
      let caseStatus=status;
      if(status==="resolved"||status==="dismissed")caseStatus=status;
      const {data:existingCase}=await admin.from("ranova_store_cases").select("id").eq("report_id",id).maybeSingle();
      if(existingCase){
        await admin.from("ranova_store_cases").update({status:caseStatus,admin_note:note||null,updated_at:now,closed_at:["resolved","dismissed"].includes(status)?now:null}).eq("id",existingCase.id);
      }else if(report.store_id&&status!=="dismissed"){
        await admin.from("ranova_store_cases").insert({
          case_ref:"RNV-CASE-"+new Date().toISOString().slice(0,10).replace(/-/g,"")+"-"+crypto.randomUUID().replace(/-/g,"").slice(0,6).toUpperCase(),
          store_id:report.store_id,report_id:report.id,severity:report.severity||"medium",status:caseStatus,
          title:"Store report: "+clean(report.category,100),admin_note:note||null,created_by:actor.user.id
        });
      }
      if(report.reporter_user_id){
        await queueNotice("buyer",report.reporter_user_id,null,null,null,"store_report_"+status,
          "Your RANOVA report was updated",
          status==="resolved"?"RANOVA has completed its review of report "+report.report_ref+".":status==="dismissed"?"RANOVA completed its review of report "+report.report_ref+".":status==="awaiting_customer"?"RANOVA needs additional information for report "+report.report_ref+".":"RANOVA is reviewing report "+report.report_ref+".",
          {report_ref:report.report_ref,status},"/appliances/all/report-store.html","report-status:"+report.id+":"+status);
      }
      await log(actor.user.id,"store_report_status_changed","safety_report",id,{status,note,store_id:report.store_id,report_ref:report.report_ref});
      return response(h,200,{ok:true});
    }

    if(action==="prepare_seller_media"){
      if(!canSellerReview(actor.role))return response(h,403,{ok:false,error:"Seller-review permission is required."});
      const storeId=clean(b.store_id,80),mime=clean(b.mime_type,120),size=Number(b.file_size||0);
      const types:any={"image/jpeg":"image","image/png":"image","image/webp":"image","image/gif":"image","application/pdf":"file","text/plain":"file","audio/webm":"audio","audio/mp4":"audio","audio/ogg":"audio","audio/mpeg":"audio","audio/wav":"audio"};
      if(!types[mime]||!Number.isFinite(size)||size<1||size>15728640)return response(h,400,{ok:false,error:"Unsupported file type or file is larger than 15 MB."});
      const {data:store}=await admin.from("ranova_seller_stores").select("id").eq("id",storeId).maybeSingle();
      if(!store)return response(h,404,{ok:false,error:"Seller store not found."});
      const extension:any={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif","application/pdf":"pdf","text/plain":"txt","audio/webm":"webm","audio/mp4":"m4a","audio/ogg":"ogg","audio/mpeg":"mp3","audio/wav":"wav"};
      const path=store.id+"/"+actor.user.id+"/"+crypto.randomUUID()+"."+extension[mime];
      const {data,error}=await admin.storage.from("admin-seller-media").createSignedUploadUrl(path);
      if(error)throw error;
      return response(h,200,{ok:true,path,token:data.token,media_type:types[mime]});
    }
    if(action==="message_seller"){
      if(!canSellerReview(actor.role))return response(h,403,{ok:false,error:"Seller-review permission is required."});
      const storeId=clean(b.store_id,80),body=clean(b.body,4000),path=clean(b.storage_path,300);
      if(body.length<2&&!path)return response(h,400,{ok:false,error:"Write a message or attach a file first."});
      const {data:store}=await admin.from("ranova_seller_stores").select("id,seller_id,store_name").eq("id",storeId).maybeSingle();
      if(!store)return response(h,404,{ok:false,error:"Seller store not found."});
      let media:any={};
      if(path){
        if(!path.startsWith(store.id+"/"+actor.user.id+"/"))return response(h,400,{ok:false,error:"Invalid attachment path."});
        const type=clean(b.media_type,10),mime=clean(b.mime_type,120);
        if(!["image","file","audio"].includes(type))return response(h,400,{ok:false,error:"Invalid media type."});
        const name=path.split("/").at(-1)||"";
        const {data:files,error:listError}=await admin.storage.from("admin-seller-media").list(store.id+"/"+actor.user.id,{search:name});
        const file=files?.find(x=>x.name===name);
        if(listError||!file||Number(file.metadata?.size||0)>15728640)return response(h,400,{ok:false,error:"Upload the attachment before sending."});
        media={media_type:type,storage_path:path,file_name:clean(b.file_name,250)||"Attachment",mime_type:mime};
      }
      let {data:thread}=await admin.from("ranova_admin_seller_threads").select("*").eq("store_id",store.id).maybeSingle();
      if(!thread){
        const created=await admin.from("ranova_admin_seller_threads").insert({store_id:store.id,seller_id:store.seller_id,status:"open"}).select("*").single();
        if(created.error)throw created.error;
        thread=created.data;
      }
      const {data:saved,error}=await admin.from("ranova_admin_seller_messages").insert({thread_id:thread.id,sender_role:"admin",sender_user_id:actor.user.id,body,...media}).select("id").single();
      if(error)throw error;
      await admin.from("ranova_admin_seller_threads").update({updated_at:new Date().toISOString(),status:"open"}).eq("id",thread.id);
      const sellerEmail=await emailForUser(store.seller_id);
      await queueNotice("seller",store.seller_id,sellerEmail,null,null,"admin_message",
        "Official message from RANOVA Admin",(body||"Sent an attachment").slice(0,500),{store_id:store.id,store_name:store.store_name,thread_id:thread.id,message_id:String(saved.id)},
        "/appliances/all/seller-admin-messages.html","admin-message:"+thread.id+":"+Date.now());
      await log(actor.user.id,"admin_message_sent","seller_store",store.id,{store_name:store.store_name});
      return response(h,200,{ok:true,thread_id:thread.id,message_id:String(saved.id)});
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
        const {data:overall}=await admin.from("ranova_seller_applications").select("verification_status,status").eq("application_ref",file.application_ref).maybeSingle();
        if(["approved","rejected","suspended"].includes(String(overall?.verification_status||overall?.status)))delete appPatch.verification_status;
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
      const {data:overall}=await admin.from("ranova_seller_applications").select("verification_status,status").eq("application_ref",ref).maybeSingle();
      if(["approved","rejected","suspended"].includes(String(overall?.verification_status||overall?.status)))delete patch.verification_status;
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
      if(["rejected","needs_information","suspended"].includes(decision)&&!note){
        return response(h,400,{ok:false,error:"Add a review note explaining this decision."});
      }
      if(decision==="approved"){
        const requiredTypes=["business_registration","identity_document","fulfilment_evidence"];
        const {data:reviewFiles,error:fileError}=await admin.from("ranova_seller_verification_files")
          .select("id,document_type,review_status,created_at")
          .eq("application_ref",ref)
          .in("document_type",requiredTypes)
          .order("created_at",{ascending:false});
        if(fileError)throw fileError;
        const latestByType=new Map<string,any>();
        for(const file of reviewFiles||[])if(!latestByType.has(file.document_type))latestByType.set(file.document_type,file);
        const notApproved=requiredTypes.filter(type=>String(latestByType.get(type)?.review_status||"").toLowerCase()!=="approved");
        if(notApproved.length){
          return response(h,409,{ok:false,error:"Approve all required seller documents before approving this store.",missing_document_approvals:notApproved});
        }
      }
      const now=new Date().toISOString();
      let status=decision;
      let storeSetup=app.store_setup_status;
      if(decision==="needs_information")status="under_review";
      if(decision==="approved"&&String(storeSetup||"").toLowerCase()==="locked")storeSetup="in_progress";
      if(["rejected","suspended"].includes(decision))storeSetup="locked";
      const sellerNote=decision==="approved"
        ? (note||"Your required seller documents have been approved. RANOVA Seller Center access is now available.")
        : (note||(decision==="under_review"?"Your application is being reviewed by RANOVA.":app.verification_notes||null));
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
      let notificationQueued=false;
      {
        const {data:account}=await admin.from("ranova_seller_accounts").select("user_id").eq("application_ref",ref).maybeSingle();
        try{
          await queueNotice("seller",account?.user_id||null,clean(app.email,250)||null,null,null,
            "seller_review_"+decision,({under_review:"RANOVA is reviewing your application",needs_information:"RANOVA needs more information",approved:"Your Store Has Been Approved",rejected:"Seller application decision",suspended:"Seller account update"} as any)[decision],sellerNote||decision.replace(/_/g," "),
            {application_ref:ref,decision,reviewed_at:now},"/appliances/all/seller-center.html?ref="+encodeURIComponent(ref),
            "seller-review:"+ref+":"+now);
          notificationQueued=true;
        }catch(noticeError){console.error("Seller review notice failed",noticeError)}
      }
      await log(actor.user.id,"seller_reviewed","seller_application",ref,{decision,note});
      return response(h,200,{ok:true,notification_queued:notificationQueued});
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

      if(["paused","suspended"].includes(status)&&!note)return response(h,400,{ok:false,error:"Add the reason for this store-control action."});

      const now=new Date().toISOString();
      const nextModerationNote=status==="active"?(note||"Store restored to active selling status by RANOVA Admin."):note;
      const {error}=await admin.from("ranova_seller_stores").update({
        store_status:status,
        moderation_note:nextModerationNote||null,
        moderated_at:now,
        moderated_by:actor.user.id,
        updated_at:now
      }).eq("id",id);
      if(error)throw error;

      if(status==="active"){
        const {error:approvalError}=await admin.from("ranova_seller_applications").update({status:"approved",verification_status:"approved",store_setup_status:"in_progress",verification_notes:nextModerationNote,reviewed_at:now,reviewed_by:actor.user.id,updated_at:now}).eq("application_ref",store.application_ref);
        if(approvalError)throw approvalError;
        try{await queueNotice("seller",store.seller_id,await emailForUser(store.seller_id),null,null,"seller_review_approved","Your seller account is approved",nextModerationNote,{application_ref:store.application_ref,decision:"approved",reviewed_at:now},"/appliances/all/seller-center.html","seller-review:"+store.application_ref+":"+now)}catch(e){console.error("Store approval notification failed",e)}
      }

      // Keep a server-side enforcement record so a seller cannot bypass
      // an Admin investigation/suspension by republishing the store.
      const enforcementStatus=status==="active"?"good_standing":status==="paused"?"restricted":"suspended";
      const reasonCode=status==="active"?"admin_restored":status==="paused"?"under_investigation":"store_terminated";
      const enforcement:any={
        store_id:store.id,
        seller_id:store.seller_id,
        enforcement_status:enforcementStatus,
        reason_code:reasonCode,
        reason_detail:nextModerationNote||null,
        updated_at:now
      };
      if(status==="active"){
        enforcement.starts_at=null;
        enforcement.ends_at=null;
        enforcement.lifted_by=actor.user.id;
        enforcement.lifted_at=now;
        enforcement.lift_reason=nextModerationNote||"Restored by RANOVA Admin.";
      }else{
        enforcement.starts_at=now;
        enforcement.ends_at=null;
        enforcement.imposed_by=actor.user.id;
        enforcement.imposed_at=now;
        enforcement.lifted_by=null;
        enforcement.lifted_at=null;
        enforcement.lift_reason=null;
      }
      const {error:enfError}=await admin.from("ranova_seller_enforcement").upsert(enforcement,{onConflict:"store_id"});
      if(enfError)throw enfError;

      await log(actor.user.id,"seller_store_status_changed","seller_store",id,{
        status,
        enforcement_status:enforcementStatus,
        note:nextModerationNote,
        store_name:store.store_name
      });
      return response(h,200,{ok:true,status,enforcement_status:enforcementStatus});
    }


    if(action==="run_finance_reconciliation"){
      if(!canFinance(actor.role))return response(h,403,{ok:false,error:"Finance permission is required."});
      const {data:runId,error}=await admin.rpc("ranova_run_finance_reconciliation");
      if(error){
        // private function is not exposed through PostgREST; use a controlled public wrapper only if present.
        const {data:run2,error:error2}=await admin.rpc("ranova_run_finance_reconciliation_service");
        if(error2)throw error2;
        await log(actor.user.id,"finance_reconciliation_run","finance_reconciliation",String(run2),{});
        return response(h,200,{ok:true,run_id:run2});
      }
      await log(actor.user.id,"finance_reconciliation_run","finance_reconciliation",String(runId),{});
      return response(h,200,{ok:true,run_id:runId});
    }

    if(action==="set_reconciliation_issue_status"){
      if(!canFinance(actor.role))return response(h,403,{ok:false,error:"Finance permission is required."});
      const id=clean(b.id,80),status=clean(b.status,30),note=clean(b.note,1200);
      if(!["acknowledged","resolved"].includes(status))return response(h,400,{ok:false,error:"Invalid reconciliation issue status."});
      if(!note)return response(h,400,{ok:false,error:"Add a finance review note."});
      const {data:issue}=await admin.from("ranova_finance_reconciliation_issues").select("*").eq("id",id).maybeSingle();
      if(!issue)return response(h,404,{ok:false,error:"Reconciliation issue not found."});
      const patch:any={status,resolution_note:note,last_seen_at:issue.last_seen_at};
      if(status==="resolved")patch.resolved_at=new Date().toISOString();
      const {error}=await admin.from("ranova_finance_reconciliation_issues").update(patch).eq("id",id);
      if(error)throw error;
      await log(actor.user.id,"finance_reconciliation_issue_"+status,"finance_reconciliation_issue",id,{issue_code:issue.issue_code,note});
      return response(h,200,{ok:true});
    }

    if(action==="preview_commission"){
      if(!canFinance(actor.role))return response(h,403,{ok:false,error:"Finance permission is required."});
      const currency=assertSettlementCurrency(b.currency||"GHS");
      const buyerCountry=clean(b.buyer_country_code,2).toUpperCase();
      const sellerCountry=clean(b.seller_country_code,2).toUpperCase();
      if(!/^[A-Z]{2}$/.test(buyerCountry)||!/^[A-Z]{2}$/.test(sellerCountry))return response(h,400,{ok:false,error:"Choose the seller and buyer country."});
      const method=clean(b.payment_method,40);
      if(!["Mobile Money","Bank Transfer"].includes(method))return response(h,400,{ok:false,error:"Choose a payment method."});
      let rule:any;
      if(b.preview_draft===true){
        if(!isOwner(actor.role))return response(h,403,{ok:false,error:"Only the Owner can preview a draft policy."});
        rule={id:null,rule_version:1,currency,commission_rate:b.commission_rate,payment_processing_rate:b.payment_processing_rate,payment_fixed_fee:b.payment_fixed_fee,payment_fee_payer:b.payment_fee_payer};
      }else{
        const {data:rows,error}=await admin.from("ranova_marketplace_country_rules").select("*").eq("active",true);
        if(error)throw error;
        rule=selectCommissionRule(rows||[],{store_id:clean(b.store_id,80)||null,seller_country_code:sellerCountry,buyer_country_code:buyerCountry,payment_method:method,currency});
      }
      return response(h,200,{ok:true,preview_only:true,draft:b.preview_draft===true,rule_source:rule.source_name||"Unsaved owner policy",breakdown:commissionBreakdown(rule,b.subtotal,b.delivery_fee??0)});
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
      if(status==="confirmed"){
        if(!payer_reference)return response(h,400,{ok:false,error:"Enter the independently verified RANOVA payment reference."});
        const {data:confirmed,error:confirmErr}=await admin.rpc("ranova_confirm_marketplace_payment",{
          p_parent_order_id:order.id,p_provider:"manual",p_provider_reference:payer_reference,
          p_provider_transaction_id:payer_reference,p_provider_channel:order.payment_method||"manual",
          p_provider_payload:{source:"admin_manual_confirmation",note:note||null},
          p_confirmed_by:actor.user.id
        });
        if(confirmErr)return response(h,409,{ok:false,error:confirmErr.message||"Payment could not be confirmed."});
        await notifyBuyer(order,"payment_confirmed","RANOVA payment confirmed","Payment for order "+order.order_ref+" has been confirmed. Supplier payout remains protected until the delivery and buyer-protection conditions are complete.",{status:"confirmed",payer_reference});
        await notifyOrderSellers(order,"payment_confirmed","RANOVA payment confirmed","Customer payment for order "+order.order_ref+" has been confirmed. Your payout remains pending until RANOVA's release conditions are satisfied.",{status:"confirmed",payer_reference});
        await log(actor.user.id,"marketplace_payment_confirmed","marketplace_order",order.id,{payer_reference,note,provider:"manual"});
        return response(h,200,{ok:true,payment:confirmed});
      }
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

    if(action==="initiate_provider_payout"){
      if(!isOwner(actor.role))return response(h,403,{ok:false,error:"Only the Owner can release seller payouts."});
      if(!PAYSTACK_SECRET_KEY)return response(h,503,{ok:false,error:"Paystack is not configured. Add PAYSTACK_SECRET_KEY to Supabase Edge Function secrets first."});
      const id=clean(b.id,80);
      const {data:p}=await admin.from("ranova_seller_payouts").select("*").eq("id",id).maybeSingle();
      if(!p)return response(h,404,{ok:false,error:"Payout not found."});
      const {data:releaseCheck,error:releaseErr}=await admin.rpc("ranova_assert_payout_releasable",{p_payout_id:p.id});
      if(releaseErr)return response(h,409,{ok:false,error:releaseErr.message||"This payout is not releasable."});
      const {data:profile}=await admin.from("ranova_seller_finance_profiles")
        .select("recipient_code,payout_account_verified,payout_account_masked,payout_method,provider_name,account_name")
        .eq("seller_id",p.seller_id).maybeSingle();
      if(!profile?.recipient_code||!profile?.payout_account_verified)return response(h,409,{ok:false,error:"The seller must configure and verify a payout destination before funds can be released."});
      const reference=("rnv-payout-"+p.id.replace(/-/g,"")).slice(0,50);
      const transfer=await paystack("/transfer",{method:"POST",body:JSON.stringify({
        source:"balance",amount:Math.round(Number(p.payout_amount||0)*100),
        recipient:profile.recipient_code,reason:"RANOVA supplier payout "+p.seller_order_ref,
        reference,currency:p.currency||"GHS"
      })});
      const d=transfer.data||{},now=new Date().toISOString();
      const {error:updateErr}=await admin.from("ranova_seller_payouts").update({
        payout_status:"processing",payout_reference:reference,provider:"paystack",
        recipient_code:profile.recipient_code,provider_transfer_code:String(d.transfer_code||"")||null,
        provider_status:String(d.status||"pending"),initiated_at:now,payout_note:"Transfer initiated through protected RANOVA settlement.",updated_at:now
      }).eq("id",p.id);
      if(updateErr)throw updateErr;
      await log(actor.user.id,"seller_payout_provider_initiated","seller_payout",p.id,{
        seller_order_ref:p.seller_order_ref,amount:p.payout_amount,currency:p.currency,
        payout_destination:profile.payout_account_masked,provider:"paystack",reference
      });
      const email=await emailForUser(p.seller_id);
      await queueNotice("seller",p.seller_id,email,null,p.seller_order_id,"payout_processing",
        "RANOVA payout is processing","Payout "+reference+" for "+p.currency+" "+Number(p.payout_amount||0).toFixed(2)+" has been sent to the payment provider for processing.",
        {payout_id:p.id,reference,amount:p.payout_amount},"/appliances/all/seller-dashboard.html","payout-processing:"+p.id);
      return response(h,200,{ok:true,payout_id:p.id,status:"processing",reference,provider_status:d.status||"pending"});
    }

    if(action==="set_payout_status"){
      if(!isOwner(actor.role))return response(h,403,{ok:false,error:"Only the Owner can release or mark seller payouts as paid."});
      const id=clean(b.id,80);
      const status=clean(b.status,30);
      const payout_reference=clean(b.payout_reference,180);
      const note=clean(b.note,1000);
      if(!["eligible","held","processing","paid","cancelled"].includes(status))return response(h,400,{ok:false,error:"Invalid payout status."});
      if(status==="eligible")return response(h,409,{ok:false,error:"Payout eligibility is calculated automatically from payment, delivery, hold, refund, dispute, after-sales and safety checks. It cannot be manually forced."});
      const {data:p}=await admin.from("ranova_seller_payouts").select("*").eq("id",id).maybeSingle();
      if(!p)return response(h,404,{ok:false,error:"Payout not found."});
      if(["processing","paid"].includes(status)){
        const {error:releaseErr}=await admin.rpc("ranova_assert_payout_releasable",{p_payout_id:p.id});
        if(releaseErr)return response(h,409,{ok:false,error:releaseErr.message||"This payout is no longer releasable."});
      }
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
      assertSettlementCurrency(b.currency||"GHS");
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

    if(action==="review_risk_flag"){
      if(!canOrderReview(actor.role)&&!canSellerReview(actor.role))return response(h,403,{ok:false,error:"Risk-review permission is required."});
      const id=clean(b.id,80),status=clean(b.status,30),note=clean(b.note,1800);
      if(!["under_review","confirmed","dismissed","resolved"].includes(status))return response(h,400,{ok:false,error:"Invalid risk review status."});
      if(["confirmed","dismissed","resolved"].includes(status)&&note.length<5)return response(h,400,{ok:false,error:"Add a clear review note."});
      const {data:f}=await admin.from("ranova_risk_flags").select("*").eq("id",id).maybeSingle();
      if(!f)return response(h,404,{ok:false,error:"Risk flag not found."});
      const now=new Date().toISOString();
      await admin.from("ranova_risk_flags").update({status,reviewed_by:actor.user.id,reviewed_at:now,review_note:note||f.review_note||null,updated_at:now}).eq("id",id);
      await admin.from("ranova_risk_review_events").insert({flag_id:id,actor_user_id:actor.user.id,action:"risk_"+status,note:note||null,metadata:{signal_code:f.signal_code,severity:f.severity}});
      await log(actor.user.id,"risk_flag_reviewed","risk_flag",id,{flag_ref:f.flag_ref,status,note,signal_code:f.signal_code});
      return response(h,200,{ok:true});
    }

    if(action==="review_safety_report"){
      if(!canOrderReview(actor.role)&&!canSellerReview(actor.role))return response(h,403,{ok:false,error:"Safety-review permission is required."});
      const id=clean(b.id,80),status=clean(b.status,30),note=clean(b.note,1800);
      if(!["under_review","resolved","dismissed"].includes(status))return response(h,400,{ok:false,error:"Invalid safety report status."});
      if(["resolved","dismissed"].includes(status)&&note.length<5)return response(h,400,{ok:false,error:"Add a clear review note."});
      const {data:r}=await admin.from("ranova_safety_reports").select("*").eq("id",id).maybeSingle();
      if(!r)return response(h,404,{ok:false,error:"Safety report not found."});
      const now=new Date().toISOString();
      await admin.from("ranova_safety_reports").update({status,admin_note:note||r.admin_note||null,reviewed_by:actor.user.id,reviewed_at:now,updated_at:now}).eq("id",id);
      await admin.from("ranova_risk_review_events").insert({safety_report_id:id,actor_user_id:actor.user.id,action:"report_"+status,note:note||null,metadata:{category:r.category,report_ref:r.report_ref}});
      await log(actor.user.id,"safety_report_reviewed","safety_report",id,{report_ref:r.report_ref,status,note,category:r.category});
      return response(h,200,{ok:true});
    }

    if(action==="review_after_sales"){
      if(!canOrderReview(actor.role)&&!canFinance(actor.role))return response(h,403,{ok:false,error:"Order-support permission is required."});
      const id=clean(b.id,80),decision=clean(b.decision,40),note=clean(b.note,1800);
      if(!["under_review","accepted","declined","resolved","closed"].includes(decision))return response(h,400,{ok:false,error:"Invalid after-sales decision."});
      const {data:c}=await admin.from("ranova_after_sales_cases").select("*").eq("id",id).maybeSingle();
      if(!c)return response(h,404,{ok:false,error:"After-sales case not found."});
      if(["declined","resolved","closed"].includes(decision)&&!note)return response(h,400,{ok:false,error:"Add a clear resolution note."});
      const now=new Date().toISOString();
      await admin.from("ranova_after_sales_cases").update({status:decision,resolution_note:note||c.resolution_note||null,updated_at:now,resolved_at:["declined","resolved","closed"].includes(decision)?now:c.resolved_at}).eq("id",id);
      await admin.from("ranova_after_sales_events").insert({case_id:id,actor_type:"admin",actor_user_id:actor.user.id,event_type:"admin_"+decision,note:note||null});
      const {data:order}=await admin.from("ranova_customer_orders").select("*").eq("id",c.customer_order_id).maybeSingle();
      if(order)await notifyBuyer(order,"after_sales_"+decision,"RANOVA after-sales update","Case "+c.case_ref+" is now "+decision.replace(/_/g," ")+(note?". "+note:""),{case_ref:c.case_ref,status:decision});
      const email=await emailForUser(c.seller_user_id);
      await queueNotice("seller",c.seller_user_id,email,c.customer_order_id,c.seller_order_id,"after_sales_"+decision,"RANOVA after-sales update","Case "+c.case_ref+" is now "+decision.replace(/_/g," ")+(note?". "+note:""),{case_ref:c.case_ref,status:decision},"/appliances/all/after-sales.html","after-sales-admin:"+id+":"+decision);
      await log(actor.user.id,"after_sales_reviewed","after_sales_case",id,{case_ref:c.case_ref,decision,note});
      return response(h,200,{ok:true});
    }

    if(action==="process_provider_refund"){
      if(!canFinance(actor.role))return response(h,403,{ok:false,error:"Finance permission is required."});
      if(!PAYSTACK_SECRET_KEY)return response(h,503,{ok:false,error:"Paystack is not configured."});
      const id=clean(b.id,80);
      const {data:r}=await admin.from("ranova_marketplace_refunds").select("*").eq("id",id).maybeSingle();
      if(!r)return response(h,404,{ok:false,error:"Refund request not found."});
      if(r.status!=="approved")return response(h,409,{ok:false,error:"The refund must be approved before it can be sent to the payment provider."});
      const amount=Number(r.approved_amount??r.requested_amount??0);
      if(!(amount>0))return response(h,400,{ok:false,error:"Approved refund amount must be greater than zero."});
      const {data:payment}=await admin.from("ranova_marketplace_payments").select("*").eq("parent_order_id",r.customer_order_id).maybeSingle();
      if(!payment||payment.payment_status!=="confirmed"||payment.provider!=="paystack"||!payment.provider_reference){
        return response(h,409,{ok:false,error:"This refund cannot be automated because the original payment was not a confirmed Paystack transaction. Use the audited manual refund path instead."});
      }
      const rr=await paystack("/refund",{method:"POST",body:JSON.stringify({
        transaction:payment.provider_reference,amount:Math.round(amount*100),currency:r.currency||"GHS",
        customer_note:"RANOVA approved refund "+r.refund_ref,
        merchant_note:"RANOVA marketplace refund "+r.refund_ref
      })});
      const d=rr.data||{},now=new Date().toISOString();
      await admin.from("ranova_marketplace_refunds").update({
        status:"processing",provider:"paystack",provider_refund_id:String(d.id||"")||null,
        provider_status:String(d.status||"pending"),provider_payload:d,
        refund_reference:String(d.reference||d.id||r.refund_reference||"")||null,
        reviewed_at:now,reviewed_by:actor.user.id,updated_at:now
      }).eq("id",r.id);
      await admin.from("ranova_seller_payouts").update({
        payout_status:"held",payout_note:"Held while refund "+r.refund_ref+" is processed.",updated_at:now
      }).eq("seller_order_id",r.seller_order_id).in("payout_status",["pending","eligible","processing"]);
      await log(actor.user.id,"refund_provider_initiated","marketplace_refund",r.id,{refund_ref:r.refund_ref,amount,provider:"paystack",provider_refund_id:d.id||null});
      return response(h,200,{ok:true,status:"processing",provider:"paystack",provider_refund_id:d.id||null});
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
    if(action==="preview_commission")return response(h,400,{ok:false,error:e instanceof Error?e.message:"The commission preview could not be calculated."});
    return response(h,500,{ok:false,error:"Marketplace moderation request could not be completed."});
  }
});
