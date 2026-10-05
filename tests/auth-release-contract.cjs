const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'rpe-v2', 'app.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'rpe-v2', 'index.html'), 'utf8');
const sw = fs.readFileSync(path.join(root, 'rpe-v2', 'rpe-v2-sw.js'), 'utf8');
const sellerApply = fs.readFileSync(path.join(root, 'rpe-v2', 'supabase', 'functions', 'ranova-seller-apply', 'index.ts'), 'utf8');

assert.match(app, /sb\.functions\.invoke\("ranova-account-signup"/, 'signup must use Supabase Functions client');
assert.match(app, /RANOVA account service took too long/, 'signup must have a bounded timeout');
assert.match(app, /showPanel\("marketplaceHomePanel"\)/, 'successful auth must open Home');
assert.match(app, /applySession\(data\.session,true\)\.catch/, 'heavy account hydration must continue in background');
assert.doesNotMatch(app, /sb\.auth\.signUp\(\{phone,password/, 'customer phone signup must not use disabled Supabase Phone provider');
assert.doesNotMatch(app, /sb\.auth\.signInWithPassword\(\{phone,password/, 'customer phone login must not use disabled Supabase Phone provider');
assert.match(app, /phoneLoginEmail\(phone\)/, 'phone/password accounts must use the RANOVA internal login identifier');
assert.match(app, /directExistingAccountToSignIn/, 'duplicate accounts must route users back to sign in');
assert.match(html, /app\.js\?v=20261004-v3a74/, 'HTML must reference the working pre-video auth release');
assert.match(sw, /ranova-rpe-v2-shell-v74/, 'service worker cache must match the working auth release');
assert.match(sellerApply, /authorization,apikey/, 'JWT-protected seller application endpoint must allow auth headers');

console.log('RANOVA auth/release contract: PASS');
