import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const ALLOWED_ORIGIN="https://ranovaprimeent.github.io";
const admin=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});

function headers(origin:string|null){
  const allow=origin===ALLOWED_ORIGIN||origin?.startsWith("http://localhost")?origin:ALLOWED_ORIGIN;
  return {"Content-Type":"application/json","Access-Control-Allow-Origin":allow||ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers":"content-type,x-ranova-client,authorization,apikey","Access-Control-Allow-Methods":"POST,OPTIONS"};
}
function clean(v:any,max=1200){return String(v??"").trim().slice(0,max)}
function response(h:any,status:number,payload:any){return new Response(JSON.stringify(payload),{status,headers:h})}
async function getUser(req:Request){
  const auth=req.headers.get("authorization")||"";
  if(!auth.startsWith("Bearer "))return null;
  const r=await fetch(SUPABASE_URL+"/auth/v1/user",{headers:{Authorization:auth,apikey:SERVICE_KEY}});
  return r.ok?await r.json():null;
}
function ref(prefix:string){return prefix+"-"+new Date().toISOString().slice(0,10).replace(/-/g,"")+"-"+crypto.randomUUID().replace(/-/g,"").slice(0,6).toUpperCase()}
function severityFor(category:string){
  if(["suspected_fraud","payment_outside_ranova","prohibited_product","threats_harassment","counterfeit"].includes(category))return "high";
  if(["non_delivery","misleading_listing","repeated_cancellation","fake_business_information"].includes(category))return "medium";
  return "low";
}
async function sellerStore(userId:string){
  const {data}=await admin.from("ranova_seller_stores").select("*").eq("seller_id",userId).maybeSingle();
  return data||null;
}
async function getOrCreateThread(store:any){
  const {data:existing}=await admin.from("ranova_admin_seller_threads").select("*").eq("store_id",store.id).maybeSingle();
  if(existing)return existing;
  const {data,error}=await admin.from("ranova_admin_seller_threads").insert({store_id:store.id,seller_id:store.seller_id,status:"open"}).select("*").single();
  if(error)throw error;
  return data;
}

Deno.serve(async(req:Request)=>{
  const h=headers(req.headers.get("origin"));
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:h});
  if(req.method!=="POST")return response(h,405,{ok:false,error:"Method not allowed"});
  if(req.headers.get("x-ranova-client")!=="ranova-site-v1")return response(h,403,{ok:false,error:"Invalid client"});
  const user=await getUser(req);
  if(!user?.id)return response(h,401,{ok:false,error:"Sign in to continue."});
  const b=await req.json().catch(()=>({}));
  const action=clean(b.action,60)||"my_reports";

  try{
    if(action==="submit_report"){
      const storeId=clean(b.store_id,80),category=clean(b.category,80),description=clean(b.description,3000);
      const allowed=["counterfeit","product_not_as_described","payment_outside_ranova","suspected_fraud","threats_harassment","non_delivery","repeated_cancellation","misleading_price","prohibited_product","fake_business_information","intellectual_property","other"];
      if(!allowed.includes(category))return response(h,400,{ok:false,error:"Choose a valid report reason."});
      if(description.length<20)return response(h,400,{ok:false,error:"Please explain the issue in at least 20 characters."});
      const {data:store}=await admin.from("ranova_seller_stores").select("id,seller_id,store_name").eq("id",storeId).maybeSingle();
      if(!store)return response(h,404,{ok:false,error:"Store not found."});
      const productId=clean(b.product_id,80)||null;
      if(productId){
        const {data:p}=await admin.from("ranova_seller_products").select("id,store_id").eq("id",productId).maybeSingle();
        if(!p||p.store_id!==store.id)return response(h,400,{ok:false,error:"The selected product does not belong to this store."});
      }
      const reportRef=ref("RNV-RPT");
      const severity=severityFor(category);
      const {data:report,error}=await admin.from("ranova_safety_reports").insert({
        report_ref:reportRef,reporter_user_id:user.id,reporter_role:"buyer",reported_user_id:store.seller_id,
        store_id:store.id,product_id:productId,category,description,severity,status:"open",evidence_count:0
      }).select("id,report_ref,status,severity").single();
      if(error)throw error;
      return response(h,200,{ok:true,report});
    }

    if(action==="add_evidence"){
      const reportId=clean(b.report_id,80),path=clean(b.storage_path,900),name=clean(b.original_filename,250),mime=clean(b.mime_type,120),size=Number(b.file_size||0);
      const {data:report}=await admin.from("ranova_safety_reports").select("id,reporter_user_id").eq("id",reportId).maybeSingle();
      if(!report||report.reporter_user_id!==user.id)return response(h,403,{ok:false,error:"You cannot add evidence to this report."});
      if(!path.startsWith(user.id+"/"+report.id+"/"))return response(h,400,{ok:false,error:"Invalid evidence path."});
      const {error}=await admin.from("ranova_report_evidence").insert({report_id:report.id,uploader_user_id:user.id,storage_path:path,original_filename:name||null,mime_type:mime||null,file_size:Number.isFinite(size)?size:null});
      if(error)throw error;
      const {count}=await admin.from("ranova_report_evidence").select("id",{count:"exact",head:true}).eq("report_id",report.id);
      await admin.from("ranova_safety_reports").update({evidence_count:count||0,updated_at:new Date().toISOString()}).eq("id",report.id);
      return response(h,200,{ok:true,evidence_count:count||0});
    }

    if(action==="my_reports"){
      const {data:reports,error}=await admin.from("ranova_safety_reports")
        .select("id,report_ref,store_id,product_id,category,description,severity,status,admin_note,evidence_count,created_at,updated_at")
        .eq("reporter_user_id",user.id).order("created_at",{ascending:false}).limit(100);
      if(error)throw error;
      return response(h,200,{ok:true,reports:reports||[]});
    }

    if(action==="seller_messages"){
      const store=await sellerStore(user.id);
      if(!store)return response(h,404,{ok:false,error:"Seller store not found."});
      const thread=await getOrCreateThread(store);
      const {data:messages,error}=await admin.from("ranova_admin_seller_messages").select("*").eq("thread_id",thread.id).order("created_at",{ascending:true}).limit(500);
      if(error)throw error;
      const signed=await Promise.all((messages||[]).map(async(m:any)=>({
        ...m,media_url:m.storage_path?(await admin.storage.from("admin-seller-media").createSignedUrl(m.storage_path,3600)).data?.signedUrl||null:null
      })));
      return response(h,200,{ok:true,store:{id:store.id,store_name:store.store_name,store_status:store.store_status,moderation_note:store.moderation_note},thread,messages:signed});
    }

    if(action==="seller_send_message"){
      const body=clean(b.body,4000);
      if(body.length<2)return response(h,400,{ok:false,error:"Write a message first."});
      const store=await sellerStore(user.id);
      if(!store)return response(h,404,{ok:false,error:"Seller store not found."});
      const thread=await getOrCreateThread(store);
      const {error}=await admin.from("ranova_admin_seller_messages").insert({thread_id:thread.id,sender_role:"seller",sender_user_id:user.id,body});
      if(error)throw error;
      await admin.from("ranova_admin_seller_threads").update({updated_at:new Date().toISOString(),status:"open"}).eq("id",thread.id);
      return response(h,200,{ok:true});
    }

    return response(h,400,{ok:false,error:"Unknown action."});
  }catch(e:any){
    return response(h,500,{ok:false,error:e?.message||"Request failed."});
  }
});
