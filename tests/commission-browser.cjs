// Component browser test. No live network calls or payment requests.
const {chromium}=require('playwright');
const fs=require('fs'),path=require('path'),assert=require('assert/strict');
(async()=>{
 const root=path.resolve(__dirname,'..'),html=fs.readFileSync(root+'/rpe-v2/admin.html','utf8'),js=fs.readFileSync(root+'/rpe-v2/admin.js','utf8');
 const {commissionBreakdown}=await import(root+'/rpe-v2/supabase/functions/_shared/commission.ts');
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>r.abort());
 await page.setContent(html.replace(/<script[\s\S]*?<\/script>/g,''));
 await page.evaluate(()=>{const card=document.getElementById('countryRulesCard').outerHTML;document.body.innerHTML=card;for(const id of ['commissionSellerCountry','commissionBuyerCountry','ruleSellerCountry','ruleBuyerCountry'])document.getElementById(id).innerHTML='<option value="GH">Ghana</option><option value="NG">Nigeria</option>'});
 let calls=[];
 await page.exposeFunction('marketApi',async b=>{calls.push(b);assert.equal(b.action,'preview_commission');return {draft:b.preview_draft,rule_source:'Test policy',breakdown:commissionBreakdown({...b,currency:'GHS'},b.subtotal,b.delivery_fee)}});
 const clear=js.slice(js.indexOf('function clearCountryRuleForm(){'),js.indexOf('function renderCountryRules(){'));
 const handlers=js.slice(js.indexOf('if($("suggestCommission")&&$("previewCommission")){'),js.indexOf('$("saveCountryRule").onclick='));
 await page.addScriptTag({content:'const $=id=>document.getElementById(id);const isOwner=()=>true;const pretty=x=>x;const esc=x=>String(x).replace(/[&<>"\x27]/g,"");'+clear+handlers});
 await page.locator('#suggestCommission').click();assert.equal(await page.locator('#ruleCommission').inputValue(),'10');assert.equal(await page.locator('#ruleActive').isChecked(),false);assert.equal(calls.length,0);
 await page.locator('#rulePaymentRate').fill('2');await page.locator('#previewCommission').click();await page.waitForFunction(()=>document.getElementById('commissionPreviewResult').textContent.includes('540.00'));assert.match(await page.locator('#commissionPreviewResult').innerText(),/48.00/);
 assert.equal(calls.length,1);assert.equal(calls[0].seller_country_code,'GH');assert.equal(calls[0].currency,'GHS');
 assert.deepEqual(errors,[]);console.log('PASS browser preview: proposal remains inactive, computes seller/platform shares, and makes only a preview request.');
 await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
