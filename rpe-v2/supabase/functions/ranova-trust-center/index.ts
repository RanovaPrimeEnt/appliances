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

    if(action==="seller_review_seen"){
      const ref=clean(b.application_ref,80),stamp=clean(b.reviewed_at,60);
      const {data:account}=await admin.from("ranova_seller_accounts").select("application_ref").eq("user_id",user.id).eq("application_ref",ref).maybeSingle();
      if(!account)return response(h,403,{ok:false,error:"This application does not belong to your account."});
      const {data:app}=await admin.from("ranova_seller_applications").select("reviewed_at").eq("application_ref",ref).maybeSingle();
      if(!stamp||!app?.reviewed_at||Date.parse(stamp)!==Date.parse(app.reviewed_at))return response(h,409,{ok:false,error:"Refresh to read the latest review note."});
      const {error}=await admin.from("ranova_marketplace_notifications").update({read_at:new Date().toISOString()})
        .eq("recipient_type","seller").eq("recipient_user_id",user.id).eq("metadata->>application_ref",ref).eq("metadata->>reviewed_at",new Date(app.reviewed_at).toISOString()).is("read_at",null);
      if(error)throw error;
      return response(h,200,{ok:true});
    }
    if(action==="seller_messages_seen"){
      const store=await sellerStore(user.id);
      if(!store)return response(h,404,{ok:false,error:"Seller store not found."});
      const thread=await getOrCreateThread(store);
      const ids=Array.isArray(b.message_ids)?b.message_ids.map((x:any)=>clean(x,30)).filter((x:string)=>/^\d+$/.test(x)).slice(0,500):[];
      if(ids.length){
        const {error}=await admin.from("ranova_marketplace_notifications").update({read_at:new Date().toISOString()})
          .eq("recipient_type","seller").eq("recipient_user_id",user.id).eq("metadata->>thread_id",thread.id).in("metadata->>message_id",ids).is("read_at",null);
        if(error)throw error;
      }
      return response(h,200,{ok:true});
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

    if(action==="seller_prepare_media"){
      const store=await sellerStore(user.id);
      if(!store)return response(h,404,{ok:false,error:"Seller store not found."});
      const mime=clean(b.mime_type,120),size=Number(b.file_size||0);
      const types:any={"image/jpeg":"image","image/png":"image","image/webp":"image","image/gif":"image","application/pdf":"file","text/plain":"file","audio/webm":"audio","audio/mp4":"audio","audio/ogg":"audio","audio/mpeg":"audio","audio/wav":"audio"};
      if(!types[mime]||!Number.isFinite(size)||size<1||size>15728640)return response(h,400,{ok:false,error:"Unsupported file type or file is larger than 15 MB."});
      const extension:any={"image/jpeg":"jpg","image/png":"png","image/webp":"webp","image/gif":"gif","application/pdf":"pdf","text/plain":"txt","audio/webm":"webm","audio/mp4":"m4a","audio/ogg":"ogg","audio/mpeg":"mp3","audio/wav":"wav"};
      const path=store.id+"/"+user.id+"/"+crypto.randomUUID()+"."+extension[mime];
      const {data,error}=await admin.storage.from("admin-seller-media").createSignedUploadUrl(path);
      if(error)throw error;
      return response(h,200,{ok:true,path,token:data.token,media_type:types[mime]});
    }

    if(action==="seller_send_message"){
      const body=clean(b.body,4000),path=clean(b.storage_path,300);
      if(body.length<2&&!path)return response(h,400,{ok:false,error:"Write a message or attach a file first."});
      const store=await sellerStore(user.id);
      if(!store)return response(h,404,{ok:false,error:"Seller store not found."});
      let media:any={};
      if(path){
        if(!path.startsWith(store.id+"/"+user.id+"/"))return response(h,400,{ok:false,error:"Invalid attachment path."});
        const type=clean(b.media_type,10),mime=clean(b.mime_type,120);
        if(!["image","file","audio"].includes(type))return response(h,400,{ok:false,error:"Invalid media type."});
        const name=path.split("/").at(-1)||"";
        const {data:files,error:listError}=await admin.storage.from("admin-seller-media").list(store.id+"/"+user.id,{search:name});
        const file=files?.find((x:any)=>x.name===name);
        if(listError||!file||Number(file.metadata?.size||0)>15728640)return response(h,400,{ok:false,error:"Upload the attachment before sending."});
        media={media_type:type,storage_path:path,file_name:clean(b.file_name,250)||"Attachment",mime_type:mime};
      }
      const thread=await getOrCreateThread(store);
      const {error}=await admin.from("ranova_admin_seller_messages").insert({thread_id:thread.id,sender_role:"seller",sender_user_id:user.id,body,...media});
      if(error)throw error;
      await admin.from("ranova_admin_seller_threads").update({updated_at:new Date().toISOString(),status:"open"}).eq("id",thread.id);
      return response(h,200,{ok:true});
    }

    return response(h,400,{ok:false,error:"Unknown action."});
  }catch(e:any){
    return response(h,500,{ok:false,error:e?.message||"Request failed."});
  }
});
