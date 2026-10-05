const encoder=new TextEncoder();
const hex=(bytes:ArrayBuffer|Uint8Array)=>Array.from(bytes instanceof Uint8Array?bytes:new Uint8Array(bytes),x=>x.toString(16).padStart(2,'0')).join('');
const unhex=(s:string)=>new Uint8Array(s.match(/.{2}/g)!.map(v=>parseInt(v,16)));
export const token=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
export const digest=async(value:string)=>hex(await crypto.subtle.digest('SHA-256',encoder.encode(value)));
export async function hashPassword(password:string,salt=hex(crypto.getRandomValues(new Uint8Array(16)))){
 const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
 const bits=await crypto.subtle.deriveBits({name:'PBKDF2',hash:'SHA-256',salt:unhex(salt),iterations:100000},key,256);
 return 'pbkdf2-sha256$100000$'+salt+'$'+hex(bits);
}
export async function verifyPassword(password:string,stored:string){
 const parts=stored.split('$');if(parts.length!==4||parts[0]!=='pbkdf2-sha256'||parts[1]!=='100000'||!/^[a-f0-9]{32}$/.test(parts[2])||!/^[a-f0-9]{64}$/.test(parts[3]))return false;
 const actual=(await hashPassword(password,parts[2])).split('$')[3];let difference=0;for(let i=0;i<actual.length;i++)difference|=actual.charCodeAt(i)^parts[3].charCodeAt(i);return difference===0;
}
