import fs from 'node:fs/promises';import path from 'node:path';
const c=JSON.parse(await fs.readFile('site.config.json','utf8')),root=path.resolve('dist');
const files=await fs.readdir(root,{recursive:true});let pages=0,links=0;const errors=[];
for(const rel of files.filter(x=>x.endsWith('.html'))){const html=await fs.readFile(path.join(root,rel),'utf8');pages++;if((html.match(/<h1[ >]/g)||[]).length!==1)errors.push(rel+': exactly one h1 required');if(!html.includes('name="description"')||!html.includes('rel="canonical"'))errors.push(rel+': missing metadata');
for(const m of html.matchAll(/(?:href|src)="([^"]+)"/g)){if(!m[1].startsWith(c.basePath+'/'))continue;const u=new URL(m[1],'https://example.test'),p=decodeURIComponent(u.pathname.slice(c.basePath.length));const target=path.join(root,p,p.endsWith('/')?'index.html':'');links++;try{await fs.access(target)}catch{errors.push(rel+': missing '+p)}}}
if(errors.length){console.error(errors.join('\n'));process.exit(1);}console.log(`Verified ${pages} HTML pages and ${links} local references.`);
