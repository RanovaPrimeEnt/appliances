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
  const out:any={ok:true,role,applications:[],files:[],stores:[],products:[],seller_orders:[],marketplace_orders:[],finance_settings:null,payment_accounts:[],payouts:[],payments:[],country_rules:[],counts:{}};
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
  }

  if(canOrderReview(role)){
    const {data:sellerOrders}=await admin.from("ranova_seller_orders")
      .select("id,order_ref,platform_order_ref,parent_order_id,seller_id,store_id,buyer_name,buyer_phone,buyer_email,delivery_location,payment_method,items,item_count,subtotal,delivery_fee,total,currency,payment_status,order_status,buyer_note,seller_note,created_at,updated_at")
      .order("created_at",{ascending:false}).limit(500);
    out.seller_orders=sellerOrders||[];
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
    payments_due:out.marketplace_orders.filter((o:any)=>o.status==="awaiting_payment"&&!["paid","confirmed","refunded"].includes(String(o.payment_status||"").toLowerCase())).length
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
      const now=new Date().toISOString();
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
              payout_status:holdDays>0?"pending":"eligible",
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

    return response(h,400,{ok:false,error:"Unknown moderation action."});
  }catch(e){
    console.error(e);
    return response(h,500,{ok:false,error:"Marketplace moderation request could not be completed."});
  }
});