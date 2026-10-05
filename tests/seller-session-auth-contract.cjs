const assert=require('node:assert');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'rpe-v2','seller-start.html'),'utf8');
const js=fs.readFileSync(path.join(root,'rpe-v2','seller-start.js'),'utf8');

assert.match(html,/id="verificationFields" hidden/, 'seller OTP controls must stay hidden');
assert.match(html,/No SMS code or email verification is required here/, 'seller onboarding must explain session-only flow');
assert.match(js,/Using your signed-in RANOVA customer account/, 'seller onboarding must use existing customer session');
assert.match(js,/location\.href = '\.\/index\.html'/, 'expired seller session must return to customer sign in');
assert.doesNotMatch(js,/if \(!session\) \{\s*if \(!destination\) throw Error\('Send a verification code first\.'/s, 'seller submission must not require OTP');
console.log('RANOVA seller session-only onboarding: PASS');
