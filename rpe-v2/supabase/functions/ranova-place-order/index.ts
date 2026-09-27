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
    "Access-Control-Allow-Headers":"content-type,x-ranova-client,authorization,apikey",
    "Access-Control-Allow-Methods":"POST,OPTIONS"
  };
}
function clean(v:any,max=180){return String(v??"").trim().slice(0,max)}
async function sha256(v:string){const bytes=new TextEncoder().encode(v);const digest=await crypto.subtle.digest("SHA-256",bytes);return Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,"0")).join("");}
async function optionalUser(req:Request){
  const auth=req.headers.get("authorization")||"";
  if(!auth.startsWith("Bearer "))return null;
  const token=auth.slice(7);
  const {data,error}=await admin.auth.getUser(token);
  return error?null:data.user;
}
function buyerCode(){return crypto.randomUUID().replace(/-/g,"").slice(0,10).toUpperCase()}
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
      .select("id,seller_id,store_id,name,sku,category,price,currency,moq,stock_quantity,stock_status,unit_label,primary_image_url,pricing_tiers,product_status")
      .in("id",ids);
    if(error)throw error;
    const productMap=new Map((products||[]).map((p:any)=>[p.id,p]));
    const storeIds=[...new Set((products||[]).map((p:any)=>p.store_id))];
    const {data:stores,error:storeError}=await admin.from("ranova_seller_stores")
      .select("id,seller_id,store_name,slug,store_status,country_code,country_name")
      .in("id",storeIds);
    if(storeError)throw storeError;
    const storeMap=new Map((stores||[]).map((s:any)=>[s.id,s]));
    const sellerApproval=new Map<string,boolean>();
    const enforcementMap=new Map<string,string>();

    for(const r of sellerRaw){
      const p:any=productMap.get(r.seller_product_id);
      if(!p||p.product_status!=="active")throw new Error("One of the selected seller products is no longer available.");
      const store:any=storeMap.get(p.store_id);
      if(!store||store.store_status!=="active")throw new Error("One of the selected seller stores is not currently active.");
      if(!sellerApproval.has(p.seller_id))sellerApproval.set(p.seller_id,await approvedSeller(p.seller_id));
      if(!sellerApproval.get(p.seller_id))throw new Error("One of the selected sellers is not currently approved.");
      if(!enforcementMap.has(p.store_id)){
        const {data:enf}=await admin.from("ranova_seller_enforcement").select("enforcement_status,ends_at").eq("store_id",p.store_id).maybeSingle();
        let status=String(enf?.enforcement_status||"good_standing");
        if(enf?.ends_at&&new Date(enf.ends_at).getTime()<=Date.now())status="good_standing";
        enforcementMap.set(p.store_id,status);
      }
      const enforcement=enforcementMap.get(p.store_id);
      if(enforcement==="restricted"||enforcement==="suspended")throw new Error("This seller store is temporarily not accepting new marketplace orders.");
      if(p.stock_status==="out_of_stock")throw new Error(p.name+" is currently out of stock.");
      if(r.quantity<Number(p.moq||1))throw new Error(p.name+" has a minimum order quantity of "+Number(p.moq||1)+".");
      if(p.stock_quantity!==null&&r.quantity>Number(p.stock_quantity))throw new Error("Requested quantity for "+p.name+" is above the seller's listed stock.");

      let unitPrice=p.price===null?null:Number(p.price);
      const tiers=Array.isArray(p.pricing_tiers)?p.pricing_tiers.slice().sort((a:any,b:any)=>Number(a.min_qty)-Number(b.min_qty)):[];
      for(const tier of tiers){
        if(r.quantity>=Number(tier?.min_qty||0)&&Number.isFinite(Number(tier?.unit_price)))unitPrice=Number(tier.unit_price);
      }
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
        seller_country_code:store.country_code||null,
        seller_country_name:store.country_name||null,
        moq:p.moq,
        unit_label:p.unit_label,
        stock_status:p.stock_status,
        primary_image_url:p.primary_image_url
      });
    }
  }
  return resolved;
}

async function resolveCountryRule(storeId:string,sellerCountry:string|null,buyerCountry:string|null,paymentMethod:string){
  const now=new Date().toISOString();
  const {data:rows,error}=await admin.from("ranova_marketplace_country_rules")
    .select("*")
    .eq("active",true)
    .lte("effective_from",now)
    .order("effective_from",{ascending:false});
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
    return new Date(b.effective_from).getTime()-new Date(a.effective_from).getTime();
  });
  const r:any=eligible[0]||null;
  return r||{
    id:null,commission_rate:0,required_payment_percent:100,payment_processing_rate:0,
    payment_fixed_fee:0,payment_fee_payer:"platform",currency:"GHS",source_name:"RANOVA fallback"
  };
}

Deno.serve(async(req:Request)=>{
  const h=headers(req.headers.get("origin"));
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:h});
  if(req.method!=="POST")return new Response(JSON.stringify({ok:false,error:"Method not allowed"}),{status:405,headers:h});
  if(req.headers.get("x-ranova-client")!=="ranova-site-v1")return new Response(JSON.stringify({ok:false,error:"Invalid client"}),{status:403,headers:h});

  let masterId:string|null=null;
  let reservationOrderRef:string|null=null;
  try{
    const b=await req.json();
    const buyerUser=await optionalUser(req);
    const customer_name=clean(b.customer_name,100);
    const customer_phone=clean(b.customer_phone,40);
    const customer_email=clean(b.customer_email,180);
    const delivery_location=clean(b.delivery_location,180);
    const buyer_country_code=clean(b.buyer_country_code,2).toUpperCase();
    const buyer_country_name=clean(b.buyer_country_name,120);
    const buyer_google_place_id=clean(b.buyer_google_place_id,180);
    const payment_method=clean(b.payment_method,40);
    const buyer_note=clean(b.buyer_note,1000);
    const raw=normalizeRawItems(b.items);

    if(!customer_name||!customer_phone||!delivery_location||!buyer_country_code||raw.length<1){
      return new Response(JSON.stringify({ok:false,error:"Please complete all required order details, including delivery country."}),{status:400,headers:h});
    }
    if(!/^[A-Z]{2}$/.test(buyer_country_code))return new Response(JSON.stringify({ok:false,error:"Choose a valid delivery country."}),{status:400,headers:h});
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
    const buyer_access_code=buyerCode();
    const buyer_access_code_hash=await sha256(buyer_access_code);
    const sellerItems=items.filter(x=>x.kind==="seller");
    const ownItems=items.filter(x=>x.kind==="ranova");
    const storeIds=[...new Set(sellerItems.map(x=>x.store_id))];
    const order_source=sellerItems.length&&ownItems.length?"mixed_marketplace":sellerItems.length?"seller_store":"ranova_catalogue";
    let inventoryReservation:any={reserved_lines:0,expires_at:null};
    if(sellerItems.length){
      const reservePayload=sellerItems.map((x:any)=>({product_id:x.seller_product_id,quantity:x.quantity}));
      const {data:reserved,error:reserveError}=await admin.rpc("ranova_reserve_order_inventory",{p_order_ref:order_ref,p_items:reservePayload,p_minutes:null});
      if(reserveError)throw reserveError;
      inventoryReservation=reserved||inventoryReservation;
      reservationOrderRef=order_ref;
    }

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
      buyer_access_code_hash,
      buyer_user_id:buyerUser?.id||null,
      customer_name,
      customer_phone,
      customer_email:customer_email||null,
      product_id,
      product_name,
      quantity,
      delivery_location,
      buyer_country_code,
      buyer_country_name:buyer_country_name||buyer_country_code,
      buyer_google_place_id:buyer_google_place_id||null,
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
      seller_order_count:storeIds.length,
      inventory_status:Number(inventoryReservation.reserved_lines||0)>0?"held":"not_required",
      inventory_reservation_expires_at:inventoryReservation.expires_at||null
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
      const sellerCountry=group[0].seller_country_code||null;
      const sellerCountryName=group[0].seller_country_name||sellerCountry;
      const rule=await resolveCountryRule(storeId,sellerCountry,buyer_country_code,payment_method);
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
        seller_country_code:sellerCountry,
        seller_country_name:sellerCountryName,
        buyer_country_code,
        buyer_country_name:buyer_country_name||buyer_country_code,
        country_rule_id:rule.id||null,
        commission_rate_snapshot:Number(rule.commission_rate||0),
        required_payment_percent_snapshot:Number(rule.required_payment_percent==null?100:rule.required_payment_percent),
        payment_processing_rate_snapshot:Number(rule.payment_processing_rate||0),
        payment_fixed_fee_snapshot:Number(rule.payment_fixed_fee||0),
        payment_fee_payer_snapshot:rule.payment_fee_payer||"platform",
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
      const {data:insertedChildren,error:childError}=await admin.from("ranova_seller_orders").insert(childOrders).select("id,store_id");
      if(childError){
        await admin.from("ranova_seller_orders").delete().eq("parent_order_id",master.id);
        await admin.from("ranova_customer_orders").delete().eq("id",master.id);
        masterId=null;
        throw childError;
      }
      for(const child of insertedChildren||[]){
        await admin.from("ranova_inventory_reservations").update({customer_order_id:master.id,seller_order_id:child.id,updated_at:new Date().toISOString()})
          .eq("order_ref",order_ref).eq("store_id",child.store_id).eq("status","held");
      }
      await admin.from("ranova_inventory_reservations").update({customer_order_id:master.id,updated_at:new Date().toISOString()})
        .eq("order_ref",order_ref).is("customer_order_id",null);
      const rules=childOrders.map((x:any)=>x.country_rule_id).filter(Boolean);
      const processingRates=childOrders.map((x:any)=>Number(x.payment_processing_rate_snapshot||0));
      const requiredPercents=childOrders.map((x:any)=>Number(x.required_payment_percent_snapshot==null?100:x.required_payment_percent_snapshot));
      await admin.from("ranova_customer_orders").update({
        country_rule_ids:rules,
        payment_processing_rate:processingRates.length?Math.max(...processingRates):0,
        required_payment_percent:requiredPercents.length?Math.max(...requiredPercents):100
      }).eq("id",master.id);
    }

    try{
      let buyerEmailRequested=!!customer_email;
      if(buyerUser?.id){
        const {data:pref}=await admin.from("ranova_buyer_preferences").select("email_order_updates").eq("user_id",buyerUser.id).maybeSingle();
        if(pref?.email_order_updates===false)buyerEmailRequested=false;
      }
      await admin.from("ranova_marketplace_notifications").insert({
        recipient_type:"buyer",recipient_user_id:buyerUser?.id||null,recipient_email:customer_email||null,customer_order_id:master.id,
        notification_type:"order_placed",notification_category:"transactional",
        title:"RANOVA order received",
        message:"Your marketplace order "+order_ref+" has been received. "+(Number(inventoryReservation.reserved_lines||0)>0?"Limited stock is temporarily reserved while the order proceeds. ":"")+"Payment instructions are provided only through the protected RANOVA order flow.",
        metadata:{order_ref,item_count:items.length,seller_order_count:childOrders.length,inventory_expires_at:inventoryReservation.expires_at||null},
        in_app_visible:true,email_requested:buyerEmailRequested,email_status:buyerEmailRequested?"queued":"not_requested",
        action_url:"/appliances/all/order-status.html?ref="+encodeURIComponent(order_ref),
        dedupe_key:"order-placed:"+master.id
      });
      if(childOrders.length){
        const sellerIds=[...new Set(childOrders.map((x:any)=>x.seller_id))];
        const {data:sellerUsers}=await admin.auth.admin.listUsers({page:1,perPage:1000});
        const emailMap=new Map((sellerUsers?.users||[]).filter((u:any)=>sellerIds.includes(u.id)).map((u:any)=>[u.id,u.email||null]));
        for(const child of childOrders){
          const sellerEmail=emailMap.get(child.seller_id)||null;
          await admin.from("ranova_marketplace_notifications").insert({
            recipient_type:"seller",recipient_user_id:child.seller_id,recipient_email:sellerEmail,
            customer_order_id:master.id,notification_type:"seller_new_order",notification_category:"transactional",
            title:"New RANOVA marketplace order",
            message:"A new seller order "+child.order_ref+" is waiting in your Seller Dashboard. Review the products, delivery and order amount before confirming.",
            metadata:{platform_order_ref:order_ref,seller_order_ref:child.order_ref,store_id:child.store_id},
            in_app_visible:true,email_requested:!!sellerEmail,email_status:sellerEmail?"queued":"not_requested",
            action_url:"/appliances/all/seller-dashboard.html",
            dedupe_key:"seller-new-order:"+child.order_ref
          });
        }
      }
    }catch(notificationError){console.error("Notification queue error",notificationError)}

    return new Response(JSON.stringify({
      ok:true,
      order_ref,
      buyer_access_code,
      item_count:items.length,
      quantity,
      product_total,
      seller_order_count:childOrders.length,
      order_source,
      status:"awaiting_confirmation",
      payment_status:"not_started",
      inventory_status:Number(inventoryReservation.reserved_lines||0)>0?"held":"not_required",
      inventory_reservation_expires_at:inventoryReservation.expires_at||null,
      message:Number(inventoryReservation.reserved_lines||0)>0
        ?"Order placed successfully. Limited stock is temporarily reserved until "+new Date(inventoryReservation.expires_at).toLocaleString()+". Payment must be confirmed before the reservation expires."
        :"Order placed successfully. Payment instructions will only be provided after order confirmation."
    }),{status:200,headers:h});
  }catch(e){
    console.error(e);
    if(masterId){
      try{
        await admin.from("ranova_seller_orders").delete().eq("parent_order_id",masterId);
        await admin.from("ranova_customer_orders").delete().eq("id",masterId);
      }catch{}
    }
    if(reservationOrderRef){
      try{await admin.rpc("ranova_release_order_inventory",{p_order_ref:reservationOrderRef,p_seller_order_id:null,p_reason:"Order creation failed; temporary inventory hold released.",p_restore_committed:false,p_actor_type:"system",p_actor_user_id:null})}catch{}
    }
    const message=e instanceof Error&&e.message?e.message:"Could not place the order. Please try again.";
    return new Response(JSON.stringify({ok:false,error:message}),{status:400,headers:h});
  }
});