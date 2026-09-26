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
function clean(v:any,max=1200){return String(v??"").trim().slice(0,max)}
function normalPhone(v:string){return v.replace(/\D/g,"").replace(/^233/,"0")}
function response(h:Record<string,string>,status:number,payload:any){return new Response(JSON.stringify(payload),{status,headers:h})}
function ref(prefix:string){return prefix+"-"+new Date().toISOString().slice(0,10).replace(/-/g,"")+"-"+crypto.randomUUID().replace(/-/g,"").slice(0,8).toUpperCase()}
async function getOrder(orderRef:string,phone:string){
  const {data:order,error}=await admin.from("ranova_customer_orders").select("*").eq("order_ref",orderRef).maybeSingle();
  if(error||!order)return null;
  if(normalPhone(String(order.customer_phone||""))!==normalPhone(phone))return null;
  return order;
}
async function sellerUsers(orderId:string){
  const {data}=await admin.from("ranova_seller_orders").select("id,seller_id,order_ref").eq("parent_order_id",orderId);
  return data||[];
}
async function emailForUser(userId:string){
  const {data:{user}}=await admin.auth.admin.getUserById(userId);
  return user?.email||null;
}
async function notifySeller(seller:any,order:any,type:string,title:string,message:string,metadata:any={}){
  const email=await emailForUser(seller.seller_id);
  await admin.from("ranova_marketplace_notifications").insert({
    recipient_type:"seller",recipient_user_id:seller.seller_id,recipient_email:email,
    customer_order_id:order.id,seller_order_id:seller.id,notification_type:type,title,message,
    metadata,email_requested:!!email,email_status:email?"queued":"not_requested"
  });
}
async function notifyAdmins(order:any,type:string,title:string,message:string,metadata:any={}){
  const {data:admins}=await admin.from("admin_users").select("user_id,role").in("role",["owner","manager","orders"]);
  for(const a of admins||[]){
    const email=await emailForUser(a.user_id);
    await admin.from("ranova_marketplace_notifications").insert({
      recipient_type:"admin",recipient_user_id:a.user_id,recipient_email:email,
      customer_order_id:order.id,notification_type:type,title,message,
      metadata,email_requested:!!email,email_status:email?"queued":"not_requested"
    });
  }
}
async function loadSupport(order:any){
  const [{data:receipt},{data:refunds},{data:disputes},{data:notifications},{data:deliveries},{data:sellerOrders}]=await Promise.all([
    admin.from("ranova_marketplace_receipts")
      .select("receipt_ref,order_ref,customer_name,buyer_country_name,payment_method,payment_reference,product_total,delivery_fee,buyer_processing_fee,total_paid,currency,issued_at,snapshot")
      .eq("customer_order_id",order.id).maybeSingle(),
    admin.from("ranova_marketplace_refunds")
      .select("id,refund_ref,seller_order_id,requested_amount,approved_amount,currency,reason_category,reason_detail,status,admin_note,refund_reference,requested_at,reviewed_at,refunded_at,updated_at")
      .eq("customer_order_id",order.id).order("requested_at",{ascending:false}),
    admin.from("ranova_marketplace_disputes")
      .select("id,dispute_ref,seller_order_id,category,subject,description,status,resolution,resolution_note,opened_at,resolved_at,updated_at")
      .eq("customer_order_id",order.id).order("opened_at",{ascending:false}),
    admin.from("ranova_marketplace_notifications")
      .select("notification_type,title,message,metadata,created_at")
      .eq("recipient_type","buyer").eq("customer_order_id",order.id).eq("in_app_visible",true)
      .order("created_at",{ascending:false}).limit(50),
    admin.from("ranova_order_deliveries")
      .select("id,seller_order_id,zone_id,responsibility,fulfilment_method,delivery_status,quoted_delivery_fee,currency,destination_text,courier_name,courier_reference,tracking_url,eta_start_date,eta_end_date,proof_required,proof_verified,assigned_at,dispatched_at,picked_up_at,out_for_delivery_at,seller_marked_delivered_at,buyer_confirmed_at,admin_confirmed_at,delivered_at,delivery_note,created_at,updated_at")
      .eq("customer_order_id",order.id).order("created_at",{ascending:true}),
    admin.from("ranova_seller_orders")
      .select("id,order_ref,store_id,order_status").eq("parent_order_id",order.id)
  ]);

  const disputeIds=(disputes||[]).map((d:any)=>d.id);
  let messages:any[]=[];
  if(disputeIds.length){
    const out=await admin.from("ranova_marketplace_dispute_messages")
      .select("id,dispute_id,sender_type,message,created_at")
      .in("dispute_id",disputeIds).order("created_at",{ascending:true});
    messages=out.data||[];
  }

  const deliveryIds=(deliveries||[]).map((d:any)=>d.id);
  let events:any[]=[],proofs:any[]=[];
  if(deliveryIds.length){
    const [ev,pr]=await Promise.all([
      admin.from("ranova_delivery_events")
        .select("id,delivery_id,status,actor_type,note,location_text,occurred_at")
        .in("delivery_id",deliveryIds).order("occurred_at",{ascending:true}),
      admin.from("ranova_delivery_proofs")
        .select("id,delivery_id,seller_order_id,proof_type,storage_path,recipient_name,note,captured_at,review_status,review_note,created_at")
        .in("delivery_id",deliveryIds).order("created_at",{ascending:true})
    ]);
    events=ev.data||[];
    for(const p of pr.data||[]){
      let proof_url=null;
      if(p.storage_path){
        const {data:signed}=await admin.storage.from("ranova-delivery-proof").createSignedUrl(p.storage_path,600);
        proof_url=signed?.signedUrl||null;
      }
      proofs.push({
        id:p.id,delivery_id:p.delivery_id,seller_order_id:p.seller_order_id,proof_type:p.proof_type,
        recipient_name:p.recipient_name,note:p.note,captured_at:p.captured_at,
        review_status:p.review_status,review_note:p.review_note,created_at:p.created_at,
        proof_url,proof_url_expires_in:proof_url?600:null
      });
    }
  }
  const sellerMap=new Map((sellerOrders||[]).map((s:any)=>[s.id,s]));
  return {
    receipt:receipt||null,
    refunds:refunds||[],
    disputes:(disputes||[]).map((d:any)=>({...d,messages:messages.filter((m:any)=>m.dispute_id===d.id)})),
    notifications:notifications||[],
    deliveries:(deliveries||[]).map((d:any)=>({
      ...d,
      seller_order_ref:sellerMap.get(d.seller_order_id)?.order_ref||null,
      seller_order_status:sellerMap.get(d.seller_order_id)?.order_status||null,
      events:events.filter((e:any)=>e.delivery_id===d.id),
      proofs:proofs.filter((p:any)=>p.delivery_id===d.id)
    }))
  };
}

Deno.serve(async(req:Request)=>{
  const h=headers(req.headers.get("origin"));
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:h});
  if(req.method!=="POST")return response(h,405,{ok:false,error:"Method not allowed"});
  if(req.headers.get("x-ranova-client")!=="ranova-site-v1")return response(h,403,{ok:false,error:"Invalid client"});
  let b:any={};try{b=await req.json()}catch{}

  try{
    const action=clean(b.action,60)||"lookup";
    const orderRef=clean(b.order_ref,90).toUpperCase();
    const phone=clean(b.phone,40);
    if(!orderRef||!phone)return response(h,400,{ok:false,error:"Order reference and phone number are required."});
    const order=await getOrder(orderRef,phone);
    if(!order)return response(h,403,{ok:false,error:"Order reference and phone number do not match."});

    if(action==="lookup"){
      return response(h,200,{ok:true,support:await loadSupport(order)});
    }

    if(action==="request_refund"){
      if(!["paid","confirmed"].includes(String(order.payment_status||"").toLowerCase())){
        return response(h,400,{ok:false,error:"A refund request can be opened only after RANOVA has confirmed payment."});
      }
      const reason_category=clean(b.reason_category,60);
      const reason_detail=clean(b.reason_detail,1600);
      const amount=Number(b.requested_amount);
      const total=Number(order.total_payment||0);
      if(!["item_not_received","item_not_as_described","damaged","duplicate_payment","cancelled_order","other"].includes(reason_category)){
        return response(h,400,{ok:false,error:"Choose a valid refund reason."});
      }
      if(reason_detail.length<12)return response(h,400,{ok:false,error:"Explain the refund request clearly."});
      if(!Number.isFinite(amount)||amount<=0||amount>total)return response(h,400,{ok:false,error:"Refund amount must be above zero and cannot exceed the recorded payment."});
      const {data:existing}=await admin.from("ranova_marketplace_refunds")
        .select("id,refund_ref,status").eq("customer_order_id",order.id)
        .in("status",["requested","under_review","approved","processing"]).limit(1);
      if(existing?.length)return response(h,409,{ok:false,error:"An active refund request already exists for this order.",refund_ref:existing[0].refund_ref});

      const refundRef=ref("RNV-RFD");
      const {data:refund,error}=await admin.from("ranova_marketplace_refunds").insert({
        refund_ref:refundRef,customer_order_id:order.id,requested_by:"buyer",
        requested_amount:Number(amount.toFixed(2)),currency:"GHS",
        reason_category,reason_detail,status:"requested"
      }).select("*").single();
      if(error)throw error;

      await admin.from("ranova_seller_payouts").update({
        payout_status:"held",payout_note:"Held while buyer refund request "+refundRef+" is reviewed.",updated_at:new Date().toISOString()
      }).eq("platform_order_ref",order.order_ref).in("payout_status",["pending","eligible","processing"]);

      const sellers=await sellerUsers(order.id);
      for(const seller of sellers)await notifySeller(seller,order,"refund_requested","Refund request opened","A buyer opened refund request "+refundRef+" for order "+order.order_ref+".",{refund_ref:refundRef});
      await notifyAdmins(order,"refund_requested","Marketplace refund needs review","Refund request "+refundRef+" was opened for order "+order.order_ref+".",{refund_ref:refundRef,amount});
      return response(h,200,{ok:true,refund_ref:refundRef,support:await loadSupport(order)});
    }

    if(action==="open_dispute"){
      const category=clean(b.category,60);
      const subject=clean(b.subject,180);
      const description=clean(b.description,2000);
      if(!["delivery","product","payment","refund","seller_conduct","other"].includes(category))return response(h,400,{ok:false,error:"Choose a valid dispute category."});
      if(subject.length<5||description.length<15)return response(h,400,{ok:false,error:"Add a clear subject and explanation."});
      const {data:existing}=await admin.from("ranova_marketplace_disputes")
        .select("id,dispute_ref,status").eq("customer_order_id",order.id)
        .in("status",["open","awaiting_buyer","awaiting_seller","under_review"]).limit(1);
      if(existing?.length)return response(h,409,{ok:false,error:"An active dispute already exists for this order.",dispute_ref:existing[0].dispute_ref});

      const disputeRef=ref("RNV-DSP");
      const {data:dispute,error}=await admin.from("ranova_marketplace_disputes").insert({
        dispute_ref:disputeRef,customer_order_id:order.id,opened_by:"buyer",
        category,subject,description,status:"open"
      }).select("*").single();
      if(error)throw error;
      await admin.from("ranova_marketplace_dispute_messages").insert({
        dispute_id:dispute.id,sender_type:"buyer",message:description
      });
      await admin.from("ranova_seller_payouts").update({
        payout_status:"held",payout_note:"Held while dispute "+disputeRef+" is reviewed.",updated_at:new Date().toISOString()
      }).eq("platform_order_ref",order.order_ref).in("payout_status",["pending","eligible","processing"]);

      const sellers=await sellerUsers(order.id);
      for(const seller of sellers)await notifySeller(seller,order,"dispute_opened","Marketplace dispute opened","Dispute "+disputeRef+" was opened for order "+order.order_ref+". Payout remains protected while RANOVA reviews the case.",{dispute_ref:disputeRef});
      await notifyAdmins(order,"dispute_opened","Marketplace dispute needs review","Dispute "+disputeRef+" was opened for order "+order.order_ref+".",{dispute_ref:disputeRef,category});
      return response(h,200,{ok:true,dispute_ref:disputeRef,support:await loadSupport(order)});
    }

    if(action==="add_dispute_message"){
      const disputeRef=clean(b.dispute_ref,80).toUpperCase();
      const message=clean(b.message,2000);
      if(message.length<2)return response(h,400,{ok:false,error:"Enter a message."});
      const {data:dispute}=await admin.from("ranova_marketplace_disputes").select("*")
        .eq("dispute_ref",disputeRef).eq("customer_order_id",order.id).maybeSingle();
      if(!dispute)return response(h,404,{ok:false,error:"Dispute not found for this order."});
      if(["resolved","closed"].includes(dispute.status))return response(h,409,{ok:false,error:"This dispute is closed."});
      await admin.from("ranova_marketplace_dispute_messages").insert({
        dispute_id:dispute.id,sender_type:"buyer",message
      });
      await admin.from("ranova_marketplace_disputes").update({
        status:"under_review",updated_at:new Date().toISOString()
      }).eq("id",dispute.id);
      await notifyAdmins(order,"dispute_message","Buyer replied to dispute","Buyer added a message to "+disputeRef+".",{dispute_ref:disputeRef});
      return response(h,200,{ok:true,support:await loadSupport(order)});
    }


    if(action==="confirm_delivery"){
      const sellerOrderRef=clean(b.seller_order_ref,90).toUpperCase();
      if(!sellerOrderRef)return response(h,400,{ok:false,error:"Seller order reference is required."});
      const {data:child}=await admin.from("ranova_seller_orders").select("*")
        .eq("parent_order_id",order.id).eq("order_ref",sellerOrderRef).maybeSingle();
      if(!child)return response(h,404,{ok:false,error:"Seller order was not found."});
      const {data:delivery}=await admin.from("ranova_order_deliveries").select("*")
        .eq("seller_order_id",child.id).maybeSingle();
      if(!delivery)return response(h,404,{ok:false,error:"Delivery record was not found."});
      if(delivery.delivery_status!=="delivered_pending_confirmation"){
        return response(h,409,{ok:false,error:"This delivery is not waiting for buyer confirmation."});
      }
      if(delivery.proof_required){
        const {count}=await admin.from("ranova_delivery_proofs").select("id",{count:"exact",head:true}).eq("delivery_id",delivery.id);
        if(!count)return response(h,409,{ok:false,error:"Delivery cannot be confirmed because proof has not been submitted."});
      }

      const now=new Date().toISOString();
      const {error:dErr}=await admin.from("ranova_order_deliveries").update({
        delivery_status:"delivered_confirmed",buyer_confirmed_at:now,delivered_at:now,
        proof_verified:true,updated_at:now
      }).eq("id",delivery.id);
      if(dErr)throw dErr;
      await admin.from("ranova_seller_orders").update({order_status:"delivered",updated_at:now}).eq("id",child.id);
      await admin.from("ranova_delivery_events").insert({
        delivery_id:delivery.id,seller_order_id:child.id,status:"delivered_confirmed",
        actor_type:"buyer",note:"Buyer confirmed receipt through verified RANOVA order tracking."
      });

      const {data:children}=await admin.from("ranova_seller_orders").select("order_status").eq("parent_order_id",order.id);
      const terminal=(children||[]).every((x:any)=>["delivered","cancelled"].includes(x.order_status));
      const anyDelivered=(children||[]).some((x:any)=>x.order_status==="delivered");
      if(terminal&&anyDelivered)await admin.from("ranova_customer_orders").update({status:"delivered"}).eq("id",order.id);

      const {data:openRefunds}=await admin.from("ranova_marketplace_refunds").select("id").eq("customer_order_id",order.id)
        .in("status",["requested","under_review","approved","processing"]).limit(1);
      const {data:openDisputes}=await admin.from("ranova_marketplace_disputes").select("id").eq("customer_order_id",order.id)
        .in("status",["open","awaiting_buyer","awaiting_seller","under_review"]).limit(1);
      const blocked=!!(openRefunds?.length||openDisputes?.length);
      const {data:payout}=await admin.from("ranova_seller_payouts").select("*").eq("seller_order_id",child.id).maybeSingle();
      if(payout&&payout.payout_status==="pending"&&!blocked){
        const eligibleAt=payout.eligible_at?new Date(payout.eligible_at).getTime():0;
        if(eligibleAt<=Date.now()){
          await admin.from("ranova_seller_payouts").update({
            payout_status:"eligible",
            payout_note:"Delivery confirmed by buyer; payout hold period satisfied.",
            updated_at:now
          }).eq("id",payout.id);
        }
      }

      const sellers=await sellerUsers(order.id);
      const seller=sellers.find((x:any)=>x.id===child.id);
      if(seller)await notifySeller(seller,order,"delivery_confirmed","Buyer confirmed delivery",
        "The buyer confirmed receipt for seller order "+sellerOrderRef+".",{seller_order_ref:sellerOrderRef});
      await notifyAdmins(order,"delivery_confirmed","Marketplace delivery confirmed",
        "Buyer confirmed receipt for "+sellerOrderRef+" under order "+order.order_ref+".",{seller_order_ref:sellerOrderRef});
      return response(h,200,{ok:true,support:await loadSupport(order)});
    }

    return response(h,400,{ok:false,error:"Unknown support action."});
  }catch(e){
    console.error(e);
    return response(h,500,{ok:false,error:"RANOVA support request could not be completed."});
  }
});