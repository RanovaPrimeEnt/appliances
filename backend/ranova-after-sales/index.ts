import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
const U=Deno.env.get("SUPABASE_URL")||"",K=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"",ORIGIN="https://ranovaprimeent.github.io";
const db=createClient(U,K,{auth:{persistSession:false,autoRefreshToken:false}});
function h(o:string|null){const a=o===ORIGIN||o?.startsWith("http://localhost")?o:ORIGIN;return {"Content-Type":"application/json","Access-Control-Allow-Origin":a||ORIGIN,"Access-Control-Allow-Headers":"content-type,x-ranova-client,authorization,apikey","Access-Control-Allow-Methods":"POST,OPTIONS"}}
function res(hh:any,s:number,p:any){return new Response(JSON.stringify(p),{status:s,headers:hh})}
function clean(v:any,n=2000){return String(v??"").trim().slice(0,n)}
async function user(req:Request){const a=req.headers.get("authorization")||"";if(!a.startsWith("Bearer "))return null;const {data,error}=await db.auth.getUser(a.slice(7));return error?null:data.user}
function ref(){return "RAS-"+new Date().toISOString().slice(0,10).replace(/-/g,"")+"-"+crypto.randomUUID().slice(0,7).toUpperCase()}
async function notify(uid:string,role:string,title:string,msg:string,type:string,meta:any={}){
 const {data:{user:u}}=await db.auth.admin.getUserById(uid);
 await db.from("ranova_marketplace_notifications").insert({recipient_type:role,recipient_user_id:uid,recipient_email:u?.email||null,notification_type:type,notification_category:"transactional",title,message:msg,metadata:meta,in_app_visible:true,email_requested:false,email_status:"not_requested",action_url:role==="seller"?"/appliances/all/after-sales.html":"/appliances/all/after-sales.html"});
}
async function load(uid:string){
 const {data:rows}=await db.from("ranova_after_sales_cases").select("*").or("buyer_user_id.eq."+uid+",seller_user_id.eq."+uid).order("created_at",{ascending:false}).limit(200);
 const ids=(rows||[]).map((x:any)=>x.id);
 let ev:any[]=[];if(ids.length){const {data}=await db.from("ranova_after_sales_events").select("*").in("case_id",ids).order("created_at",{ascending:true});ev=data||[]}
 const orderIds=[...new Set((rows||[]).map((x:any)=>x.seller_order_id))];
 let orders:any[]=[];if(orderIds.length){const {data}=await db.from("ranova_seller_orders").select("id,order_ref,platform_order_ref,store_id,seller_id,buyer_name,buyer_email,buyer_phone,items,item_count,subtotal,delivery_fee,total,currency,payment_status,order_status,created_at").in("id",orderIds);orders=data||[]}
 const storeIds=[...new Set((rows||[]).map((x:any)=>x.store_id))];
 let stores:any[]=[];if(storeIds.length){const {data}=await db.from("ranova_seller_stores").select("id,store_name,slug,return_policy_summary").in("id",storeIds);stores=data||[]}
 return (rows||[]).map((c:any)=>({...c,events:ev.filter((e:any)=>e.case_id===c.id),seller_order:orders.find((o:any)=>o.id===c.seller_order_id)||null,store:stores.find((s:any)=>s.id===c.store_id)||null,role:c.buyer_user_id===uid?"buyer":"seller"}));
}
Deno.serve(async req=>{
 const hh=h(req.headers.get("origin"));if(req.method==="OPTIONS")return new Response(null,{status:204,headers:hh});
 if(req.method!=="POST")return res(hh,405,{ok:false,error:"Method not allowed"});
 if(req.headers.get("x-ranova-client")!=="ranova-site-v1")return res(hh,403,{ok:false,error:"Invalid client"});
 const u=await user(req);if(!u)return res(hh,401,{ok:false,error:"Sign in to use RANOVA after-sales support."});
 try{
  const b=await req.json().catch(()=>({})),action=clean(b.action,40)||"list";
  if(action==="list")return res(hh,200,{ok:true,cases:await load(u.id)});
  if(action==="eligible_orders"){
   const {data:parents}=await db.from("ranova_customer_orders").select("id").eq("buyer_user_id",u.id);const pids=(parents||[]).map((x:any)=>x.id);
   if(!pids.length)return res(hh,200,{ok:true,orders:[]});
   const {data:orders}=await db.from("ranova_seller_orders").select("id,order_ref,platform_order_ref,store_id,seller_id,items,total,currency,payment_status,order_status,created_at").in("parent_order_id",pids).order("created_at",{ascending:false});
   return res(hh,200,{ok:true,orders:orders||[]});
  }
  if(action==="open_case"){
   const sid=clean(b.seller_order_id,80),type=clean(b.case_type,30),reason=clean(b.reason_category,80),desc=clean(b.description,2000);
   if(!["cancellation","return"].includes(type))return res(hh,400,{ok:false,error:"Choose cancellation or return."});
   if(desc.length<12)return res(hh,400,{ok:false,error:"Explain the request clearly."});
   const {data:so}=await db.from("ranova_seller_orders").select("*").eq("id",sid).maybeSingle();if(!so)return res(hh,404,{ok:false,error:"Seller order not found."});
   const {data:co}=await db.from("ranova_customer_orders").select("id,buyer_user_id,order_ref,payment_status").eq("id",so.parent_order_id).maybeSingle();
   if(!co||co.buyer_user_id!==u.id)return res(hh,403,{ok:false,error:"This order is not linked to your buyer account."});
   if(type==="cancellation"&&["dispatched","in_transit","out_for_delivery","delivered","returned"].includes(String(so.order_status)))return res(hh,409,{ok:false,error:"This order is already in fulfilment. Open a return request instead if applicable."});
   if(type==="return"&&!["delivered","returned"].includes(String(so.order_status)))return res(hh,409,{ok:false,error:"A return request can be opened after delivery."});
   const {data:existing}=await db.from("ranova_after_sales_cases").select("id,case_ref,status").eq("seller_order_id",sid).eq("case_type",type).in("status",["requested","seller_review","accepted","under_review","return_in_transit","return_received","refund_pending"]).limit(1);
   if(existing?.length)return res(hh,409,{ok:false,error:"An active "+type+" case already exists for this seller order.",case_ref:existing[0].case_ref});
   const cref=ref(),items=Array.isArray(b.requested_items)?b.requested_items.slice(0,100):[];
   const {data:c,error}=await db.from("ranova_after_sales_cases").insert({case_ref:cref,customer_order_id:co.id,seller_order_id:so.id,buyer_user_id:u.id,seller_user_id:so.seller_id,store_id:so.store_id,case_type:type,reason_category:reason||"other",description:desc,requested_items:items,status:"requested"}).select("*").single();if(error)throw error;
   await db.from("ranova_after_sales_events").insert({case_id:c.id,actor_type:"buyer",actor_user_id:u.id,event_type:"case_opened",note:desc,metadata:{case_type:type,reason_category:reason}});
   if(type==="cancellation"&&["not_started","unpaid","pending","awaiting_payment"].includes(String(so.payment_status||"").toLowerCase())){
     await db.from("ranova_seller_orders").update({order_status:"cancelled",updated_at:new Date().toISOString()}).eq("id",so.id);
     await db.rpc("ranova_release_order_inventory",{p_order_ref:so.platform_order_ref,p_seller_order_id:so.id,p_reason:"Buyer cancellation "+cref+" before payment/fulfilment.",p_restore_committed:false,p_actor_type:"buyer",p_actor_user_id:u.id});
     await db.from("ranova_after_sales_cases").update({status:"resolved",resolution_note:"Unpaid order cancelled and inventory released.",resolved_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",c.id);
     await db.from("ranova_after_sales_events").insert({case_id:c.id,actor_type:"system",event_type:"unpaid_cancellation_resolved",note:"Unpaid seller order cancelled and reserved stock released."});
   }else{
     await db.from("ranova_seller_payouts").update({payout_status:"held",payout_note:"Held for after-sales case "+cref,updated_at:new Date().toISOString()}).eq("seller_order_id",so.id).in("payout_status",["pending","eligible","processing"]);
   }
   await notify(so.seller_id,"seller","New RANOVA after-sales case",cref+" was opened for seller order "+so.order_ref+".","after_sales_opened",{case_ref:cref,seller_order_ref:so.order_ref,case_type:type});
   return res(hh,200,{ok:true,case_ref:cref,cases:await load(u.id)});
  }
  const cid=clean(b.case_id,80);const {data:c}=await db.from("ranova_after_sales_cases").select("*").eq("id",cid).maybeSingle();if(!c)return res(hh,404,{ok:false,error:"Case not found."});
  const role=c.buyer_user_id===u.id?"buyer":c.seller_user_id===u.id?"seller":null;if(!role)return res(hh,403,{ok:false,error:"You do not have access to this case."});
  if(action==="seller_response"){
   if(role!=="seller")return res(hh,403,{ok:false,error:"Only the seller can respond here."});
   if(!["requested","seller_review"].includes(c.status))return res(hh,409,{ok:false,error:"This case is not waiting for a seller response."});
   const decision=clean(b.decision,30),note=clean(b.note,1800);if(!["accept","decline","review"].includes(decision))return res(hh,400,{ok:false,error:"Choose accept, decline, or request review."});
   const next=decision==="accept"?"accepted":decision==="decline"?"declined":"under_review";
   await db.from("ranova_after_sales_cases").update({status:next,seller_response:note||null,updated_at:new Date().toISOString(),resolved_at:decision==="decline"?new Date().toISOString():null}).eq("id",cid);
   await db.from("ranova_after_sales_events").insert({case_id:cid,actor_type:"seller",actor_user_id:u.id,event_type:"seller_"+decision,note:note||null});
   if(decision==="accept"&&c.case_type==="cancellation"){
     const {data:so}=await db.from("ranova_seller_orders").select("*").eq("id",c.seller_order_id).maybeSingle();
     if(so&&!["paid","confirmed"].includes(String(so.payment_status||"").toLowerCase())){
       await db.from("ranova_seller_orders").update({order_status:"cancelled",updated_at:new Date().toISOString()}).eq("id",so.id);
       await db.rpc("ranova_release_order_inventory",{p_order_ref:so.platform_order_ref,p_seller_order_id:so.id,p_reason:"Seller accepted cancellation "+c.case_ref,p_restore_committed:false,p_actor_type:"seller",p_actor_user_id:u.id});
       await db.from("ranova_after_sales_cases").update({status:"resolved",resolution_note:"Seller accepted unpaid cancellation; inventory released.",resolved_at:new Date().toISOString()}).eq("id",cid);
     }else{
       const refundRef="RNV-RFD-"+new Date().toISOString().slice(0,10).replace(/-/g,"")+"-"+crypto.randomUUID().slice(0,8).toUpperCase();
       const amount=Number(so.total||so.subtotal||0);
       const {data:refund,error:refundErr}=await db.from("ranova_marketplace_refunds").insert({
         refund_ref:refundRef,customer_order_id:c.customer_order_id,seller_order_id:so.id,requested_by:"buyer",requested_by_user_id:c.buyer_user_id,
         requested_amount:amount,currency:so.currency||"GHS",reason_category:"cancelled_order",
         reason_detail:"Paid cancellation accepted under after-sales case "+c.case_ref+".",status:"requested"
       }).select("id").single();
       if(refundErr)throw refundErr;
       await db.from("ranova_after_sales_cases").update({status:"refund_pending",refund_id:refund.id,updated_at:new Date().toISOString()}).eq("id",cid);
       await db.from("ranova_after_sales_events").insert({case_id:cid,actor_type:"system",event_type:"refund_opened",note:"Refund request "+refundRef+" opened automatically after paid cancellation approval."});
     }
   }
   if(decision==="accept"&&c.case_type==="return")await db.from("ranova_after_sales_cases").update({status:"return_in_transit",updated_at:new Date().toISOString()}).eq("id",cid);
   await notify(c.buyer_user_id,"buyer","After-sales case updated",c.case_ref+" has a seller response: "+decision+".","after_sales_response",{case_ref:c.case_ref,decision});
   return res(hh,200,{ok:true,cases:await load(u.id)});
  }
  if(action==="buyer_mark_return_sent"){
   if(role!=="buyer"||c.case_type!=="return"||c.status!=="return_in_transit")return res(hh,409,{ok:false,error:"This return is not ready to be marked as sent."});
   const note=clean(b.note,1200);await db.from("ranova_after_sales_events").insert({case_id:cid,actor_type:"buyer",actor_user_id:u.id,event_type:"return_sent",note:note||"Buyer marked return as sent."});
   await notify(c.seller_user_id,"seller","Returned goods are on the way",c.case_ref+" was marked as returned by the buyer.","after_sales_return_sent",{case_ref:c.case_ref});
   return res(hh,200,{ok:true,cases:await load(u.id)});
  }
  if(action==="seller_confirm_return"){
   if(role!=="seller"||c.case_type!=="return"||c.status!=="return_in_transit")return res(hh,409,{ok:false,error:"This return is not awaiting seller receipt."});
   const note=clean(b.note,1200),{data:so}=await db.from("ranova_seller_orders").select("*").eq("id",c.seller_order_id).maybeSingle();
   if(!so)return res(hh,404,{ok:false,error:"Seller order not found."});
   await db.rpc("ranova_release_order_inventory",{p_order_ref:so.platform_order_ref,p_seller_order_id:so.id,p_reason:"Returned goods received under "+c.case_ref,p_restore_committed:true,p_actor_type:"seller",p_actor_user_id:u.id});
   let refundId=c.refund_id||null;
   if(!refundId){
     const refundRef="RNV-RFD-"+new Date().toISOString().slice(0,10).replace(/-/g,"")+"-"+crypto.randomUUID().slice(0,8).toUpperCase();
     const amount=Number(so.total||so.subtotal||0);
     const {data:refund,error:refundErr}=await db.from("ranova_marketplace_refunds").insert({
       refund_ref:refundRef,customer_order_id:c.customer_order_id,seller_order_id:so.id,requested_by:"buyer",requested_by_user_id:c.buyer_user_id,
       requested_amount:amount,currency:so.currency||"GHS",reason_category:"item_not_as_described",
       reason_detail:"Return received under after-sales case "+c.case_ref+".",status:"requested"
     }).select("id").single();
     if(refundErr)throw refundErr; refundId=refund.id;
     await db.from("ranova_after_sales_events").insert({case_id:cid,actor_type:"system",event_type:"refund_opened",note:"Refund request opened after seller confirmed returned goods."});
   }
   await db.from("ranova_after_sales_cases").update({status:"refund_pending",refund_id:refundId,seller_response:note||c.seller_response,updated_at:new Date().toISOString()}).eq("id",cid);
   await db.from("ranova_after_sales_events").insert({case_id:cid,actor_type:"seller",actor_user_id:u.id,event_type:"return_received",note:note||"Seller confirmed returned goods received and inventory restored."});
   await notify(c.buyer_user_id,"buyer","Seller received your return",c.case_ref+" is now awaiting refund review.","after_sales_return_received",{case_ref:c.case_ref});
   return res(hh,200,{ok:true,cases:await load(u.id)});
  }
  if(action==="add_note"){
   const note=clean(b.note,1800);if(note.length<2)return res(hh,400,{ok:false,error:"Enter a note."});
   await db.from("ranova_after_sales_events").insert({case_id:cid,actor_type:role,actor_user_id:u.id,event_type:"message",note});
   const other=role==="buyer"?c.seller_user_id:c.buyer_user_id;await notify(other,role==="buyer"?"seller":"buyer","After-sales case message",c.case_ref+" has a new message.","after_sales_message",{case_ref:c.case_ref});
   return res(hh,200,{ok:true,cases:await load(u.id)});
  }
  return res(hh,400,{ok:false,error:"Unknown after-sales action."});
 }catch(e){console.error(e);return res(hh,500,{ok:false,error:e instanceof Error?e.message:"After-sales request failed."})}
});