import http from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {randomUUID,timingSafeEqual,createHash} from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import {normalizePhone} from '../public/assets/logic.mjs';
import {brands,districts} from '../src/data.mjs';
const MIME={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml','.webp':'image/webp','.png':'image/png','.xml':'application/xml','.yml':'application/xml','.txt':'text/plain; charset=utf-8'};
const STATUS=['new','qualified','confirmed','paid','cancelled'];
const TIME=['09:00–12:00','12:00–15:00','15:00–18:00','18:00–21:00'];
const text=(v,max=2000)=>String(v??'').trim().slice(0,max);
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Moscow',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
function validDate(s){if(!/^\d{4}-\d{2}-\d{2}$/.test(s))return false;const d=new Date(s+'T00:00:00Z');return !isNaN(d)&&d.toISOString().slice(0,10)===s&&s>=today()&&d.getTime()<Date.now()+366*86400000;}
function attachmentValid(value){if(!value)return true;const m=/^data:image\/(jpeg|png|webp);base64,([a-zA-Z0-9+/]+={0,2})$/.exec(value);if(!m)return false;const b=Buffer.from(m[2],'base64');if(b.length>4*1024*1024)return false;return m[1]==='jpeg'?b[0]===255&&b[1]===216:m[1]==='png'?b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP';}
export async function createApp({dbPath='data/service.sqlite',adminToken,allowedOrigins=[],bookingEnabled=false,staticRoot='dist',basePath='',rateLimit=20}={}){
 if(!adminToken||adminToken.length<32)throw Error('ADMIN_TOKEN must contain at least 32 characters.');
 if(dbPath!==':memory:')await fs.mkdir(path.dirname(path.resolve(dbPath)),{recursive:true});
 const db=new DatabaseSync(dbPath);db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
 CREATE TABLE IF NOT EXISTS slots(id TEXT PRIMARY KEY,master TEXT NOT NULL,district TEXT NOT NULL,date TEXT NOT NULL,time TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,UNIQUE(master,date,time));
 CREATE TABLE IF NOT EXISTS leads(id TEXT PRIMARY KEY,requestId TEXT NOT NULL UNIQUE,created TEXT NOT NULL,name TEXT NOT NULL,phone TEXT NOT NULL,district TEXT NOT NULL,brand TEXT NOT NULL,model TEXT,problem TEXT NOT NULL,preferredDate TEXT NOT NULL,slotId TEXT REFERENCES slots(id),status TEXT NOT NULL DEFAULT 'new',paidAmount REAL NOT NULL DEFAULT 0,source TEXT NOT NULL DEFAULT '{}',attachment TEXT,consentVersion TEXT NOT NULL);
 CREATE UNIQUE INDEX IF NOT EXISTS active_slot ON leads(slotId) WHERE slotId IS NOT NULL AND status<>'cancelled';
 CREATE INDEX IF NOT EXISTS phone_created ON leads(phone,created);
 CREATE TABLE IF NOT EXISTS cases(id TEXT PRIMARY KEY,title TEXT NOT NULL,model TEXT NOT NULL,price REAL NOT NULL,date TEXT NOT NULL,body TEXT NOT NULL);
 `);
 const rate=new Map(),root=path.resolve(staticRoot),secretHash=createHash('sha256').update(adminToken).digest();
 const authorized=req=>{const presented=req.headers.authorization?.replace(/^Bearer /,'')||'';return timingSafeEqual(createHash('sha256').update(presented).digest(),secretHash);};
 const json=(res,status,data)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));};
 async function body(req){if(!(req.headers['content-type']||'').startsWith('application/json'))throw Object.assign(Error('Нужен формат JSON.'),{status:415});let bytes=0,chunks=[];for await(const chunk of req){bytes+=chunk.length;if(bytes>6*1024*1024)throw Object.assign(Error('Слишком большой запрос.'),{status:413});chunks.push(chunk);}try{return JSON.parse(Buffer.concat(chunks).toString())}catch{throw Object.assign(Error('Некорректный запрос.'),{status:400});}}
 const server=http.createServer(async(req,res)=>{
 res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');res.setHeader('X-Frame-Options','DENY');
 const origin=req.headers.origin;if(origin&&allowedOrigins.includes(origin)){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Access-Control-Allow-Methods','GET, POST, PATCH, DELETE, OPTIONS');}
 if(origin&&!allowedOrigins.includes(origin))return json(res,403,{error:'Источник запроса не разрешён.'});
 if(req.method==='OPTIONS'){res.writeHead(204).end();return;}
 try{
 const u=new URL(req.url,'http://localhost'),p=u.pathname;
 if(p.startsWith('/api/')){
 const ip=req.socket.remoteAddress||'unknown',now=Date.now(),key=ip+':'+(p.startsWith('/api/admin/')?'admin':'public');let bucket=rate.get(key);if(!bucket||now-bucket.start>60000){bucket={start:now,count:0};rate.set(key,bucket);}if(rate.size>10000)for(const[k,v]of rate)if(now-v.start>60000)rate.delete(k);
 if(['POST','PATCH','DELETE'].includes(req.method)&&++bucket.count>rateLimit)return json(res,429,{error:'Слишком много запросов. Попробуйте через минуту.'});
 if(p.startsWith('/api/admin/')&&!authorized(req))return json(res,401,{error:'Неверный ключ доступа.'});
 if(p==='/api/health'&&req.method==='GET')return json(res,200,{ok:true,bookingEnabled});
 if(p==='/api/slots'&&req.method==='GET'){
 const date=u.searchParams.get('date'),district=u.searchParams.get('district');if(!validDate(date||'')||!districts.includes(district))return json(res,400,{error:'Проверьте дату и округ.'});
 const slots=db.prepare("SELECT id,date,time FROM slots WHERE active=1 AND date=? AND district=? AND id NOT IN (SELECT slotId FROM leads WHERE slotId IS NOT NULL AND status<>'cancelled') ORDER BY time").all(date,district);return json(res,200,{slots});}
 if(p==='/api/leads'&&req.method==='POST'){
 if(!bookingEnabled)return json(res,503,{error:'Приём заявок пока закрыт.'});
 const b=await body(req),phone=normalizePhone(b.phone),name=text(b.name,80),problem=text(b.problem),date=text(b.preferredDate,10),slotId=text(b.slotId,80)||null;
 if(b.website)return json(res,400,{error:'Обращение не принято.'});
 if(!phone||name.length<2||problem.length<10||b.consent!==true||!brands.includes(b.brand)||!districts.includes(b.district)||!validDate(date)||!/^[\w-]{16,80}$/.test(b.requestId||'')||!attachmentValid(b.attachment))return json(res,400,{error:'Проверьте контактные данные, дату, согласие и формат фотографии.'});
 const existing=db.prepare('SELECT id FROM leads WHERE requestId=?').get(b.requestId);if(existing)return json(res,200,{id:existing.id,duplicate:true});
 // Deduplication response does not expose an existing lead ID to someone knowing a phone number.
 const repeated=db.prepare("SELECT id FROM leads WHERE phone=? AND created>? AND status<>'cancelled'").get(phone,new Date(Date.now()-86400000).toISOString());if(repeated)return json(res,409,{error:'По этому телефону уже есть обращение за последние сутки. Дождитесь связи с диспетчером.'});
 if(slotId){const slot=db.prepare('SELECT * FROM slots WHERE id=? AND active=1').get(slotId);if(!slot||slot.date!==date||slot.district!==b.district)return json(res,409,{error:'Этот интервал больше недоступен. Обновите расписание.'});}
 const id='TR-'+randomUUID().slice(0,8).toUpperCase(),source={};for(const k of ['utm_source','utm_medium','utm_campaign','utm_term','utm_content'])if(b.source?.[k])source[k]=text(b.source[k],150);
 try{db.prepare('INSERT INTO leads(id,requestId,created,name,phone,district,brand,model,problem,preferredDate,slotId,source,attachment,consentVersion) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id,b.requestId,new Date().toISOString(),name,phone,b.district,b.brand,text(b.model,80),problem,date,slotId,JSON.stringify(source),b.attachment||null,'2026-09-28');}catch(err){if(String(err.message).includes('UNIQUE'))return json(res,409,{error:'Интервал уже выбран другим клиентом. Обновите расписание.'});throw err;}
 return json(res,201,{id,duplicate:false});}
 if(p==='/api/cases'&&req.method==='GET')return json(res,200,{cases:db.prepare('SELECT * FROM cases ORDER BY date DESC LIMIT 100').all()});
 if(p==='/api/admin/leads'&&req.method==='GET'){const leads=db.prepare('SELECT l.id,l.created,l.name,l.phone,l.district,l.brand,l.model,l.problem,l.preferredDate,l.status,l.paidAmount,l.source,l.slotId,s.time AS slotTime,CASE WHEN l.attachment IS NULL THEN 0 ELSE 1 END AS hasAttachment FROM leads l LEFT JOIN slots s ON s.id=l.slotId ORDER BY l.created DESC LIMIT 500').all().map(x=>({...x,source:JSON.parse(x.source)}));return json(res,200,{leads});}
 if(/^\/api\/admin\/leads\/[^/]+\/attachment$/.test(p)&&req.method==='GET'){const row=db.prepare('SELECT attachment FROM leads WHERE id=?').get(p.split('/')[4]);return row?.attachment?json(res,200,row):json(res,404,{error:'Вложение не найдено.'});}
 if(/^\/api\/admin\/leads\/[^/]+$/.test(p)&&req.method==='PATCH'){
 const b=await body(req),id=p.split('/')[4];if(!STATUS.includes(b.status)||!Number.isFinite(b.paidAmount)||b.paidAmount<0||b.paidAmount>1000000||b.status==='paid'&&b.paidAmount<=0)return json(res,400,{error:'Проверьте статус и сумму оплаты.'});
 const lead=db.prepare('SELECT * FROM leads WHERE id=?').get(id);if(!lead)return json(res,404,{error:'Обращение не найдено.'});
 if(lead.status==='cancelled'&&b.status!=='cancelled'&&lead.slotId){const slot=db.prepare('SELECT active FROM slots WHERE id=?').get(lead.slotId);if(!slot?.active)return json(res,409,{error:'Старый интервал снят с расписания. Создайте новую запись.'});}
 try{db.prepare('UPDATE leads SET status=?,paidAmount=? WHERE id=?').run(b.status,b.paidAmount,id);}catch(err){if(String(err.message).includes('UNIQUE'))return json(res,409,{error:'Интервал уже занят другим обращением.'});throw err;}return json(res,200,{ok:true});}
 if(p==='/api/admin/slots'&&req.method==='GET')return json(res,200,{slots:db.prepare("SELECT s.*,EXISTS(SELECT 1 FROM leads l WHERE l.slotId=s.id AND l.status<>'cancelled') AS booked FROM slots s WHERE active=1 ORDER BY date,time LIMIT 500").all()});
 if(p==='/api/admin/slots'&&req.method==='POST'){
 const b=await body(req);if(!validDate(b.date||'')||!districts.includes(b.district)||!TIME.includes(b.time)||text(b.master,80).length<2)return json(res,400,{error:'Проверьте дату, округ, мастера и интервал.'});
 const id=randomUUID();try{db.prepare('INSERT INTO slots(id,master,district,date,time) VALUES(?,?,?,?,?)').run(id,text(b.master,80),b.district,b.date,b.time);}catch{return json(res,409,{error:'У мастера уже есть интервал на это время.'});}return json(res,201,{id});}
 if(/^\/api\/admin\/slots\/[^/]+$/.test(p)&&req.method==='DELETE'){const id=p.split('/')[4];if(db.prepare("SELECT id FROM leads WHERE slotId=? AND status<>'cancelled'").get(id))return json(res,409,{error:'Сначала отмените или перенесите обращение в этом интервале.'});db.prepare('UPDATE slots SET active=0 WHERE id=?').run(id);return json(res,200,{ok:true});}
 if(p==='/api/admin/cases'&&req.method==='POST'){
 const b=await body(req);if(text(b.title,120).length<5||text(b.model,80).length<2||text(b.body).length<30||!Number.isFinite(b.price)||b.price<0||b.price>1000000||!/^\d{4}-\d{2}-\d{2}$/.test(b.date||'')||b.date>today()||b.publishConsent!==true)return json(res,400,{error:'Проверьте сведения о ремонте и согласие на публикацию.'});
 const id=randomUUID();db.prepare('INSERT INTO cases VALUES(?,?,?,?,?,?)').run(id,text(b.title,120),text(b.model,80),b.price,b.date,text(b.body));return json(res,201,{id});}
 return json(res,404,{error:'Метод не найден.'});
 }
 if(req.method!=='GET'&&req.method!=='HEAD')return json(res,405,{error:'Метод не поддерживается.'});
 let pathname=decodeURIComponent(p);if(basePath&&(pathname===basePath||pathname.startsWith(basePath+'/')))pathname=pathname.slice(basePath.length)||'/';if(pathname.endsWith('/'))pathname+='index.html';
 const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep))return json(res,403,{error:'Доступ запрещён.'});
 if(pathname.includes('/admin/'))res.setHeader('X-Robots-Tag','noindex, nofollow');
 try{const buffer=await fs.readFile(file);res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:buffer);}catch{res.writeHead(404,{'Content-Type':'text/html; charset=utf-8'});res.end(await fs.readFile(path.join(root,'404.html')).catch(()=>Buffer.from('Not found')));}
 }catch(err){json(res,err.status||500,{error:err.status?err.message:'Временная ошибка сервера. Повторите позже.'});}
 });
 server.requestTimeout=30000;server.headersTimeout=15000;
 return {server,db,close:()=>new Promise(resolve=>server.close(()=>{db.close();resolve();}))};
}
