import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const ALLOWED_ORIGIN="https://ranovaprimeent.github.io";
const admin=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});

function headers(origin:string|null){
  const allow=origin===ALLOWED_ORIGIN||origin?.startsWith("http://localhost")?origin:ALLOWED_ORIGIN;
  return {"Content-Type":"application/json","Access-Control-Allow-Origin":allow||ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers":"content-type,x-ranova-client,authorization,apikey","Access-Control-Allow-Methods":"POST,OPTIONS"};
}
function clean(v:any,max=180){return String(v??"").trim().slice(0,max)}
async function optionalUser(req:Request){
  const auth=req.headers.get("authorization")||"";
  if(!auth.startsWith("Bearer "))return null;
  const {data,error}=await admin.auth.getUser(auth.slice(7));
  return error?null:data.user;
}
function normalPhone(v:string){return v.replace(/\D/g,"").replace(/^233/,"0")}
async function sha256(v:string){
  const bytes=new TextEncoder().encode(v);
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function validBuyerCode(order:any,v:any){
  const code=clean(v,40).toUpperCase();
  if(!code||!order?.buyer_access_code_hash)return false;
  return (await sha256(code))===String(order.buyer_access_code_hash);
}
function response(h:Record<string,string>,status:number,payload:any){return new Response(JSON.stringify(payload),{status,headers:h})}
function rating(v:any){const n=Math.trunc(Number(v));return Number.isFinite(n)&&n>=1&&n<=5?n:null}
function displayName(v:any){
  const p=clean(v,180).split(/\s+/).filter(Boolean);
  if(!p.length)return "Verified buyer";
  return p.length===1?p[0]:p[0]+" "+p[p.length-1].charAt(0).toUpperCase()+".";
}
async function getOrder(order_ref:string,phone:string,buyerUserId:string|null){
  const {data:order,error}=await admin.from("ranova_customer_orders")
    .select("id,order_ref,buyer_user_id,buyer_access_code_hash,customer_name,customer_phone,customer_email,delivery_location,buyer_country_code,buyer_country_name,payment_method,product_name,quantity,product_total,delivery_fee,total_payment,payment_processing_rate,payment_processing_fee,payment_fee_payer,items,item_count,status,payment_status,buyer_note,order_source,seller_order_count,inventory_status,inventory_reservation_expires_at,created_at")
    .eq("order_ref",order_ref).maybeSingle();
  if(error||!order)return {error:"Order not found. Check the reference and try again."};
  if(buyerUserId&&order.buyer_user_id===buyerUserId)return {order};
  if(!phone||normalPhone(String(order.customer_phone||""))!==phone)return {error:"The phone number does not match this order."};
  return {order};
}

Deno.serve(async(req:Request)=>{
  const h=headers(req.headers.get("origin"));
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:h});
  if(req.method!=="POST")return response(h,405,{ok:false,error:"Method not allowed"});
  if(req.headers.get("x-ranova-client")!=="ranova-site-v1")return response(h,403,{ok:false,error:"Invalid client"});
  try{
    const b=await req.json();
    const user=await optionalUser(req);
    const action=clean(b.action,40)||"lookup";
    const order_ref=clean(b.order_ref,90).toUpperCase();
    const phone=normalPhone(clean(b.phone,40));
    if(!order_ref||(!phone&&!user))return response(h,400,{ok:false,error:"Enter your order reference and phone number, or sign in to the buyer account that owns this order."});
    const found:any=await getOrder(order_ref,phone,user?.id||null);
    if(found.error)return response(h,found.error.startsWith("The phone")?403:404,{ok:false,error:found.error});
    const order:any=found.order;

    if(action==="submit_review"){
      if(!await validBuyerCode(order,b.buyer_access_code))return response(h,403,{ok:false,error:"Enter the buyer security code created at checkout before submitting a review."});
      const seller_order_ref=clean(b.seller_order_ref,100).toUpperCase();
      const overall=rating(b.overall_rating),product=rating(b.product_rating),service=rating(b.service_rating),delivery=rating(b.delivery_rating);
      if(!seller_order_ref||!overall||!product||!service||!delivery)
        return response(h,400,{ok:false,error:"Choose a 1–5 rating for overall, product, service and delivery."});
      const title=clean(b.review_title,160),review_text=clean(b.review_text,3000);
      const {data:child}=await admin.from("ranova_seller_orders").select("id,order_ref,store_id,seller_id,order_status,parent_order_id")
        .eq("parent_order_id",order.id).eq("order_ref",seller_order_ref).maybeSingle();
      if(!child)return response(h,404,{ok:false,error:"Seller order not found for this purchase."});
      const {data:del}=await admin.from("ranova_order_deliveries").select("delivery_status").eq("seller_order_id",child.id).maybeSingle();
      if(child.order_status!=="delivered"||del?.delivery_status!=="delivered_confirmed")
        return response(h,409,{ok:false,error:"A review unlocks only after delivery is confirmed."});
      const {data:existing}=await admin.from("ranova_marketplace_reviews").select("id,review_ref").eq("seller_order_id",child.id).maybeSingle();
      if(existing)return response(h,409,{ok:false,error:"This seller order already has a verified review."});

      const {data:store}=await admin.from("ranova_seller_stores").select("id,public_phone").eq("id",child.store_id).maybeSingle();
      const flags:string[]=[];
      if(store?.public_phone&&normalPhone(String(store.public_phone))===phone)flags.push("buyer_phone_matches_store_phone");
      if(review_text.length>=12){
        const {data:dup}=await admin.from("ranova_marketplace_reviews").select("id").eq("review_text",review_text).limit(1);
        if((dup||[]).length)flags.push("duplicate_review_text");
      }
      const status=flags.length?"pending":"published";
      const now=new Date().toISOString();
      const review_ref="RVW-"+Date.now().toString(36).toUpperCase()+"-"+crypto.randomUUID().slice(0,5).toUpperCase();
      const {data:review,error}=await admin.from("ranova_marketplace_reviews").insert({
        review_ref,customer_order_id:order.id,seller_order_id:child.id,store_id:child.store_id,seller_id:child.seller_id,
        buyer_display_name:displayName(order.customer_name),overall_rating:overall,product_rating:product,service_rating:service,delivery_rating:delivery,
        review_title:title||null,review_text:review_text||null,recommend:typeof b.recommend==="boolean"?b.recommend:null,
        verified_purchase:true,moderation_status:status,moderation_flags:flags,
        submitted_at:now,published_at:status==="published"?now:null,updated_at:now
      }).select("id,review_ref,moderation_status").single();
      if(error)throw error;
      await admin.from("ranova_review_moderation_events").insert({
        review_id:review.id,actor_type:"system",action:"submitted",reason:"Verified purchase review submitted.",
        metadata:{flags}
      });
      await admin.from("ranova_review_moderation_events").insert({
        review_id:review.id,actor_type:"system",action:status==="published"?"published":"flagged",
        reason:status==="published"?"Auto-published: no automated risk signals.":"Held for RANOVA moderation.",metadata:{flags}
      });
      await admin.rpc("ranova_refresh_seller_trust_metrics",{p_store_id:child.store_id});
      return response(h,200,{ok:true,review_ref:review.review_ref,moderation_status:review.moderation_status,
        message:status==="published"?"Your verified review is now visible.":"Your verified review was received and is awaiting a RANOVA trust review."});
    }

    const {data:children}=await admin.from("ranova_seller_orders")
      .select("id,order_ref,platform_order_ref,store_id,buyer_name,delivery_location,items,item_count,subtotal,delivery_fee,total,currency,payment_method,payment_status,order_status,buyer_note,seller_note,created_at,updated_at")
      .eq("parent_order_id",order.id).order("created_at",{ascending:true});
    const storeIds=[...new Set((children||[]).map((x:any)=>x.store_id))];
    let stores:any[]=[];
    if(storeIds.length){
      const out=await admin.from("ranova_seller_stores").select("id,store_name,slug,public_phone,public_email,store_status").in("id",storeIds);
      stores=out.data||[];
    }
    const storeMap=new Map(stores.map((s:any)=>[s.id,s]));
    const childIds=(children||[]).map((x:any)=>x.id);
    let reviews:any[]=[], deliveries:any[]=[];
    if(childIds.length){
      const rr=await admin.from("ranova_marketplace_reviews")
        .select("id,review_ref,seller_order_id,overall_rating,product_rating,service_rating,delivery_rating,review_title,review_text,recommend,verified_purchase,moderation_status,moderation_note,submitted_at,published_at,seller_response,seller_responded_at")
        .in("seller_order_id",childIds);
      reviews=rr.data||[];
      const dd=await admin.from("ranova_order_deliveries").select("seller_order_id,delivery_status").in("seller_order_id",childIds);
      deliveries=dd.data||[];
    }

    let payment_instructions:any=null;
    const paymentDue=order.status==="awaiting_payment"&&!["paid","confirmed","refunded"].includes(String(order.payment_status||"").toLowerCase());
    if(paymentDue&&order.payment_method){
      const {data:accounts}=await admin.from("ranova_marketplace_payment_accounts")
        .select("payment_method,provider_name,account_name,account_reference,instructions,updated_at")
        .eq("payment_method",order.payment_method).eq("active",true).order("updated_at",{ascending:false}).limit(1);
      const account=accounts?.[0];
      if(account)payment_instructions={payment_method:account.payment_method,provider_name:account.provider_name,account_name:account.account_name,
        account_reference:account.account_reference,instructions:account.instructions,amount:order.total_payment,currency:"GHS"};
    }

    return response(h,200,{ok:true,order:{
      order_ref:order.order_ref,customer_name:order.customer_name,delivery_location:order.delivery_location,buyer_country_code:order.buyer_country_code,
      buyer_country_name:order.buyer_country_name,payment_method:order.payment_method,payment_processing_rate:order.payment_processing_rate,
      payment_processing_fee:order.payment_processing_fee,payment_fee_payer:order.payment_fee_payer,product_name:order.product_name,quantity:order.quantity,
      product_total:order.product_total,delivery_fee:order.delivery_fee,total_payment:order.total_payment,items:order.items||[],item_count:order.item_count,
      status:order.status,payment_status:order.payment_status,buyer_note:order.buyer_note,order_source:order.order_source,
      seller_order_count:order.seller_order_count,inventory_status:order.inventory_status,inventory_reservation_expires_at:order.inventory_reservation_expires_at,created_at:order.created_at
    },payment_instructions,seller_orders:(children||[]).map((x:any)=>{
      const s:any=storeMap.get(x.store_id)||{};
      const rv=reviews.find((r:any)=>r.seller_order_id===x.id)||null;
      const dl=deliveries.find((d:any)=>d.seller_order_id===x.id)||null;
      return {order_ref:x.order_ref,store_name:s.store_name||"Seller store",store_slug:s.slug||null,store_status:s.store_status||null,
        items:x.items||[],item_count:x.item_count,subtotal:x.subtotal,delivery_fee:x.delivery_fee,total:x.total,currency:x.currency,
        payment_method:x.payment_method,payment_status:x.payment_status,order_status:x.order_status,seller_note:x.seller_note,updated_at:x.updated_at,
        review_eligible:x.order_status==="delivered"&&dl?.delivery_status==="delivered_confirmed"&&!rv,
        review:rv?{review_ref:rv.review_ref,overall_rating:rv.overall_rating,product_rating:rv.product_rating,service_rating:rv.service_rating,
          delivery_rating:rv.delivery_rating,review_title:rv.review_title,review_text:rv.review_text,recommend:rv.recommend,
          verified_purchase:rv.verified_purchase,moderation_status:rv.moderation_status,moderation_note:rv.moderation_note,
          submitted_at:rv.submitted_at,published_at:rv.published_at,seller_response:rv.seller_response,seller_responded_at:rv.seller_responded_at}:null
      };
    })});
  }catch(e){
    console.error(e);
    return response(h,500,{ok:false,error:"Could not load the order status. Please try again."});
  }
});