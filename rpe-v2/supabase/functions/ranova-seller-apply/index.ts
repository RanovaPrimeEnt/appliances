import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const SERVICE_KEY=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
const ALLOWED_ORIGIN="https://ranovaprimeent.github.io";

function headers(origin:string|null){
  const allow=origin===ALLOWED_ORIGIN||origin?.startsWith("http://localhost")?origin:ALLOWED_ORIGIN;
  return {
    "Content-Type":"application/json",
    "Access-Control-Allow-Origin":allow||ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers":"content-type,x-ranova-client",
    "Access-Control-Allow-Methods":"POST,OPTIONS"
  };
}
function clean(v:any,max=300){return String(v??"").trim().slice(0,max)}
function refCode(){
  const d=new Date();
  const y=d.getUTCFullYear();
  const m=String(d.getUTCMonth()+1).padStart(2,"0");
  const day=String(d.getUTCDate()).padStart(2,"0");
  const token=crypto.randomUUID().replace(/-/g,"").slice(0,6).toUpperCase();
  return `RNV-SLR-${y}${m}${day}-${token}`;
}

Deno.serve(async(req:Request)=>{
  const h=headers(req.headers.get("origin"));
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:h});
  if(req.method!=="POST")return new Response(JSON.stringify({ok:false,error:"Method not allowed"}),{status:405,headers:h});
  if(req.headers.get("x-ranova-client")!=="ranova-site-v1"){
    return new Response(JSON.stringify({ok:false,error:"Invalid client"}),{status:403,headers:h});
  }
  try{
    const b=await req.json();
    const business_name=clean(b.business_name,160);
    const contact_person=clean(b.contact_person,120);
    const phone=clean(b.phone,40);
    const email=clean(b.email,160);
    const business_location=clean(b.business_location,160);
    const supplier_type=clean(b.supplier_type,80);
    const categories=clean(b.categories,400);
    const business_details=clean(b.business_details,1200);
    const years_in_business=Math.max(0,Math.min(100,Math.floor(Number(b.years_in_business||0))));
    const sales_channels=Array.isArray(b.sales_channels)?b.sales_channels.map((x:any)=>clean(x,60)).filter(Boolean).slice(0,10):[];
    const has_business_registration=Boolean(b.has_business_registration);
    const registration_number=clean(b.registration_number,120);
    const preferred_fulfilment=clean(b.preferred_fulfilment,80);

    if(!business_name||!contact_person||!phone||!business_location||!supplier_type||!categories){
      return new Response(JSON.stringify({ok:false,error:"Please complete all required seller application fields."}),{status:400,headers:h});
    }

    const application_ref=refCode();
    const payload={
      application_ref,business_name,contact_person,phone,email:email||null,business_location,
      supplier_type,categories,business_details:business_details||null,years_in_business,
      sales_channels,has_business_registration,registration_number:registration_number||null,
      preferred_fulfilment:preferred_fulfilment||null,status:"in_progress"
    };

    const res=await fetch(SUPABASE_URL+"/rest/v1/ranova_seller_applications",{
      method:"POST",
      headers:{
        "apikey":SERVICE_KEY,
        "Authorization":"Bearer "+SERVICE_KEY,
        "Content-Type":"application/json",
        "Prefer":"return=representation"
      },
      body:JSON.stringify(payload)
    });
    const data=await res.json().catch(()=>[]);
    if(!res.ok){
      console.error("seller application insert failed",res.status,data);
      return new Response(JSON.stringify({ok:false,error:"Could not submit the seller application. Please try again."}),{status:500,headers:h});
    }

    return new Response(JSON.stringify({
      ok:true,
      application_ref,
      status:"submitted",
      message:"Seller application received."
    }),{status:200,headers:h});
  }catch(e){
    console.error(e);
    return new Response(JSON.stringify({ok:false,error:"Could not submit the seller application. Please try again."}),{status:500,headers:h});
  }
});