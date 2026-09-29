const {chromium}=require('playwright'),fs=require('fs'),assert=require('node:assert/strict');
const html=fs.readFileSync(require('path').join(__dirname,'../all/seller-center.html'),'utf8');
const types=['business_registration','identity_document','fulfilment_evidence'];
const docs=()=>types.map((type,i)=>({id:String(i),document_type:type,review_status:'submitted',created_at:'2026-09-29T00:00:00Z',original_filename:'test.pdf'}));
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
 async function run(name,files,fn,serverReject=false){
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage(),errors=[];let submits=0;
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.addInitScript(()=>{window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'test',user:{id:'seller-test'}}}}),onAuthStateChange:()=>{}},storage:{from:()=>({upload:async()=>({error:null})})},from:()=>({insert:async()=>({error:null})})})}});
  await page.route('**/*',async route=>{
   const url=route.request().url();
   if(url.includes('ranova-seller-workspace')){
    const b=route.request().postDataJSON();
    if(b.action==='submit_for_review'){submits++;return route.fulfill({status:serverReject?400:200,json:serverReject?{ok:false,error:'Please fill this part 👍',missing_types:['identity_document']}:{ok:true}})}
    if(b.action==='document_submitted'){files.push({id:'new',document_type:b.document_type,review_status:'submitted',created_at:'2026-09-29T01:00:00Z'});return route.fulfill({json:{ok:true}})}
    return route.fulfill({json:{ok:true,linked:true,application:{application_ref:'TEST',business_name:'Test Store',business_info_status:'complete',verification_status:'in_progress'},files}});
   }
   if(url==='https://ranova.test/seller-center.html')return route.fulfill({contentType:'text/html',body:html});
   return route.fulfill({body:'',contentType:'application/javascript'});
  });
  await page.goto('https://ranova.test/seller-center.html');await page.locator('#workspace').waitFor({state:'visible'});
  await fn(page,()=>submits);assert.deepEqual(errors,[]);console.log('PASS '+name);await context.close();
 }
 await run('empty required sections: button active, all hints visible, no submission',[],async(p,n)=>{assert.equal(await p.locator('#submitForReview').isDisabled(),false);await p.locator('#submitForReview').click();assert.equal(await p.locator('.needs-document').count(),3);assert.equal(n(),0);assert.equal(await p.locator('#locationUploadCard .document-reminder').count(),0);assert.equal(await p.locator('#businessDoc').getAttribute('aria-invalid'),'true')});
 await run('selected file alone cannot count as uploaded',[],async(p,n)=>{await p.locator('#businessDoc').setInputFiles({name:'test.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-test')});await p.locator('#submitForReview').click();assert.match(await p.locator('#businessDocReminder').innerText(),/tap Upload/);assert.equal(n(),0)});
 await run('only missing ID highlighted',docs().filter(x=>x.document_type!=='identity_document'),async(p,n)=>{await p.locator('#submitForReview').click();assert.equal(await p.locator('.needs-document').count(),1);assert.equal(await p.locator('#identityDocReminder').isVisible(),true);assert.equal(n(),0)});
 await run('latest rejected document blocks despite older approved file',[...docs(),{id:'new',document_type:'identity_document',review_status:'rejected',created_at:'2026-09-29T02:00:00Z'}],async(p,n)=>{await p.locator('#submitForReview').click();assert.equal(await p.locator('#identityDocReminder').isVisible(),true);assert.equal(n(),0)});
 await run('all required documents permit submission without optional location',docs(),async(p,n)=>{await p.locator('#submitForReview').click();await p.waitForFunction(()=>document.getElementById('verifyMsg').textContent.includes('successfully'));assert.equal(n(),1);assert.equal(await p.locator('#submitForReview').isDisabled(),false)});
 await run('successful upload clears highlighted section',docs().filter(x=>x.document_type!=='identity_document'),async(p,n)=>{await p.locator('#submitForReview').click();await p.locator('#identityDoc').setInputFiles({name:'test.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-test')});await p.locator('[data-input=identityDoc]').click();await p.locator('#identityDocReminder').waitFor({state:'hidden'});await p.locator('#submitForReview').click();await p.waitForFunction(()=>document.getElementById('verifyMsg').textContent.includes('successfully'));assert.equal(n(),1)});
 await run('server rejection restores clickable button and marks affected section',docs(),async(p,n)=>{await p.locator('#submitForReview').click();await p.locator('#identityDocReminder').waitFor({state:'visible'});assert.equal(n(),1);assert.equal(await p.locator('#submitForReview').isDisabled(),false)},true);
 await browser.close();console.log('7 browser scenarios passed; no real accounts or documents changed.');
})().catch(e=>{console.error(e);process.exit(1)});
