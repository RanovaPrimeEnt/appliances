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
function clean(v:any,max=180){return String(v??"").trim().slice(0,max)}
function normalPhone(v:string){return v.replace(/\D/g,"").replace(/^233/,"0")}

async function getUser(req:Request){
  const auth=req.headers.get("authorization")||"";
  if(!auth.startsWith("Bearer "))return null;
  const res=await fetch(SUPABASE_URL+"/auth/v1/user",{headers:{Authorization:auth,apikey:SERVICE_KEY}});
  if(!res.ok)return null;
  return await res.json();
}

Deno.serve(async(req:Request)=>{
  const h=headers(req.headers.get("origin"));
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:h});
  if(req.method!=="POST")return new Response(JSON.stringify({ok:false,error:"Method not allowed"}),{status:405,headers:h});
  if(req.headers.get("x-ranova-client")!=="ranova-site-v1"){
    return new Response(JSON.stringify({ok:false,error:"Invalid client"}),{status:403,headers:h});
  }

  const user=await getUser(req);
  if(!user?.id)return new Response(JSON.stringify({ok:false,error:"Sign in to continue."}),{status:401,headers:h});

  try{
    const b=await req.json();
    const application_ref=clean(b.application_ref,80).toUpperCase();
    const phone=normalPhone(clean(b.phone,40));
    if(!application_ref||!phone){
      return new Response(JSON.stringify({ok:false,error:"Enter your application reference and phone number."}),{status:400,headers:h});
    }

    const q=new URL(SUPABASE_URL+"/rest/v1/ranova_seller_applications");
    q.searchParams.set("select","application_ref,business_name,phone,email,status,verification_status,business_documents_status,store_setup_status");
    q.searchParams.set("application_ref","eq."+application_ref);
    q.searchParams.set("limit","1");
    const appRes=await fetch(q.toString(),{headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY}});
    const apps=await appRes.json().catch(()=>[]);
    if(!appRes.ok||!apps.length){
      return new Response(JSON.stringify({ok:false,error:"Application not found. Check the reference, or start a new seller application."}),{status:404,headers:h});
    }
    const app=apps[0];

    if(normalPhone(String(app.phone||""))!==phone){
      return new Response(JSON.stringify({ok:false,error:"The phone number does not match this seller application."}),{status:403,headers:h});
    }
    if(app.email&&user.email&&String(app.email).toLowerCase()!==String(user.email).toLowerCase()){
      return new Response(JSON.stringify({ok:false,error:"Sign in with the same email used in the seller application."}),{status:403,headers:h});
    }

    const existingQ=new URL(SUPABASE_URL+"/rest/v1/ranova_seller_accounts");
    existingQ.searchParams.set("select","user_id,application_ref");
    existingQ.searchParams.set("application_ref","eq."+application_ref);
    existingQ.searchParams.set("limit","1");
    const exRes=await fetch(existingQ.toString(),{headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY}});
    const existing=await exRes.json().catch(()=>[]);
    if(existing.length&&existing[0].user_id!==user.id){
      return new Response(JSON.stringify({ok:false,error:"This seller application is already connected to another account. Sign in to the original account or contact RANOVA support."}),{status:409,headers:h});
    }

    const userAccountQ=new URL(SUPABASE_URL+"/rest/v1/ranova_seller_accounts");
    userAccountQ.searchParams.set("select","user_id,application_ref");
    userAccountQ.searchParams.set("user_id","eq."+user.id);
    userAccountQ.searchParams.set("limit","1");
    const uaRes=await fetch(userAccountQ.toString(),{headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY}});
    const userAccounts=await uaRes.json().catch(()=>[]);
    if(userAccounts.length&&userAccounts[0].application_ref!==application_ref){
      return new Response(JSON.stringify({ok:false,error:"This login is already connected to a different seller application. Sign out and use the correct seller account."}),{status:409,headers:h});
    }

    const upsert=await fetch(SUPABASE_URL+"/rest/v1/ranova_seller_accounts?on_conflict=user_id",{
      method:"POST",
      headers:{
        apikey:SERVICE_KEY,
        Authorization:"Bearer "+SERVICE_KEY,
        "Content-Type":"application/json",
        Prefer:"resolution=merge-duplicates,return=representation"
      },
      body:JSON.stringify({user_id:user.id,application_ref})
    });
    if(!upsert.ok){
      const err=await upsert.text().catch(()=>"");
      console.error(err);
      return new Response(JSON.stringify({ok:false,error:"Could not connect the seller account."}),{status:500,headers:h});
    }

    return new Response(JSON.stringify({
      ok:true,
      application_ref,
      business_name:app.business_name,
      verification_status:app.verification_status||app.status||"in_progress",
      already_linked:existing.length>0
    }),{status:200,headers:h});
  }catch(e){
    console.error(e);
    return new Response(JSON.stringify({ok:false,error:"Could not connect the seller account."}),{status:500,headers:h});
  }
});