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
    "Access-Control-Allow-Headers":"content-type,x-ranova-client",
    "Access-Control-Allow-Methods":"POST,OPTIONS"
  };
}
function response(h:Record<string,string>,status:number,payload:any){return new Response(JSON.stringify(payload),{status,headers:h})}
function clean(v:any,max=180){return String(v??"").trim().slice(0,max)}
async function resolveRule(storeId:string,sellerCountry:string|null,buyerCountry:string,paymentMethod:string){
  const now=new Date().toISOString();
  const {data:rows,error}=await admin.from("ranova_marketplace_country_rules")
    .select("id,store_id,seller_country_code,buyer_country_code,payment_method,commission_rate,required_payment_percent,payment_processing_rate,payment_fixed_fee,payment_fee_payer,currency,source_name,source_kind,source_verified_at,effective_from,rule_version,change_reason")
    .eq("active",true).is("effective_to",null).lte("effective_from",now).order("effective_from",{ascending:false});
  if(error)throw error;
  const eligible=(rows||[]).filter((r:any)=>{
    if(r.store_id&&r.store_id!==storeId)return false;
    if(r.seller_country_code&&r.seller_country_code!==sellerCountry)return false;
    if(r.buyer_country_code&&r.buyer_country_code!==buyerCountry)return false;
    if(r.payment_method&&r.payment_method!==paymentMethod)return false;
    return true;
  });
  eligible.sort((a:any,b:any)=>{
    const score=(x:any)=>(x.store_id?8:0)+(x.seller_country_code?4:0)+(x.buyer_country_code?2:0)+(x.payment_method?1:0);
    const d=score(b)-score(a);
    if(d)return d;
    return Number(b.rule_version||1)-Number(a.rule_version||1);
  });
  return eligible[0]||null;
}

Deno.serve(async(req:Request)=>{
  const h=headers(req.headers.get("origin"));
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:h});
  if(req.method!=="POST")return response(h,405,{ok:false,error:"Method not allowed"});
  if(req.headers.get("x-ranova-client")!=="ranova-site-v1")return response(h,403,{ok:false,error:"Invalid client"});
  let b:any={};try{b=await req.json()}catch{}
  try{
    const storeId=clean(b.store_id,80);
    const buyerCountry=clean(b.buyer_country_code,2).toUpperCase();
    const paymentMethod=clean(b.payment_method,40);
    const subtotalRaw=b.subtotal;
    const subtotal=subtotalRaw===null||subtotalRaw===undefined||subtotalRaw===""?null:Number(subtotalRaw);
    if(!storeId||!/^[A-Z]{2}$/.test(buyerCountry)||!["Mobile Money","Bank Transfer"].includes(paymentMethod)){
      return response(h,400,{ok:false,error:"Store, buyer country and payment method are required."});
    }
    if(subtotal!==null&&(!Number.isFinite(subtotal)||subtotal<0))return response(h,400,{ok:false,error:"Invalid subtotal."});

    const {data:store,error:storeErr}=await admin.from("ranova_seller_stores")
      .select("id,store_name,country_code,country_name,store_status")
      .eq("id",storeId).maybeSingle();
    if(storeErr)throw storeErr;
    if(!store||store.store_status!=="active")return response(h,404,{ok:false,error:"Store is not currently available."});

    const rule=await resolveRule(store.id,store.country_code||null,buyerCountry,paymentMethod);
    const rate=Number(rule?.payment_processing_rate||0);
    const fixed=Number(rule?.payment_fixed_fee||0);
    const payer=String(rule?.payment_fee_payer||"platform");
    const rawFee=subtotal===null?null:Number((subtotal*rate/100+fixed).toFixed(2));
    const buyerFee=payer==="buyer"?(rawFee??null):(subtotal===null?null:0);
    const buyerTotal=subtotal===null?null:Number((subtotal+Number(buyerFee||0)).toFixed(2));
    const payerText=payer==="buyer"?"Buyer":payer==="seller"?"Seller":"RANOVA";

    return response(h,200,{
      ok:true,
      store:{name:store.store_name,country_code:store.country_code,country_name:store.country_name},
      buyer_country_code:buyerCountry,
      payment_method:paymentMethod,
      buyer:{
        provider_fee_rate:payer==="buyer"?rate:0,
        provider_fixed_fee:payer==="buyer"?fixed:0,
        provider_fee_estimate:buyerFee,
        subtotal_estimate:subtotal,
        total_before_delivery_estimate:buyerTotal,
        seller_commission_added_to_buyer_price:false
      },
      transparency:{
        fee_payer:payer,
        fee_payer_label:payerText,
        message:payer==="buyer"
          ?"The buyer pays the payment-provider processing fee shown here. RANOVA seller commission is not added to the buyer's price."
          :payer==="seller"
            ?"The seller absorbs the payment-provider processing fee. The buyer is not charged that provider fee by RANOVA."
            :"RANOVA absorbs the payment-provider processing fee. The buyer is not charged that provider fee.",
        delivery_note:"Delivery is quoted separately and is not included in this preview."
      },
      rule:{
        version:Number(rule?.rule_version||1),
        effective_from:rule?.effective_from||null,
        source_name:rule?.source_name||"RANOVA global fallback",
        source_kind:rule?.source_kind||"owner_policy",
        source_verified_at:rule?.source_verified_at||null
      }
    });
  }catch(e){
    console.error(e);
    return response(h,500,{ok:false,error:"Fee preview could not be calculated."});
  }
});