import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const ALLOWED_ORIGIN="https://ranovaprimeent.github.io";

function headers(origin:string|null){
  const allow=origin===ALLOWED_ORIGIN||origin?.startsWith("http://localhost")?origin:ALLOWED_ORIGIN;
  return {
    "Content-Type":"application/json",
    "Access-Control-Allow-Origin":allow||ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers":"content-type,x-ranova-client,authorization,apikey",
    "Access-Control-Allow-Methods":"POST,OPTIONS"
  };
}
function clean(v:any,max=500){return String(v??"").trim().slice(0,max)}
function slugify(v:any){
  return clean(v,120).toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,80);
}
function num(v:any){
  if(v===null||v===undefined||v==="")return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function int(v:any,min=0,max=1000000){
  if(v===null||v===undefined||v==="")return null;
  const n=Math.trunc(Number(v));
  return Number.isFinite(n)?Math.max(min,Math.min(max,n)):null;
}
function safeAssetUrl(v:any){
  const s=clean(v,1000);
  if(!s)return "";
  const prefix=SUPABASE_URL+"/storage/v1/object/public/seller-store-assets/";
  return s.startsWith(prefix)?s:"";
}
function safeAssetUrls(v:any){
  if(!Array.isArray(v))return [];
  return v.map(safeAssetUrl).filter(Boolean).slice(0,8);
}
async function getUser(req:Request){
  const auth=req.headers.get("authorization")||"";
  if(!auth.startsWith("Bearer "))return null;
  const res=await fetch(SUPABASE_URL+"/auth/v1/user",{headers:{Authorization:auth,apikey:SERVICE_KEY}});
  if(!res.ok)return null;
  return await res.json();
}
async function serviceGet(path:string,params:Record<string,string>={}){
  const u=new URL(SUPABASE_URL+"/rest/v1/"+path);
  Object.entries(params).forEach(([k,v])=>u.searchParams.set(k,v));
  const r=await fetch(u.toString(),{headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY}});
  const j=await r.json().catch(()=>[]);
  if(!r.ok)throw new Error("Database request failed.");
  return j;
}
async function resolveSeller(userId:string){
  const accounts=await serviceGet("ranova_seller_accounts",{select:"application_ref",user_id:"eq."+userId,limit:"1"});
  if(!accounts.length)return null;
  const ref=accounts[0].application_ref;
  const apps=await serviceGet("ranova_seller_applications",{
    select:"application_ref,business_name,contact_person,phone,email,business_location,supplier_type,categories,status,verification_status,store_setup_status,verification_notes",
    application_ref:"eq."+ref,
    limit:"1"
  });
  if(!apps.length)return null;
  const application=apps[0];
  const approved=String(application.verification_status||application.status||"").toLowerCase()==="approved";
  return {application_ref:ref,application,approved};
}
async function patchApplication(ref:string,body:any){
  await fetch(SUPABASE_URL+"/rest/v1/ranova_seller_applications?application_ref=eq."+encodeURIComponent(ref),{
    method:"PATCH",
    headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json"},
    body:JSON.stringify({...body,updated_at:new Date().toISOString()})
  });
}
async function syncParentOrder(parentId:string|null){
  if(!parentId)return;
  const parents=await serviceGet("ranova_customer_orders",{select:"id,order_source",id:"eq."+parentId,limit:"1"});
  const parent=parents[0];
  if(!parent)return;
  const children=await serviceGet("ranova_seller_orders",{
    select:"subtotal,delivery_fee,total,order_status",
    parent_order_id:"eq."+parentId,
    order:"created_at.asc"
  });
  if(!children.length)return;

  const states=children.map((x:any)=>x.order_status);
  let status="awaiting_confirmation";
  if(states.every((x:string)=>x==="delivered"))status="delivered";
  else if(states.every((x:string)=>x==="cancelled"))status="cancelled";
  else if(states.some((x:string)=>x==="dispatched"))status="dispatched";
  else if(states.some((x:string)=>x==="ready_for_dispatch"))status="ready_for_dispatch";
  else if(states.some((x:string)=>x==="preparing"))status="preparing";
  else if(states.every((x:string)=>["confirmed","delivered"].includes(x)))status="awaiting_payment";

  const patch:any={status};
  if(parent.order_source==="seller_store"){
    if(children.every((x:any)=>x.subtotal!==null))patch.product_total=Number(children.reduce((s:number,x:any)=>s+Number(x.subtotal||0),0).toFixed(2));
    if(children.every((x:any)=>x.delivery_fee!==null))patch.delivery_fee=Number(children.reduce((s:number,x:any)=>s+Number(x.delivery_fee||0),0).toFixed(2));
    if(children.every((x:any)=>x.total!==null))patch.total_payment=Number(children.reduce((s:number,x:any)=>s+Number(x.total||0),0).toFixed(2));
  }
  await fetch(SUPABASE_URL+"/rest/v1/ranova_customer_orders?id=eq."+encodeURIComponent(parentId),{
    method:"PATCH",
    headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json"},
    body:JSON.stringify(patch)
  });
}
async function loadDashboard(userId:string,seller:any){
  const stores=await serviceGet("ranova_seller_stores",{select:"*",seller_id:"eq."+userId,limit:"1"});
  const store=stores[0]||null;
  const products=store?await serviceGet("ranova_seller_products",{
    select:"id,name,slug,sku,category,short_description,description,price,currency,moq,stock_quantity,stock_status,unit_label,primary_image_url,image_urls,product_status,moderation_note,created_at,updated_at",
    seller_id:"eq."+userId,
    order:"created_at.desc"
  }):[];
  const orders=store?await serviceGet("ranova_seller_orders",{
    select:"id,order_ref,platform_order_ref,buyer_name,buyer_phone,buyer_email,delivery_location,payment_method,items,item_count,subtotal,delivery_fee,total,currency,payment_status,order_status,buyer_note,seller_note,created_at,updated_at",
    seller_id:"eq."+userId,
    order:"created_at.desc",
    limit:"50"
  }):[];
  const counts={
    products:products.length,
    active_products:products.filter((p:any)=>p.product_status==="active").length,
    pending_products:products.filter((p:any)=>p.product_status==="pending_review").length,
    orders:orders.length,
    open_orders:orders.filter((o:any)=>!["delivered","cancelled","returned"].includes(o.order_status)).length
  };
  return {ok:true,linked:true,approved:seller.approved,application:seller.application,store,products,orders,counts};
}
function response(h:Record<string,string>,status:number,payload:any){
  return new Response(JSON.stringify(payload),{status,headers:h});
}

Deno.serve(async(req:Request)=>{
  const h=headers(req.headers.get("origin"));
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:h});
  if(req.method!=="POST")return response(h,405,{ok:false,error:"Method not allowed"});
  if(req.headers.get("x-ranova-client")!=="ranova-site-v1")return response(h,403,{ok:false,error:"Invalid client"});

  const user=await getUser(req);
  if(!user?.id)return response(h,401,{ok:false,error:"Sign in to continue."});
  const seller=await resolveSeller(user.id);
  if(!seller)return response(h,403,{ok:false,error:"Link a seller application before using the Seller Dashboard."});

  let b:any={};
  try{b=await req.json()}catch{}
  const action=clean(b.action,50)||"dashboard";

  try{
    if(action==="dashboard"){
      return response(h,200,await loadDashboard(user.id,seller));
    }

    if(!seller.approved){
      return response(h,403,{ok:false,error:"Store management unlocks after RANOVA approves your seller verification."});
    }

    if(action==="save_store"){
      const current=await serviceGet("ranova_seller_stores",{select:"*",seller_id:"eq."+user.id,limit:"1"});
      const existing=current[0]||null;
      const store_name=clean(b.store_name,120)||clean(seller.application.business_name,120);
      if(!store_name)return response(h,400,{ok:false,error:"Store name is required."});

      let slug=slugify(b.slug||existing?.slug||store_name);
      if(!slug)slug="ranova-store";
      if(!existing)slug=(slug+"-"+String(seller.application_ref).replace(/[^a-zA-Z0-9]/g,"").slice(-6).toLowerCase()).slice(0,80);

      const requestedStatus=clean(b.store_status,20);
      const store_status=["draft","active","paused"].includes(requestedStatus)?requestedStatus:(existing?.store_status||"draft");
      const public_phone=clean(b.public_phone,40)||clean(seller.application.phone,40);
      const public_email=clean(b.public_email,180)||clean(seller.application.email,180);
      const business_location=clean(b.business_location,180)||clean(seller.application.business_location,180);
      const description=clean(b.description,2500);
      if(store_status==="active"&&(!description||!business_location||(!public_phone&&!public_email))){
        return response(h,400,{ok:false,error:"Before publishing, add a store description, business location and at least one public contact method."});
      }

      const payload={
        seller_id:user.id,
        application_ref:seller.application_ref,
        store_name,
        slug,
        tagline:clean(b.tagline,180)||null,
        description:description||null,
        logo_url:safeAssetUrl(b.logo_url)||null,
        banner_url:safeAssetUrl(b.banner_url)||null,
        public_phone:public_phone||null,
        public_email:public_email||null,
        business_location:business_location||null,
        fulfilment_summary:clean(b.fulfilment_summary,700)||null,
        return_policy_summary:clean(b.return_policy_summary,700)||null,
        minimum_order_note:clean(b.minimum_order_note,300)||null,
        store_status,
        updated_at:new Date().toISOString()
      };

      let r:Response;
      if(existing){
        r=await fetch(SUPABASE_URL+"/rest/v1/ranova_seller_stores?seller_id=eq."+encodeURIComponent(user.id),{
          method:"PATCH",
          headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json",Prefer:"return=representation"},
          body:JSON.stringify(payload)
        });
      }else{
        r=await fetch(SUPABASE_URL+"/rest/v1/ranova_seller_stores",{
          method:"POST",
          headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json",Prefer:"return=representation"},
          body:JSON.stringify(payload)
        });
      }
      const rows=await r.json().catch(()=>[]);
      if(!r.ok){
        const msg=String(rows?.message||rows?.details||"");
        if(/duplicate|unique/i.test(msg))return response(h,409,{ok:false,error:"That store web address is already in use. Choose another store slug."});
        throw new Error("Could not save store.");
      }
      await patchApplication(seller.application_ref,{store_setup_status:store_status==="active"?"complete":"in_progress"});
      return response(h,200,{ok:true,store:rows[0]||payload});
    }

    const stores=await serviceGet("ranova_seller_stores",{select:"id,store_status",seller_id:"eq."+user.id,limit:"1"});
    if(!stores.length)return response(h,400,{ok:false,error:"Create your store profile first."});
    const store=stores[0];

    if(action==="save_product"){
      const id=clean(b.id,80);
      let existing:any=null;
      if(id){
        const rows=await serviceGet("ranova_seller_products",{select:"*",id:"eq."+id,seller_id:"eq."+user.id,limit:"1"});
        existing=rows[0]||null;
        if(!existing)return response(h,404,{ok:false,error:"Product not found."});
      }
      const name=clean(b.name,180);
      const category=clean(b.category,100);
      if(!name||!category)return response(h,400,{ok:false,error:"Product name and category are required."});
      let slug=slugify(b.slug||existing?.slug||name);
      if(!slug)slug="product";
      if(!existing)slug=(slug+"-"+Date.now().toString(36)).slice(0,100);

      const payload:any={
        seller_id:user.id,
        store_id:store.id,
        name,
        slug,
        sku:clean(b.sku,100)||null,
        category,
        short_description:clean(b.short_description,300)||null,
        description:clean(b.description,2500)||null,
        price:num(b.price),
        currency:"GHS",
        moq:int(b.moq,1,100000)||1,
        stock_quantity:int(b.stock_quantity,0,1000000),
        stock_status:["in_stock","low_stock","out_of_stock","preorder","confirm_on_enquiry"].includes(clean(b.stock_status,30))?clean(b.stock_status,30):"confirm_on_enquiry",
        unit_label:clean(b.unit_label,60)||null,
        primary_image_url:safeAssetUrl(b.primary_image_url)||null,
        image_urls:safeAssetUrls(b.image_urls),
        updated_at:new Date().toISOString()
      };
      if(existing){
        payload.product_status=existing.product_status==="active"?"pending_review":existing.product_status;
        const r=await fetch(SUPABASE_URL+"/rest/v1/ranova_seller_products?id=eq."+encodeURIComponent(id)+"&seller_id=eq."+encodeURIComponent(user.id),{
          method:"PATCH",
          headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json",Prefer:"return=representation"},
          body:JSON.stringify(payload)
        });
        const rows=await r.json().catch(()=>[]);
        if(!r.ok)return response(h,400,{ok:false,error:"Could not update product. Check that the SKU is not already used in your store."});
        return response(h,200,{ok:true,product:rows[0]});
      }else{
        payload.product_status="draft";
        const r=await fetch(SUPABASE_URL+"/rest/v1/ranova_seller_products",{
          method:"POST",
          headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json",Prefer:"return=representation"},
          body:JSON.stringify(payload)
        });
        const rows=await r.json().catch(()=>[]);
        if(!r.ok)return response(h,400,{ok:false,error:"Could not create product. Check that the SKU is not already used in your store."});
        return response(h,200,{ok:true,product:rows[0]});
      }
    }

    if(action==="submit_product"){
      const id=clean(b.id,80);
      const rows=await serviceGet("ranova_seller_products",{select:"*",id:"eq."+id,seller_id:"eq."+user.id,limit:"1"});
      const p=rows[0];
      if(!p)return response(h,404,{ok:false,error:"Product not found."});
      if(!p.description||!p.primary_image_url)return response(h,400,{ok:false,error:"Add a product description and main image before submitting for review."});
      const r=await fetch(SUPABASE_URL+"/rest/v1/ranova_seller_products?id=eq."+encodeURIComponent(id)+"&seller_id=eq."+encodeURIComponent(user.id),{
        method:"PATCH",
        headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json",Prefer:"return=representation"},
        body:JSON.stringify({product_status:"pending_review",moderation_note:null,updated_at:new Date().toISOString()})
      });
      const out=await r.json().catch(()=>[]);
      if(!r.ok)throw new Error("Could not submit product.");
      return response(h,200,{ok:true,product:out[0]});
    }

    if(action==="pause_product"||action==="archive_product"){
      const id=clean(b.id,80);
      const status=action==="pause_product"?"paused":"archived";
      const r=await fetch(SUPABASE_URL+"/rest/v1/ranova_seller_products?id=eq."+encodeURIComponent(id)+"&seller_id=eq."+encodeURIComponent(user.id),{
        method:"PATCH",
        headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json",Prefer:"return=representation"},
        body:JSON.stringify({product_status:status,updated_at:new Date().toISOString()})
      });
      const out=await r.json().catch(()=>[]);
      if(!r.ok||!out.length)return response(h,404,{ok:false,error:"Product not found."});
      return response(h,200,{ok:true,product:out[0]});
    }

    if(action==="update_order_quote"){
      const id=clean(b.id,80);
      const rows=await serviceGet("ranova_seller_orders",{select:"*",id:"eq."+id,seller_id:"eq."+user.id,limit:"1"});
      const order=rows[0];
      if(!order)return response(h,404,{ok:false,error:"Order not found."});
      if(["dispatched","delivered","cancelled","returned"].includes(order.order_status)){
        return response(h,400,{ok:false,error:"This order can no longer be repriced."});
      }
      const subtotal=num(b.subtotal);
      const delivery_fee=num(b.delivery_fee);
      if(subtotal===null||subtotal<0)return response(h,400,{ok:false,error:"Enter a valid product subtotal."});
      if(delivery_fee!==null&&delivery_fee<0)return response(h,400,{ok:false,error:"Enter a valid delivery fee."});
      const total=Number((subtotal+(delivery_fee||0)).toFixed(2));
      const r=await fetch(SUPABASE_URL+"/rest/v1/ranova_seller_orders?id=eq."+encodeURIComponent(id)+"&seller_id=eq."+encodeURIComponent(user.id),{
        method:"PATCH",
        headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json",Prefer:"return=representation"},
        body:JSON.stringify({
          subtotal:Number(subtotal.toFixed(2)),
          delivery_fee:delivery_fee===null?null:Number(delivery_fee.toFixed(2)),
          total,
          seller_note:clean(b.seller_note,1000)||order.seller_note||null,
          updated_at:new Date().toISOString()
        })
      });
      const out=await r.json().catch(()=>[]);
      if(!r.ok||!out.length)throw new Error("Could not update the order amount.");
      await syncParentOrder(order.parent_order_id||null);
      return response(h,200,{ok:true,order:out[0]});
    }

    if(action==="update_order_status"){
      const id=clean(b.id,80),next=clean(b.status,40);
      const rows=await serviceGet("ranova_seller_orders",{select:"*",id:"eq."+id,seller_id:"eq."+user.id,limit:"1"});
      const order=rows[0];
      if(!order)return response(h,404,{ok:false,error:"Order not found."});
      const allowed:any={
        new:["confirmed","cancelled"],
        confirmed:["preparing","cancelled"],
        preparing:["ready_for_dispatch","cancelled"],
        ready_for_dispatch:["dispatched","cancelled"],
        dispatched:["delivered"],
        delivered:[],
        cancelled:[],
        return_requested:["returned"],
        returned:[]
      };
      if(!(allowed[order.order_status]||[]).includes(next)){
        return response(h,400,{ok:false,error:"That order-status change is not allowed from "+order.order_status.replace(/_/g," ")+". "});
      }
      if(next==="confirmed"&&order.total===null){
        return response(h,400,{ok:false,error:"Set the final product subtotal and delivery fee before confirming this order."});
      }
      const patch:any={order_status:next,updated_at:new Date().toISOString()};
      const note=clean(b.seller_note,1000);
      if(note)patch.seller_note=note;
      const r=await fetch(SUPABASE_URL+"/rest/v1/ranova_seller_orders?id=eq."+encodeURIComponent(id)+"&seller_id=eq."+encodeURIComponent(user.id),{
        method:"PATCH",
        headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json",Prefer:"return=representation"},
        body:JSON.stringify(patch)
      });
      const out=await r.json().catch(()=>[]);
      if(!r.ok||!out.length)throw new Error("Could not update order status.");
      await syncParentOrder(order.parent_order_id||null);
      return response(h,200,{ok:true,order:out[0]});
    }

    return response(h,400,{ok:false,error:"Unknown action."});
  }catch(e){
    console.error(e);
    return response(h,500,{ok:false,error:"Seller Dashboard request could not be completed."});
  }
});