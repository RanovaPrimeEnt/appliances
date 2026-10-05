const assert=require('node:assert');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'rpe-v2','index.html'),'utf8');
const app=fs.readFileSync(path.join(root,'rpe-v2','app.js'),'utf8');
const sw=fs.readFileSync(path.join(root,'rpe-v2','rpe-v2-sw.js'),'utf8');

assert.match(html,/id="forgotPassword"/,'login must expose Forgot password');
assert.match(html,/id="changePassword"/,'signed-in profile must expose Change password');
assert.match(html,/id="passwordRecoveryOverlay"/,'password reset UI must exist');
assert.match(app,/resetPasswordForEmail\(email,\{redirectTo\}\)/,'email accounts must use Supabase recovery email');
assert.match(app,/event==="PASSWORD_RECOVERY"/,'recovery callback must enter password reset mode');
assert.match(app,/updateUser\(payload\)/,'password update must use the authenticated/recovery session');
assert.match(app,/currentPassword:current/,'signed-in password change must require current password');
assert.match(app,/Phone accounts do not use insecure SMS-free password resets/,'phone recovery must not bypass identity proof');
assert.match(html,/app\.js\?v=20261005-v3a75/,'HTML must publish the recovery release');
assert.match(sw,/ranova-rpe-v2-shell-v75/,'service worker cache must publish recovery release');
console.log('RANOVA password recovery contract: PASS');
