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
    "Access-Control-Allow-Headers":"content-type,x-ranova-client,apikey",
    "Access-Control-Allow-Methods":"GET,OPTIONS",
    "Cache-Control":"public,max-age=300"
  };
}
function weekBounds(offsetWeeks=0){
  const now=new Date();
  const day=now.getUTCDay();
  const daysSinceMonday=(day+6)%7;
  const currentStart=new Date(Date.UTC(now.getUTCFullYear(),now.getUTCMonth(),now.getUTCDate()-daysSinceMonday,0,0,0,0));
  const start=new Date(currentStart.getTime()-offsetWeeks*7*24*60*60*1000);
  const end=new Date(start.getTime()+7*24*60*60*1000-1);
  return {start,end};
}

Deno.serve(async(req:Request)=>{
  const h=headers(req.headers.get("origin"));
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:h});
  if(req.method!=="GET")return new Response(JSON.stringify({ok:false,error:"Method not allowed"}),{status:405,headers:h});
  if(req.headers.get("x-ranova-client")!=="ranova-site-v1")return new Response(JSON.stringify({ok:false,error:"Invalid client"}),{status:403,headers:h});

  try{
    let sourceOffset=0;
    let {start,end}=weekBounds(0);
    let payments:any[]=[];

    // Use this Monday-Sunday period first. If it has no confirmed purchases,
    // reuse the most recent earlier week that had purchases.
    for(let offset=0;offset<=12;offset++){
      const bounds=weekBounds(offset);
      const result=await admin.from("ranova_marketplace_payments")
        .select("parent_order_id,payment_status,updated_at")
        .in("payment_status",["confirmed","paid"])
        .gte("updated_at",bounds.start.toISOString())
        .lte("updated_at",bounds.end.toISOString())
        .limit(5000);
      if(result.error)throw result.error;
      if((result.data||[]).length){
        sourceOffset=offset;
        start=bounds.start;
        end=bounds.end;
        payments=result.data||[];
        break;
      }
    }

    const orderIds=[...new Set((payments||[]).map((p:any)=>p.parent_order_id).filter(Boolean))];
    if(!orderIds.length){
      return new Response(JSON.stringify({
        ok:true,
        week_start:weekBounds(0).start.toISOString(),
        week_end:weekBounds(0).end.toISOString(),
        source_week_start:null,
        source_week_end:null,
        fallback:true,
        products:[]
      }),{status:200,headers:h});
    }

    const {data:orders,error:orderError}=await admin.from("ranova_customer_orders")
      .select("id,items")
      .in("id",orderIds);
    if(orderError)throw orderError;

    const totals=new Map<string,{product_id:string,purchase_quantity:number,order_count:number}>();
    for(const order of orders||[]){
      const seenInOrder=new Set<string>();
      for(const item of Array.isArray((order as any).items)?(order as any).items:[]){
        const productId=String(item?.seller_product_id||"").trim();
        if(!productId)continue;
        const quantity=Math.max(1,Math.floor(Number(item?.quantity||1)));
        const row=totals.get(productId)||{product_id:productId,purchase_quantity:0,order_count:0};
        row.purchase_quantity+=quantity;
        if(!seenInOrder.has(productId)){row.order_count+=1;seenInOrder.add(productId)}
        totals.set(productId,row);
      }
    }

    const products=[...totals.values()]
      .sort((a,b)=>b.purchase_quantity-a.purchase_quantity||b.order_count-a.order_count||a.product_id.localeCompare(b.product_id))
      .slice(0,20);

    return new Response(JSON.stringify({
      ok:true,
      week_start:weekBounds(0).start.toISOString(),
      week_end:weekBounds(0).end.toISOString(),
      source_week_start:start.toISOString(),
      source_week_end:end.toISOString(),
      fallback:sourceOffset>0,
      products
    }),{status:200,headers:h});
  }catch(e){
    console.error(e);
    return new Response(JSON.stringify({ok:false,error:"Could not calculate weekly trending products."}),{status:500,headers:h});
  }
});
