import fs from 'node:fs/promises';import {createApp} from './app.mjs';
const config=JSON.parse(await fs.readFile('site.config.json','utf8'));
if(config.bookingEnabled&&(!config.legalName||!config.legalAddress||!config.email||!config.phone||!config.pricesApproved))throw Error('Before opening bookings, fill legal/contact details, approve prices and publish a complete privacy policy.');
const port=Number(process.env.PORT||3000),host=process.env.HOST||'127.0.0.1';
const app=await createApp({adminToken:process.env.ADMIN_TOKEN,dbPath:process.env.DB_PATH||'data/service.sqlite',allowedOrigins:(process.env.ALLOWED_ORIGINS||`http://127.0.0.1:${port},http://localhost:${port}`).split(',').map(x=>x.trim()),bookingEnabled:config.bookingEnabled,basePath:config.basePath});
app.server.listen(port,host,()=>console.log(`Service listening on ${host}:${port}. Booking ${config.bookingEnabled?'enabled':'closed'}.`));
for(const s of ['SIGINT','SIGTERM'])process.on(s,async()=>{await app.close();process.exit(0)});
