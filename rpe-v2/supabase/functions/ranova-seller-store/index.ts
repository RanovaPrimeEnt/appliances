import { sellerDocumentCompliance } from "../_shared/seller-documents.ts";
import { sellerAccessApproved } from "../_shared/seller-approval.ts";
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
function clean(v:any,max=500){return String(v??"").trim().slice(0,max)}
function slugify(v:any){
  return clean(v,120).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,80);
}
function num(v:any){
  if(v===null||v===undefined||v==="")return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function int(v:any,min=0,max=1000000){
  if(v===null||v===undefined||v==="")return null;
  const n=Math.trunc(Number(v));
  return Number.isFinite(n)?Math.max(min,Math.min(max,n)):null;
}
function safeAssetUrl(v:any){
  const s=clean(v,1000);
  if(!s)return "";
  const prefix=SUPABASE_URL+"/storage/v1/object/public/seller-store-assets/";
  return s.startsWith(prefix)?s:"";
}
function safeAssetUrls(v:any){
  if(!Array.isArray(v))return [];
  return v.map(safeAssetUrl).filter(Boolean).slice(0,8);
}
async function getUser(req:Request){
  const auth=req.headers.get("authorization")||"";
  if(!auth.startsWith("Bearer "))return null;
  const res=await fetch(SUPABASE_URL+"/auth/v1/user",{headers:{Authorization:auth,apikey:SERVICE_KEY}});
  if(!res.ok)return null;
  return await res.json();
}
async function serviceGet(path:string,params:Record<string,string>={}){
  const u=new URL(SUPABASE_URL+"/rest/v1/"+path);
  Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,v));
  const r=await fetch(u.toString(),{headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY}});
  const j=await r.json().catch(()=>[]);
  if(!r.ok)throw new Error("Database request failed.");
  return j;
}
async function resolveSeller(userId:string){
  const accounts=await serviceGet("ranova_seller_accounts",{select:"application_ref",user_id:"eq."+userId,limit:"1"});
  if(!accounts.length)return null;
  const ref=accounts[0].application_ref;
  const apps=await serviceGet("ranova_seller_applications",{
    select:"application_ref,business_name,contact_person,phone,email,business_location,supplier_type,categories,status,verification_status,store_setup_status,verification_notes,reviewed_at,created_at",
    application_ref:"eq."+ref,
    limit:"1"
  });
  if(!apps.length)return null;
  const application=apps[0];
  const stores=await serviceGet("ranova_seller_stores",{select:"store_status,moderated_by,moderated_at",seller_id:"eq."+userId,application_ref:"eq."+ref,limit:"1"});
  const approved=sellerAccessApproved(application,stores[0]||null);
  const verificationFiles=await serviceGet("ranova_seller_verification_files",{select:"id,document_type,original_filename,created_at",seller_id:"eq."+userId,application_ref:"eq."+ref});
  const document_compliance=sellerDocumentCompliance(application,verificationFiles);
  return {application_ref:ref,application,approved,document_compliance,store_accessible:approved&&!document_compliance.blocked};
}
async function patchApplication(ref:string,body:any){
  await fetch(SUPABASE_URL+"/rest/v1/ranova_seller_applications?application_ref=eq."+encodeURIComponent(ref),{
    method:"PATCH",
    headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json"},
    body:JSON.stringify({...body,updated_at:new Date().toISOString()})
  });
}
async function syncParentOrder(parentId:string|null){
  if(!parentId)return;
  const parents=await serviceGet("ranova_customer_orders",{select:"id,order_source",id:"eq."+parentId,limit:"1"});
  const parent=parents[0];
  if(!parent)return;
  const children=await serviceGet("ranova_seller_orders",{
    select:"subtotal,delivery_fee,total,order_status,required_payment_percent_snapshot,payment_processing_rate_snapshot,payment_fixed_fee_snapshot,payment_fee_payer_snapshot",
    parent_order_id:"eq."+parentId,
    order:"created_at.asc"
  });
  if(!children.length)return;

  const states=children.map((x:any)=>x.order_status);
  let status="awaiting_confirmation";
  if(states.every((x:string)=>x==="delivered"))status="delivered";
  else if(states.every((x:string)=>x==="cancelled"))status="cancelled";
  else if(states.some((x:string)=>x==="dispatched"))status="dispatched";
  else if(states.some((x:string)=>x==="ready_for_dispatch"))status="ready_for_dispatch";
  else if(states.some((x:string)=>x==="preparing"))status="preparing";
  else if(states.every((x:string)=>["confirmed","delivered"].includes(x)))status="awaiting_payment";

  const patch:any={status};
  if(status==="awaiting_payment")patch.payment_status="pending";
  if(parent.order_source==="seller_store"){
    if(children.every((x:any)=>x.subtotal!==null))patch.product_total=Number(children.reduce((s:number,x:any)=>s+Number(x.subtotal||0),0).toFixed(2));
    if(children.every((x:any)=>x.delivery_fee!==null))patch.delivery_fee=Number(children.reduce((s:number,x:any)=>s+Number(x.delivery_fee||0),0).toFixed(2));
    if(children.every((x:any)=>x.total!==null)){
      const baseTotal=Number(children.reduce((s:number,x:any)=>s+Number(x.total||0),0).toFixed(2));
      const allFees=children.reduce((s:number,x:any)=>{
        const rate=Number(x.payment_processing_rate_snapshot||0);
        const fixed=Number(x.payment_fixed_fee_snapshot||0);
        return s+Number((Number(x.total||0)*rate/100+fixed).toFixed(2));
      },0);
      const buyerFees=children.reduce((s:number,x:any)=>{
        if(x.payment_fee_payer_snapshot!=="buyer")return s;
        const rate=Number(x.payment_processing_rate_snapshot||0);
        const fixed=Number(x.payment_fixed_fee_snapshot||0);
        return s+Number((Number(x.total||0)*rate/100+fixed).toFixed(2));
      },0);
      const rates=children.map((x:any)=>Number(x.payment_processing_rate_snapshot||0));
      const required=children.map((x:any)=>Number(x.required_payment_percent_snapshot==null?100:x.required_payment_percent_snapshot));
      const payers=[...new Set(children.map((x:any)=>x.payment_fee_payer_snapshot||"platform"))];
      patch.payment_processing_fee=Number(allFees.toFixed(2));
      patch.payment_processing_rate=rates.length?Math.max(...rates):0;
      patch.required_payment_percent=required.length?Math.max(...required):100;
      patch.payment_fee_payer=payers.length===1?payers[0]:"mixed";
      patch.total_payment=Number((baseTotal+buyerFees).toFixed(2));
    }
  }
  await fetch(SUPABASE_URL+"/rest/v1/ranova_customer_orders?id=eq."+encodeURIComponent(parentId),{
    method:"PATCH",
    headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json"},
    body:JSON.stringify(patch)
  });
}
async function loadDashboard(userId:string,seller:any){
  const stores=await serviceGet("ranova_seller_stores",{select:"*",seller_id:"eq."+userId,limit:"1"});
  const store=stores[0]||null;
  const products=store?await serviceGet("ranova_seller_products",{
    select:"id,name,slug,sku,category,short_description,description,price,currency,moq,stock_quantity,stock_status,unit_label,primary_image_url,image_urls,specifications,pricing_tiers,product_status,moderation_note,created_at,updated_at",
    seller_id:"eq."+userId,
    order:"created_at.desc"
  }):[];
  const orders=store?await serviceGet("ranova_seller_orders",{
    select:"id,parent_order_id,order_ref,platform_order_ref,buyer_name,buyer_phone,buyer_email,delivery_location,payment_method,items,item_count,subtotal,delivery_fee,total,currency,payment_status,order_status,buyer_note,seller_note,seller_country_code,seller_country_name,buyer_country_code,buyer_country_name,country_rule_id,commission_rate_snapshot,required_payment_percent_snapshot,payment_processing_rate_snapshot,payment_fixed_fee_snapshot,payment_fee_payer_snapshot,created_at,updated_at",
    seller_id:"eq."+userId,
    order:"created_at.desc",
    limit:"50"
  }):[];
  const counts={
    products:products.length,
    active_products:products.filter((p:any)=>p.product_status==="active").length,
    pending_products:products.filter((p:any)=>p.product_status==="pending_review").length,
    orders:orders.length,
    open_orders:orders.filter((o:any)=>!["delivered","cancelled","returned"].includes(o.order_status)).length
  };
  let finance_profile=null,payouts=[],finance_settings=null,notifications=[],refunds=[],disputes=[],delivery_zones=[],deliveries=[],delivery_events=[],delivery_proofs=[],reviews=[],trust_metrics=null,performance=null,enforcement=null,enforcement_events=[],appeals=[],inventory_reservations=[],inventory_events=[];
  if(store){
    inventory_reservations=await serviceGet("ranova_inventory_reservations",{
      select:"id,order_ref,customer_order_id,seller_order_id,product_id,store_id,quantity,status,reserved_at,expires_at,committed_at,released_at,release_reason,updated_at",
      store_id:"eq."+store.id,order:"reserved_at.desc",limit:"200"
    });
    inventory_events=await serviceGet("ranova_inventory_events",{
      select:"id,reservation_id,product_id,store_id,order_ref,seller_order_id,event_type,quantity,stock_before,stock_after,note,actor_type,created_at",
      store_id:"eq."+store.id,order:"created_at.desc",limit:"300"
    });
    const profiles=await serviceGet("ranova_seller_finance_profiles",{select:"seller_id,store_id,payout_method,provider_name,account_name,account_reference,commission_rate_override,updated_at",seller_id:"eq."+userId,limit:"1"});
    finance_profile=profiles[0]||null;
    payouts=await serviceGet("ranova_seller_payouts",{
      select:"id,seller_order_id,platform_order_ref,seller_order_ref,gross_product_amount,delivery_fee,commission_rate,commission_amount,payment_processing_rate,payment_processing_fee,payment_fee_payer,adjustment_amount,payout_amount,currency,payout_status,eligible_at,payout_reference,payout_note,paid_at,created_at,updated_at",
      seller_id:"eq."+userId,
      order:"created_at.desc",
      limit:"100"
    });
    const settings=await serviceGet("ranova_marketplace_finance_settings",{select:"default_commission_rate,payout_hold_days,currency",id:"eq.1",limit:"1"});
    finance_settings=settings[0]||{default_commission_rate:0,payout_hold_days:0,currency:"GHS"};

    delivery_zones=await serviceGet("ranova_delivery_zones",{
      select:"id,store_id,zone_name,country_code,area_description,fulfilment_method,pricing_type,fixed_fee,currency,eta_min_days,eta_max_days,active,created_at,updated_at",
      store_id:"eq."+store.id,
      order:"zone_name.asc",
      limit:"100"
    });
    deliveries=await serviceGet("ranova_order_deliveries",{
      select:"id,customer_order_id,seller_order_id,store_id,zone_id,responsibility,fulfilment_method,delivery_status,quoted_delivery_fee,currency,destination_text,courier_name,courier_phone,courier_reference,tracking_url,eta_start_date,eta_end_date,proof_required,proof_verified,assigned_at,dispatched_at,picked_up_at,out_for_delivery_at,seller_marked_delivered_at,buyer_confirmed_at,admin_confirmed_at,delivered_at,delivery_note,created_at,updated_at",
      store_id:"eq."+store.id,
      order:"created_at.desc",
      limit:"100"
    });
    if(deliveries.length){
      const ids=deliveries.map((d:any)=>d.id);
      delivery_events=await serviceGet("ranova_delivery_events",{
        select:"id,delivery_id,seller_order_id,status,actor_type,note,location_text,metadata,occurred_at",
        delivery_id:"in.("+ids.join(",")+")",
        order:"occurred_at.asc",
        limit:"1000"
      });
      delivery_proofs=await serviceGet("ranova_delivery_proofs",{
        select:"id,delivery_id,seller_order_id,proof_type,recipient_name,note,uploaded_by_type,captured_at,review_status,review_note,reviewed_at,created_at",
        delivery_id:"in.("+ids.join(",")+")",
        order:"created_at.asc",
        limit:"500"
      });
    }

    reviews=await serviceGet("ranova_marketplace_reviews",{
      select:"id,review_ref,seller_order_id,buyer_display_name,overall_rating,product_rating,service_rating,delivery_rating,review_title,review_text,recommend,verified_purchase,moderation_status,moderation_note,submitted_at,published_at,seller_response,seller_responded_at",
      store_id:"eq."+store.id,
      order:"submitted_at.desc",
      limit:"200"
    });
    const tm=await serviceGet("ranova_seller_trust_metrics",{
      select:"store_id,published_review_count,overall_rating,product_rating,service_rating,delivery_rating,completed_orders,confirmed_deliveries,complaint_orders,dispute_orders,refund_orders,complaint_order_rate,delivery_confirmation_rate,updated_at",
      store_id:"eq."+store.id,
      limit:"1"
    });
    trust_metrics=tm[0]||null;
    const perf=await serviceGet("ranova_seller_performance",{
      select:"store_id,total_orders,completed_orders,cancelled_orders,returned_orders,cancellation_rate,return_rate,deliveries_with_eta,late_deliveries,late_delivery_rate,confirmed_deliveries,complaint_orders,complaint_order_rate,published_review_count,overall_rating,fulfillment_score,service_score,performance_level,trusted_badge,automated_reasons,calculated_at",
      store_id:"eq."+store.id,limit:"1"
    });
    performance=perf[0]||null;
    const enf=await serviceGet("ranova_seller_enforcement",{
      select:"store_id,enforcement_status,reason_code,reason_detail,starts_at,ends_at,imposed_at,lifted_at,lift_reason,updated_at",
      store_id:"eq."+store.id,limit:"1"
    });
    enforcement=enf[0]||null;
    enforcement_events=await serviceGet("ranova_seller_enforcement_events",{
      select:"id,action,reason_code,reason_detail,previous_status,new_status,actor_type,created_at",
      store_id:"eq."+store.id,order:"created_at.desc",limit:"100"
    });
    appeals=await serviceGet("ranova_seller_appeals",{
      select:"id,appeal_ref,enforcement_event_id,subject,appeal_text,status,admin_note,submitted_at,reviewed_at,updated_at",
      store_id:"eq."+store.id,order:"submitted_at.desc",limit:"100"
    });

    notifications=await serviceGet("ranova_marketplace_notifications",{
      select:"id,customer_order_id,seller_order_id,notification_type,title,message,metadata,read_at,created_at",
      recipient_user_id:"eq."+userId,
      recipient_type:"eq.seller",
      order:"created_at.desc",
      limit:"50"
    });

    const parentIds=[...new Set(orders.map((o:any)=>o.parent_order_id).filter(Boolean))];
    if(parentIds.length){
      const inParents="in.("+parentIds.join(",")+")";
      refunds=await serviceGet("ranova_marketplace_refunds",{
        select:"id,refund_ref,customer_order_id,seller_order_id,requested_amount,approved_amount,currency,reason_category,reason_detail,status,admin_note,refund_reference,requested_at,reviewed_at,refunded_at,updated_at",
        customer_order_id:inParents,
        order:"requested_at.desc",
        limit:"100"
      });
      disputes=await serviceGet("ranova_marketplace_disputes",{
        select:"id,dispute_ref,customer_order_id,seller_order_id,category,subject,description,status,resolution,resolution_note,opened_at,resolved_at,updated_at",
        customer_order_id:inParents,
        order:"opened_at.desc",
        limit:"100"
      });
      const disputeIds=disputes.map((d:any)=>d.id);
      if(disputeIds.length){
        const messages=await serviceGet("ranova_marketplace_dispute_messages",{
          select:"id,dispute_id,sender_type,message,created_at",
          dispute_id:"in.("+disputeIds.join(",")+")",
          order:"created_at.asc",
          limit:"500"
        });
        disputes=disputes.map((d:any)=>({...d,messages:messages.filter((m:any)=>m.dispute_id===d.id)}));
      }
    }
  }
  counts.open_support_cases=refunds.filter((r:any)=>!["refunded","rejected","cancelled"].includes(r.status)).length+
    disputes.filter((d:any)=>!["resolved","closed"].includes(d.status)).length;
  counts.active_deliveries=deliveries.filter((d:any)=>!["delivered_confirmed","returned","cancelled"].includes(d.delivery_status)).length;
  counts.awaiting_delivery_confirmation=deliveries.filter((d:any)=>d.delivery_status==="delivered_pending_confirmation").length;
  counts.published_reviews=reviews.filter((r:any)=>r.moderation_status==="published").length;
  counts.pending_reviews=reviews.filter((r:any)=>r.moderation_status==="pending").length;
  return {ok:true,linked:true,approved:seller.approved,store_accessible:seller.store_accessible,document_compliance:seller.document_compliance,application:seller.application,store,products,orders,counts,finance_profile,payouts,finance_settings,notifications,refunds,disputes,delivery_zones,deliveries,delivery_events,delivery_proofs,reviews,trust_metrics,performance,enforcement,enforcement_events,appeals,inventory_reservations,inventory_events};
}
function response(h:Record<string,string>,status:number,payload:any){
  return new Response(JSON.stringify(payload),{status,headers:h});
}
async function queueBuyerOrderNotice(order:any,type:string,title:string,message:string,metadata:any={}){
  const {data:parent}=await admin.from("ranova_customer_orders")
    .select("id,order_ref,buyer_user_id,customer_email").eq("id",order.parent_order_id).maybeSingle();
  if(!parent)return;
  let emailRequested=!!parent.customer_email;
  if(parent.buyer_user_id){
    const {data:pref}=await admin.from("ranova_buyer_preferences").select("email_order_updates").eq("user_id",parent.buyer_user_id).maybeSingle();
    if(pref?.email_order_updates===false)emailRequested=false;
  }
  const {error}=await admin.from("ranova_marketplace_notifications").insert({
    recipient_type:"buyer",recipient_user_id:parent.buyer_user_id||null,recipient_email:parent.customer_email||null,
    customer_order_id:parent.id,seller_order_id:order.id,notification_type:type,notification_category:"transactional",
    title,message,metadata,in_app_visible:true,email_requested:emailRequested,email_status:emailRequested?"queued":"not_requested",
    action_url:"/appliances/all/order-status.html?ref="+encodeURIComponent(parent.order_ref),
    dedupe_key:type+":"+order.id+":"+String(metadata.status||metadata.delivery_status||"")
  });
  if(error&&String(error.code||"")!=="23505")throw error;
}

Deno.serve(async(req:Request)=>{
  const h=headers(req.headers.get("origin"));
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:h});
  if(req.method!=="POST")return response(h,405,{ok:false,error:"Method not allowed"});
  if(req.headers.get("x-ranova-client")!=="ranova-site-v1")return response(h,403,{ok:false,error:"Invalid client"});

  const user=await getUser(req);
  if(!user?.id)return response(h,401,{ok:false,error:"Sign in to continue."});
  const seller=await resolveSeller(user.id);
  if(!seller)return response(h,403,{ok:false,error:"Link a seller application before using the Seller Dashboard."});

  let b:any={};
  try{b=await req.json()}catch{}
  const action=clean(b.action,50)||"dashboard";

  try{
    if(action==="dashboard"){
      if(seller.document_compliance.blocked)return response(h,200,{ok:true,linked:true,approved:seller.approved,store_accessible:false,document_compliance:seller.document_compliance,application:seller.application});
      return response(h,200,await loadDashboard(user.id,seller));
    }
    if(action==="mark_notifications_read"){
      const id=clean(b.id,80),now=new Date().toISOString();
      let q=admin.from("ranova_marketplace_notifications").update({read_at:now})
        .eq("recipient_user_id",user.id).eq("recipient_type","seller");
      if(id)q=q.eq("id",id);else q=q.is("read_at",null);
      const {error}=await q;if(error)throw error;
      return response(h,200,{ok:true});
    }

    if(seller.document_compliance.blocked){
      return response(h,403,{ok:false,error:"Your document submission deadline has passed. Upload the outstanding documents in Seller Center or email ranovaprimeenterprise360@gmail.com for help.",code:"seller_documents_overdue",document_compliance:seller.document_compliance});
    }
    if(!seller.approved){
      return response(h,403,{ok:false,error:"Store management unlocks after RANOVA approves your seller verification."});
    }

    if(action==="save_store"){
      const current=await serviceGet("ranova_seller_stores",{select:"*",seller_id:"eq."+user.id,limit:"1"});
      const existing=current[0]||null;
      const store_name=clean(b.store_name,120)||clean(seller.application.business_name,120);
      if(!store_name)return response(h,400,{ok:false,error:"Store name is required."});

      let slug=slugify(b.slug||existing?.slug||store_name);
      if(!slug)slug="ranova-store";
      if(!existing)slug=(slug+"-"+String(seller.application_ref).replace(/[^a-zA-Z0-9]/g,"").slice(-6).toLowerCase()).slice(0,80);

      const requestedStatus=clean(b.store_status,20);
      const store_status=["draft","active","paused"].includes(requestedStatus)?requestedStatus:(existing?.store_status||"draft");
      if(store_status==="active"&&existing){
        const enf=await serviceGet("ranova_seller_enforcement",{select:"enforcement_status,ends_at",store_id:"eq."+existing.id,limit:"1"});
        const e=enf[0];
        if(e&&["suspended","restricted"].includes(e.enforcement_status)&&(!e.ends_at||new Date(e.ends_at).getTime()>Date.now())){
          return response(h,403,{ok:false,error:"This store is paused or suspended by RANOVA and cannot be republished until the enforcement action is lifted or expires."});
        }
      }
      const public_phone=clean(b.public_phone,40)||clean(seller.application.phone,40);
      const public_email=clean(b.public_email,180)||clean(seller.application.email,180);
      const business_location=clean(seller.application.business_location,180)||clean(existing?.business_location,180)||clean(b.business_location,180);
      const description=clean(b.description,2500);
      const country_code=/^[A-Z]{2}$/.test(clean(b.country_code,2).toUpperCase())?clean(b.country_code,2).toUpperCase():(existing?.country_code||null);
      const country_name=clean(b.country_name,120)||existing?.country_name||null;
      if(store_status==="active"&&(!description||!business_location||!country_code||(!public_phone&&!public_email))){
        return response(h,400,{ok:false,error:"Before publishing, add a store description, business location, country and at least one public contact method."});
      }

      const payload={
        seller_id:user.id,
        application_ref:seller.application_ref,
        store_name,
        slug,
        tagline:clean(b.tagline,180)||null,
        description:description||null,
        logo_url:safeAssetUrl(b.logo_url)||null,
        banner_url:safeAssetUrl(b.banner_url)||null,
        public_phone:public_phone||null,
        public_email:public_email||null,
        business_location:business_location||null,
        country_code,
        country_name,
        google_place_id:clean(b.google_place_id,180)||existing?.google_place_id||null,
        country_source:clean(b.country_source,40)||existing?.country_source||null,
        fulfilment_summary:clean(b.fulfilment_summary,700)||null,
        return_policy_summary:clean(b.return_policy_summary,700)||null,
        minimum_order_note:clean(b.minimum_order_note,300)||null,
        store_status,
        updated_at:new Date().toISOString()
      };

      let r:Response;
      if(existing){
        r=await fetch(SUPABASE_URL+"/rest/v1/ranova_seller_stores?seller_id=eq."+encodeURIComponent(user.id),{
          method:"PATCH",
          headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json",Prefer:"return=representation"},
          body:JSON.stringify(payload)
        });
      }else{
        r=await fetch(SUPABASE_URL+"/rest/v1/ranova_seller_stores",{
          method:"POST",
          headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json",Prefer:"return=representation"},
          body:JSON.stringify(payload)
        });
      }
      const rows=await r.json().catch(()=>[]);
      if(!r.ok){
        const msg=String(rows?.message||rows?.details||"");
        if(/duplicate|unique/i.test(msg))return response(h,409,{ok:false,error:"That store web address is already in use. Choose another store slug."});
        throw new Error("Could not save store.");
      }
      await patchApplication(seller.application_ref,{store_setup_status:store_status==="active"?"complete":"in_progress"});
      return response(h,200,{ok:true,store:rows[0]||payload});
    }

    const stores=await serviceGet("ranova_seller_stores",{select:"id,store_status",seller_id:"eq."+user.id,limit:"1"});
    if(!stores.length)return response(h,400,{ok:false,error:"Create your store profile first."});
    const store=stores[0];

    if(action==="save_delivery_zone"){
      const id=clean(b.id,80);
      const zone_name=clean(b.zone_name,120);
      const country_code=clean(b.country_code,2).toUpperCase();
      const area_description=clean(b.area_description,700);
      const fulfilment_method=clean(b.fulfilment_method,40)||"seller_delivery";
      const pricing_type=clean(b.pricing_type,20)||"quote";
      const fixed_fee=num(b.fixed_fee);
      const eta_min_days=int(b.eta_min_days,0,365);
      const eta_max_days=int(b.eta_max_days,0,365);
      if(!zone_name||!/^[A-Z]{2}$/.test(country_code))return response(h,400,{ok:false,error:"Zone name and country are required."});
      if(!["seller_delivery","third_party_courier","ranova_delivery","pickup"].includes(fulfilment_method))return response(h,400,{ok:false,error:"Invalid fulfilment method."});
      if(!["quote","fixed","free"].includes(pricing_type))return response(h,400,{ok:false,error:"Invalid delivery pricing type."});
      if(pricing_type==="fixed"&&(fixed_fee===null||fixed_fee<0))return response(h,400,{ok:false,error:"Enter a valid fixed delivery fee."});
      if(eta_min_days!==null&&eta_max_days!==null&&eta_max_days<eta_min_days)return response(h,400,{ok:false,error:"Maximum ETA cannot be earlier than minimum ETA."});
      const payload:any={
        store_id:store.id,zone_name,country_code,area_description:area_description||null,
        fulfilment_method,pricing_type,
        fixed_fee:pricing_type==="fixed"?Number(fixed_fee!.toFixed(2)):pricing_type==="free"?0:null,
        currency:"GHS",eta_min_days,eta_max_days,active:true,updated_at:new Date().toISOString()
      };
      if(id){
        const rows=await serviceGet("ranova_delivery_zones",{select:"id",id:"eq."+id,store_id:"eq."+store.id,limit:"1"});
        if(!rows.length)return response(h,404,{ok:false,error:"Delivery zone not found."});
        const {error}=await admin.from("ranova_delivery_zones").update(payload).eq("id",id).eq("store_id",store.id);
        if(error)throw error;
        return response(h,200,{ok:true});
      }
      const {error}=await admin.from("ranova_delivery_zones").insert(payload);
      if(error){
        if(String(error.message||"").toLowerCase().includes("duplicate"))return response(h,409,{ok:false,error:"An active delivery zone with that name already exists."});
        throw error;
      }
      return response(h,200,{ok:true});
    }

    if(action==="archive_delivery_zone"){
      const id=clean(b.id,80);
      const rows=await serviceGet("ranova_delivery_zones",{select:"id",id:"eq."+id,store_id:"eq."+store.id,limit:"1"});
      if(!rows.length)return response(h,404,{ok:false,error:"Delivery zone not found."});
      const {error}=await admin.from("ranova_delivery_zones").update({active:false,updated_at:new Date().toISOString()}).eq("id",id).eq("store_id",store.id);
      if(error)throw error;
      return response(h,200,{ok:true});
    }

    if(action==="save_delivery_plan"){
      const orderId=clean(b.order_id,80);
      const rows=await serviceGet("ranova_seller_orders",{select:"*",id:"eq."+orderId,seller_id:"eq."+user.id,limit:"1"});
      const order=rows[0];
      if(!order)return response(h,404,{ok:false,error:"Order not found."});
      if(String(order.payment_status)==="paid")return response(h,409,{ok:false,error:"Delivery price and fulfilment plan are locked after RANOVA confirms customer payment. Courier/tracking details can still be updated."});
      if(["delivered","cancelled","returned"].includes(order.order_status))return response(h,409,{ok:false,error:"Delivery plan can no longer be changed for this order."});

      const zoneId=clean(b.zone_id,80)||null;
      let zone:any=null;
      if(zoneId){
        const zones=await serviceGet("ranova_delivery_zones",{select:"*",id:"eq."+zoneId,store_id:"eq."+store.id,active:"eq.true",limit:"1"});
        zone=zones[0]||null;
        if(!zone)return response(h,400,{ok:false,error:"Selected delivery zone is not available."});
      }
      const fulfilment=zone?.fulfilment_method||clean(b.fulfilment_method,40)||"seller_delivery";
      const responsibility=fulfilment==="ranova_delivery"?"ranova":fulfilment==="third_party_courier"?"third_party":fulfilment==="pickup"?"buyer_pickup":"seller";
      let fee=num(b.delivery_fee);
      if(zone?.pricing_type==="fixed")fee=Number(zone.fixed_fee||0);
      if(zone?.pricing_type==="free")fee=0;
      if(fee===null||fee<0)return response(h,400,{ok:false,error:"Enter a valid delivery fee or select a fixed/free delivery zone."});
      const etaStart=clean(b.eta_start_date,10)||null,etaEnd=clean(b.eta_end_date,10)||null;
      if(etaStart&&etaEnd&&new Date(etaEnd)<new Date(etaStart))return response(h,400,{ok:false,error:"Delivery ETA end date cannot be before the start date."});

      const total=order.subtotal===null?null:Number((Number(order.subtotal||0)+fee).toFixed(2));
      const now=new Date().toISOString();
      const {error:orderErr}=await admin.from("ranova_seller_orders").update({
        delivery_fee:Number(fee.toFixed(2)),total,updated_at:now
      }).eq("id",order.id).eq("seller_id",user.id);
      if(orderErr)throw orderErr;

      const existing=await serviceGet("ranova_order_deliveries",{select:"id,delivery_status",seller_order_id:"eq."+order.id,limit:"1"});
      const deliveryStatus=order.order_status==="confirmed"||order.payment_status==="paid"?"awaiting_dispatch":"pending_quote";
      const deliveryPayload:any={
        customer_order_id:order.parent_order_id,store_id:store.id,zone_id:zoneId,
        responsibility,fulfilment_method:fulfilment,quoted_delivery_fee:Number(fee.toFixed(2)),
        destination_text:order.delivery_location,eta_start_date:etaStart,eta_end_date:etaEnd,
        delivery_note:clean(b.delivery_note,1000)||null,
        proof_required:fulfilment!=="pickup",
        updated_at:now
      };
      let deliveryId=existing[0]?.id;
      if(deliveryId){
        const {error}=await admin.from("ranova_order_deliveries").update(deliveryPayload).eq("id",deliveryId);
        if(error)throw error;
      }else{
        const {data,error}=await admin.from("ranova_order_deliveries").insert({
          ...deliveryPayload,seller_order_id:order.id,delivery_status:deliveryStatus
        }).select("id").single();
        if(error)throw error; deliveryId=data.id;
      }
      await admin.from("ranova_delivery_events").insert({
        delivery_id:deliveryId,seller_order_id:order.id,status:deliveryStatus,actor_type:"seller",actor_user_id:user.id,
        note:"Delivery plan updated. Fee: GHS "+Number(fee).toFixed(2)+"."
      });
      await syncParentOrder(order.parent_order_id||null);
      return response(h,200,{ok:true,delivery_id:deliveryId,delivery_fee:Number(fee.toFixed(2))});
    }

    if(action==="update_delivery_courier"){
      const orderId=clean(b.order_id,80);
      const rows=await serviceGet("ranova_seller_orders",{select:"id,parent_order_id,payment_status,order_status,buyer_email,order_ref",id:"eq."+orderId,seller_id:"eq."+user.id,limit:"1"});
      const order=rows[0];
      if(!order)return response(h,404,{ok:false,error:"Order not found."});
      const deliveries=await serviceGet("ranova_order_deliveries",{select:"*",seller_order_id:"eq."+order.id,store_id:"eq."+store.id,limit:"1"});
      const delivery=deliveries[0];
      if(!delivery)return response(h,400,{ok:false,error:"Save the delivery plan first."});
      if(["delivered_pending_confirmation","delivered_confirmed","returned","cancelled"].includes(delivery.delivery_status)){
        return response(h,409,{ok:false,error:"Courier details are locked once delivery is awaiting/final confirmation or the delivery is closed."});
      }
      const courier_name=clean(b.courier_name,160),courier_phone=clean(b.courier_phone,60),courier_reference=clean(b.courier_reference,180),tracking_url=clean(b.tracking_url,1000);
      if(tracking_url&&!/^https:\/\//i.test(tracking_url))return response(h,400,{ok:false,error:"Tracking link must use HTTPS."});
      const now=new Date().toISOString();
      const nextStatus=delivery.delivery_status==="pending_quote"?"awaiting_dispatch":delivery.delivery_status;
      const {error}=await admin.from("ranova_order_deliveries").update({
        courier_name:courier_name||null,courier_phone:courier_phone||null,courier_reference:courier_reference||null,
        tracking_url:tracking_url||null,delivery_status:nextStatus,assigned_at:courier_name?now:delivery.assigned_at,updated_at:now
      }).eq("id",delivery.id);
      if(error)throw error;
      await admin.from("ranova_delivery_events").insert({
        delivery_id:delivery.id,seller_order_id:order.id,status:nextStatus,actor_type:"seller",actor_user_id:user.id,
        note:courier_name?"Courier assigned: "+courier_name+".":"Delivery details updated."
      });
      return response(h,200,{ok:true});
    }

    if(action==="create_delivery_proof_upload"){
      const orderId=clean(b.order_id,80),mime=clean(b.mime_type,80);
      const size=Number(b.file_size||0);
      if(!["image/jpeg","image/png","image/webp"].includes(mime))return response(h,400,{ok:false,error:"Proof must be a JPG, PNG or WebP image."});
      if(!Number.isFinite(size)||size<=0||size>5*1024*1024)return response(h,400,{ok:false,error:"Proof image must be 5 MB or smaller."});
      const rows=await serviceGet("ranova_seller_orders",{select:"id",id:"eq."+orderId,seller_id:"eq."+user.id,limit:"1"});
      if(!rows.length)return response(h,404,{ok:false,error:"Order not found."});
      const deliveries=await serviceGet("ranova_order_deliveries",{select:"id",seller_order_id:"eq."+orderId,store_id:"eq."+store.id,limit:"1"});
      if(!deliveries.length)return response(h,400,{ok:false,error:"Save the delivery plan first."});
      const ext=mime==="image/png"?"png":mime==="image/webp"?"webp":"jpg";
      const path=user.id+"/"+orderId+"/"+Date.now()+"_"+crypto.randomUUID().slice(0,8)+"."+ext;
      const {data,error}=await admin.storage.from("ranova-delivery-proof").createSignedUploadUrl(path);
      if(error||!data?.token)throw new Error("Could not prepare secure proof upload.");
      return response(h,200,{ok:true,path,token:data.token});
    }

    if(action==="record_delivery_proof"){
      const orderId=clean(b.order_id,80),path=clean(b.storage_path,500),proofType=clean(b.proof_type,40)||"photo";
      const rows=await serviceGet("ranova_seller_orders",{select:"id",id:"eq."+orderId,seller_id:"eq."+user.id,limit:"1"});
      if(!rows.length)return response(h,404,{ok:false,error:"Order not found."});
      if(!path.startsWith(user.id+"/"+orderId+"/"))return response(h,403,{ok:false,error:"Invalid proof path."});
      if(!["photo","courier_receipt","recipient_name","signature","other"].includes(proofType))return response(h,400,{ok:false,error:"Invalid proof type."});
      const deliveries=await serviceGet("ranova_order_deliveries",{select:"id",seller_order_id:"eq."+orderId,store_id:"eq."+store.id,limit:"1"});
      const delivery=deliveries[0];if(!delivery)return response(h,400,{ok:false,error:"Delivery record not found."});
      const parts=path.split("/"),name=parts.pop()||"",folder=parts.join("/");
      const {data:list,error:listErr}=await admin.storage.from("ranova-delivery-proof").list(folder,{search:name,limit:10});
      if(listErr||!(list||[]).some((x:any)=>x.name===name))return response(h,400,{ok:false,error:"Proof upload was not found. Upload the image again."});
      const {error}=await admin.from("ranova_delivery_proofs").insert({
        delivery_id:delivery.id,seller_order_id:orderId,proof_type:proofType,storage_path:path,
        recipient_name:clean(b.recipient_name,180)||null,note:clean(b.note,1000)||null,
        uploaded_by_type:"seller",uploaded_by_user_id:user.id,captured_at:b.captured_at?new Date(b.captured_at).toISOString():new Date().toISOString()
      });
      if(error)throw error;
      await admin.from("ranova_delivery_events").insert({
        delivery_id:delivery.id,seller_order_id:orderId,status:"proof_submitted",actor_type:"seller",actor_user_id:user.id,note:"Delivery proof submitted for review."
      });
      return response(h,200,{ok:true});
    }

    if(action==="delivery_proof_url"){
      const proofId=clean(b.proof_id,80);
      const proofs=await serviceGet("ranova_delivery_proofs",{select:"id,storage_path,seller_order_id",id:"eq."+proofId,limit:"1"});
      const proof=proofs[0];if(!proof?.storage_path)return response(h,404,{ok:false,error:"Delivery proof not found."});
      const rows=await serviceGet("ranova_seller_orders",{select:"id",id:"eq."+proof.seller_order_id,seller_id:"eq."+user.id,limit:"1"});
      if(!rows.length)return response(h,403,{ok:false,error:"This proof does not belong to your store."});
      const {data,error}=await admin.storage.from("ranova-delivery-proof").createSignedUrl(proof.storage_path,600);
      if(error||!data?.signedUrl)throw new Error("Could not open delivery proof.");
      return response(h,200,{ok:true,url:data.signedUrl,expires_in:600});
    }

    if(action==="update_delivery_status"){
      const orderId=clean(b.order_id,80),next=clean(b.status,50),note=clean(b.note,1000);
      const rows=await serviceGet("ranova_seller_orders",{select:"*",id:"eq."+orderId,seller_id:"eq."+user.id,limit:"1"});
      const order=rows[0];if(!order)return response(h,404,{ok:false,error:"Order not found."});
      const deliveries=await serviceGet("ranova_order_deliveries",{select:"*",seller_order_id:"eq."+order.id,store_id:"eq."+store.id,limit:"1"});
      const delivery=deliveries[0];if(!delivery)return response(h,400,{ok:false,error:"Save the delivery plan first."});
      const allowed:any={
        pending_quote:["awaiting_dispatch","cancelled"],
        awaiting_dispatch:["assigned","picked_up","in_transit","cancelled"],
        assigned:["picked_up","in_transit","cancelled"],
        picked_up:["in_transit","out_for_delivery","delivered_pending_confirmation","returned"],
        in_transit:["out_for_delivery","failed_attempt","returned"],
        out_for_delivery:["delivered_pending_confirmation","failed_attempt","returned"],
        failed_attempt:["out_for_delivery","returned"],
        delivered_pending_confirmation:[],
        delivered_confirmed:[],
        returned:[],
        cancelled:[]
      };
      if(!(allowed[delivery.delivery_status]||[]).includes(next))return response(h,400,{ok:false,error:"That delivery-status change is not allowed from "+String(delivery.delivery_status).replace(/_/g," ")+". "});
      if(["failed_attempt","returned","cancelled"].includes(next)&&!note)return response(h,400,{ok:false,error:"Add a reason for this delivery status."});
      if(next==="cancelled"&&String(order.payment_status)==="paid")return response(h,409,{ok:false,error:"A paid order cannot be cancelled unilaterally. Use the refund/dispute process so the buyer and RANOVA have a record."});
      if(["picked_up","in_transit","out_for_delivery","delivered_pending_confirmation"].includes(next)&&String(order.payment_status)!=="paid"){
        return response(h,409,{ok:false,error:"RANOVA must confirm customer payment before this order can be dispatched."});
      }
      if(next==="delivered_pending_confirmation"&&delivery.proof_required){
        const proofs=await serviceGet("ranova_delivery_proofs",{select:"id",delivery_id:"eq."+delivery.id,limit:"1"});
        if(!proofs.length)return response(h,409,{ok:false,error:"Upload delivery proof before marking the order delivered."});
      }
      const now=new Date().toISOString(),patch:any={delivery_status:next,delivery_note:note||delivery.delivery_note||null,updated_at:now};
      if(next==="assigned")patch.assigned_at=now;
      if(next==="picked_up"){patch.picked_up_at=now;patch.dispatched_at=delivery.dispatched_at||now}
      if(next==="in_transit")patch.dispatched_at=delivery.dispatched_at||now;
      if(next==="out_for_delivery")patch.out_for_delivery_at=now;
      if(next==="delivered_pending_confirmation")patch.seller_marked_delivered_at=now;
      const {error}=await admin.from("ranova_order_deliveries").update(patch).eq("id",delivery.id);
      if(error)throw error;
      const sellerStatus=next==="awaiting_dispatch"?"ready_for_dispatch":
        ["assigned","picked_up","in_transit","out_for_delivery","delivered_pending_confirmation"].includes(next)?"dispatched":
        next==="returned"?"returned":next==="cancelled"?"cancelled":order.order_status;
      if(sellerStatus!==order.order_status){
        if(next==="cancelled"){
          const {error:releaseErr}=await admin.rpc("ranova_release_order_inventory",{
            p_order_ref:order.platform_order_ref,p_seller_order_id:order.id,
            p_reason:note||"Delivery cancelled before completion.",p_restore_committed:false,
            p_actor_type:"seller",p_actor_user_id:user.id
          });
          if(releaseErr)throw releaseErr;
        }
        if(next==="returned"){
          const {error:restoreErr}=await admin.rpc("ranova_release_order_inventory",{
            p_order_ref:order.platform_order_ref,p_seller_order_id:order.id,
            p_reason:note||"Returned goods restored to seller inventory.",p_restore_committed:true,
            p_actor_type:"seller",p_actor_user_id:user.id
          });
          if(restoreErr)throw restoreErr;
        }
        await admin.from("ranova_seller_orders").update({order_status:sellerStatus,updated_at:now}).eq("id",order.id);
        await syncParentOrder(order.parent_order_id||null);
      }
      await admin.from("ranova_delivery_events").insert({
        delivery_id:delivery.id,seller_order_id:order.id,status:next,actor_type:"seller",actor_user_id:user.id,note:note||null
      });
      await queueBuyerOrderNotice(order,"delivery_status","RANOVA delivery update",
        "Delivery for seller order "+order.order_ref+" is now "+next.replace(/_/g," ")+(note?". "+note:""),
        {seller_order_ref:order.order_ref,delivery_status:next});
      return response(h,200,{ok:true});
    }


    if(action==="save_finance_profile"){
      const payout_method=clean(b.payout_method,40);
      const provider_name=clean(b.provider_name,120);
      const account_name=clean(b.account_name,160);
      const account_reference=clean(b.account_reference,160);
      if(!["Mobile Money","Bank Transfer"].includes(payout_method)||!provider_name||!account_name||!account_reference){
        return response(h,400,{ok:false,error:"Complete your payout method, provider, account name and account number/phone."});
      }
      const payload={
        seller_id:user.id,
        store_id:store.id,
        payout_method,
        provider_name,
        account_name,
        account_reference,
        updated_at:new Date().toISOString()
      };
      const r=await fetch(SUPABASE_URL+"/rest/v1/ranova_seller_finance_profiles",{
        method:"POST",
        headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json",Prefer:"resolution=merge-duplicates,return=representation"},
        body:JSON.stringify(payload)
      });
      const out=await r.json().catch(()=>[]);
      if(!r.ok)throw new Error("Could not save payout details.");
      return response(h,200,{ok:true,finance_profile:out[0]||payload});
    }

    if(action==="update_product_price"){
      const id=clean(b.id,80);
      if(!id)return response(h,400,{ok:false,error:"Product ID is required."});
      const rows=await serviceGet("ranova_seller_products",{select:"id,name,price,product_status",id:"eq."+id,seller_id:"eq."+user.id,limit:"1"});
      const existing=rows[0]||null;
      if(!existing)return response(h,404,{ok:false,error:"Product not found."});

      const rawPrice=b.price;
      const nextPrice=(rawPrice===null||rawPrice===undefined||String(rawPrice).trim()==="")?null:num(rawPrice);
      if(nextPrice!==null&&(!Number.isFinite(nextPrice)||nextPrice<0)){
        return response(h,400,{ok:false,error:"Enter a valid product price of 0 or more."});
      }

      const r=await fetch(SUPABASE_URL+"/rest/v1/ranova_seller_products?id=eq."+encodeURIComponent(id)+"&seller_id=eq."+encodeURIComponent(user.id),{
        method:"PATCH",
        headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json",Prefer:"return=representation"},
        body:JSON.stringify({price:nextPrice,updated_at:new Date().toISOString()})
      });
      const updated=await r.json().catch(()=>[]);
      if(!r.ok)return response(h,400,{ok:false,error:"Could not update the product price."});
      return response(h,200,{ok:true,product:updated[0]||null});
    }

    if(action==="save_product"){
      const id=clean(b.id,80);
      let existing:any=null;
      if(id){
        const rows=await serviceGet("ranova_seller_products",{select:"*",id:"eq."+id,seller_id:"eq."+user.id,limit:"1"});
        existing=rows[0]||null;
        if(!existing)return response(h,404,{ok:false,error:"Product not found."});
      }
      const name=clean(b.name,180);
      const category=clean(b.category,100);
      if(!name||!category)return response(h,400,{ok:false,error:"Product name and category are required."});
      let slug=slugify(b.slug||existing?.slug||name);
      if(!slug)slug="product";
      if(!existing)slug=(slug+"-"+Date.now().toString(36)).slice(0,100);

      const nextStock=int(b.stock_quantity,0,1000000);
      if(existing&&nextStock!==null){
        const {data:holds}=await admin.from("ranova_inventory_reservations").select("quantity").eq("product_id",existing.id).eq("status","held").gt("expires_at",new Date().toISOString());
        const reserved=(holds||[]).reduce((n:number,x:any)=>n+Number(x.quantity||0),0);
        if(nextStock<reserved)return response(h,409,{ok:false,error:"Stock cannot be lowered below "+reserved+" unit(s) currently reserved by active buyer orders."});
      }
      const payload:any={
        seller_id:user.id,
        store_id:store.id,
        name,
        slug,
        sku:clean(b.sku,100)||null,
        category,
        short_description:clean(b.short_description,300)||null,
        description:clean(b.description,2500)||null,
        price:num(b.price),
        currency:"GHS",
        moq:int(b.moq,1,100000)||1,
        stock_quantity:nextStock,
        stock_status:["in_stock","low_stock","out_of_stock","preorder","confirm_on_enquiry"].includes(clean(b.stock_status,30))?clean(b.stock_status,30):"confirm_on_enquiry",
        unit_label:clean(b.unit_label,60)||null,
        primary_image_url:safeAssetUrl(b.primary_image_url)||null,
        image_urls:safeAssetUrls(b.image_urls),
        specifications:(()=>{
          const out:any={};
          const raw=b.specifications;
          if(raw&&typeof raw==="object"&&!Array.isArray(raw)){
            Object.entries(raw).slice(0,30).forEach(([k,v])=>{
              const key=clean(k,80),val=clean(v,300);if(key&&val)out[key]=val;
            });
          }
          return out;
        })(),
        pricing_tiers:(()=>{
          if(!Array.isArray(b.pricing_tiers))return [];
          const rows=b.pricing_tiers.slice(0,20).map((x:any)=>({min_qty:int(x?.min_qty,1,100000)||1,unit_price:num(x?.unit_price)}))
            .filter((x:any)=>x.unit_price!==null&&x.unit_price>=0).sort((a:any,b:any)=>a.min_qty-b.min_qty);
          const seen=new Set<number>();
          return rows.filter((x:any)=>{if(seen.has(x.min_qty))return false;seen.add(x.min_qty);return true});
        })(),
        updated_at:new Date().toISOString()
      };
      if(existing){
        payload.product_status=existing.product_status==="active"?"pending_review":existing.product_status;
        const r=await fetch(SUPABASE_URL+"/rest/v1/ranova_seller_products?id=eq."+encodeURIComponent(id)+"&seller_id=eq."+encodeURIComponent(user.id),{
          method:"PATCH",
          headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json",Prefer:"return=representation"},
          body:JSON.stringify(payload)
        });
        const rows=await r.json().catch(()=>[]);
        if(!r.ok)return response(h,400,{ok:false,error:"Could not update product. Check that the SKU is not already used in your store."});
        return response(h,200,{ok:true,product:rows[0]});
      }else{
        payload.product_status="draft";
        const r=await fetch(SUPABASE_URL+"/rest/v1/ranova_seller_products",{
          method:"POST",
          headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json",Prefer:"return=representation"},
          body:JSON.stringify(payload)
        });
        const rows=await r.json().catch(()=>[]);
        if(!r.ok)return response(h,400,{ok:false,error:"Could not create product. Check that the SKU is not already used in your store."});
        return response(h,200,{ok:true,product:rows[0]});
      }
    }

    if(action==="submit_product"){
      const id=clean(b.id,80);
      const rows=await serviceGet("ranova_seller_products",{select:"*",id:"eq."+id,seller_id:"eq."+user.id,limit:"1"});
      const p=rows[0];
      if(!p)return response(h,404,{ok:false,error:"Product not found."});
      if(!p.description||!p.primary_image_url)return response(h,400,{ok:false,error:"Add a product description and main image before submitting for review."});
      const r=await fetch(SUPABASE_URL+"/rest/v1/ranova_seller_products?id=eq."+encodeURIComponent(id)+"&seller_id=eq."+encodeURIComponent(user.id),{
        method:"PATCH",
        headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json",Prefer:"return=representation"},
        body:JSON.stringify({product_status:"pending_review",moderation_note:null,updated_at:new Date().toISOString()})
      });
      const out=await r.json().catch(()=>[]);
      if(!r.ok)throw new Error("Could not submit product.");
      return response(h,200,{ok:true,product:out[0]});
    }

    if(action==="pause_product"||action==="archive_product"){
      const id=clean(b.id,80);
      const status=action==="pause_product"?"paused":"archived";
      const r=await fetch(SUPABASE_URL+"/rest/v1/ranova_seller_products?id=eq."+encodeURIComponent(id)+"&seller_id=eq."+encodeURIComponent(user.id),{
        method:"PATCH",
        headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json",Prefer:"return=representation"},
        body:JSON.stringify({product_status:status,updated_at:new Date().toISOString()})
      });
      const out=await r.json().catch(()=>[]);
      if(!r.ok||!out.length)return response(h,404,{ok:false,error:"Product not found."});
      return response(h,200,{ok:true,product:out[0]});
    }

    if(action==="update_order_quote"){
      const id=clean(b.id,80);
      const rows=await serviceGet("ranova_seller_orders",{select:"*",id:"eq."+id,seller_id:"eq."+user.id,limit:"1"});
      const order=rows[0];
      if(!order)return response(h,404,{ok:false,error:"Order not found."});
      if(String(order.payment_status)==="paid")return response(h,409,{ok:false,error:"The order amount is locked because RANOVA has already confirmed customer payment."});
      if(["dispatched","delivered","cancelled","returned"].includes(order.order_status)){
        return response(h,400,{ok:false,error:"This order can no longer be repriced."});
      }
      const subtotal=num(b.subtotal);
      const delivery_fee=num(b.delivery_fee);
      if(subtotal===null||subtotal<0)return response(h,400,{ok:false,error:"Enter a valid product subtotal."});
      if(delivery_fee!==null&&delivery_fee<0)return response(h,400,{ok:false,error:"Enter a valid delivery fee."});
      const total=Number((subtotal+(delivery_fee||0)).toFixed(2));
      const r=await fetch(SUPABASE_URL+"/rest/v1/ranova_seller_orders?id=eq."+encodeURIComponent(id)+"&seller_id=eq."+encodeURIComponent(user.id),{
        method:"PATCH",
        headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json",Prefer:"return=representation"},
        body:JSON.stringify({
          subtotal:Number(subtotal.toFixed(2)),
          delivery_fee:delivery_fee===null?null:Number(delivery_fee.toFixed(2)),
          total,
          seller_note:clean(b.seller_note,1000)||order.seller_note||null,
          updated_at:new Date().toISOString()
        })
      });
      const out=await r.json().catch(()=>[]);
      if(!r.ok||!out.length)throw new Error("Could not update the order amount.");
      const existingDelivery=await serviceGet("ranova_order_deliveries",{select:"id,delivery_status",seller_order_id:"eq."+order.id,limit:"1"});
      if(existingDelivery.length){
        await admin.from("ranova_order_deliveries").update({
          quoted_delivery_fee:delivery_fee===null?null:Number(delivery_fee.toFixed(2)),
          destination_text:order.delivery_location,
          updated_at:new Date().toISOString()
        }).eq("id",existingDelivery[0].id);
      }else{
        const {data:d,error:dErr}=await admin.from("ranova_order_deliveries").insert({
          customer_order_id:order.parent_order_id,seller_order_id:order.id,store_id:order.store_id,
          responsibility:"seller",fulfilment_method:"seller_delivery",delivery_status:"pending_quote",
          quoted_delivery_fee:delivery_fee===null?null:Number(delivery_fee.toFixed(2)),
          destination_text:order.delivery_location,proof_required:true
        }).select("id").single();
        if(dErr)throw dErr;
        await admin.from("ranova_delivery_events").insert({
          delivery_id:d.id,seller_order_id:order.id,status:"pending_quote",actor_type:"seller",actor_user_id:user.id,
          note:"Delivery fee recorded with seller quote."
        });
      }
      await syncParentOrder(order.parent_order_id||null);
      await queueBuyerOrderNotice(order,"seller_order_status","RANOVA seller order update",
        "Seller order "+order.order_ref+" is now "+next.replace(/_/g," ")+(note?". "+note:""),
        {seller_order_ref:order.order_ref,status:next});
      return response(h,200,{ok:true,order:out[0]});
    }

    if(action==="update_order_status"){
      const id=clean(b.id,80),next=clean(b.status,40);
      const rows=await serviceGet("ranova_seller_orders",{select:"*",id:"eq."+id,seller_id:"eq."+user.id,limit:"1"});
      const order=rows[0];
      if(!order)return response(h,404,{ok:false,error:"Order not found."});
      const allowed:any={
        new:["confirmed","cancelled"],
        confirmed:["preparing","cancelled"],
        preparing:["ready_for_dispatch","cancelled"],
        ready_for_dispatch:["cancelled"],
        dispatched:[],
        delivered:[],
        cancelled:[],
        return_requested:["returned"],
        returned:[]
      };
      if(["dispatched","delivered"].includes(next))return response(h,409,{ok:false,error:"Use Delivery tracking for dispatch and proof. Final delivery must be confirmed by the buyer or RANOVA."});
      if(!(allowed[order.order_status]||[]).includes(next)){
        return response(h,400,{ok:false,error:"That order-status change is not allowed from "+order.order_status.replace(/_/g," ")+". "});
      }
      if(next==="confirmed"&&order.total===null){
        return response(h,400,{ok:false,error:"Set the final product subtotal and delivery fee before confirming this order."});
      }
      const note=clean(b.seller_note,1000);
      if(next==="cancelled"&&String(order.payment_status)==="paid"){
        return response(h,409,{ok:false,error:"A paid order cannot be cancelled by the seller. Use the refund/dispute process so stock, buyer money and seller payout stay auditable."});
      }
      if(next==="cancelled"){
        const {error:releaseErr}=await admin.rpc("ranova_release_order_inventory",{
          p_order_ref:order.platform_order_ref,p_seller_order_id:order.id,
          p_reason:note||"Seller cancelled unpaid order.",p_restore_committed:false,
          p_actor_type:"seller",p_actor_user_id:user.id
        });
        if(releaseErr)throw releaseErr;
      }
      if(next==="returned"){
        if(!note)return response(h,400,{ok:false,error:"Add a return note confirming the goods were actually received back before stock is restored."});
        const {error:restoreErr}=await admin.rpc("ranova_release_order_inventory",{
          p_order_ref:order.platform_order_ref,p_seller_order_id:order.id,
          p_reason:note,p_restore_committed:true,
          p_actor_type:"seller",p_actor_user_id:user.id
        });
        if(restoreErr)throw restoreErr;
      }
      const patch:any={order_status:next,updated_at:new Date().toISOString()};
      if(next==="confirmed")patch.payment_status="pending";
      if(note)patch.seller_note=note;
      const r=await fetch(SUPABASE_URL+"/rest/v1/ranova_seller_orders?id=eq."+encodeURIComponent(id)+"&seller_id=eq."+encodeURIComponent(user.id),{
        method:"PATCH",
        headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json",Prefer:"return=representation"},
        body:JSON.stringify(patch)
      });
      const out=await r.json().catch(()=>[]);
      if(!r.ok||!out.length)throw new Error("Could not update order status.");
      if(next==="ready_for_dispatch"){
        const deliveries=await serviceGet("ranova_order_deliveries",{select:"id,delivery_status",seller_order_id:"eq."+order.id,limit:"1"});
        if(deliveries.length&&!["delivered_confirmed","returned","cancelled"].includes(deliveries[0].delivery_status)){
          await admin.from("ranova_order_deliveries").update({delivery_status:"awaiting_dispatch",updated_at:new Date().toISOString()}).eq("id",deliveries[0].id);
          await admin.from("ranova_delivery_events").insert({
            delivery_id:deliveries[0].id,seller_order_id:order.id,status:"awaiting_dispatch",
            actor_type:"seller",actor_user_id:user.id,note:"Order marked ready for dispatch."
          });
        }
      }
      await syncParentOrder(order.parent_order_id||null);
      return response(h,200,{ok:true,order:out[0]});
    }


    if(action==="seller_dispute_message"){
      const disputeRef=clean(b.dispute_ref,80).toUpperCase();
      const message=clean(b.message,2000);
      if(message.length<2)return response(h,400,{ok:false,error:"Enter a message."});
      const disputes=await serviceGet("ranova_marketplace_disputes",{select:"*",dispute_ref:"eq."+disputeRef,limit:"1"});
      const dispute=disputes[0];
      if(!dispute)return response(h,404,{ok:false,error:"Dispute not found."});
      if(["resolved","closed"].includes(dispute.status))return response(h,409,{ok:false,error:"This dispute is closed."});
      const sellerOrders=await serviceGet("ranova_seller_orders",{
        select:"id,parent_order_id,platform_order_ref,buyer_email",
        seller_id:"eq."+user.id,
        parent_order_id:"eq."+dispute.customer_order_id,
        limit:"10"
      });
      if(!sellerOrders.length)return response(h,403,{ok:false,error:"This dispute is not linked to your store."});

      const insertMsg=await fetch(SUPABASE_URL+"/rest/v1/ranova_marketplace_dispute_messages",{
        method:"POST",
        headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json",Prefer:"return=representation"},
        body:JSON.stringify({dispute_id:dispute.id,sender_type:"seller",sender_user_id:user.id,message})
      });
      if(!insertMsg.ok)throw new Error("Could not save dispute reply.");
      await fetch(SUPABASE_URL+"/rest/v1/ranova_marketplace_disputes?id=eq."+encodeURIComponent(dispute.id),{
        method:"PATCH",
        headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json"},
        body:JSON.stringify({status:"under_review",updated_at:new Date().toISOString()})
      });

      await queueBuyerOrderNotice(sellerOrders[0],"dispute_message","Seller replied to your RANOVA dispute",
        "The seller added a message to dispute "+disputeRef+". Open order tracking to review it.",
        {dispute_ref:disputeRef,status:"reply"});
      return response(h,200,{ok:true});
    }

    if(action==="submit_enforcement_appeal"){
      const stores=await serviceGet("ranova_seller_stores",{select:"id",seller_id:"eq."+user.id,limit:"1"});
      const store=stores[0];
      if(!store)return response(h,404,{ok:false,error:"Create your seller store before filing an appeal."});
      const enforcementRows=await serviceGet("ranova_seller_enforcement",{select:"enforcement_status",store_id:"eq."+store.id,limit:"1"});
      const enforcement=enforcementRows[0];
      if(!enforcement||enforcement.enforcement_status==="good_standing")return response(h,409,{ok:false,error:"There is no active enforcement action to appeal."});
      const subject=clean(b.subject,180),appeal_text=clean(b.appeal_text,3000);
      if(subject.length<5||appeal_text.length<20)return response(h,400,{ok:false,error:"Add a clear appeal subject and explanation."});
      const active=await serviceGet("ranova_seller_appeals",{
        select:"id,appeal_ref,status",store_id:"eq."+store.id,status:"in.(submitted,under_review)",limit:"1"
      });
      if(active.length)return response(h,409,{ok:false,error:"An appeal is already being reviewed.",appeal_ref:active[0].appeal_ref});
      const events=await serviceGet("ranova_seller_enforcement_events",{
        select:"id",store_id:"eq."+store.id,order:"created_at.desc",limit:"1"
      });
      const appeal_ref="APL-"+Date.now().toString(36).toUpperCase()+"-"+crypto.randomUUID().slice(0,5).toUpperCase();
      const r=await fetch(SUPABASE_URL+"/rest/v1/ranova_seller_appeals",{
        method:"POST",headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json",Prefer:"return=representation"},
        body:JSON.stringify({appeal_ref,store_id:store.id,seller_id:user.id,enforcement_event_id:events[0]?.id||null,subject,appeal_text,status:"submitted"})
      });
      if(!r.ok)throw new Error("Could not submit appeal.");
      return response(h,200,{ok:true,appeal_ref});
    }

    if(action==="respond_to_review"){
      const reviewId=clean(b.id,80),reply=clean(b.response,1800);
      if(reply.length<2)return response(h,400,{ok:false,error:"Write a seller response before publishing it."});
      const rows=await serviceGet("ranova_marketplace_reviews",{
        select:"id,store_id,seller_id,moderation_status",
        id:"eq."+reviewId,
        seller_id:"eq."+user.id,
        limit:"1"
      });
      const review=rows[0];
      if(!review)return response(h,404,{ok:false,error:"Review not found for this seller."});
      if(review.moderation_status!=="published")return response(h,409,{ok:false,error:"You can respond only to a published review."});
      const now=new Date().toISOString();
      const r=await fetch(SUPABASE_URL+"/rest/v1/ranova_marketplace_reviews?id=eq."+encodeURIComponent(reviewId)+"&seller_id=eq."+encodeURIComponent(user.id),{
        method:"PATCH",
        headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json",Prefer:"return=representation"},
        body:JSON.stringify({seller_response:reply,seller_responded_at:now,updated_at:now})
      });
      const changed=await r.json().catch(()=>[]);
      if(!r.ok||!changed.length)throw new Error("Could not save seller response.");
      await fetch(SUPABASE_URL+"/rest/v1/ranova_review_moderation_events",{
        method:"POST",
        headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json"},
        body:JSON.stringify({review_id:reviewId,actor_type:"seller",actor_user_id:user.id,action:"seller_response",reason:"Seller posted a public response."})
      });
      return response(h,200,{ok:true});
    }

    return response(h,400,{ok:false,error:"Unknown action."});
  }catch(e){
    console.error(e);
    return response(h,500,{ok:false,error:"Seller Dashboard request could not be completed."});
  }
});