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
function response(h:Record<string,string>,status:number,payload:any){return new Response(JSON.stringify(payload),{status,headers:h})}
function int(v:any,min=1,max=1000000){const n=Math.trunc(Number(v));return Number.isFinite(n)?Math.max(min,Math.min(max,n)):min}
async function getUser(req:Request){
  const auth=req.headers.get("authorization")||"";
  if(!auth.startsWith("Bearer "))return null;
  const {data,error}=await admin.auth.getUser(auth.slice(7));
  return error?null:data.user;
}
function enforcementStatus(e:any){if(!e)return "good_standing";if(e.ends_at&&new Date(e.ends_at).getTime()<=Date.now())return "good_standing";return String(e.enforcement_status||"good_standing")}
function tierPrice(p:any,q:number){
  let price=p.price==null?null:Number(p.price);
  const tiers=Array.isArray(p.pricing_tiers)?p.pricing_tiers.slice().sort((a:any,b:any)=>Number(a.min_qty)-Number(b.min_qty)):[];
  for(const t of tiers)if(q>=Number(t?.min_qty||0)&&Number.isFinite(Number(t?.unit_price)))price=Number(t.unit_price);
  return price;
}
Deno.serve(async(req:Request)=>{
  const h=headers(req.headers.get("origin"));
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:h});
  if(req.method!=="POST")return response(h,405,{ok:false,error:"Method not allowed"});
  if(req.headers.get("x-ranova-client")!=="ranova-site-v1")return response(h,403,{ok:false,error:"Invalid client"});
  try{
    const b=await req.json().catch(()=>({})),buyerCountry=clean(b.buyer_country_code,2).toUpperCase();
    const raw=Array.isArray(b.items)?b.items.slice(0,100):[];
    const normalized=raw.map((x:any)=>({product_id:clean(x?.product_id||x?.seller_product_id,80),quantity:int(x?.quantity,1)})).filter((x:any)=>x.product_id);
    if(!normalized.length)return response(h,200,{ok:true,groups:[],item_count:0,total_quantity:0,product_total:0,all_prices_known:true});
    const ids=[...new Set(normalized.map((x:any)=>x.product_id))];
    const [{data:products},{data:stores},{data:enforcement}]=await Promise.all([
      admin.from("ranova_seller_products").select("id,seller_id,store_id,name,sku,category,price,currency,moq,stock_quantity,stock_status,unit_label,primary_image_url,pricing_tiers,product_status").in("id",ids),
      admin.from("ranova_seller_stores").select("id,seller_id,store_name,slug,logo_url,country_code,country_name,store_status").in("id",(await admin.from("ranova_seller_products").select("store_id").in("id",ids)).data?.map((x:any)=>x.store_id)||[]),
      admin.from("ranova_seller_enforcement").select("store_id,enforcement_status,ends_at").in("store_id",(await admin.from("ranova_seller_products").select("store_id").in("id",ids)).data?.map((x:any)=>x.store_id)||[])
    ]);
    const {data:holds}=await admin.from("ranova_inventory_reservations").select("product_id,quantity").in("product_id",ids).eq("status","held").gt("expires_at",new Date().toISOString());
    const heldByProduct=new Map<string,number>();
    (holds||[]).forEach((x:any)=>heldByProduct.set(x.product_id,(heldByProduct.get(x.product_id)||0)+Number(x.quantity||0)));
    const pm=new Map((products||[]).map((x:any)=>[x.id,x])),sm=new Map((stores||[]).map((x:any)=>[x.id,x])),em=new Map((enforcement||[]).map((x:any)=>[x.store_id,x]));
    const groups=new Map<string,any>();
    for(const item of normalized){
      const p:any=pm.get(item.product_id);
      if(!p||p.product_status!=="active")continue;
      const s:any=sm.get(p.store_id);
      if(!s||s.store_status!=="active")continue;
      const status=enforcementStatus(em.get(s.id));
      const unavailable=["restricted","suspended"].includes(status)||p.stock_status==="out_of_stock";
      const held=heldByProduct.get(p.id)||0;
      const availableStock=p.stock_quantity==null?null:Math.max(0,Number(p.stock_quantity)-held);
      const quantity=Math.max(Number(p.moq||1),item.quantity);
      const shortage=availableStock!==null&&quantity>availableStock;
      const price=tierPrice(p,quantity),lineTotal=price==null?null:Number((price*quantity).toFixed(2));
      if(!groups.has(s.id))groups.set(s.id,{store_id:s.id,store_name:s.store_name,store_slug:s.slug,logo_url:s.logo_url,country_code:s.country_code,country_name:s.country_name,enforcement_status:status,items:[],subtotal:0,all_prices_known:true,delivery_options:[]});
      const g=groups.get(s.id);
      g.items.push({product_id:p.id,name:p.name,sku:p.sku,category:p.category,quantity,requested_quantity:item.quantity,moq:p.moq,stock_quantity:p.stock_quantity,available_stock:availableStock,reserved_quantity:held,stock_status:p.stock_status,unit_label:p.unit_label,primary_image_url:p.primary_image_url,unit_price:price,line_total:lineTotal,pricing_tiers:p.pricing_tiers||[],stock_shortage:shortage,available:!unavailable&&!shortage&&(availableStock===null||availableStock>=Number(p.moq||1))});
      if(lineTotal==null)g.all_prices_known=false;else g.subtotal=Number((g.subtotal+lineTotal).toFixed(2));
    }
    const out=Array.from(groups.values());
    if(buyerCountry&&out.length){
      const {data:zones}=await admin.from("ranova_delivery_zones").select("id,store_id,zone_name,country_code,area_description,fulfilment_method,pricing_type,fixed_fee,currency,eta_min_days,eta_max_days").in("store_id",out.map((x:any)=>x.store_id)).eq("active",true).eq("country_code",buyerCountry);
      out.forEach((g:any)=>g.delivery_options=(zones||[]).filter((z:any)=>z.store_id===g.store_id));
    }
    const user=await getUser(req);
    return response(h,200,{ok:true,buyer_authenticated:!!user,groups:out,
      item_count:out.reduce((n:number,g:any)=>n+g.items.length,0),
      total_quantity:out.reduce((n:number,g:any)=>n+g.items.reduce((a:number,x:any)=>a+x.quantity,0),0),
      all_prices_known:out.every((g:any)=>g.all_prices_known),
      product_total:out.every((g:any)=>g.all_prices_known)?Number(out.reduce((n:number,g:any)=>n+g.subtotal,0).toFixed(2)):null,
      note:"Delivery is calculated per seller. Fixed/free delivery can be shown when a matching published zone exists; quoted delivery is confirmed before payment."
    });
  }catch(e){console.error(e);return response(h,500,{ok:false,error:"Could not prepare marketplace cart."})}
});