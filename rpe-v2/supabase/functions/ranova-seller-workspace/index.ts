import { sellerDocumentCompliance, sellerRequiredDocumentsApproved } from "../_shared/seller-documents.ts";
import { sellerAccessApproved } from "../_shared/seller-approval.ts";
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
  if(req.headers.get("x-ranova-client")!=="ranova-site-v1")return new Response(JSON.stringify({ok:false,error:"Invalid client"}),{status:403,headers:h});
  const user=await getUser(req);
  if(!user?.id)return new Response(JSON.stringify({ok:false,error:"Sign in to continue."}),{status:401,headers:h});
  let body:any={};
  try{body=await req.json()}catch{}
  const action=String(body?.action||"workspace").trim().toLowerCase();

  const accountQ=new URL(SUPABASE_URL+"/rest/v1/ranova_seller_accounts");
  accountQ.searchParams.set("select","application_ref");
  accountQ.searchParams.set("user_id","eq."+user.id);
  accountQ.searchParams.set("limit","1");
  const ar=await fetch(accountQ.toString(),{headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY}});
  const accounts=await ar.json().catch(()=>[]);
  if(!accounts.length)return new Response(JSON.stringify({ok:true,linked:false}),{status:200,headers:h});
  const ref=accounts[0].application_ref;

  const appQ=new URL(SUPABASE_URL+"/rest/v1/ranova_seller_applications");
  appQ.searchParams.set("select","application_ref,business_name,contact_person,business_location,supplier_type,categories,status,verification_status,business_info_status,business_documents_status,identity_status,fulfilment_status,store_setup_status,verification_notes,reviewed_at,created_at");
  appQ.searchParams.set("application_ref","eq."+ref);
  appQ.searchParams.set("limit","1");
  const appRes=await fetch(appQ.toString(),{headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY}});
  const apps=await appRes.json().catch(()=>[]);
  if(!apps.length)return new Response(JSON.stringify({ok:false,error:"Linked application could not be loaded."}),{status:404,headers:h});

  const filesQ=new URL(SUPABASE_URL+"/rest/v1/ranova_seller_verification_files");
  filesQ.searchParams.set("select","id,document_type,original_filename,review_status,review_note,created_at");
  filesQ.searchParams.set("seller_id","eq."+user.id);
  filesQ.searchParams.set("application_ref","eq."+ref);
  filesQ.searchParams.set("order","created_at.desc,id.desc");
  const fr=await fetch(filesQ.toString(),{headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY}});
  const files=await fr.json().catch(()=>[]);

  if(!fr.ok)return new Response(JSON.stringify({ok:false,error:"Could not check uploaded documents."}),{status:500,headers:h});
  const document_compliance=sellerDocumentCompliance(apps[0],files);
  const required_documents_approved=sellerRequiredDocumentsApproved(files);

  const storeQ=new URL(SUPABASE_URL+"/rest/v1/ranova_seller_stores");
  storeQ.searchParams.set("select","store_status,moderated_by,moderated_at");
  storeQ.searchParams.set("seller_id","eq."+user.id);
  storeQ.searchParams.set("application_ref","eq."+ref);
  storeQ.searchParams.set("limit","1");
  const storeRes=await fetch(storeQ.toString(),{headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY}});
  const stores=await storeRes.json().catch(()=>[]);
  if(!storeRes.ok)return new Response(JSON.stringify({ok:false,error:"Could not check store approval."}),{status:500,headers:h});
  const approved=sellerAccessApproved(apps[0],stores[0]||null)&&required_documents_approved;

  if(action==="document_submitted"){
    const type=String(body?.document_type||"").trim().toLowerCase();
    const stageMap:Record<string,string>={
      business_registration:"business_documents_status",
      identity_document:"identity_status",
      fulfilment_evidence:"fulfilment_status"
    };
    if(!["business_registration","identity_document","location_proof","fulfilment_evidence"].includes(type)){
      return new Response(JSON.stringify({ok:false,error:"Invalid verification document type."}),{status:400,headers:h});
    }

    const verifyQ=new URL(SUPABASE_URL+"/rest/v1/ranova_seller_verification_files");
    verifyQ.searchParams.set("select","id,review_status");
    verifyQ.searchParams.set("seller_id","eq."+user.id);
    verifyQ.searchParams.set("application_ref","eq."+ref);
    verifyQ.searchParams.set("document_type","eq."+type);
    verifyQ.searchParams.set("review_status","eq.submitted");
    verifyQ.searchParams.set("order","created_at.desc");
    verifyQ.searchParams.set("limit","1");
    const vr=await fetch(verifyQ.toString(),{headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY}});
    const vf=await vr.json().catch(()=>[]);
    if(!vr.ok||!vf.length){
      return new Response(JSON.stringify({ok:false,error:"The submitted verification document could not be confirmed."}),{status:400,headers:h});
    }

    const stage=stageMap[type];
    if(stage){
      const patch:any={[stage]:"under_review",updated_at:new Date().toISOString()};
      if(!approved&&!["rejected","suspended"].includes(String(apps[0].verification_status||apps[0].status)))patch.verification_status="in_progress";
      const pr=await fetch(SUPABASE_URL+"/rest/v1/ranova_seller_applications?application_ref=eq."+encodeURIComponent(ref),{
        method:"PATCH",
        headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json",Prefer:"return=minimal"},
        body:JSON.stringify(patch)
      });
      if(!pr.ok){
        const detail=await pr.text().catch(()=>"");
        return new Response(JSON.stringify({ok:false,error:"Document uploaded, but the verification stage could not be updated.",detail}),{status:500,headers:h});
      }
    }
    return new Response(JSON.stringify({ok:true,application_ref:ref,document_type:type,stage_status:stage?"under_review":"supporting_document"}),{status:200,headers:h});
  }

  if(action==="submit_for_review"){
    if(approved)return new Response(JSON.stringify({ok:true,application_ref:ref,status:"approved",approval_preserved:true}),{status:200,headers:h});
    const reqQ=new URL(SUPABASE_URL+"/rest/v1/ranova_seller_verification_files");
    reqQ.searchParams.set("select","id,document_type,original_filename,review_status,created_at");
    reqQ.searchParams.set("order","created_at.desc,id.desc");
    reqQ.searchParams.set("seller_id","eq."+user.id);
    reqQ.searchParams.set("application_ref","eq."+ref);
    reqQ.searchParams.set("document_type","in.(business_registration,identity_document,fulfilment_evidence)");
    const rr=await fetch(reqQ.toString(),{headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY}});
    const rows=await rr.json().catch(()=>[]);
    if(!rr.ok)return new Response(JSON.stringify({ok:false,error:"Could not verify submitted documents."}),{status:500,headers:h});
    const acceptable=(t:string)=>{const latest=rows.find((x:any)=>x.document_type===t);return latest&&/\.(pdf|doc|docx|ppt|pptx|jpe?g|png|webp|gif|bmp|tiff?|heic|heif|avif|svg|ico)$/i.test(String(latest.original_filename||""))};
    const missing:string[]=[];
    if(!acceptable("business_registration"))missing.push("business proof");
    if(!acceptable("identity_document"))missing.push("identity ID");
    if(!acceptable("fulfilment_evidence"))missing.push("orders and delivery evidence");
    const types=["business_registration","identity_document","fulfilment_evidence"];
    const missing_types=types.filter(t=>!acceptable(t));
    if(missing.length)return new Response(JSON.stringify({ok:false,error:"Please fill this part 👍 — upload the required documents: "+missing.join(", ")+".",missing,missing_types}),{status:400,headers:h});
    if(!["complete","approved","verified"].includes(String(apps[0].business_info_status||"").toLowerCase()))return new Response(JSON.stringify({ok:false,error:"Please fill this part 👍 — complete your business information before submitting."}),{status:400,headers:h});

    const now=new Date().toISOString();
    const pr=await fetch(SUPABASE_URL+"/rest/v1/ranova_seller_applications?application_ref=eq."+encodeURIComponent(ref),{
      method:"PATCH",
      headers:{apikey:SERVICE_KEY,Authorization:"Bearer "+SERVICE_KEY,"Content-Type":"application/json",Prefer:"return=minimal"},
      body:JSON.stringify({
        status:"under_review",
        verification_status:"in_progress",
        updated_at:now
      })
    });
    if(!pr.ok)return new Response(JSON.stringify({ok:false,error:"Could not submit the seller application for review."}),{status:500,headers:h});
    return new Response(JSON.stringify({ok:true,application_ref:ref,status:"under_review"}),{status:200,headers:h});
  }


  return new Response(JSON.stringify({ok:true,linked:true,application:apps[0],approved,store_accessible:approved&&!document_compliance.blocked,document_compliance,files}),{status:200,headers:h});
});
