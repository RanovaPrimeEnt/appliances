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
function normalPhone(v:string){return v.replace(/D/g,"").replace(/^233/,"0")}
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
  const [{data:receipt},{data:refunds},{data:disputes},{data:notifications}]=await Promise.all([
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
      .order("created_at",{ascending:false}).limit(50)
  ]);
  const ids=(disputes||[]).map((d:any)=>d.id);
  let messages:any[]=[];
  if(ids.length){
    const out=await admin.from("ranova_marketplace_dispute_messages")
      .select("id,dispute_id,sender_type,message,created_at")
      .in("dispute_id",ids).order("created_at",{ascending:true});
    messages=out.data||[];
  }
  return {
    receipt:receipt||null,
    refunds:refunds||[],
    disputes:(disputes||[]).map((d:any)=>({...d,messages:messages.filter((m:any)=>m.dispute_id===d.id)})),
    notifications:notifications||[]
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

    return response(h,400,{ok:false,error:"Unknown support action."});
  }catch(e){
    console.error(e);
    return response(h,500,{ok:false,error:"RANOVA support request could not be completed."});
  }
});