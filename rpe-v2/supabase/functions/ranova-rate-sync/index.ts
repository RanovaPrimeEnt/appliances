import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const admin=createClient(SUPABASE_URL,SERVICE_KEY,{auth:{persistSession:false,autoRefreshToken:false}});

function response(status:number,payload:any){return new Response(JSON.stringify(payload),{status,headers:{"Content-Type":"application/json"}})}
function blockedHost(host:string){
  const h=host.toLowerCase();
  if(h==="localhost"||h==="::1"||h.endsWith(".local"))return true;
  if(/^127./.test(h)||/^10./.test(h)||/^192.168./.test(h))return true;
  const m=h.match(/^172.(d{1,2})./);if(m){const n=Number(m[1]);if(n>=16&&n<=31)return true}
  return false;
}
function num(v:any,min=0,max=100){
  const n=Number(v);return Number.isFinite(n)&&n>=min&&n<=max?n:null;
}
function fixed(v:any){
  const n=Number(v);return Number.isFinite(n)&&n>=0?n:null;
}
function parsePayload(j:any){
  const x=j&&typeof j==="object"?(j.rates&&typeof j.rates==="object"?j.rates:j):{};
  const out:any={};
  const c=num(x.commission_rate);if(c!==null)out.commission_rate=Number(c.toFixed(2));
  const p=num(x.required_payment_percent);if(p!==null)out.required_payment_percent=Number(p.toFixed(2));
  const pr=num(x.payment_processing_rate);if(pr!==null)out.payment_processing_rate=Number(pr.toFixed(2));
  const ff=fixed(x.payment_fixed_fee);if(ff!==null)out.payment_fixed_fee=Number(ff.toFixed(2));
  if(["platform","buyer","seller"].includes(String(x.payment_fee_payer||"")))out.payment_fee_payer=String(x.payment_fee_payer);
  if(x.effective_from&&!Number.isNaN(new Date(x.effective_from).getTime()))out.effective_from=new Date(x.effective_from).toISOString();
  return out;
}

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return response(405,{ok:false,error:"Method not allowed"});
  if(req.headers.get("x-ranova-client")!=="ranova-site-v1")return response(403,{ok:false,error:"Invalid client"});
  let body:any={};try{body=await req.json()}catch{}
  const force=!!body.force;
  const {data:rules,error}=await admin.from("ranova_marketplace_country_rules")
    .select("*").eq("active",true).eq("auto_update",true).not("source_url","is",null);
  if(error)return response(500,{ok:false,error:"Could not load auto-update rules."});

  const results:any[]=[];
  for(const rule of rules||[]){
    const now=new Date();
    const last=rule.last_checked_at?new Date(rule.last_checked_at):null;
    if(!force&&last&&now.getTime()-last.getTime()<30*60*1000){
      results.push({id:rule.id,status:"skipped_recent"});
      continue;
    }
    if(rule.source_kind==="owner_policy"){
      await admin.from("ranova_marketplace_country_rules").update({
        last_checked_at:now.toISOString(),last_sync_status:"skipped_owner_policy",
        last_sync_error:"Owner-policy rules are not externally synchronized."
      }).eq("id",rule.id);
      results.push({id:rule.id,status:"skipped_owner_policy"});
      continue;
    }
    try{
      const u=new URL(String(rule.source_url||""));
      if(u.protocol!=="https:"||blockedHost(u.hostname))throw new Error("Only public HTTPS official sources are allowed.");
      const headers:any={"Accept":"application/json"};
      if(rule.source_etag)headers["If-None-Match"]=rule.source_etag;
      if(rule.source_last_modified)headers["If-Modified-Since"]=rule.source_last_modified;
      const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),10000);
      const r=await fetch(u.toString(),{headers,signal:ctrl.signal});clearTimeout(timer);
      if(r.status===304){
        await admin.from("ranova_marketplace_country_rules").update({
          last_checked_at:now.toISOString(),last_sync_status:"unchanged",last_sync_error:null
        }).eq("id",rule.id);
        results.push({id:rule.id,status:"unchanged"});continue;
      }
      if(!r.ok)throw new Error("Official source returned HTTP "+r.status+".");
      const type=r.headers.get("content-type")||"";
      if(!type.toLowerCase().includes("json"))throw new Error("Auto-update source must return JSON.");
      const j=await r.json();
      const updates=parsePayload(j);
      if(!Object.keys(updates).length)throw new Error("Source JSON did not contain supported rate fields.");
      updates.last_checked_at=now.toISOString();
      updates.last_sync_status="updated";
      updates.last_sync_error=null;
      updates.source_etag=r.headers.get("etag")||rule.source_etag||null;
      updates.source_last_modified=r.headers.get("last-modified")||rule.source_last_modified||null;
      updates.updated_at=now.toISOString();
      const {error:updateError}=await admin.from("ranova_marketplace_country_rules").update(updates).eq("id",rule.id);
      if(updateError)throw updateError;
      results.push({id:rule.id,status:"updated",fields:Object.keys(updates).filter(x=>!x.startsWith("last_")&&!x.startsWith("source_")&&x!=="updated_at")});
    }catch(e){
      const message=e instanceof Error?e.message:String(e);
      await admin.from("ranova_marketplace_country_rules").update({
        last_checked_at:new Date().toISOString(),last_sync_status:"error",last_sync_error:message.slice(0,1000)
      }).eq("id",rule.id);
      results.push({id:rule.id,status:"error",error:message});
    }
  }
  return response(200,{ok:true,checked:results.length,results});
});