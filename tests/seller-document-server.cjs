const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),{stripTypeScriptTypes}=require('node:module');
const source=stripTypeScriptTypes(fs.readFileSync(require('path').join(__dirname,'../rpe-v2/supabase/functions/ranova-seller-workspace/index.ts'),'utf8').replace(/^import .*;\n/gm,''));
const types=['business_registration','identity_document','fulfilment_evidence'];
async function run(rows,complete=true){let handler,patches=0;
 const fakeFetch=async(url,options={})=>{
  const u=new URL(url);
  if(options.method==='PATCH'){patches++;return new Response(null,{status:204})}
  let body=[];
  if(u.pathname==='/auth/v1/user')body={id:'seller'};
  else if(u.pathname.endsWith('ranova_seller_accounts'))body=[{application_ref:'TEST'}];
  else if(u.pathname.endsWith('ranova_seller_applications'))body=[{application_ref:'TEST',business_info_status:complete?'complete':'in_progress'}];
  else if(u.pathname.endsWith('ranova_seller_verification_files')){assert.equal(u.searchParams.get('seller_id'),'eq.seller');assert.equal(u.searchParams.get('application_ref'),'eq.TEST');assert.equal(u.searchParams.get('order'),'created_at.desc,id.desc');body=rows}
  return new Response(JSON.stringify(body),{status:200});
 };
 vm.runInNewContext(source,{Deno:{env:{get:k=>k==='SUPABASE_URL'?'https://test.example':'test'},serve:f=>handler=f},fetch:fakeFetch,URL,Response,Request,console});
 const res=await handler(new Request('https://test.example',{method:'POST',headers:{Authorization:'Bearer test','x-ranova-client':'ranova-site-v1','Content-Type':'application/json'},body:JSON.stringify({action:'submit_for_review'})}));
 return {status:res.status,body:await res.json(),patches};
}
(async()=>{
 let r=await run([]);assert.equal(r.status,400);assert.equal(r.body.missing_types.length,3);assert.equal(r.patches,0);
 const complete=types.map(document_type=>({document_type,review_status:'submitted',original_filename:'test.pdf'}));
 r=await run(complete);assert.equal(r.status,200);assert.equal(r.patches,1);
 r=await run([{document_type:'identity_document',review_status:'rejected',original_filename:'test.pptx'},...complete]);assert.equal(r.status,200);assert.equal(r.patches,1);
 r=await run([{document_type:'identity_document',review_status:'submitted',original_filename:'bad.exe'},...complete]);assert.equal(r.status,400);assert.deepEqual(r.body.missing_types,['identity_document']);assert.equal(r.patches,0);
 r=await run(complete,false);assert.equal(r.status,400);assert.equal(r.patches,0);
 console.log('PASS 5 server scenarios: missing documents, valid submission, supported prior rejection, unsupported format, incomplete business information. No live writes.');
})().catch(e=>{console.error(e);process.exit(1)});
