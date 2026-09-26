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
function clean(v:any,max=180){return String(v??"").trim().slice(0,max)}
function normalPhone(v:string){return v.replace(/\D/g,"").replace(/^233/,"0")}
function response(h:Record<string,string>,status:number,payload:any){return new Response(JSON.stringify(payload),{status,headers:h})}

Deno.serve(async(req:Request)=>{
  const h=headers(req.headers.get("origin"));
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:h});
  if(req.method!=="POST")return response(h,405,{ok:false,error:"Method not allowed"});
  if(req.headers.get("x-ranova-client")!=="ranova-site-v1")return response(h,403,{ok:false,error:"Invalid client"});

  try{
    const b=await req.json();
    const order_ref=clean(b.order_ref,90).toUpperCase();
    const phone=normalPhone(clean(b.phone,40));
    if(!order_ref||!phone)return response(h,400,{ok:false,error:"Enter your order reference and phone number."});

    const {data:order,error}=await admin.from("ranova_customer_orders")
      .select("id,order_ref,customer_name,customer_phone,customer_email,delivery_location,buyer_country_code,buyer_country_name,payment_method,product_name,quantity,product_total,delivery_fee,total_payment,payment_processing_rate,payment_processing_fee,payment_fee_payer,items,item_count,status,payment_status,buyer_note,order_source,seller_order_count,created_at")
      .eq("order_ref",order_ref).maybeSingle();
    if(error||!order)return response(h,404,{ok:false,error:"Order not found. Check the reference and try again."});
    if(normalPhone(String(order.customer_phone||""))!==phone)return response(h,403,{ok:false,error:"The phone number does not match this order."});

    const {data:children}=await admin.from("ranova_seller_orders")
      .select("id,order_ref,platform_order_ref,store_id,buyer_name,delivery_location,items,item_count,subtotal,delivery_fee,total,currency,payment_method,payment_status,order_status,buyer_note,seller_note,created_at,updated_at")
      .eq("parent_order_id",order.id)
      .order("created_at",{ascending:true});

    const storeIds=[...new Set((children||[]).map((x:any)=>x.store_id))];
    let stores:any[]=[];
    if(storeIds.length){
      const out=await admin.from("ranova_seller_stores")
        .select("id,store_name,slug,public_phone,public_email,store_status")
        .in("id",storeIds);
      stores=out.data||[];
    }
    const storeMap=new Map(stores.map((s:any)=>[s.id,s]));

    let payment_instructions:any=null;
    const paymentDue=order.status==="awaiting_payment"&&!["paid","confirmed","refunded"].includes(String(order.payment_status||"").toLowerCase());
    if(paymentDue&&order.payment_method){
      const {data:accounts}=await admin.from("ranova_marketplace_payment_accounts")
        .select("payment_method,provider_name,account_name,account_reference,instructions,updated_at")
        .eq("payment_method",order.payment_method)
        .eq("active",true)
        .order("updated_at",{ascending:false})
        .limit(1);
      const account=accounts?.[0];
      if(account){
        payment_instructions={
          payment_method:account.payment_method,
          provider_name:account.provider_name,
          account_name:account.account_name,
          account_reference:account.account_reference,
          instructions:account.instructions,
          amount:order.total_payment,
          currency:"GHS"
        };
      }
    }

    return response(h,200,{
      ok:true,
      order:{
        order_ref:order.order_ref,
        customer_name:order.customer_name,
        delivery_location:order.delivery_location,
        buyer_country_code:order.buyer_country_code,
        buyer_country_name:order.buyer_country_name,
        payment_method:order.payment_method,
        payment_processing_rate:order.payment_processing_rate,
        payment_processing_fee:order.payment_processing_fee,
        payment_fee_payer:order.payment_fee_payer,
        product_name:order.product_name,
        quantity:order.quantity,
        product_total:order.product_total,
        delivery_fee:order.delivery_fee,
        total_payment:order.total_payment,
        items:order.items||[],
        item_count:order.item_count,
        status:order.status,
        payment_status:order.payment_status,
        buyer_note:order.buyer_note,
        order_source:order.order_source,
        seller_order_count:order.seller_order_count,
        created_at:order.created_at
      },
      payment_instructions,
      seller_orders:(children||[]).map((x:any)=>{
        const s:any=storeMap.get(x.store_id)||{};
        return {
          order_ref:x.order_ref,
          store_name:s.store_name||"Seller store",
          store_slug:s.slug||null,
          store_status:s.store_status||null,
          items:x.items||[],
          item_count:x.item_count,
          subtotal:x.subtotal,
          delivery_fee:x.delivery_fee,
          total:x.total,
          currency:x.currency,
          payment_method:x.payment_method,
          payment_status:x.payment_status,
          order_status:x.order_status,
          seller_note:x.seller_note,
          updated_at:x.updated_at
        };
      })
    });
  }catch(e){
    console.error(e);
    return response(h,500,{ok:false,error:"Could not load the order status. Please try again."});
  }
});