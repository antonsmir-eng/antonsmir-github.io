import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {createApp} from '../server/app.mjs';
test('lead lifecycle: protected admin, real slots, dedup, cancellation and public cases',async()=>{
const token=randomUUID()+randomUUID(),app=await createApp({dbPath:':memory:',adminToken:token,bookingEnabled:true,allowedOrigins:['https://example.test'],rateLimit:100});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+app.server.address().port;
const req=async(p,{auth=false,method='GET',body,originHeader}={})=>{const r=await fetch(origin+p,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+token}:{}),...(originHeader?{Origin:originHeader}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()}};
try{
assert.equal((await req('/api/admin/leads')).status,401);assert.equal((await req('/api/health',{originHeader:'https://evil.test'})).status,403);
const date=new Date(Date.now()+86400000).toISOString().slice(0,10);const slot=await req('/api/admin/slots',{auth:true,method:'POST',body:{master:'Мастер 1',district:'ЦАО',date,time:'09:00–12:00'}});assert.equal(slot.status,201);
const slot2=await req('/api/admin/slots',{auth:true,method:'POST',body:{master:'Мастер 1',district:'САО',date,time:'09:00–12:00'}});assert.equal(slot2.status,409);
const base={name:'Тестовый клиент',phone:'+7 999 123-45-67',district:'ЦАО',brand:'LG',model:'Test',problem:'Тест: не сливает воду',preferredDate:date,slotId:slot.data.id,consent:true,requestId:randomUUID(),source:{utm_source:'test'},attachment:null};
assert.equal((await req('/api/leads',{method:'POST',body:{...base,consent:false}})).status,400);
const lead=await req('/api/leads',{method:'POST',body:base});assert.equal(lead.status,201);assert.ok(lead.data.id);
const repeat=await req('/api/leads',{method:'POST',body:base});assert.equal(repeat.status,200);assert.equal(repeat.data.id,lead.data.id);
assert.equal((await req('/api/leads',{method:'POST',body:{...base,requestId:randomUUID()}})).status,409);
assert.equal((await req('/api/leads',{method:'POST',body:{...base,requestId:randomUUID(),phone:'79991234568'}})).status,409);
assert.equal((await req('/api/slots?date='+date+'&district='+encodeURIComponent('ЦАО'))).data.slots.length,0);
const all=await req('/api/admin/leads',{auth:true});assert.equal(all.data.leads.length,1);assert.equal(all.data.leads[0].source.utm_source,'test');assert.equal('attachment' in all.data.leads[0],false);
assert.equal((await req('/api/admin/leads/'+lead.data.id,{auth:true,method:'PATCH',body:{status:'paid',paidAmount:0}})).status,400);
assert.equal((await req('/api/admin/leads/'+lead.data.id,{auth:true,method:'PATCH',body:{status:'cancelled',paidAmount:0}})).status,200);
assert.equal((await req('/api/slots?date='+date+'&district='+encodeURIComponent('ЦАО'))).data.slots.length,1);
assert.equal((await req('/api/leads',{method:'POST',body:{...base,requestId:randomUUID(),phone:'79991234568'}})).status,201);
assert.equal((await req('/api/admin/leads/'+lead.data.id,{auth:true,method:'PATCH',body:{status:'confirmed',paidAmount:0}})).status,409);
assert.equal((await req('/api/admin/cases',{auth:true,method:'POST',body:{title:'Тестовая история',model:'LG Test',price:9000,date:'2026-09-01',body:'Симптом, установленная причина и выполненная работа для тестирования.',publishConsent:true}})).status,201);
assert.equal((await req('/api/cases')).data.cases.length,1);
}finally{await app.close();}
});
test('closed intake rejects personal data and invalid staff configuration',async()=>{await assert.rejects(createApp({adminToken:'short'}));const app=await createApp({adminToken:randomUUID(),dbPath:':memory:'});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));try{const r=await fetch('http://127.0.0.1:'+app.server.address().port+'/api/leads',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(r.status,503);}finally{await app.close();}});
