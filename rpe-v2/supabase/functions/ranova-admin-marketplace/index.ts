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
  const out:any={ok:true,role,applications:[],files:[],stores:[],products:[],seller_orders:[],counts:{}};
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
        .select("id,seller_id,application_ref,store_name,slug,tagline,description,logo_url,banner_url,public_phone,public_email,business_location,store_status,moderation_note,created_at,updated_at,moderated_at,moderated_by")
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

  out.counts={
    seller_applications:out.applications.length,
    seller_pending:out.applications.filter((a:any)=>!["approved","rejected","suspended"].includes(String(a.verification_status||a.status||"").toLowerCase())).length,
    seller_approved:out.applications.filter((a:any)=>String(a.verification_status||a.status||"").toLowerCase()==="approved").length,
    documents_pending:out.files.filter((f:any)=>["submitted","under_review"].includes(String(f.review_status||"").toLowerCase())).length,
    products_pending:out.products.filter((p:any)=>p.product_status==="pending_review").length,
    active_seller_products:out.products.filter((p:any)=>p.product_status==="active").length,
    active_stores:out.stores.filter((s:any)=>s.store_status==="active").length,
    seller_orders:out.seller_orders.length,
    seller_orders_open:out.seller_orders.filter((o:any)=>!["delivered","cancelled","returned"].includes(o.order_status)).length
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

    return response(h,400,{ok:false,error:"Unknown moderation action."});
  }catch(e){
    console.error(e);
    return response(h,500,{ok:false,error:"Marketplace moderation request could not be completed."});
  }
});