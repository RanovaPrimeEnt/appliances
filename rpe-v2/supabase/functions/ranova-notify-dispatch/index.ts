import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const RESEND_KEY=Deno.env.get("RESEND_API_KEY")||"";
const FROM=Deno.env.get("RANOVA_EMAIL_FROM")||"";
const admin=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});

function response(status:number,payload:any){
  return new Response(JSON.stringify(payload),{status,headers:{"Content-Type":"application/json"}});
}
function esc(v:any){return String(v??"").replace(/[&<>"']/g,(c)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"} as any)[c])}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return response(405,{ok:false,error:"Method not allowed"});
  if(req.headers.get("x-ranova-client")!=="ranova-site-v1")return response(403,{ok:false,error:"Invalid client"});
  const providerReady=!!(RESEND_KEY&&FROM);
  if(!providerReady)return response(200,{ok:true,provider_configured:false,sent:0,failed:0,queued:true});

  const {data:rows,error}=await admin.from("ranova_marketplace_notifications")
    .select("*")
    .eq("email_requested",true)
    .in("email_status",["queued","failed"])
    .not("recipient_email","is",null)
    .order("created_at",{ascending:true})
    .limit(50);
  if(error)return response(500,{ok:false,error:"Could not load notification queue."});

  let sent=0,failed=0;
  for(const n of rows||[]){
    try{
      const html='<div style="font-family:Arial,sans-serif;line-height:1.6;color:#17342e;max-width:620px;margin:auto">'+
        '<div style="background:#176B61;color:white;padding:18px 20px;border-radius:14px 14px 0 0"><strong>RANOVA MARKETPLACE</strong></div>'+
        '<div style="border:1px solid #e0e8e4;border-top:0;padding:22px;border-radius:0 0 14px 14px;background:#fff">'+
        '<h2 style="margin-top:0">'+esc(n.title)+'</h2><p>'+esc(n.message)+'</p>'+
        '<p style="color:#6E7E7A;font-size:13px">This message was generated from a recorded RANOVA marketplace event. Keep your order reference for support.</p>'+
        '</div></div>';
      const r=await fetch("https://api.resend.com/emails",{
        method:"POST",
        headers:{"Authorization":"Bearer "+RESEND_KEY,"Content-Type":"application/json"},
        body:JSON.stringify({from:FROM,to:[n.recipient_email],subject:n.title,html})
      });
      const body=await r.text();
      if(!r.ok)throw new Error("Email provider returned HTTP "+r.status+": "+body.slice(0,300));
      await admin.from("ranova_marketplace_notifications").update({
        email_status:"sent",email_attempted_at:new Date().toISOString(),email_sent_at:new Date().toISOString(),email_error:null
      }).eq("id",n.id);
      sent++;
    }catch(e){
      const msg=e instanceof Error?e.message:String(e);
      await admin.from("ranova_marketplace_notifications").update({
        email_status:"failed",email_attempted_at:new Date().toISOString(),email_error:msg.slice(0,1000)
      }).eq("id",n.id);
      failed++;
    }
  }
  return response(200,{ok:true,provider_configured:true,checked:(rows||[]).length,sent,failed});
});