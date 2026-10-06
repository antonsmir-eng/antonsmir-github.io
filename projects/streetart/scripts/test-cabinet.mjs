import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';

const root=process.cwd(),out=path.join(root,'.sites-runtime/cabinet-tests');await fs.mkdir(out,{recursive:true});
for(const name of ['cabinet-model','cabinet-crypto','cabinet-server']){
 const source=await fs.readFile(path.join(root,'lib',name+'.ts'),'utf8');
 const code=ts.transpileModule(source,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace("from '../data/blog'","from './blog.mjs'").replace(/from '(\.\/cabinet-[^']+)'/g,"from '$1.mjs'");
 await fs.writeFile(path.join(out,name+'.mjs'),code);
}
await fs.writeFile(path.join(out,'blog.mjs'),ts.transpileModule(await fs.readFile('data/blog.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);
const {mergeArticles,seedArticles}=await import(path.join(out,'blog.mjs'));
const {handleCabinetRequest}=await import(path.join(out,'cabinet-server.mjs'));
const {hashPassword}=await import(path.join(out,'cabinet-crypto.mjs'));
const sqlite=new DatabaseSync(':memory:');sqlite.exec('PRAGMA foreign_keys=ON');
const journal=JSON.parse(await fs.readFile('drizzle/meta/_journal.json','utf8'));
for(const entry of journal.entries)sqlite.exec((await fs.readFile('drizzle/'+entry.tag+'.sql','utf8')).replaceAll('--> statement-breakpoint',''));
class Statement{
 constructor(sql,args=[]){this.sql=sql;this.args=args;}
 bind(...args){return new Statement(this.sql,args);}
 async first(){return sqlite.prepare(this.sql).get(...this.args)??null;}
 async all(){return {success:true,results:sqlite.prepare(this.sql).all(...this.args),meta:{changes:0}};}
 execute(){const stmt=sqlite.prepare(this.sql);if(stmt.columns().length)return {success:true,results:stmt.all(...this.args),meta:{changes:0}};const r=stmt.run(...this.args);return {success:true,results:[],meta:{changes:Number(r.changes)}};}
 async run(){return this.execute();}
}
const db={prepare:sql=>new Statement(sql),async batch(statements){sqlite.exec('BEGIN');try{const rows=statements.map(s=>s.execute());sqlite.exec('COMMIT');return rows;}catch(error){sqlite.exec('ROLLBACK');throw error;}}};
const objects=new Map();
const bucket={async put(key,stream){objects.set(key,new Uint8Array(await new Response(stream).arrayBuffer()));},async get(key){const bytes=objects.get(key);return bytes?{body:bytes}:null;},async delete(key){objects.delete(key);}};
const env={DB:db,BUCKET:bucket,ADMIN_BOOTSTRAP_HASH:await hashPassword('admin'),CABINET_ORIGIN:'https://cabinet.test',PAYMENT_MODE:'disabled'};
const jars={admin:'',a:'',b:''};
let passed=0;const results=[];
function check(name,fn){try{fn();results.push({name,passed:true});passed++;console.log('PASS '+name);}catch(error){results.push({name,passed:false});throw error;}}
async function call(who,route,method='GET',body,extra={},runtime=env){
 const headers={Origin:'https://cabinet.test',...(jars[who]?{Cookie:jars[who]}:{}),...extra};
 let payload;if(body instanceof FormData)payload=body;else if(body!==undefined){headers['Content-Type']='application/json';payload=JSON.stringify(body);}
 const response=await handleCabinetRequest(new Request('https://cabinet.test/api/cabinet/'+route,{method,headers,body:payload}),runtime);
 const setCookie=response.headers.get('set-cookie');if(setCookie)jars[who]=setCookie.split(';')[0];
 const text=await response.text();let data;try{data=JSON.parse(text);}catch{data=text;}
 return {status:response.status,data,headers:response.headers};
}
try{
 const anonymous=await call('a','orders');check('Заказы требуют серверного входа',()=>assert.equal(anonymous.status,401));
 const login=await call('admin','auth/login','POST',{login:'admin',password:'admin'});check('Начальный admin/admin работает, пароль не передаётся в ответ',()=>{assert.equal(login.status,200);assert.equal(login.data.user.mustChangePassword,true);assert.ok(!JSON.stringify(login.data).includes('passwordHash'));assert.match(login.headers.get('set-cookie'),/HttpOnly.*SameSite=Lax.*Secure/);});
 const initial=await call('admin','orders');check('Начальный администратор обязан сменить пароль',()=>assert.equal(initial.status,428));
 const oldAdminCookie=jars.admin;
 const changed=await call('admin','password','POST',{currentPassword:'admin',password:'Test-Admin-Password-2026'});check('Смена пароля завершает прежние сеансы',()=>{assert.equal(changed.status,200);assert.equal(changed.data.user.mustChangePassword,false);assert.notEqual(jars.admin,oldAdminCookie);});
 const newAdminCookie=jars.admin;jars.admin=oldAdminCookie;const stale=await call('admin','orders');jars.admin=newAdminCookie;check('Старый cookie больше не даёт доступ',()=>assert.equal(stale.status,401));
 const customerA=await call('a','auth/register','POST',{email:'qa-a@example.test',name:'Тестовый клиент А',password:'Customer-A-Password-2026',role:'admin'});
 const customerB=await call('b','auth/register','POST',{email:'qa-b@example.test',name:'Тестовый клиент Б',password:'Customer-B-Password-2026'});
 check('Регистрация по почте создаёт клиента, роль admin не принимается',()=>{assert.equal(customerA.status,201);assert.equal(customerB.status,201);assert.equal(customerA.data.user.role,'customer');});
 const reserved=await call('b','auth/register','POST',{email:'admin@streetart.local',name:'Подмена администратора',password:'Customer-C-Password-2026'});check('Почта начального администратора зарезервирована',()=>assert.equal(reserved.status,400));
 const duplicate=await call('b','auth/register','POST',{email:'QA-A@EXAMPLE.TEST',name:'Дубликат',password:'Customer-C-Password-2026'});check('Нормализованная почта уникальна',()=>assert.equal(duplicate.status,409));
 const crossOrigin=await call('a','orders','POST',{}, {Origin:'https://other.test'});check('Чужой Origin блокирует изменения',()=>assert.equal(crossOrigin.status,403));
 const requestId=crypto.randomUUID(),orderInput={title:'Тестовое оформление',city:'Екатеринбург',budget:14000,quantity:4,product:'Баннер',width:6,height:3};
 let r=await call('a','orders','POST',{requestId,details:orderInput});let o=r.data.order;
 check('Черновик сохраняется на сервере даже ниже минимума',()=>{assert.equal(r.status,201);assert.equal(o.status,'draft');});
 const twice=await call('a','orders','POST',{requestId,details:orderInput});check('Повтор сохранения не создаёт второй заказ',()=>assert.equal(twice.data.order.id,o.id));
 const forbidden=await call('b','orders/'+o.id);check('Клиент не может читать чужой заказ',()=>assert.equal(forbidden.status,404));
 const low=await call('a','orders/'+o.id+'/submit','POST',{version:o.version});check('Заказ ниже 15000 не отправляется на расчёт',()=>assert.equal(low.status,400));
 r=await call('a','orders/'+o.id,'PATCH',{version:o.version,details:{...orderInput,budget:15000}});o=r.data.order;
 const staleUpdate=await call('a','orders/'+o.id,'PATCH',{version:1,details:{...orderInput,budget:15000}});check('Устаревшая версия не перезаписывает заказ',()=>assert.equal(staleUpdate.status,409));
 r=await call('a','orders/'+o.id+'/submit','POST',{version:o.version});o=r.data.order;check('Минимум 15000 принят и статус записан',()=>assert.equal(o.status,'submitted'));
 const form=new FormData();form.append('file',new File(['%PDF test fixture'],'Тестовый-макет.pdf',{type:'application/pdf'}));r=await call('a','orders/'+o.id+'/files','POST',form);const fileId=r.data.files[0].id;
 const privateFile=await call('b','files/'+fileId);const ownFile=await call('a','files/'+fileId);check('Файлы хранятся и проверяют владельца при скачивании',()=>{assert.equal(privateFile.status,404);assert.equal(ownFile.status,200);assert.match(ownFile.headers.get('content-disposition'),/attachment/);assert.equal(objects.size,1);});
 const jsonForm=new FormData();jsonForm.append('file',new File(['{\"total\":15000}'],'StreetArt_calculation.json',{type:'application/json'}));const jsonUpload=await call('a','orders/'+o.id+'/files','POST',jsonForm);check('Полный расчёт JSON можно приложить к заказу',()=>assert.equal(jsonUpload.status,201));
 const customerStatus=await call('a','orders/'+o.id+'/status','POST',{version:o.version,status:'production',note:''});check('Клиент не управляет производственными статусами',()=>assert.equal(customerStatus.status,403));
 const tooLowQuote=await call('admin','orders/'+o.id+'/quote','POST',{version:o.version,amount:14999,note:'Тестовая смета'});check('Администратор не выставляет смету ниже минимума',()=>assert.equal(tooLowQuote.status,400));
 r=await call('admin','orders/'+o.id+'/quote','POST',{version:o.version,amount:17000,note:'Тест: печать, обработка и доставка'});o=r.data.order;check('Смета администратора попадает на согласование',()=>assert.equal(o.status,'awaiting_approval'));
 r=await call('a','orders/'+o.id+'/approve','POST',{version:o.version});o=r.data.order;check('Клиент согласует конкретную версию сметы',()=>assert.equal(o.status,'awaiting_payment'));
 const disabled=await call('a','orders/'+o.id+'/payment','POST',{});check('Без провайдера нет ложной успешной оплаты',()=>assert.equal(disabled.status,503));
 const missingInvoice=await call('a','orders/'+o.id+'/invoice');check('Счёт без реквизитов не выдаётся',()=>assert.equal(missingInvoice.status,409));
 const supplier={name:'Тестовая компания',inn:'1234567890',kpp:'123456789',address:'Тестовый адрес',bank:'Тестовый банк',bik:'123456789',account:'12345678901234567890',correspondent:'12345678901234567890'};
 const savedSettings=await call('admin','settings','PUT',supplier);const invoice=await call('a','orders/'+o.id+'/invoice');check('Счёт использует сохранённые реквизиты и согласованную сумму',()=>{assert.equal(savedSettings.status,200);assert.equal(invoice.status,200);assert.match(invoice.data,/17000.00/);assert.match(invoice.data,/Тестовая компания/);});
 const rawFetch=globalThis.fetch;let createCalls=0;let providerPayment;
 globalThis.fetch=async(url,options)=>{if(options?.method==='POST'){createCalls++;const data=JSON.parse(options.body);providerPayment={id:'fixture-payment-1',status:'pending',paid:false,test:true,amount:data.amount,metadata:data.metadata,confirmation:{confirmation_url:'https://yoomoney.ru/api-pages/v2/payment-confirm/fixture'}};}return Response.json(providerPayment);};
 const testEnv={...env,PAYMENT_MODE:'test',YOOKASSA_SHOP_ID:'fixture',YOOKASSA_SECRET_KEY:'fixture'};
 const malformedFetch=globalThis.fetch;globalThis.fetch=async()=>Response.json({id:'fixture-bad',status:'pending',paid:false,test:true,amount:{value:'1.00',currency:'RUB'},metadata:{order_id:o.id},confirmation:{confirmation_url:'https://yoomoney.ru/api-pages/v2/payment-confirm/fixture'}});const badCreate=await call('a','orders/'+o.id+'/payment','POST',{},{},testEnv);check('Неверная сумма отклоняется до перехода на оплату',()=>assert.equal(badCreate.status,502));globalThis.fetch=malformedFetch;
 const pay1=await call('a','orders/'+o.id+'/payment','POST',{amount:1},{},testEnv);const pay2=await call('a','orders/'+o.id+'/payment','POST',{},{},testEnv);check('Сумма платежа берётся из заказа; повтор использует тот же платёж',()=>{assert.equal(pay1.status,200);assert.equal(pay2.status,200);assert.equal(createCalls,1);assert.equal(providerPayment.amount.value,'17000.00');});
 const cancelPending=await call('a','orders/'+o.id+'/cancel','POST',{version:o.version,note:'Отмена тестового заказа'});const bankPending=await call('admin','orders/'+o.id+'/bank-payment','POST',{version:o.version,reference:'Тестовый документ'});const adminCancel=await call('admin','orders/'+o.id+'/status','POST',{version:o.version,status:'canceled',note:'Тест'});check('Незавершённый платёж блокирует отмену и двойное подтверждение',()=>{assert.equal(cancelPending.status,409);assert.equal(bankPending.status,409);assert.equal(adminCancel.status,400);});
 providerPayment={...providerPayment,status:'succeeded',paid:true};const testPaid=await call('a','orders/'+o.id+'/payment-check','POST',{},{},testEnv);o=testPaid.data.order;check('Тестовый платёж не разрешает производство и не объявляется реальным',()=>{assert.equal(o.status,'awaiting_payment');assert.equal(o.paymentStatus,'test_paid');assert.equal(testPaid.data.payments[0].status,'test_succeeded');});
 providerPayment={...providerPayment,amount:{value:'1.00',currency:'RUB'}};const forged=await call('a','orders/'+o.id+'/payment-check','POST',{},{},testEnv);check('Подмена суммы провайдера отклоняется',()=>assert.equal(forged.status,502));globalThis.fetch=rawFetch;
 r=await call('admin','orders/'+o.id+'/bank-payment','POST',{version:o.version,reference:'Тестовый документ № 1 от 05.10.2026'});o=r.data.order;check('Банковская оплата и её основание записываются атомарно',()=>{assert.equal(o.status,'paid');assert.ok(r.data.payments.some(p=>p.provider==='bank'&&p.amount===1700000));});
 const jump=await call('admin','orders/'+o.id+'/status','POST',{version:o.version,status:'completed',note:''});check('Нельзя пропустить недопустимые производственные этапы',()=>assert.equal(jump.status,409));
 for(const status of ['production','ready','shipped','completed']){r=await call('admin','orders/'+o.id+'/status','POST',{version:o.version,status,note:'Тестовый этап'});assert.equal(r.status,200);o=r.data.order;}
 check('Заказ проходит производство, отгрузку и завершение с историей',()=>{assert.equal(o.status,'completed');assert.ok(r.data.events.some(e=>e.title==='Отгружен'));assert.ok(r.data.events.some(e=>e.title==='Завершён'));});
 const list=await call('a','orders?search='+encodeURIComponent('Тестовое'));check('Поиск читает сохранённые заказы из базы',()=>assert.equal(list.data.total,1));
 const nonAdminSettings=await call('a','settings');check('Реквизиты может изменять только администратор',()=>assert.equal(nonAdminSettings.status,403));

 const blogDenied=await call('a','blog/manage');check('Редактор блога закрыт для клиента',()=>assert.equal(blogDenied.status,403));
 const article={slug:'qa-test-article',title:'Тестовая статья',excerpt:'Практическое описание для проверки публикации',category:'Практика',body:'## Заголовок\n'+('Проверяем публикацию и сохранение текста. '.repeat(10)),status:'draft',expectedUpdatedAt:0};
 const forbiddenPublish=await call('a','blog/article','PUT',article);check('Клиент не может публиковать статьи',()=>assert.equal(forbiddenPublish.status,403));
 let blog=await call('admin','blog/article','PUT',article);check('Администратор сохраняет черновик статьи',()=>assert.equal(blog.status,200));
 const allArticles=()=>sqlite.prepare('SELECT slug,title,excerpt,category,body,status,published_at AS publishedAt,updated_at AS updatedAt FROM cabinet_articles').all();
 check('Черновик отсутствует в публичном списке',()=>assert.ok(!mergeArticles(allArticles()).some(a=>a.slug===article.slug)));
 const oldVersion=blog.data.article.updatedAt;
 blog=await call('admin','blog/article','PUT',{...article,status:'published',expectedUpdatedAt:oldVersion});check('Публикация открывает статью и увеличивает версию',()=>{assert.equal(blog.status,200);assert.ok(blog.data.article.updatedAt>oldVersion);assert.ok(mergeArticles(allArticles()).some(a=>a.slug===article.slug));});
 const staleBlog=await call('admin','blog/article','PUT',{...article,expectedUpdatedAt:oldVersion});check('Устаревшая версия статьи не перезаписывает новую',()=>assert.equal(staleBlog.status,409));
 const seed=seedArticles[0];const unpublish=await call('admin','blog/article','PUT',{...seed,status:'draft',expectedUpdatedAt:seed.updatedAt});check('Снятая с публикации начальная статья скрыта',()=>{assert.equal(unpublish.status,200);assert.ok(!mergeArticles(allArticles()).some(a=>a.slug===seed.slug));});
 const reservedArticle=await call('admin','blog/article','PUT',{...article,slug:'editor'});check('Служебный адрес редактора нельзя занять статьёй',()=>assert.equal(reservedArticle.status,400));
 const emptyArticle=await call('admin','blog/article','PUT',{...article,slug:'empty-article',status:'published',body:''});check('Пустую статью нельзя опубликовать',()=>assert.equal(emptyArticle.status,400));
 await call('a','auth/logout','POST',{});const signedOut=await call('a','orders');check('Выход удаляет серверный сеанс',()=>assert.equal(signedOut.status,401));
 let last;for(let i=0;i<11;i++)last=await call('b','auth/login','POST',{login:'unknown@example.test',password:'wrong'});check('Повторные неудачные входы ограничиваются',()=>assert.equal(last.status,429));
 check('В базе отсутствуют пароли и сырые session-токены',()=>{assert.match(sqlite.prepare("SELECT password_hash FROM cabinet_users WHERE login='admin'").get().password_hash,/^pbkdf2-sha256/);assert.ok(!sqlite.prepare('SELECT token_hash FROM cabinet_sessions').all().some(row=>Object.values(jars).some(jar=>jar.includes(row.token_hash))));});
 await fs.mkdir('reports',{recursive:true});await fs.writeFile('reports/cabinet-tests.json',JSON.stringify({date:'2026-10-06',passed,failed:0,environment:'isolated SQLite + R2 fixture; no live payments',results},null,2)+'\n');console.log(JSON.stringify({passed,failed:0}));
}catch(error){await fs.writeFile('reports/cabinet-tests.json',JSON.stringify({date:'2026-10-06',passed,failed:1,results,error:error.message},null,2)+'\n');throw error;}finally{sqlite.close();}
