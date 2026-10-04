(()=>{'use strict';
const authReturn=location.hash.includes('access_token=')||location.hash.includes('error=')||new URLSearchParams(location.search).has('code');
const $=id=>document.getElementById(id),cfg=window.RPE_CONFIG||{},sb=window.supabase&&cfg.supabaseUrl&&cfg.supabasePublishableKey?window.supabase.createClient(cfg.supabaseUrl,cfg.supabasePublishableKey):null;
const paths={user:'M20 21a8 8 0 0 0-16 0 M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0',shield:'m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3 M8 12l3 3 5-6',store:'M4 10v11h16V10 M3 3h18l-2 7H5L3 3 M9 21v-7h6v7',home:'m3 10 9-7 9 7 M5 9v12h14V9 M9 21v-7h6v7',message:'M21 4H3v14h5l-5 4V4 M7 8h10 M7 12h7',cart:'M2 3h3l3 13h11l2-9H6 M10 20h.01 M18 20h.01',back:'m15 5-7 7 7 7',switch:'M4 7h16l-4-4 M20 17H4l4 4',gift:'M3 8h18v4H3z M5 12v9h14v-9 M12 8v13 M12 8C3 8 5 0 9 4l3 4 M12 8c9 0 7-8 3-4l-3 4',box:'m12 3 9 5-9 5-9-5 9-5 M3 8v10l9 4 9-4V8 M12 13v9 M7 6l10 5',pin:'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0 M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',chart:'M4 3v18h17 M8 16v-5 M13 16V8 M18 16V5',spark:'m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3',factory:'M3 21V10l6 3V7l6 4V3h5v18H3 M7 17h1 M12 17h1 M17 17h1'};
const svg=k=>'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="'+paths[k]+'"/></svg>';
document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=svg(el.dataset.icon));
const benefits=[['gift','Growth support','Help your store grow','Planned','The reference advertises signup business credits. RANOVA has not launched a credit or cash-reward programme.'],['box','Quick publishing','List your products','After approval','Approved sellers can add products and submit a catalogue through the Seller Dashboard. Listings require RANOVA review.'],['pin','Map visibility','Help buyers find you','Planned','Map-based store discovery is planned. Business location is collected during registration.'],['message','Buyer inquiries','Keep conversations together','After approval','Buyers can contact your store through RANOVA’s existing messaging service once your approved store is published.'],['chart','Industry insights','Understand your market','Planned','Industry trend reports are not yet available in RANOVA.'],['shield','Business verification','Build buyer confidence','RANOVA review','RANOVA reviews your submitted business documents before approving your store. This is not Sesame Credit certification.'],['spark','AI assistant','Support daily tasks','Planned','An AI business assistant is not yet available. Registration does not include an AI service subscription.'],['factory','Source credentials','Show business evidence','Document review','Submit genuine supplier and business documents during verification. RANOVA does not award manufacturer status without supporting evidence.']];
$('benefitGrid').innerHTML=benefits.map((b,i)=>'<button type="button" class="benefit" data-benefit="'+i+'"><span class="benefit-icon">'+svg(b[0])+'</span><b>'+b[1]+'</b><small>'+b[2]+'</small><span class="badge">'+b[3]+'</span></button>').join('');
$('benefitGrid').onclick=e=>{const b=e.target.closest('[data-benefit]');if(!b)return;const x=benefits[Number(b.dataset.benefit)];$('benefitContent').innerHTML='<span class="benefit-icon">'+svg(x[0])+'</span><h2>'+x[1]+'</h2><p>'+x[4]+'</p>';$('benefitDialog').showModal()};$('closeBenefit').onclick=$('dismissBenefit').onclick=()=>$('benefitDialog').close();
function route(){const register=location.hash==='#register';$('welcome').hidden=register;$('registration').hidden=!register;window.scrollTo(0,0)}document.querySelectorAll('[data-register]').forEach(b=>b.onclick=()=>{location.hash='register'});$('back').onclick=()=>{location.hash=''};window.addEventListener('hashchange',route);route();
let destination = null, session = null, busy = false, pending = null;
const validPhone = value => /^\+[1-9]\d{7,14}$/.test(value);
function readSaved(key) { try { return JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { return null; } }
function save(key, value) { try { sessionStorage.setItem(key, JSON.stringify(value)); } catch {} }
function phone() {
  const n = $('phone').value.replace(/[\s()-]/g, '');
  return n.startsWith('+') || $('dial').value === 'other' ? n : $('dial').value + n.replace(/^0+/, '');
}
function details() { return {member: $('member').value.trim(), company: $('company').value.trim(), phone: phone(), email: $('email').value.trim().toLowerCase()}; }
function method() { return document.querySelector('[name=method]:checked').value; }
function err(e) { return e?.name === 'AbortError' ? 'The connection timed out. Please check your connection and try again.' : e?.message || 'Please try again.'; }
function setBusy(value) {
  busy = value;
  document.querySelectorAll('#registerForm input, #registerForm select, #registerForm button, #businessForm input, #businessForm select, #businessForm button').forEach(el => el.disabled = value);
  document.querySelector('[name=method][value=phone]').disabled = value || !smsEnabled;
}
let smsEnabled = false;
function setSignedIn(user) {
  session = user ? session : null;
  $('verificationFields').hidden = !!user;
  $('email').required = !user && method() === 'email';
  $('code').required = !user;
  $('registerButton').innerHTML = user ? 'Continue with this account <span>→</span>' : 'Register and continue <span>→</span>';
  $('accountStatus').textContent = '';
}
function fill(user) {
  const m = user.user_metadata || {};
  $('member').value = m.full_name || $('member').value;
  $('company').value = m.business_name || $('company').value;
  $('email').value = user.email || '';
  const number = m.contact_phone || user.phone;
  if (number) { $('dial').value = 'other'; $('phone').value = number.startsWith('+') ? number : '+' + number; }
}
async function api(name, body, currentSession) {
  const headers = {'Content-Type': 'application/json', 'x-ranova-client': 'ranova-site-v1', apikey: cfg.supabasePublishableKey};
  if (currentSession) headers.Authorization = 'Bearer ' + currentSession.access_token;
  const response = await fetch(cfg.supabaseUrl + '/functions/v1/' + name, {method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(20000)});
  const out = await response.json().catch(() => ({}));
  if (!response.ok || !out.ok) throw Error(out.error || 'Could not complete this step. Please try again.');
  return out;
}
function continueSeller(ref,documents=false) { const params=new URLSearchParams(); if(ref)params.set('ref',ref); if(documents)params.set('onboarding','documents'); location.href='../all/seller-center.html'+(params.toString()?'?'+params.toString():''); }
async function existingSeller(currentSession,documents=false) {
  const out = await api('ranova-seller-workspace', {action: 'workspace'}, currentSession);
  if (out.linked) { continueSeller(out.application?.application_ref,documents); return true; }
  return false;
}
function validDetails() {
  const d = details();
  if (!d.member || !d.company || !validPhone(d.phone) || (!session && method() === 'email' && !$('email').checkValidity())) throw Error('Enter your name, company, a valid phone number and email address.');
  if (!$('location').value.trim() || !$('type').value || !$('categories').value.trim()) throw Error('Complete your business location, business type and products you sell.');
  if (!$('consent').checked) throw Error('Please read and accept the terms and privacy policy first.');
  return d;
}
async function createAndLinkSellerApplication(currentSession,d){
  if(await existingSeller(currentSession,true))return true;
  const body={
    business_name:d.company,
    contact_person:d.member,
    phone:d.phone,
    email:currentSession.user.email||'',
    business_location:$('location').value.trim(),
    supplier_type:$('type').value,
    categories:$('categories').value.trim()
  };
  const saved=pending||readSaved('ranova_new_seller_application');
  pending=saved?.user===currentSession.user.id&&saved.phone===d.phone&&typeof saved.ref==='string'?saved:null;
  if(!pending){
    const out=await api('ranova-seller-apply',body,currentSession);
    if(!out.application_ref)throw Error('The application service did not return a reference. Please contact RANOVA support before submitting again.');
    pending={user:currentSession.user.id,phone:d.phone,ref:out.application_ref};
    save('ranova_new_seller_application',pending);
  }
  try{
    sessionStorage.setItem('ranovaSellerApplicationRef',pending.ref);
    sessionStorage.setItem('ranovaSellerApplicationPhone',d.phone);
    sessionStorage.setItem('ranovaSellerApplicationEmail',currentSession.user.email||'');
  }catch{}
  await api('ranova-seller-link',{application_ref:pending.ref,phone:d.phone},currentSession);
  continueSeller(pending.ref,true);
  return true;
}
document.querySelectorAll('[name=method]').forEach(el => el.onchange = () => {
  const email = method() === 'email';
  $('emailField').hidden = !email;
  $('email').required = email && !session;
  destination = null;
  $('code').value = '';
  $('codeHelp').textContent = email ? 'Your email may contain a code or a sign-in link. Use either to continue.' : 'Enter the verification code sent to your phone.';
});
$('sendCode').onclick = async () => {
  if (busy) return;
  try {
    const d = validDetails(), m = method();
    if (!sb) throw Error('Registration is temporarily unavailable. Please reload the page.');
    if (m === 'phone' && !smsEnabled) throw Error('Phone verification is unavailable. Please use email.');
    setBusy(true);
    destination = null;
    const metadata = {full_name: d.member, business_name: d.company, contact_phone: d.phone};
    const request = m === 'email' ? {email: d.email, options: {emailRedirectTo: new URL('./seller-start.html#register', location.href).href, data: metadata}} : {phone: d.phone, options: {data: metadata}};
    const {error} = await sb.auth.signInWithOtp(request);
    if (error) throw error;
    destination = {method: m, value: m === 'email' ? d.email : d.phone};
    $('formStatus').textContent = m === 'email' ? 'Check your email for a verification code or sign-in link.' : 'A verification code has been sent to your phone.';
  } catch (e) { $('formStatus').textContent = err(e); } finally { setBusy(false); }
};
$('registerForm').onsubmit = async e => {
  e.preventDefault();
  if (busy) return;
  try {
    const d = validDetails();
    if (!sb) throw Error('Registration is temporarily unavailable. Please reload the page.');
    if (!session) {
      if (!destination) throw Error('Send a verification code first.');
      if (destination.method !== method() || destination.value !== (method() === 'email' ? d.email : d.phone)) throw Error('Your contact details changed. Request a new code.');
      setBusy(true);
      const req = destination.method === 'email' ? {email: destination.value, token: $('code').value.trim(), type: 'email'} : {phone: destination.value, token: $('code').value.trim(), type: 'sms'};
      const result = await sb.auth.verifyOtp(req);
      if (result.error) throw result.error;
      session = result.data.session;
      if (!session) throw Error('Verification did not create a session. Request a new code.');
      setSignedIn(session.user);
    }
    setBusy(true);
    const updated = await sb.auth.updateUser({data: {full_name: d.member, business_name: d.company, contact_phone: d.phone}});
    if (updated.error) throw updated.error;
    const currentSession=(await sb.auth.getSession()).data.session;
    if(!currentSession)throw Error('Please sign in again before continuing.');
    await createAndLinkSellerApplication(currentSession,d);
  } catch (e) { $('formStatus').textContent = err(e); } finally { setBusy(false); }
};
async function initialize() {
  setBusy(true);
  try {
    if (!sb) throw Error('Registration is temporarily unavailable. Please reload the page.');
    const {data, error} = await sb.auth.getSession();
    if (error) throw error;
    session = data.session;
    if (session) { fill(session.user); setSignedIn(session.user); }
    if (authReturn) {
      location.hash = 'register';
      route();
      if (!session) $('formStatus').textContent = 'This sign-in link has expired or could not be verified. Request a new email below.';
    }
  } catch (e) { $('formStatus').textContent = err(e); } finally { setBusy(false); }
  if (sb) {
    try {
      const response = await fetch(cfg.supabaseUrl + '/auth/v1/settings', {headers: {apikey: cfg.supabasePublishableKey}, signal: AbortSignal.timeout(10000)});
      if (response.ok) smsEnabled = (await response.json()).external?.phone === true;
    } catch {}
    document.querySelector('[name=method][value=phone]').disabled = busy || !smsEnabled;
    $('smsStatus').textContent = smsEnabled ? '' : 'SMS verification is currently unavailable. Use email verification.';
  }
}
initialize();
})();
