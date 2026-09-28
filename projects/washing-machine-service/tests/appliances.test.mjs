import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {createApp} from '../server/app.mjs';import {appliances} from '../src/catalog.mjs';
test('appliance symptoms are distinct and new directions do not inherit washer prices',()=>{assert.equal(appliances.length,3);const ids=appliances.flatMap(a=>a.services.map(s=>s.id));assert.equal(new Set(ids).size,ids.length);for(const a of appliances.slice(1)){assert.equal(a.services.length,6);assert.ok(a.services.every(s=>s.min===null&&s.max===null&&s.checks.length>=3));}assert.ok(appliances[2].brands.includes("De'Longhi"));assert.ok(!appliances[0].brands.includes("De'Longhi"));});
test('booking persists appliance, validates matching brand and rejects wrong specialty slot',async()=>{
 const token=randomUUID(),app=await createApp({dbPath:':memory:',adminToken:token,bookingEnabled:true,rateLimit:100});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const root='http://127.0.0.1:'+app.server.address().port;
 const req=async(p,method='GET',body,auth=false)=>{const r=await fetch(root+p,{method,headers:{'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()}};
 try{const date=new Date(Date.now()+86400000).toISOString().slice(0,10);const slot=await req('/api/admin/slots','POST',{appliance:'coffee',master:'Кофемастер',district:'ЦАО',date,time:'09:00–12:00'},true);assert.equal(slot.status,201);
 assert.equal((await req('/api/slots?date='+date+'&district='+encodeURIComponent('ЦАО')+'&appliance=washer')).data.slots.length,0);
 assert.equal((await req('/api/slots?date='+date+'&district='+encodeURIComponent('ЦАО')+'&appliance=coffee')).data.slots.length,1);
 const body={appliance:'coffee',brand:"De'Longhi",name:'Тест клиента',phone:'79991234577',district:'ЦАО',problem:'Не подаёт кофе, тестовое обращение',preferredDate:date,slotId:slot.data.id,consent:true,requestId:randomUUID()};
 assert.equal((await req('/api/leads','POST',{...body,appliance:'washer',brand:'LG'})).status,409);
 assert.equal((await req('/api/leads','POST',{...body,brand:'LG'})).status,400);
 assert.equal((await req('/api/leads','POST',body)).status,201);
 const leads=await req('/api/admin/leads','GET',null,true);assert.equal(leads.data.leads[0].appliance,'coffee');assert.equal(leads.data.leads[0].brand,"De'Longhi");
 const dishwasher=await req('/api/leads','POST',{...body,appliance:'dishwasher',brand:'Bosch',slotId:'',phone:'79991234578',requestId:randomUUID()});assert.equal(dishwasher.status,201);
 }finally{await app.close();}
});
