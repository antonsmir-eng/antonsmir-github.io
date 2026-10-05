import {z,ZodError} from 'zod';
import {CompanySchema,MINIMUM_KOPECKS,PasswordSchema,RequestSchema,statuses,transitions,type CabinetOrder,type CabinetUser,type Company,type OrderStatus} from './cabinet-model';
import {digest,hashPassword,token,verifyPassword} from './cabinet-crypto';

export type CabinetEnv={DB?:D1Database;BUCKET?:R2Bucket;ADMIN_BOOTSTRAP_HASH?:string;CABINET_ORIGIN?:string;YOOKASSA_SHOP_ID?:string;YOOKASSA_SECRET_KEY?:string;PAYMENT_MODE?:string};
type UserRow=Omit<CabinetUser,'mustChangePassword'>&{passwordHash:string;mustChangePassword:number};
type PaymentAttempt={id:string;amount:number;idempotency_key:string;confirmation_url:string;provider_id:string;created_at:number;status:string};
type RawOrder=Omit<CabinetOrder,'details'>&{details:string};
class Problem extends Error{constructor(public status:number,message:string){super(message);}}
function fail(status:number,message:string):never{throw new Problem(status,message);}
const json=(data:unknown,status=200,extra:HeadersInit={})=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...extra}});
const userColumns='id,email,role,name,phone,company,inn,address,must_change_password AS mustChangePassword,password_hash AS passwordHash';
const orderColumns='o.id,o.number,o.user_id AS userId,o.title,o.details_json AS details,o.status,o.budget,o.quote,o.quote_note AS quoteNote,o.payment_status AS paymentStatus,o.version,o.created_at AS createdAt,o.updated_at AS updatedAt,u.name AS customerName,u.email AS customerEmail';
const publicUser=(u:UserRow):CabinetUser=>({id:u.id,email:u.email,role:u.role,name:u.name,phone:u.phone,company:u.company,inn:u.inn,address:u.address,mustChangePassword:!!u.mustChangePassword});
const readOrder=(o:RawOrder):CabinetOrder=>({...o,details:JSON.parse(o.details)});
const cookieName='streetart_session';
const sessionAge=7*24*60*60;
const cookie=(request:Request,value:string,maxAge=sessionAge)=>`${cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${new URL(request.url).protocol==='https:'?'; Secure':''}`;
const parseCookie=(r:Request)=>(r.headers.get('cookie')||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(cookieName+'='))?.slice(cookieName.length+1)||'';
function database(env:CabinetEnv){return env.DB||fail(503,'Кабинет временно недоступен. Попробуйте позже.');}
function sameOrigin(request:Request,env:CabinetEnv){
 const supplied=request.headers.get('origin'),expected=env.CABINET_ORIGIN||new URL(request.url).origin;
 if(!supplied||supplied!==expected||request.headers.get('sec-fetch-site')==='cross-site')fail(403,'Обновите страницу и повторите действие.');
}
async function payload(request:Request){if(Number(request.headers.get('content-length')||0)>20000)fail(413,'Слишком большой запрос.');const raw=await request.text();if(raw.length>20000)fail(413,'Слишком большой запрос.');try{return JSON.parse(raw);}catch{return fail(400,'Не удалось прочитать данные.');}}
async function rate(db:D1Database,request:Request,scope:string,identity:string,max:number,window:number){
 const now=Date.now(),key=await digest(scope+'|'+(request.headers.get('cf-connecting-ip')||'preview')+'|'+identity+'|'+Math.floor(now/window));
 const row=await db.prepare('INSERT INTO cabinet_auth_limits (key,attempts,expires_at) VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=attempts+1 RETURNING attempts').bind(key,now+window).first<{attempts:number}>();
 if((row?.attempts||0)>max)fail(429,'Слишком много попыток. Попробуйте позже.');
}
async function currentUser(request:Request,db:D1Database){const value=parseCookie(request);if(!/^[a-f0-9]{64}$/.test(value))return null;return db.prepare(`SELECT ${userColumns.split(',').map(c=>'u.'+c).join(',')} FROM cabinet_users u JOIN cabinet_sessions s ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?`).bind(await digest(value),Date.now()).first<UserRow>();}
async function requireUser(request:Request,db:D1Database,allowInitial=false){const u=await currentUser(request,db);if(!u)fail(401,'Войдите в личный кабинет.');if(u.mustChangePassword&&!allowInitial)fail(428,'Задайте новый пароль администратора.');return u;}
const requireAdmin=(u:UserRow)=>{if(u.role!=='admin')fail(403,'Это действие доступно администратору.');};
async function newSession(db:D1Database,userId:string){const value=token(),now=Date.now();await db.prepare('INSERT INTO cabinet_sessions (token_hash,user_id,expires_at,created_at) VALUES (?,?,?,?)').bind(await digest(value),userId,now+sessionAge*1000,now).run();return value;}
async function ensureAdmin(db:D1Database,env:CabinetEnv){if(!env.ADMIN_BOOTSTRAP_HASH)return;const exists=await db.prepare("SELECT id FROM cabinet_users WHERE role='admin' LIMIT 1").first();if(exists)return;await db.prepare("INSERT OR IGNORE INTO cabinet_users (id,email,login,password_hash,role,name,must_change_password,created_at) VALUES (?,?,?,?,?,?,1,?)").bind(crypto.randomUUID(),'admin@streetart.local','admin',env.ADMIN_BOOTSTRAP_HASH,'admin','Администратор StreetArt',Date.now()).run();}
async function ownedOrder(db:D1Database,u:UserRow,id:string){const row=await db.prepare(`SELECT ${orderColumns} FROM cabinet_orders o JOIN cabinet_users u ON u.id=o.user_id WHERE o.id=?${u.role==='admin'?'':' AND o.user_id=?'}`).bind(...(u.role==='admin'?[id]:[id,u.id])).first<RawOrder>();return row?readOrder(row):fail(404,'Заказ не найден.');}
async function company(db:D1Database){const row=await db.prepare("SELECT value FROM cabinet_settings WHERE key='company'").first<{value:string}>();if(!row)return null;const result=CompanySchema.safeParse(JSON.parse(row.value));return result.success?result.data:null;}
function paymentMode(env:CabinetEnv):'disabled'|'test'|'live'{return env.YOOKASSA_SHOP_ID&&env.YOOKASSA_SECRET_KEY&&(env.PAYMENT_MODE==='test'||env.PAYMENT_MODE==='live')?env.PAYMENT_MODE:'disabled';}
async function config(db:D1Database,env:CabinetEnv){return {paymentMode:paymentMode(env),bankReady:!!await company(db),minimumOrder:MINIMUM_KOPECKS};}
type ChangeValues={status?:string;details_json?:string;title?:string;budget?:number;quote?:number;quote_note?:string;payment_status?:string};
const noActivePayment="NOT EXISTS (SELECT 1 FROM cabinet_payments p WHERE p.order_id=cabinet_orders.id AND p.provider='yookassa' AND p.status IN ('creating','pending','waiting_for_capture'))";
async function changeOrder(db:D1Database,u:UserRow,o:CabinetOrder,expected:number,values:ChangeValues,title:string,note='',extra?:(nonce:string)=>D1PreparedStatement[],guard=''){
 if(o.version!==expected)fail(409,'Заказ уже изменён. Обновите его перед продолжением.');
 const entries=Object.entries(values),nonce=crypto.randomUUID(),now=Date.now();
 const result=await db.batch([
  db.prepare(`UPDATE cabinet_orders SET ${entries.map(([k])=>k+'=?').join(',')},updated_at=?,version=version+1,change_id=? WHERE id=? AND version=?${guard?' AND ('+guard+')':''}`).bind(...entries.map(([,v])=>v),now,nonce,o.id,expected),
  db.prepare('INSERT INTO cabinet_order_events (id,order_id,actor_id,title,note,created_at) SELECT ?,id,?,?,?,? FROM cabinet_orders WHERE id=? AND change_id=?').bind(crypto.randomUUID(),u.id,title,note,now,o.id,nonce),
  ...(extra?extra(nonce):[])
 ]);
 if(!result[0].meta.changes)fail(409,'Заказ уже изменён. Обновите его перед продолжением.');
 return ownedOrder(db,u,o.id);
}
async function details(db:D1Database,u:UserRow,id:string){const order=await ownedOrder(db,u,id);const [events,files,payments]=await Promise.all([
 db.prepare('SELECT e.id,e.title,e.note,e.created_at AS createdAt,u.name AS actorName FROM cabinet_order_events e JOIN cabinet_users u ON u.id=e.actor_id WHERE e.order_id=? ORDER BY e.created_at DESC,e.id DESC').bind(id).all(),
 db.prepare('SELECT id,name,size,created_at AS createdAt FROM cabinet_files WHERE order_id=? ORDER BY created_at DESC').bind(id).all(),
 db.prepare('SELECT id,amount,provider,status,reference,created_at AS createdAt FROM cabinet_payments WHERE order_id=? ORDER BY created_at DESC').bind(id).all()
 ]);return {order,events:events.results,files:files.results,payments:payments.results};}
const escape=(s:unknown)=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
function invoiceHtml(o:CabinetOrder,supplier:Company,buyer:UserRow){const amount=(o.quote!/100).toFixed(2),vat=(Math.round(o.quote!*22/122)/100).toFixed(2);return `<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Счёт ${escape(o.number)}</title><style>body{font:16px/1.6 Arial,sans-serif;max-width:900px;margin:48px auto;padding:24px;color:#212323}h1{font-size:32px}table{border-collapse:collapse;width:100%;margin:24px 0}td,th{border:1px solid #ccc;padding:12px;text-align:left}.sum{text-align:right;font-size:22px}button{padding:12px 24px;border:0;background:#ed7541;color:#212323;font:inherit;cursor:pointer}@media print{button{display:none}body{margin:0;max-width:none}}</style><h1>Счёт на оплату № ${escape(o.number)}</h1><p>Дата: ${new Date().toLocaleDateString('ru-RU',{timeZone:'Europe/Moscow'})}</p><p><b>Получатель:</b> ${escape(supplier.name)}<br>ИНН ${escape(supplier.inn)} ${supplier.kpp?' · КПП '+escape(supplier.kpp):''}<br>${escape(supplier.address)}</p><p><b>Банк:</b> ${escape(supplier.bank)}<br>БИК ${escape(supplier.bik)}<br>р/с ${escape(supplier.account)}<br>к/с ${escape(supplier.correspondent)}</p><p><b>Плательщик:</b> ${escape(buyer.company||buyer.name)}${buyer.inn?' · ИНН '+escape(buyer.inn):''}<br>${escape(buyer.address)}</p><table><tr><th>Основание</th><th>Сумма с НДС, ₽</th></tr><tr><td>${escape(o.title)}<br>${escape(o.quoteNote)}</td><td>${amount}</td></tr></table><p class="sum"><b>К оплате: ${amount} ₽</b><br>В том числе НДС 22%: ${vat} ₽</p><p>Назначение платежа: оплата заказа ${escape(o.number)}. В том числе НДС 22%.</p><p>После перечисления средств прикрепите платёжный документ к заказу. Поступление подтвердит администратор.</p><button onclick="window.print()">Печать / сохранить PDF</button></html>`;}
type ProviderPayment={id:string;status:string;paid:boolean;test?:boolean;amount:{value:string;currency:string};metadata?:{order_id?:string};confirmation?:{confirmation_url?:string}};
async function providerRequest(env:CabinetEnv,path:string,options:RequestInit={},key?:string){if(paymentMode(env)==='disabled')fail(503,'Оплата картой ещё не подключена. Выберите счёт или обратитесь к администратору.');const response=await fetch('https://api.yookassa.ru/v3/'+path,{...options,headers:{'Authorization':'Basic '+btoa(env.YOOKASSA_SHOP_ID+':'+env.YOOKASSA_SECRET_KEY),'Content-Type':'application/json',...(key?{'Idempotence-Key':key}:{}),...options.headers},signal:AbortSignal.timeout(15000)});if(!response.ok)fail(502,'Платёжный сервис не подтвердил операцию. Повторите проверку позже.');return response.json() as Promise<ProviderPayment>;}
async function synchronizePayment(db:D1Database,env:CabinetEnv,p:{id:string;order_id:string;amount:number;provider_id:string;status:string},actor:UserRow){
 const actual=await providerRequest(env,'payments/'+encodeURIComponent(p.provider_id));
 if(actual.id!==p.provider_id||actual.amount.currency!=='RUB'||Math.round(Number(actual.amount.value)*100)!==p.amount||actual.metadata?.order_id!==p.order_id||!!actual.test!==(paymentMode(env)==='test'))fail(502,'Данные платежа требуют проверки администратором.');
 if(!['pending','waiting_for_capture','succeeded','canceled'].includes(actual.status))fail(502,'Неизвестный ответ платёжного сервиса.');
 const o=await ownedOrder(db,actor,p.order_id);
 if(actual.status==='succeeded'&&actual.paid){
  if(o.quote!==p.amount)fail(409,'Сумма заказа изменилась. Нужна проверка оплаты.');
  if(o.paymentStatus!=='paid'&&!(paymentMode(env)==='test'&&o.paymentStatus==='test_paid')){
   if(o.status!=='awaiting_payment')fail(409,'Заказ не ожидает оплату. Обратитесь к администратору.');
   await changeOrder(db,actor,o,o.version,{status:paymentMode(env)==='test'?'awaiting_payment':'paid',payment_status:paymentMode(env)==='test'?'test_paid':'paid'},paymentMode(env)==='test'?'Тестовый платёж подтверждён':'Платёж подтверждён ЮKassa',paymentMode(env)==='test'?'Тестовый магазин: деньги не списывались.':'');
  }
 }
 await db.prepare('UPDATE cabinet_payments SET status=?,updated_at=? WHERE id=?').bind(actual.status==='succeeded'&&actual.test?'test_succeeded':actual.status,Date.now(),p.id).run();return {status:actual.status,test:!!actual.test};
}

export async function handleCabinetRequest(request:Request,env:CabinetEnv):Promise<Response>{try{
 const db=database(env),url=new URL(request.url),path=url.pathname.replace(/^\/api\/cabinet\/?/,'').split('/').filter(Boolean),method=request.method;
 if(!['GET','HEAD'].includes(method)&&path.join('/')!=='payments/webhook')sameOrigin(request,env);
 if(path.join('/')==='auth/register'&&method==='POST'){
  await rate(db,request,'register','',5,3600000);
  const data=z.object({email:z.string().trim().email('Укажите корректную почту').max(254).transform(s=>s.toLowerCase()),name:z.string().trim().min(2,'Укажите имя').max(100),password:PasswordSchema}).parse(await payload(request));
  if(data.email==='admin@streetart.local')fail(400,'Используйте вашу электронную почту.');
  if(await db.prepare('SELECT id FROM cabinet_users WHERE email=? OR login=?').bind(data.email,data.email).first())fail(409,'Эта почта уже зарегистрирована. Войдите в кабинет.');
  const id=crypto.randomUUID(),now=Date.now();
  try{await db.prepare("INSERT INTO cabinet_users (id,email,login,password_hash,role,name,created_at) VALUES (?,?,?,?,'customer',?,?)").bind(id,data.email,data.email,await hashPassword(data.password),data.name,now).run();}catch{fail(409,'Эта почта уже зарегистрирована.');}
  const user=(await db.prepare(`SELECT ${userColumns} FROM cabinet_users WHERE id=?`).bind(id).first<UserRow>())!;
  return json({user:publicUser(user),config:await config(db,env)},201,{'Set-Cookie':cookie(request,await newSession(db,id))});
 }
 if(path.join('/')==='auth/login'&&method==='POST'){
  const data=z.object({login:z.string().trim().min(1,'Укажите почту или логин').max(254).transform(s=>s.toLowerCase()),password:z.string().min(1,'Укажите пароль').max(128)}).parse(await payload(request));
  await rate(db,request,'login',data.login,10,900000);await ensureAdmin(db,env);
  const user=await db.prepare(`SELECT ${userColumns} FROM cabinet_users WHERE login=?`).bind(data.login).first<UserRow>();
  const valid=await verifyPassword(data.password,user?.passwordHash||env.ADMIN_BOOTSTRAP_HASH||'');if(!user||!valid)fail(401,'Неверная почта или пароль.');
  return json({user:publicUser(user),config:await config(db,env)},200,{'Set-Cookie':cookie(request,await newSession(db,user.id))});
 }
 if(path.join('/')==='me'&&method==='GET'){const user=await currentUser(request,db);return json({user:user?publicUser(user):null,config:await config(db,env)});}
 if(path.join('/')==='auth/logout'&&method==='POST'){const value=parseCookie(request);if(value)await db.prepare('DELETE FROM cabinet_sessions WHERE token_hash=?').bind(await digest(value)).run();return json({ok:true},200,{'Set-Cookie':cookie(request,'',0)});}
 if(path.join('/')==='payments/webhook'&&method==='POST'){
  await rate(db,request,'webhook','',120,60000);
  const data=z.object({object:z.object({id:z.string().max(80)})}).parse(await payload(request));
  const payment=await db.prepare("SELECT id,order_id,amount,provider_id,status FROM cabinet_payments WHERE provider='yookassa' AND provider_id=?").bind(data.object.id).first<{id:string;order_id:string;amount:number;provider_id:string;status:string}>();
  if(!payment) return json({ok:true});
  const actor=await db.prepare(`SELECT ${userColumns} FROM cabinet_users WHERE id=(SELECT user_id FROM cabinet_orders WHERE id=?)`).bind(payment.order_id).first<UserRow>();
  if(actor)await synchronizePayment(db,env,payment,actor);return json({ok:true});
 }
 const user=await requireUser(request,db,path.join('/')==='password'||path.join('/')==='profile');
 if(path.join('/')==='password'&&method==='POST'){
  const data=z.object({currentPassword:z.string().max(128),password:PasswordSchema}).parse(await payload(request));
  await rate(db,request,'password',user.id,6,900000);if(!await verifyPassword(data.currentPassword,user.passwordHash))fail(400,'Текущий пароль неверен.');
  if(data.password===data.currentPassword)fail(400,'Выберите другой пароль.');
  await db.batch([db.prepare('UPDATE cabinet_users SET password_hash=?,must_change_password=0 WHERE id=?').bind(await hashPassword(data.password),user.id),db.prepare('DELETE FROM cabinet_sessions WHERE user_id=?').bind(user.id)]);
  const updated=(await db.prepare(`SELECT ${userColumns} FROM cabinet_users WHERE id=?`).bind(user.id).first<UserRow>())!;
  return json({user:publicUser(updated)},200,{'Set-Cookie':cookie(request,await newSession(db,user.id))});
 }
 if(path.join('/')==='profile'&&method==='PATCH'){
  const data=z.object({name:z.string().trim().min(2).max(100),phone:z.string().trim().max(30),company:z.string().trim().max(200),inn:z.string().regex(/^(\d{10}|\d{12})?$/,'ИНН — 10 или 12 цифр'),address:z.string().trim().max(400)}).parse(await payload(request));
  await db.prepare('UPDATE cabinet_users SET name=?,phone=?,company=?,inn=?,address=? WHERE id=?').bind(data.name,data.phone,data.company,data.inn,data.address,user.id).run();return json({user:publicUser({...user,...data})});
 }
 if(path.join('/')==='settings'){
  requireAdmin(user);if(method==='GET')return json({company:await company(db),config:await config(db,env)});
  if(method==='PUT'){const data=CompanySchema.parse(await payload(request));await db.prepare("INSERT INTO cabinet_settings (key,value) VALUES ('company',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").bind(JSON.stringify(data)).run();return json({company:data,config:await config(db,env)});}
 }
 if(path.join('/')==='orders'&&method==='GET'){
  const search=(url.searchParams.get('search')||'').trim().slice(0,100),status=url.searchParams.get('status')||'',page=Math.max(0,Math.min(10000,parseInt(url.searchParams.get('page')||'0')||0));
  const conditions:string[]=[],bindings:unknown[]=[];if(user.role!=='admin'){conditions.push('o.user_id=?');bindings.push(user.id);}if(status&&status in statuses){conditions.push('o.status=?');bindings.push(status);}if(search){conditions.push('(o.title LIKE ? ESCAPE \'\\\' OR o.number LIKE ? ESCAPE \'\\\')');const pattern='%'+search.replace(/[\\%_]/g,'\\$&')+'%';bindings.push(pattern,pattern);}
  const where=conditions.length?' WHERE '+conditions.join(' AND '):'';
  const [rows,count]=await Promise.all([db.prepare(`SELECT ${orderColumns} FROM cabinet_orders o JOIN cabinet_users u ON u.id=o.user_id${where} ORDER BY o.created_at DESC,o.id DESC LIMIT 25 OFFSET ?`).bind(...bindings,page*25).all<RawOrder>(),db.prepare('SELECT COUNT(*) AS total FROM cabinet_orders o'+where).bind(...bindings).first<{total:number}>()]);
  return json({orders:rows.results.map(readOrder),total:count?.total||0,page});
 }
 if(path.join('/')==='orders'&&method==='POST'){
  const input=z.object({requestId:z.string().uuid(),details:RequestSchema}).parse(await payload(request));const existing=await db.prepare('SELECT id FROM cabinet_orders WHERE user_id=? AND request_id=?').bind(user.id,input.requestId).first<{id:string}>();if(existing)return json(await details(db,user,existing.id));
  await rate(db,request,'orders',user.id,30,3600000);const id=crypto.randomUUID(),now=Date.now(),number='SA-'+new Date().getUTCFullYear()+'-'+id.slice(0,8).toUpperCase();
  await db.batch([db.prepare("INSERT INTO cabinet_orders (id,request_id,user_id,number,title,details_json,budget,change_id,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)").bind(id,input.requestId,user.id,number,input.details.title,JSON.stringify(input.details),Math.round(input.details.budget*100),id,now,now),db.prepare('INSERT INTO cabinet_order_events (id,order_id,actor_id,title,note,created_at) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),id,user.id,'Черновик создан','',now)]);
  return json(await details(db,user,id),201);
 }
 if(path[0]==='files'&&path[1]&&method==='GET'){
  const file=await db.prepare('SELECT id,order_id,name,content_type,object_key FROM cabinet_files WHERE id=?').bind(path[1]).first<{id:string;order_id:string;name:string;content_type:string;object_key:string}>();if(!file)fail(404,'Файл не найден.');await ownedOrder(db,user,file.order_id);if(!env.BUCKET)fail(503,'Хранилище временно недоступно.');const object=await env.BUCKET.get(file.object_key);if(!object)fail(404,'Файл недоступен.');return new Response(object.body,{headers:{'Content-Type':file.content_type,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(file.name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }
 if(path[0]==='orders'&&path[1]){
  const o=await ownedOrder(db,user,path[1]),action=path[2]||'';
  if(!action&&method==='GET')return json(await details(db,user,o.id));
  if(!action&&method==='PATCH'){
   if(o.status!=='draft')fail(409,'Отправленную заявку можно уточнить сообщением.');const input=z.object({version:z.number().int(),details:RequestSchema}).parse(await payload(request));await changeOrder(db,user,o,input.version,{title:input.details.title,details_json:JSON.stringify(input.details),budget:Math.round(input.details.budget*100)},'Черновик обновлён');return json(await details(db,user,o.id));
  }
  if(action==='submit'&&method==='POST'){
   const data=z.object({version:z.number().int()}).parse(await payload(request));if(o.status!=='draft')fail(409,'Заявка уже отправлена.');if(o.budget<MINIMUM_KOPECKS)fail(400,'Минимальный заказ — 15 000 ₽ с НДС.');if(!o.details.city.trim())fail(400,'Укажите город проекта.');await changeOrder(db,user,o,data.version,{status:'submitted'},'Заявка отправлена');return json(await details(db,user,o.id));
  }
  if(action==='comment'&&method==='POST'){
   const data=z.object({text:z.string().trim().min(1,'Введите сообщение').max(2000)}).parse(await payload(request));await rate(db,request,'comment',user.id,60,3600000);await db.prepare('INSERT INTO cabinet_order_events (id,order_id,actor_id,title,note,created_at) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),o.id,user.id,user.role==='admin'?'Сообщение администратора':'Сообщение клиента',data.text,Date.now()).run();return json(await details(db,user,o.id));
  }
  if(action==='quote'&&method==='POST'){
   requireAdmin(user);const data=z.object({version:z.number().int(),amount:z.number().finite().min(15000,'Минимальный заказ — 15 000 ₽').max(1000000000),note:z.string().trim().min(3,'Опишите состав сметы').max(2000)}).parse(await payload(request));if(!['submitted','estimating','awaiting_approval'].includes(o.status))fail(409,'Смету можно менять до согласования и оплаты.');await changeOrder(db,user,o,data.version,{quote:Math.round(data.amount*100),quote_note:data.note,status:'awaiting_approval'},'Смета готова к согласованию',data.note);return json(await details(db,user,o.id));
  }
  if(action==='approve'&&method==='POST'){
   const data=z.object({version:z.number().int()}).parse(await payload(request));if(user.role==='admin'&&o.userId!==user.id)fail(403,'Смету согласует клиент.');if(o.status!=='awaiting_approval'||!o.quote||o.quote<MINIMUM_KOPECKS)fail(409,'Смета ещё не готова.');await changeOrder(db,user,o,data.version,{status:'awaiting_payment'},'Клиент согласовал смету',String(o.quote/100)+' ₽ с НДС');return json(await details(db,user,o.id));
  }
  if(action==='status'&&method==='POST'){
   requireAdmin(user);const data=z.object({version:z.number().int(),status:z.enum(Object.keys(statuses) as [OrderStatus,...OrderStatus[]]),note:z.string().trim().max(2000)}).parse(await payload(request));if(['paid','awaiting_approval','awaiting_payment','submitted','canceled'].includes(data.status))fail(400,'Для этого статуса используйте соответствующее действие заказа.');if(!transitions[o.status].includes(data.status))fail(409,'Такой переход статуса сейчас недоступен.');await changeOrder(db,user,o,data.version,{status:data.status},statuses[data.status],data.note);return json(await details(db,user,o.id));
  }
  if(action==='cancel'&&method==='POST'){
   const data=z.object({version:z.number().int(),note:z.string().trim().min(3,'Укажите причину отмены').max(1000)}).parse(await payload(request));if(!transitions[o.status].includes('canceled'))fail(409,'Заказ уже оплачен или завершён. Обратитесь к администратору.');if(await db.prepare("SELECT id FROM cabinet_payments WHERE order_id=? AND provider='yookassa' AND status IN ('creating','pending','waiting_for_capture')").bind(o.id).first())fail(409,'Сначала проверьте незавершённый платёж ЮKassa.');await changeOrder(db,user,o,data.version,{status:'canceled'},'Заказ отменён',data.note,undefined,noActivePayment);return json(await details(db,user,o.id));
  }
  if(action==='files'&&method==='POST'){
   if(['completed','canceled'].includes(o.status))fail(409,'Заказ закрыт.');if(!env.BUCKET)fail(503,'Хранилище временно недоступно.');if(Number(request.headers.get('content-length')||0)>11*1024*1024)fail(413,'Максимальный размер файла — 10 МБ.');const form=await request.formData(),file=form.get('file');if(!(file instanceof File)||file.size===0||file.size>10*1024*1024)fail(400,'Выберите файл до 10 МБ.');if(!/\.(pdf|cdr|ai|eps|tiff?|png|jpe?g|zip|xlsx?|csv|docx?)$/i.test(file.name))fail(400,'Допустимы макеты, изображения, таблицы, документы и ZIP.');const count=await db.prepare('SELECT COUNT(*) AS total FROM cabinet_files WHERE order_id=?').bind(o.id).first<{total:number}>();if((count?.total||0)>=20)fail(400,'К одному заказу можно добавить до 20 файлов.');
   const id=crypto.randomUUID(),objectKey='orders/'+o.id+'/'+id,name=file.name.replace(/[\x00-\x1f/\\]/g,'_').slice(0,180),contentType='application/octet-stream';await env.BUCKET.put(objectKey,file.stream(),{httpMetadata:{contentType}});
   try{await db.batch([db.prepare('INSERT INTO cabinet_files (id,order_id,owner_id,name,size,content_type,object_key,created_at) VALUES (?,?,?,?,?,?,?,?)').bind(id,o.id,user.id,name,file.size,contentType,objectKey,Date.now()),db.prepare('INSERT INTO cabinet_order_events (id,order_id,actor_id,title,note,created_at) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),o.id,user.id,'Добавлен файл',name,Date.now())]);}catch(error){await env.BUCKET.delete(objectKey);throw error;}return json(await details(db,user,o.id),201);
  }
  if(action==='invoice'&&method==='GET'){
   if(!o.quote||!['awaiting_payment','paid','production','ready','shipped','completed'].includes(o.status))fail(409,'Сначала согласуйте смету.');const supplier=await company(db);if(!supplier)fail(409,'Администратор ещё не заполнил реквизиты для счёта.');const buyer=(await db.prepare(`SELECT ${userColumns} FROM cabinet_users WHERE id=?`).bind(o.userId).first<UserRow>())!;return new Response(invoiceHtml(o,supplier,buyer),{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'"}});
  }
  if(action==='bank-payment'&&method==='POST'){
   requireAdmin(user);const data=z.object({version:z.number().int(),reference:z.string().trim().min(5,'Укажите номер и дату платёжного документа').max(300)}).parse(await payload(request));if(o.status!=='awaiting_payment'||!o.quote)fail(409,'Заказ не ожидает оплату.');if(await db.prepare("SELECT id FROM cabinet_payments WHERE order_id=? AND provider='yookassa' AND status IN ('creating','pending','waiting_for_capture')").bind(o.id).first())fail(409,'Сначала проверьте незавершённый платёж ЮKassa.');
   await changeOrder(db,user,o,data.version,{status:'paid',payment_status:'paid'},'Подтверждена оплата по счёту',data.reference,nonce=>[db.prepare("INSERT INTO cabinet_payments (id,order_id,amount,provider,idempotency_key,status,reference,created_at,updated_at) SELECT ?,id,?,'bank',?,'succeeded',?,?,? FROM cabinet_orders WHERE id=? AND change_id=?").bind(crypto.randomUUID(),o.quote,crypto.randomUUID(),data.reference,Date.now(),Date.now(),o.id,nonce)],noActivePayment);return json(await details(db,user,o.id));
  }
  if(action==='payment'&&method==='POST'){
   if(user.role==='admin'&&user.id!==o.userId)fail(403,'Оплату запускает клиент.');if(o.status!=='awaiting_payment'||!o.quote||o.quote<MINIMUM_KOPECKS)fail(409,'Заказ не готов к оплате.');if(paymentMode(env)==='disabled')fail(503,'Оплата картой ещё не подключена. Доступен счёт после заполнения реквизитов.');
   await rate(db,request,'payment',user.id,20,3600000);
   let p=await db.prepare("SELECT id,amount,idempotency_key,confirmation_url,provider_id,created_at,status FROM cabinet_payments WHERE order_id=? AND provider='yookassa' AND status IN ('creating','pending','waiting_for_capture') ORDER BY created_at DESC LIMIT 1").bind(o.id).first<PaymentAttempt>();
   if(p&&p.amount!==o.quote)fail(409,'Сумма платежа требует проверки.');
   if(p?.confirmation_url)return json({confirmationUrl:p.confirmation_url,test:paymentMode(env)==='test'});
   if(p&&Date.now()-p.created_at>23*3600000)fail(409,'Предыдущая попытка оплаты требует проверки администратором.');
   if(!p){const id=crypto.randomUUID(),key='payment-'+id;await db.prepare("INSERT OR IGNORE INTO cabinet_payments (id,order_id,amount,provider,idempotency_key,status,created_at,updated_at) SELECT ?,id,quote,'yookassa',?,'creating',?,? FROM cabinet_orders WHERE id=? AND version=? AND status='awaiting_payment'").bind(id,key,Date.now(),Date.now(),o.id,o.version).run();p=(await db.prepare("SELECT id,amount,idempotency_key,confirmation_url,provider_id,created_at,status FROM cabinet_payments WHERE order_id=? AND provider='yookassa' AND status IN ('creating','pending','waiting_for_capture') ORDER BY created_at DESC LIMIT 1").bind(o.id).first<PaymentAttempt>())!;if(!p||!['creating','pending'].includes(p.status))fail(409,'Платёж уже закрыт. Обратитесь к администратору.');}
   const actual=await providerRequest(env,'payments',{method:'POST',body:JSON.stringify({amount:{value:(o.quote/100).toFixed(2),currency:'RUB'},capture:true,confirmation:{type:'redirect',return_url:(env.CABINET_ORIGIN||url.origin)+'/account?order='+encodeURIComponent(o.id)+'&payment=return'},description:('StreetArt '+o.number).slice(0,128),metadata:{order_id:o.id}})},p.idempotency_key);
   if(!actual.id||actual.id.length>80||actual.amount?.currency!=='RUB'||Math.round(Number(actual.amount?.value)*100)!==o.quote||actual.metadata?.order_id!==o.id||!!actual.test!==(paymentMode(env)==='test')||!['pending','waiting_for_capture','succeeded','canceled'].includes(actual.status))fail(502,'Данные платежа требуют проверки администратором.');
   await db.prepare('UPDATE cabinet_payments SET provider_id=?,status=?,updated_at=? WHERE id=?').bind(actual.id,actual.status==='succeeded'?'pending':actual.status,Date.now(),p.id).run();
   if(actual.status==='succeeded'&&actual.paid){const paymentResult=await synchronizePayment(db,env,{...p,order_id:o.id,provider_id:actual.id},user);return json({...await details(db,user,o.id),paymentResult});}
   if(actual.status==='canceled')fail(409,'Платёж отменён. Можно начать новую попытку.');
   const confirmation=actual.confirmation?.confirmation_url;if(!confirmation||!/^https:\/\/(?:[a-z0-9-]+\.)?(?:yoomoney\.ru|yookassa\.ru)\//i.test(confirmation))fail(502,'Платёжный сервис не вернул ссылку на оплату.');
   await db.prepare('UPDATE cabinet_payments SET provider_id=?,status=?,confirmation_url=?,updated_at=? WHERE id=?').bind(actual.id,actual.status,confirmation,Date.now(),p.id).run();return json({confirmationUrl:confirmation,test:paymentMode(env)==='test'});
  }
  if(action==='payment-check'&&method==='POST'){
   const p=await db.prepare("SELECT id,order_id,amount,provider_id,status FROM cabinet_payments WHERE order_id=? AND provider='yookassa' AND provider_id IS NOT NULL ORDER BY created_at DESC LIMIT 1").bind(o.id).first<{id:string;order_id:string;amount:number;provider_id:string;status:string}>();if(!p)fail(404,'Платёж пока не создан.');const result=await synchronizePayment(db,env,p,user);return json({...await details(db,user,o.id),paymentResult:result});
  }
 }
 return fail(404,'Действие не найдено.');
 }catch(error){if(error instanceof Problem)return json({error:error.message},error.status);if(error instanceof ZodError)return json({error:error.issues[0]?.message||'Проверьте поля формы.'},400);console.error('Cabinet request failed',error instanceof Error?error.name:'unknown');return json({error:'Не удалось выполнить действие. Данные формы сохранены; повторите попытку позже.'},503);}}
