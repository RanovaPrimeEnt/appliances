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
function refCode(){
  const d=new Date(),y=d.getUTCFullYear(),m=String(d.getUTCMonth()+1).padStart(2,"0"),day=String(d.getUTCDate()).padStart(2,"0");
  const token=crypto.randomUUID().replace(/-/g,"").slice(0,6).toUpperCase();
  return `RPE-${y}${m}${day}-${token}`;
}
function uuidLike(v:any){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(v||""))}
function normalizeRawItems(raw:any[]){
  const out:any[]=[];
  for(const x of Array.isArray(raw)?raw:[]){
    const quantity=Math.floor(Number(x?.quantity||0));
    if(quantity<1)continue;
    const seller_product_id=clean(x?.seller_product_id,80);
    if(seller_product_id&&uuidLike(seller_product_id)){
      out.push({kind:"seller",seller_product_id,quantity});
      continue;
    }
    const product_name=clean(x?.product_name,160);
    if(!product_name)continue;
    const unit_price=Number(x?.unit_price||0);
    out.push({
      kind:"ranova",
      product_id:clean(x?.product_id,80)||null,
      product_name,
      quantity,
      unit_price:unit_price>0?Number(unit_price.toFixed(2)):null,
      line_total:unit_price>0?Number((unit_price*quantity).toFixed(2)):null
    });
  }
  return out.slice(0,100);
}
async function approvedSeller(sellerId:string){
  const {data:account}=await admin.from("ranova_seller_accounts").select("application_ref").eq("user_id",sellerId).maybeSingle();
  if(!account)return false;
  const {data:app}=await admin.from("ranova_seller_applications").select("verification_status,status").eq("application_ref",account.application_ref).maybeSingle();
  return String(app?.verification_status||app?.status||"").toLowerCase()==="approved";
}
async function resolveItems(raw:any[]){
  const legacy=raw.filter(x=>x.kind==="ranova");
  const sellerRaw=raw.filter(x=>x.kind==="seller");
  const ids=[...new Set(sellerRaw.map(x=>x.seller_product_id))];
  const resolved:any[]=[...legacy];

  if(ids.length){
    const {data:products,error}=await admin.from("ranova_seller_products")
      .select("id,seller_id,store_id,name,sku,category,price,currency,moq,stock_quantity,stock_status,unit_label,primary_image_url,product_status")
      .in("id",ids);
    if(error)throw error;
    const productMap=new Map((products||[]).map((p:any)=>[p.id,p]));
    const storeIds=[...new Set((products||[]).map((p:any)=>p.store_id))];
    const {data:stores,error:storeError}=await admin.from("ranova_seller_stores")
      .select("id,seller_id,store_name,slug,store_status")
      .in("id",storeIds);
    if(storeError)throw storeError;
    const storeMap=new Map((stores||[]).map((s:any)=>[s.id,s]));
    const sellerApproval=new Map<string,boolean>();

    for(const r of sellerRaw){
      const p:any=productMap.get(r.seller_product_id);
      if(!p||p.product_status!=="active")throw new Error("One of the selected seller products is no longer available.");
      const store:any=storeMap.get(p.store_id);
      if(!store||store.store_status!=="active")throw new Error("One of the selected seller stores is not currently active.");
      if(!sellerApproval.has(p.seller_id))sellerApproval.set(p.seller_id,await approvedSeller(p.seller_id));
      if(!sellerApproval.get(p.seller_id))throw new Error("One of the selected sellers is not currently approved.");
      if(p.stock_status==="out_of_stock")throw new Error(p.name+" is currently out of stock.");
      if(r.quantity<Number(p.moq||1))throw new Error(p.name+" has a minimum order quantity of "+Number(p.moq||1)+".");
      if(p.stock_quantity!==null&&r.quantity>Number(p.stock_quantity))throw new Error("Requested quantity for "+p.name+" is above the seller's listed stock.");

      const unitPrice=p.price===null?null:Number(p.price);
      resolved.push({
        kind:"seller",
        seller_product_id:p.id,
        product_id:p.id,
        product_name:p.name,
        sku:p.sku,
        quantity:r.quantity,
        unit_price:unitPrice,
        line_total:unitPrice===null?null:Number((unitPrice*r.quantity).toFixed(2)),
        seller_id:p.seller_id,
        store_id:p.store_id,
        store_name:store.store_name,
        store_slug:store.slug,
        moq:p.moq,
        unit_label:p.unit_label,
        stock_status:p.stock_status,
        primary_image_url:p.primary_image_url
      });
    }
  }
  return resolved;
}

Deno.serve(async(req:Request)=>{
  const h=headers(req.headers.get("origin"));
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:h});
  if(req.method!=="POST")return new Response(JSON.stringify({ok:false,error:"Method not allowed"}),{status:405,headers:h});
  if(req.headers.get("x-ranova-client")!=="ranova-site-v1")return new Response(JSON.stringify({ok:false,error:"Invalid client"}),{status:403,headers:h});

  let masterId:string|null=null;
  try{
    const b=await req.json();
    const customer_name=clean(b.customer_name,100);
    const customer_phone=clean(b.customer_phone,40);
    const customer_email=clean(b.customer_email,180);
    const delivery_location=clean(b.delivery_location,180);
    const payment_method=clean(b.payment_method,40);
    const buyer_note=clean(b.buyer_note,1000);
    const raw=normalizeRawItems(b.items);

    if(!customer_name||!customer_phone||!delivery_location||raw.length<1){
      return new Response(JSON.stringify({ok:false,error:"Please complete all required order details."}),{status:400,headers:h});
    }
    if(!["Mobile Money","Bank Transfer"].includes(payment_method)){
      return new Response(JSON.stringify({ok:false,error:"Choose Mobile Money or Bank Transfer."}),{status:400,headers:h});
    }

    const items=await resolveItems(raw);
    if(!items.length)return new Response(JSON.stringify({ok:false,error:"No valid products were submitted."}),{status:400,headers:h});

    const quantity=items.reduce((s,x)=>s+x.quantity,0);
    const knownTotals=items.filter(x=>typeof x.line_total==="number");
    const product_total=knownTotals.length===items.length
      ?Number(knownTotals.reduce((s,x)=>s+x.line_total,0).toFixed(2))
      :null;
    const product_name=items.length===1?items[0].product_name:`${items.length} products`;
    const product_id=items.length===1?items[0].product_id:null;
    const order_ref=refCode();
    const sellerItems=items.filter(x=>x.kind==="seller");
    const ownItems=items.filter(x=>x.kind==="ranova");
    const storeIds=[...new Set(sellerItems.map(x=>x.store_id))];
    const order_source=sellerItems.length&&ownItems.length?"mixed_marketplace":sellerItems.length?"seller_store":"ranova_catalogue";

    const customerItems=items.map(x=>({
      source:x.kind==="seller"?"seller_store":"ranova_catalogue",
      seller_product_id:x.seller_product_id||null,
      store_id:x.store_id||null,
      store_name:x.store_name||null,
      product_id:x.product_id||null,
      product_name:x.product_name,
      quantity:x.quantity,
      unit_price:x.unit_price,
      line_total:x.line_total
    }));

    const {data:master,error:masterError}=await admin.from("ranova_customer_orders").insert({
      order_ref,
      customer_name,
      customer_phone,
      customer_email:customer_email||null,
      product_id,
      product_name,
      quantity,
      delivery_location,
      payment_method,
      unit_price:items.length===1?items[0].unit_price:null,
      product_total,
      delivery_fee:null,
      total_payment:product_total,
      items:customerItems,
      item_count:items.length,
      status:"awaiting_confirmation",
      payment_status:"not_started",
      buyer_note:buyer_note||null,
      order_source,
      seller_order_count:storeIds.length
    }).select("id").single();
    if(masterError||!master)throw masterError||new Error("Could not create order.");
    masterId=master.id;

    const childOrders:any[]=[];
    let idx=0;
    for(const storeId of storeIds){
      idx++;
      const group=sellerItems.filter(x=>x.store_id===storeId);
      const allKnown=group.every(x=>typeof x.line_total==="number");
      const subtotal=allKnown?Number(group.reduce((s,x)=>s+x.line_total,0).toFixed(2)):null;
      childOrders.push({
        order_ref:order_ref+"-S"+idx,
        parent_order_id:master.id,
        platform_order_ref:order_ref,
        seller_id:group[0].seller_id,
        store_id:storeId,
        buyer_name:customer_name,
        buyer_phone:customer_phone,
        buyer_email:customer_email||null,
        delivery_location,
        payment_method,
        items:group.map(x=>({
          seller_product_id:x.seller_product_id,
          product_name:x.product_name,
          sku:x.sku,
          quantity:x.quantity,
          unit_price:x.unit_price,
          line_total:x.line_total,
          unit_label:x.unit_label,
          image_url:x.primary_image_url
        })),
        item_count:group.length,
        subtotal,
        delivery_fee:null,
        total:subtotal,
        currency:"GHS",
        payment_status:"not_started",
        order_status:"new",
        buyer_note:buyer_note||null
      });
    }

    if(childOrders.length){
      const {error:childError}=await admin.from("ranova_seller_orders").insert(childOrders);
      if(childError){
        await admin.from("ranova_seller_orders").delete().eq("parent_order_id",master.id);
        await admin.from("ranova_customer_orders").delete().eq("id",master.id);
        masterId=null;
        throw childError;
      }
    }

    return new Response(JSON.stringify({
      ok:true,
      order_ref,
      item_count:items.length,
      quantity,
      product_total,
      seller_order_count:childOrders.length,
      order_source,
      status:"awaiting_confirmation",
      payment_status:"not_started",
      message:"Order placed successfully. Payment instructions will only be provided after order confirmation."
    }),{status:200,headers:h});
  }catch(e){
    console.error(e);
    if(masterId){
      try{
        await admin.from("ranova_seller_orders").delete().eq("parent_order_id",masterId);
        await admin.from("ranova_customer_orders").delete().eq("id",masterId);
      }catch{}
    }
    const message=e instanceof Error&&e.message?e.message:"Could not place the order. Please try again.";
    return new Response(JSON.stringify({ok:false,error:message}),{status:400,headers:h});
  }
});