import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const HUBTEL_CLIENT_ID=Deno.env.get("HUBTEL_CLIENT_ID")||"";
const HUBTEL_CLIENT_SECRET=Deno.env.get("HUBTEL_CLIENT_SECRET")||"";
const HUBTEL_MERCHANT_ID=Deno.env.get("HUBTEL_MERCHANT_ID")||"";
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
function json(h:Record<string,string>,status:number,payload:any){
  return new Response(JSON.stringify(payload),{status,headers:h});
}
function clean(v:any,max=180){return String(v??"").trim().slice(0,max)}
async function authUser(req:Request){
  const auth=req.headers.get("authorization")||"";
  if(!auth.startsWith("Bearer "))return null;
  const {data:{user},error}=await admin.auth.getUser(auth.slice(7));
  return error?null:user;
}
function hubtelCredentialState(){
  return {
    provider:"hubtel",
    credentials_present:!!(HUBTEL_CLIENT_ID&&HUBTEL_CLIENT_SECRET),
    merchant_id_present:!!HUBTEL_MERCHANT_ID,
    live_adapter_enabled:false
  };
}
async function ownedOrder(orderRef:string,userId:string){
  const {data,error}=await admin.from("ranova_customer_orders").select("*").eq("order_ref",orderRef).maybeSingle();
  if(error)throw error;
  if(!data||data.buyer_user_id!==userId)return null;
  return data;
}
async function paymentFor(order:any){
  const {data,error}=await admin.from("ranova_marketplace_payments").select("*").eq("parent_order_id",order.id).maybeSingle();
  if(error)throw error;
  return data||null;
}
async function ensurePayment(order:any){
  const amount=order.total_payment==null?null:Number(order.total_payment);
  const payload={
    parent_order_id:order.id,
    order_ref:order.order_ref,
    amount,
    currency:order.currency||"GHS",
    payment_method:order.payment_method||null,
    payment_status:"pending",
    provider:"hubtel",
    updated_at:new Date().toISOString()
  };
  const {data,error}=await admin.from("ranova_marketplace_payments")
    .upsert(payload,{onConflict:"parent_order_id"})
    .select("*").single();
  if(error)throw error;
  return data;
}
async function activeCollectionAccount(){
  const {data,error}=await admin.from("ranova_marketplace_payment_accounts")
    .select("id,payment_method,provider_name,account_name,account_reference,instructions,active")
    .eq("active",true).order("updated_at",{ascending:false}).limit(1).maybeSingle();
  if(error)throw error;
  return data||null;
}

Deno.serve(async(req:Request)=>{
  const h=headers(req.headers.get("origin"));
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:h});
  if(req.method!=="POST")return json(h,405,{ok:false,error:"Method not allowed."});
  if(req.headers.get("x-ranova-client")!=="ranova-site-v1")return json(h,403,{ok:false,error:"Invalid client."});

  const user=await authUser(req);
  if(!user)return json(h,401,{ok:false,error:"Sign in before using RANOVA payments."});

  let body:any={};
  try{body=await req.json()}catch{}
  const action=clean(body.action,40);
  const orderRef=clean(body.order_ref,100);

  try{
    if(action==="provider_status"){
      return json(h,200,{ok:true,...hubtelCredentialState(),mode:"pre_live"});
    }

    if(!orderRef)return json(h,400,{ok:false,error:"Order reference is required."});
    const order=await ownedOrder(orderRef,user.id);
    if(!order)return json(h,404,{ok:false,error:"Order not found."});

    if(action==="status"){
      const payment=await paymentFor(order);
      return json(h,200,{
        ok:true,
        order_ref:order.order_ref,
        order_payment_status:order.payment_status||"not_started",
        payment:payment?{
          id:payment.id,
          payment_status:payment.payment_status,
          provider:payment.provider||"hubtel",
          provider_status:payment.provider_status||null,
          provider_reference:payment.provider_reference||null,
          amount:payment.amount,
          currency:payment.currency
        }:null
      });
    }

    if(action==="verify"){
      // Before the Hubtel contract/credentials are supplied, RANOVA must never
      // trust a browser-provided transaction reference as proof of payment.
      // This action only reports the server-side state. Live verification will
      // be added here against Hubtel's documented API once provisioned.
      const payment=await paymentFor(order);
      const confirmed=payment?.payment_status==="confirmed"||order.payment_status==="paid";
      return json(h,200,{
        ok:true,
        confirmed,
        order_ref:order.order_ref,
        order_payment_status:order.payment_status||"not_started",
        payment_status:payment?.payment_status||"pending",
        provider:"hubtel",
        mode:"pre_live"
      });
    }

    if(action==="initialize"){
      if(order.total_payment==null||!(Number(order.total_payment)>0)){
        return json(h,409,{ok:false,error:"This order total is not ready for payment yet."});
      }
      const payment=await ensurePayment(order);
      const state=hubtelCredentialState();

      // Credentials alone are not enough: the live Hubtel contract, exact
      // collection endpoint, callback requirements and transfer product must
      // be confirmed before RANOVA sends money-related requests.
      if(state.credentials_present&&state.live_adapter_enabled){
        return json(h,503,{ok:false,error:"Hubtel live adapter is awaiting final activation."});
      }

      const collection=await activeCollectionAccount();
      if(!collection){
        return json(h,503,{
          ok:false,
          error:"RANOVA payments are being prepared. Hubtel live collection is awaiting activation and no manual collection account is active."
        });
      }

      const reference=("RNV-"+order.order_ref+"-"+payment.id.slice(0,8)).replace(/[^A-Za-z0-9-]/g,"").slice(0,80);
      await admin.from("ranova_marketplace_payments").update({
        payer_reference:reference,
        initialized_at:new Date().toISOString(),
        provider:"hubtel",
        provider_status:"pre_live_manual_collection",
        updated_at:new Date().toISOString()
      }).eq("id",payment.id);

      return json(h,200,{
        ok:true,
        payment_mode:"manual_collection_account",
        provider:"hubtel",
        mode:"pre_live",
        order_ref:order.order_ref,
        amount:Number(order.total_payment),
        currency:order.currency||"GHS",
        reference,
        collection_account:collection,
        protection_note:"RANOVA will not mark this order paid until the payment is independently verified on the server."
      });
    }

    return json(h,400,{ok:false,error:"Unsupported payment action."});
  }catch(e){
    console.error(e);
    return json(h,500,{ok:false,error:"RANOVA payment service is temporarily unavailable."});
  }
});
