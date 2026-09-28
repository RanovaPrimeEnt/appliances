import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { stripTypeScriptTypes } from 'node:module';
import * as policy from '../rpe-v2/supabase/functions/_shared/commission.ts';
const source=stripTypeScriptTypes(fs.readFileSync(new URL('../rpe-v2/supabase/functions/ranova-admin-marketplace/index.ts',import.meta.url),'utf8').replace(/^import .*;\n/gm,''));
const rule={id:'global',active:true,effective_from:'2026-01-01',rule_version:1,currency:'GHS',commission_rate:0,payment_processing_rate:0,payment_fixed_fee:0,payment_fee_payer:'platform'};
async function call(role,body,token=true){
 let handler;
 const admin={auth:{getUser:async()=>({data:{user:{id:'test-admin'}},error:null})},from(table){
   const chain={select(){return this},eq(){return this},maybeSingle:async()=>({data:role?{role}:null}),then(resolve){resolve({data:[rule],error:null})}};
   for(const mutation of ['insert','update','upsert','delete'])chain[mutation]=()=>{throw Error('Preview must never write data')};
   return chain;
 }};
 vm.runInNewContext(source,{...policy,createClient:()=>admin,Deno:{env:{get:()=>''},serve:f=>handler=f},Request,Response,console});
 const response=await handler(new Request('https://example.test',{method:'POST',headers:{'Content-Type':'application/json','x-ranova-client':'ranova-site-v1',...(token?{Authorization:'Bearer test'}:{})},body:JSON.stringify({action:'preview_commission',seller_country_code:'GH',buyer_country_code:'GH',payment_method:'Mobile Money',currency:'GHS',subtotal:600,delivery_fee:0,...body})}));
 return {status:response.status,body:await response.json()};
}
test('anonymous callers cannot access owner earnings preview',async()=>assert.equal((await call(null,{},false)).status,403));
test('catalogue role cannot access finance preview',async()=>assert.equal((await call('catalogue',{})).status,403));
test('manager cannot preview an owner draft',async()=>assert.equal((await call('manager',{preview_draft:true})).status,403));
test('owner draft preview calculates without any write',async()=>{const r=await call('owner',{preview_draft:true,commission_rate:5,payment_processing_rate:2,payment_fixed_fee:0,payment_fee_payer:'platform'});assert.equal(r.status,200);assert.equal(r.body.breakdown.commission_amount,30);assert.equal(r.body.breakdown.platform_net_before_other_costs,18)});
test('active preview uses database rate, not caller supplied rate',async()=>{const r=await call('owner',{commission_rate:99});assert.equal(r.status,200);assert.equal(r.body.breakdown.commission_amount,0)});
test('unsupported currency fails with no write',async()=>assert.equal((await call('owner',{currency:'USD'})).body.ok,false));
