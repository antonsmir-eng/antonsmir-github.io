import fs from 'node:fs/promises';
const c=JSON.parse(await fs.readFile('site.config.json','utf8'));
if(!c.bookingEnabled||!c.indexNowKey)throw Error('Open the real service and configure IndexNow before notifying search engines.');
const urls=process.argv.slice(2),home=new URL(c.origin+c.basePath+'/');
if(!urls.length)throw Error('Pass only new or changed absolute URLs as arguments.');
if(urls.length>10000||urls.some(x=>{const u=new URL(x);return u.origin!==home.origin||!u.pathname.startsWith(home.pathname)}))throw Error('All URLs must belong to this site.');
const r=await fetch('https://yandex.com/indexnow',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({host:home.host,key:c.indexNowKey,keyLocation:home.href+c.indexNowKey+'.txt',urlList:urls})});
console.log('IndexNow HTTP '+r.status);if(!r.ok)process.exitCode=1;
