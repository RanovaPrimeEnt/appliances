// Run with Playwright installed and CHROMIUM_PATH pointing to a Chromium binary.
// All network requests are intercepted: these tests cannot send OTPs or write production data.
const {chromium} = require('playwright');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const origin = 'http://localhost:8765';
const user = {id:'test-user', email:'seller@example.com', user_metadata:{full_name:'Test Seller',business_name:'Test Store',contact_phone:'+233241234567'}};
(async () => {
  const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH, args:['--no-sandbox']});
  let passed=0;
  async function scenario(name, options, test) {
    const context = await browser.newContext({viewport:{width:390,height:844}});
    const page = await context.newPage(), errors=[], calls=[];
    let links=0;
    page.on('pageerror', e=>errors.push(e.message));
    await page.addInitScript(({user,options})=>{
      window.testSession=options.signedIn?{user,access_token:'fake'}:null;
      window.testAuthCalls=[];
      if(options.realSDK)return;
      window.supabase={createClient:()=>({auth:{
        getSession:async()=>({data:{session:window.testSession},error:null}),
        signInWithOtp:async request=>{window.testAuthCalls.push(request);return {error:options.sendFail?{message:'Email limit exceeded'}:null}},
        verifyOtp:async request=>{if(request.token!=='123456')return {error:{message:'Invalid code'}};window.testSession={user,access_token:'fake'};return {data:{session:window.testSession},error:null}},
        updateUser:async()=>({error:null})
      }})};
      if(options.corruptStorage)sessionStorage.setItem('ranova_new_seller_application','broken-json');
      if(options.blockStorage)Storage.prototype.setItem=()=>{throw Error('Storage blocked')};
    },{user,options});
    await page.route('**/*',async route=>{
      const req=route.request(), url=new URL(req.url());
      if(url.hostname==='cdn.jsdelivr.net')return route.fulfill({contentType:'application/javascript',body:options.realSDK?fs.readFileSync(process.env.SUPABASE_SDK_PATH,'utf8'):''});
      if(url.pathname==='/auth/v1/settings')return route.fulfill({json:{external:{email:true,phone:!!options.sms}}});
      if(url.pathname.includes('/functions/v1/')) {
        const name=url.pathname.split('/').pop();calls.push(name);
        if(name==='ranova-seller-workspace')return route.fulfill({json:options.workspaceFail?{ok:false,error:'Workspace unavailable'}:{ok:true,linked:!!options.linked,application:{application_ref:'EXISTING'}}});
        if(name==='ranova-seller-apply')return route.fulfill({json:{ok:true,application_ref:'TEST-REF'}});
        if(name==='ranova-seller-link'){links++;return route.fulfill({json:options.linkFail&&links===1?{ok:false,error:'Link failed'}:{ok:true}})}
        throw Error('Unexpected API '+name);
      }
      if(url.origin===origin){
        if(url.pathname==='/all/seller-center.html')return route.fulfill({contentType:'text/html',body:'<h1>Seller Center test destination</h1>'});
        const target=path.join(root,decodeURIComponent(url.pathname));
        if(fs.existsSync(target)&&fs.statSync(target).isFile())return route.fulfill({body:fs.readFileSync(target),contentType:target.endsWith('.js')?'application/javascript':target.endsWith('.css')?'text/css':'text/html'});
      }
      return route.abort();
    });
    try {
      await page.goto(origin+'/rpe-v2/seller-start.html'+(options.hash||''));
      await page.waitForFunction(()=>!document.getElementById('registerButton').disabled);
      await test(page,calls);
      assert.deepEqual(errors,[],'Browser errors');
      console.log('PASS '+name);passed++;
    } finally {await context.close()}
  }
  async function register(p){await p.locator('[data-register]').last().click();await p.locator('#registration').waitFor({state:'visible'});await p.locator('#member').fill('Test Seller');await p.locator('#company').fill('Test Store');await p.locator('#phone').fill('+233241234567');await p.locator('#email').fill('seller@example.com');await p.locator('#consent').check()}
  async function verified(p){await register(p);await p.locator('#sendCode').click();await p.locator('#code').fill('123456');await p.locator('#registerButton').click();await p.locator('#businessStep').waitFor({state:'visible'})}
  async function business(p){await p.locator('#location').fill('Accra, Ghana');await p.locator('#type').selectOption('Wholesaler');await p.locator('#categories').fill('Appliances');await p.locator('#businessForm button').click()}
  await scenario('mobile layout, navigation and eight benefit dialogs',{},async p=>{
    for(const width of [320,390,768]){await p.setViewportSize({width,height:844});assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await p.locator('[data-register]').last().click();await p.locator('#registration').waitFor({state:'visible'});assert.equal(await p.locator('.benefit').count(),8);assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await p.locator('.benefit').first().click();assert.equal(await p.locator('dialog').isVisible(),true);await p.locator('#dismissBenefit').click();await p.locator('#back').click();await p.locator('#welcome').waitFor({state:'visible'})}
    await p.setViewportSize({width:390,height:844});
    if(process.env.SCREENSHOT_DIR){fs.mkdirSync(process.env.SCREENSHOT_DIR,{recursive:true});await p.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'seller-welcome.png'),fullPage:true});await p.locator('[data-register]').last().click();await p.locator('#registration').waitFor({state:'visible'});await p.screenshot({path:path.join(process.env.SCREENSHOT_DIR,'seller-registration.png'),fullPage:true})}
  });
  await scenario('disabled SMS and required consent',{},async p=>{await register(p);assert.equal(await p.locator('[value=phone]').isDisabled(),true);await p.locator('#consent').uncheck();await p.locator('#sendCode').click();assert.match(await p.locator('#formStatus').innerText(),/accept/);assert.equal(await p.evaluate(()=>testAuthCalls.length),0)});
  await scenario('email OTP to application and seller center',{},async(p,calls)=>{await verified(p);await business(p);await p.waitForURL('**/seller-center.html?ref=TEST-REF');assert.equal(calls.filter(x=>x==='ranova-seller-apply').length,1)});
  await scenario('invalid OTP remains on form',{},async p=>{await register(p);await p.locator('#sendCode').click();await p.locator('#code').fill('000000');await p.locator('#registerButton').click();await p.waitForFunction(()=>document.getElementById('formStatus').textContent==='Invalid code');assert.equal(await p.locator('#businessStep').isHidden(),true)});
  await scenario('changed email requires a new code',{},async p=>{await register(p);await p.locator('#sendCode').click();await p.locator('#email').fill('other@example.com');await p.locator('#code').fill('123456');await p.locator('#registerButton').click();assert.match(await p.locator('#formStatus').innerText(),/changed/)});
  await scenario('email delivery error releases controls',{sendFail:true},async p=>{await register(p);await p.locator('#sendCode').click();await p.waitForFunction(()=>document.getElementById('formStatus').textContent==='Email limit exceeded');assert.equal(await p.locator('#sendCode').isDisabled(),false)});
  await scenario('signed-in buyer reuses account',{signedIn:true},async p=>{await p.locator('[data-register]').last().click();await p.locator('#registration').waitFor({state:'visible'});assert.equal(await p.locator('#verificationFields').isHidden(),true);await p.locator('#consent').check();await p.locator('#registerButton').click();await p.locator('#businessStep').waitFor({state:'visible'});assert.equal(await p.evaluate(()=>testAuthCalls.length),0)});
  await scenario('existing seller resumes without creating application',{signedIn:true,linked:true},async(p,calls)=>{await p.locator('[data-register]').last().click();await p.locator('#registration').waitFor({state:'visible'});await p.locator('#consent').check();await p.locator('#registerButton').click();await p.waitForURL('**/seller-center.html?ref=EXISTING');assert.equal(calls.includes('ranova-seller-apply'),false);assert.equal(calls.includes('ranova-seller-link'),false)});
  await scenario('link retry reuses saved application',{linkFail:true,corruptStorage:true},async(p,calls)=>{await verified(p);await business(p);await p.waitForFunction(()=>document.getElementById('businessStatus').textContent.includes('Link failed'));await p.locator('#businessForm button').click();await p.waitForURL('**/seller-center.html?ref=TEST-REF');assert.equal(calls.filter(x=>x==='ranova-seller-apply').length,1)});
  await scenario('blocked browser storage does not lose in-page reference',{linkFail:true,blockStorage:true},async(p,calls)=>{await verified(p);await business(p);await p.waitForFunction(()=>document.getElementById('businessStatus').textContent.includes('Link failed'));await p.locator('#businessForm button').click();await p.waitForURL('**/seller-center.html?ref=TEST-REF');assert.equal(calls.filter(x=>x==='ranova-seller-apply').length,1)});
  await scenario('workspace failure stops new application',{signedIn:true,workspaceFail:true},async(p,calls)=>{await p.locator('[data-register]').last().click();await p.locator('#registration').waitFor({state:'visible'});await p.locator('#consent').check();await p.locator('#registerButton').click();await p.waitForFunction(()=>document.getElementById('formStatus').textContent==='Workspace unavailable');assert.equal(calls.includes('ranova-seller-apply'),false)});
  await scenario('expired email link returns to registration',{hash:'#error=access_denied'},async p=>{await p.locator('#registration').waitFor({state:'visible'});assert.match(await p.locator('#formStatus').innerText(),/expired/) });
  await scenario('SMS can be enabled by provider settings',{sms:true},async p=>{await register(p);await p.locator('[value=phone]').check();await p.locator('#sendCode').click();await p.locator('#code').fill('123456');await p.locator('#registerButton').click();await p.locator('#businessStep').waitFor({state:'visible'})});
  await scenario('expired session blocks application creation',{},async(p,calls)=>{await verified(p);await p.evaluate(()=>{window.testSession=null});await business(p);await p.waitForFunction(()=>document.getElementById('businessStatus').textContent.includes('session changed'));assert.equal(calls.includes('ranova-seller-apply'),false)});
  await scenario('valid email callback reuses authenticated account',{signedIn:true,hash:'#access_token=fake'},async p=>{await p.locator('#registration').waitFor({state:'visible'});assert.equal(await p.locator('#verificationFields').isHidden(),true);assert.match(await p.locator('#accountStatus').innerText(),/seller@example.com/)});
  if(process.env.SUPABASE_SDK_PATH)await scenario('pinned Supabase SDK initializes without a session',{realSDK:true},async p=>{await p.locator('[data-register]').last().click();await p.locator('#registration').waitFor({state:'visible'});assert.equal(await p.locator('#registerButton').isDisabled(),false);assert.equal(await p.locator('#verificationFields').isVisible(),true);assert.equal(await p.evaluate(()=>typeof window.supabase.createClient),'function')});
  await browser.close();console.log(`${passed} browser scenarios passed. No production writes or messages.`);
})().catch(e=>{console.error(e);process.exit(1)});
