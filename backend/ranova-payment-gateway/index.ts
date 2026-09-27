import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const U=Deno.env.get("SUPABASE_URL")||"";
const SERVICE=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const PAYSTACK=Deno.env.get("PAYSTACK_SECRET_KEY")||"";
const ORIGIN="https://ranovaprimeent.github.io";
const db=createClient(U,SERVICE,{auth:{persistSession:false,autoRefreshToken:false}});

function cors(origin:string|null){
  const allow=origin===ORIGIN||origin?.startsWith("http://localhost")?origin:ORIGIN;
  return {"Content-Type":"application/json","Access-Control-Allow-Origin":allow||ORIGIN,
    "Access-Control-Allow-Headers":"content-type,x-ranova-client,authorization,apikey,x-paystack-signature",
    "Access-Control-Allow-Methods":"POST,OPTIONS"};
}
function resp(h:any,status:number,p:any){return new Response(JSON.stringify(p),{status,headers:h})}
function clean(v:any,n=300){return String(v??"").trim().slice(0,n)}
function digits(v:any){return String(v??"").replace(/\D/g,"")}
async function sha256(v:string){const d=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(v));return Array.from(new Uint8Array(d)).map(x=>x.toString(16).padStart(2,"0")).join("")}
async function optionalUser(req:Request){
  const a=req.headers.get("authorization")||"";if(!a.startsWith("Bearer "))return null;
  const {data,error}=await db.auth.getUser(a.slice(7));return error?null:data.user;
}
async function hmac512(raw:string,key:string){
  const k=await crypto.subtle.importKey("raw",new TextEncoder().encode(key),{name:"HMAC",hash:"SHA-512"},false,["sign"]);
  const sig=await crypto.subtle.sign("HMAC",k,new TextEncoder().encode(raw));
  return Array.from(new Uint8Array(sig)).map(x=>x.toString(16).padStart(2,"0")).join("");
}
async function paystack(path:string,init:RequestInit={}){
  if(!PAYSTACK)throw new Error("PAYSTACK_NOT_CONFIGURED");
  const r=await fetch("https://api.paystack.co"+path,{...init,headers:{
    "Authorization":"Bearer "+PAYSTACK,
    "Content-Type":"application/json",
    ...(init.headers||{})
  }});
  const o=await r.json().catch(()=>({}));
  if(!r.ok||o?.status===false)throw new Error(o?.message||"Paystack request failed.");
  return o;
}
async function orderAccess(req:Request,b:any){
  const ref=clean(b.order_ref,100).toUpperCase();
  if(!ref)return {error:"Order reference is required."};
  const {data:o}=await db.from("ranova_customer_orders").select("*").eq("order_ref",ref).maybeSingle();
  if(!o)return {error:"Order not found."};
  const u=await optionalUser(req);
  if(u&&o.buyer_user_id===u.id)return {order:o,user:u,mode:"account"};
  const phone=digits(b.phone),code=clean(b.buyer_access_code,40).toUpperCase();
  if(!phone||!code)return {error:"Use your signed-in buyer account or provide phone number and Buyer Security Code."};
  if(digits(o.customer_phone)!==phone)return {error:"Order verification failed."};
  if((await sha256(code))!==o.buyer_access_code_hash)return {error:"Order verification failed."};
  return {order:o,user:u,mode:"security_code"};
}
async function verifyAndConfirm(reference:string){
  const {data:p}=await db.from("ranova_marketplace_payments").select("*").eq("provider","paystack").eq("provider_reference",reference).maybeSingle();
  if(!p)throw new Error("RANOVA payment record not found.");
  const {data:o}=await db.from("ranova_customer_orders").select("*").eq("id",p.parent_order_id).maybeSingle();
  if(!o)throw new Error("Marketplace order not found.");
  const v=await paystack("/transaction/verify/"+encodeURIComponent(reference),{method:"GET"});
  const d=v.data||{};
  if(d.status!=="success")return {ok:false,status:d.status||"pending",order_ref:o.order_ref};
  const expected=Math.round(Number(o.total_payment||0)*100);
  if(Number(d.amount)!==expected)throw new Error("Payment amount does not match the RANOVA order total.");
  if(String(d.currency||"").toUpperCase()!=="GHS")throw new Error("Payment currency does not match this RANOVA order.");
  const {data:confirmed,error}=await db.rpc("ranova_confirm_marketplace_payment",{
    p_parent_order_id:o.id,p_provider:"paystack",p_provider_reference:reference,
    p_provider_transaction_id:String(d.id||""),p_provider_channel:String(d.channel||""),
    p_provider_payload:d,p_confirmed_by:null
  });
  if(error)throw error;
  return {ok:true,status:"success",order_ref:o.order_ref,payment:confirmed};
}
async function processWebhook(raw:string,event:any){
  const type=clean(event?.event,120),d=event?.data||{};
  const key=type+":"+String(d.id||d.reference||crypto.randomUUID());
  const {data:existing}=await db.from("ranova_payment_provider_events").select("id,processing_status").eq("provider","paystack").eq("event_key",key).maybeSingle();
  if(existing?.processing_status==="processed")return;
  const {data:row,error}=await db.from("ranova_payment_provider_events").upsert({
    provider:"paystack",event_key:key,event_type:type,provider_reference:String(d.reference||"")||null,
    payload:event,processing_status:"received"
  },{onConflict:"provider,event_key"}).select("id").single();
  if(error)throw error;
  try{
    if(type==="charge.success"&&d.reference){
      await verifyAndConfirm(String(d.reference));
    }else if(["transfer.success","transfer.failed","transfer.reversed"].includes(type)&&d.reference){
      const status=type==="transfer.success"?"paid":type==="transfer.reversed"?"eligible":"held";
      const {data:p}=await db.from("ranova_seller_payouts").select("*").eq("payout_reference",String(d.reference)).maybeSingle();
      if(p){
        const now=new Date().toISOString();
        await db.from("ranova_seller_payouts").update({
          payout_status:status,provider_status:String(d.status||type),
          paid_at:status==="paid"?now:p.paid_at,
          failure_reason:type==="transfer.failed"?String(d.failures||d.reason||"Transfer failed"):null,
          updated_at:now
        }).eq("id",p.id);
        if(status==="paid")await db.from("ranova_settlement_ledger").insert({
          entry_ref:"PAYOUT:"+p.id,entry_type:"seller_payout",seller_order_id:p.seller_order_id,payout_id:p.id,
          seller_id:p.seller_id,store_id:p.store_id,amount:p.payout_amount,currency:p.currency,
          direction:"debit",status:"posted",provider:"paystack",provider_reference:String(d.reference),
          note:"Supplier payout completed through Paystack."
        }).select("id").maybeSingle();
      }
    }else if(type.startsWith("refund.")&&d.id){
      const providerRefundId=String(d.id),providerStatus=type.split(".")[1]||String(d.status||"");
      const {data:r}=await db.from("ranova_marketplace_refunds").select("*").eq("provider","paystack").eq("provider_refund_id",providerRefundId).maybeSingle();
      if(r){
        const next=providerStatus==="processed"?"refunded":providerStatus==="failed"?"approved":"processing";
        await db.from("ranova_marketplace_refunds").update({
          provider_status:providerStatus,status:next,
          refunded_at:next==="refunded"?new Date().toISOString():r.refunded_at,
          updated_at:new Date().toISOString(),provider_payload:d
        }).eq("id",r.id);
        if(next==="refunded")await db.from("ranova_settlement_ledger").insert({
          entry_ref:"REFUND:"+r.id,entry_type:"refund",customer_order_id:r.customer_order_id,
          seller_order_id:r.seller_order_id,refund_id:r.id,amount:Number(r.approved_amount||r.requested_amount||0),
          currency:r.currency||"GHS",direction:"debit",status:"posted",provider:"paystack",
          provider_reference:providerRefundId,note:"Customer refund processed through Paystack."
        }).select("id").maybeSingle();
      }
    }
    await db.from("ranova_payment_provider_events").update({processing_status:"processed",processed_at:new Date().toISOString(),error_text:null}).eq("id",row.id);
  }catch(e){
    await db.from("ranova_payment_provider_events").update({processing_status:"failed",processed_at:new Date().toISOString(),error_text:e instanceof Error?e.message:String(e)}).eq("id",row.id);
    throw e;
  }
}

Deno.serve(async(req:Request)=>{
  const h=cors(req.headers.get("origin"));
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:h});
  if(req.method!=="POST")return resp(h,405,{ok:false,error:"Method not allowed"});

  const sig=req.headers.get("x-paystack-signature");
  if(sig){
    const raw=await req.text();
    if(!PAYSTACK)return resp(h,503,{ok:false,error:"Payment provider is not configured."});
    const expected=await hmac512(raw,PAYSTACK);
    if(expected!==sig)return resp(h,401,{ok:false,error:"Invalid webhook signature."});
    let event:any={};try{event=JSON.parse(raw)}catch{return resp(h,400,{ok:false,error:"Invalid webhook payload."})}
    try{await processWebhook(raw,event);return resp(h,200,{ok:true})}
    catch(e){console.error(e);return resp(h,500,{ok:false,error:"Webhook processing failed."})}
  }

  if(req.headers.get("x-ranova-client")!=="ranova-site-v1")return resp(h,403,{ok:false,error:"Invalid client"});
  let b:any={};try{b=await req.json()}catch{}
  const action=clean(b.action,40);
  try{
    if(action==="provider_status")return resp(h,200,{ok:true,provider:"paystack",configured:!!PAYSTACK,mode:PAYSTACK.startsWith("sk_live_")?"live":PAYSTACK?"test":"not_configured"});

    const access:any=await orderAccess(req,b);
    if(access.error)return resp(h,403,{ok:false,error:access.error});
    const o=access.order;

    if(action==="status"){
      const {data:p}=await db.from("ranova_marketplace_payments").select("payment_status,provider,provider_reference,provider_channel,provider_status,paid_at,amount,currency").eq("parent_order_id",o.id).maybeSingle();
      return resp(h,200,{ok:true,order_ref:o.order_ref,order_payment_status:o.payment_status,payment:p||null,provider_configured:!!PAYSTACK});
    }

    if(action==="initialize"){
      if(!PAYSTACK)return resp(h,503,{ok:false,error:"Secure online payment is not configured yet. RANOVA must add the Paystack secret key in Supabase before live payments can start.",provider_not_configured:true});
      if(o.payment_status==="paid")return resp(h,409,{ok:false,error:"This order is already paid."});
      if(o.status!=="awaiting_payment")return resp(h,409,{ok:false,error:"Payment is not open yet. Each supplier must first confirm the final product and delivery amount."});
      if(o.total_payment===null||Number(o.total_payment)<=0)return resp(h,409,{ok:false,error:"The final RANOVA order total is not ready for payment."});
      if(["expired","released"].includes(String(o.inventory_status||"")))return resp(h,409,{ok:false,error:"The inventory hold has expired. Place the order again before paying."});
      if(!o.customer_email)return resp(h,409,{ok:false,error:"An email address is required for secure online payment."});

      const reference=("rnv_"+o.order_ref.replace(/[^a-zA-Z0-9]/g,"_")+"_"+crypto.randomUUID().slice(0,8)).slice(0,100);
      const {data:existing}=await db.from("ranova_marketplace_payments").select("*").eq("parent_order_id",o.id).maybeSingle();
      if(existing?.payment_status==="confirmed")return resp(h,409,{ok:false,error:"This order is already paid."});

      await db.from("ranova_marketplace_payments").upsert({
        parent_order_id:o.id,order_ref:o.order_ref,amount:o.total_payment,currency:"GHS",
        payment_method:o.payment_method,payment_status:"pending",provider:"paystack",
        provider_reference:reference,provider_status:"initialized",payer_reference:reference,
        updated_at:new Date().toISOString()
      },{onConflict:"parent_order_id"});

      const init=await paystack("/transaction/initialize",{method:"POST",body:JSON.stringify({
        email:o.customer_email,amount:String(Math.round(Number(o.total_payment)*100)),currency:"GHS",reference,
        callback_url:ORIGIN+"/appliances/all/order-status.html?ref="+encodeURIComponent(o.order_ref)+"&payment_return=1",
        metadata:JSON.stringify({ranova_order_ref:o.order_ref,ranova_order_id:o.id,buyer_protection:true})
      })});
      return resp(h,200,{ok:true,order_ref:o.order_ref,reference,authorization_url:init.data?.authorization_url,access_code:init.data?.access_code});
    }

    if(action==="verify"){
      const reference=clean(b.reference,120);
      const {data:p}=reference
        ?await db.from("ranova_marketplace_payments").select("*").eq("parent_order_id",o.id).eq("provider_reference",reference).maybeSingle()
        :await db.from("ranova_marketplace_payments").select("*").eq("parent_order_id",o.id).eq("provider","paystack").maybeSingle();
      if(!p?.provider_reference)return resp(h,404,{ok:false,error:"No Paystack payment attempt was found for this order."});
      const verified=await verifyAndConfirm(p.provider_reference);
      return resp(h,200,verified);
    }

    return resp(h,400,{ok:false,error:"Unknown payment action."});
  }catch(e){
    console.error(e);
    const msg=e instanceof Error?e.message:"Payment request failed.";
    if(msg==="PAYSTACK_NOT_CONFIGURED")return resp(h,503,{ok:false,error:"Secure online payment is not configured yet.",provider_not_configured:true});
    return resp(h,500,{ok:false,error:msg});
  }
});