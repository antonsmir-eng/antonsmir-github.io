import {calculate,initialOrder,addVat,round,type Prices,type Calculation} from './pricing';
import {ZodError} from 'zod';
import {calculateProduct,initialProduct,recipes,districtFor,packaging} from './production';
export type AddressRow={city:string;address:string;width:number;height:number;material:string;quantity:number;mount:boolean;recipe?:string;thickness?:number;letterHeight?:number;density?:number;warehouse?:boolean;latitude?:number;longitude?:number};
export type AddressResult={row:number;input:AddressRow;calculation:Calculation|null;error:string};
export function normalizeCity(value:unknown){const s=String(value??'').trim().replace(/^г[.\s]+/i,'').replace(/\s+/g,' ');const aliases:Record<string,string>={'екб':'Екатеринбург','екатеринбург':'Екатеринбург','москва':'Москва','спб':'Санкт-Петербург','санкт петербург':'Санкт-Петербург','санкт-петербург':'Санкт-Петербург','новосибирск':'Новосибирск'};return aliases[s.toLowerCase()]||s;}
const number=(v:unknown)=>Number(String(v??'').replace(',','.').trim());const yes=(v:unknown)=>['да','1','true','yes'].includes(String(v||'').trim().toLowerCase());
export function normalizeRow(raw:Record<string,unknown>,p:Prices):AddressRow{
 const row=Object.fromEntries(Object.entries(raw).map(([k,v])=>[k.toLowerCase().trim(),v]));const size=String(row['размер']||row['size']||'').replaceAll(',','.').split(/[xх×*]/i).map(x=>Number(x.trim()));
 const material=String(row['материал']||row['material']||'').trim();const rate=[...p.wide,...p.interior].find(x=>x.id===material||x.name.toLowerCase()===material.toLowerCase());const recipe=String(row['рецепт']||row['recipe']||'').trim();
 return {city:normalizeCity(row['город']||row['city']),address:String(row['адрес']||row['address']||'').trim().replace(/\s+/g,' '),width:row['ширина']!==undefined?number(row['ширина']):row['width']!==undefined?number(row['width']):size[0],height:row['высота']!==undefined?number(row['высота']):row['height']!==undefined?number(row['height']):size[1],material:rate?.id||material,quantity:number(row['количество']??row['quantity']??1),mount:yes(row['монтаж']||row['mount']),recipe:recipe||undefined,thickness:number(row['толщина']||material.match(/^pvc-(3|5|8)$/)?.[1]||3),letterHeight:row['высота буквы']!==undefined?number(row['высота буквы']):undefined,density:row['плотность']!==undefined&&row['плотность']!==''?number(row['плотность']):undefined,warehouse:yes(row['склад']||row['warehouse']),latitude:row['широта']!==undefined?number(row['широта']):undefined,longitude:row['долгота']!==undefined?number(row['долгота']):undefined};
}
function addressKey(row:AddressRow){return (row.city+'|'+row.address).toLocaleLowerCase('ru');}
function rowError(error:unknown){
 if(error instanceof ZodError){
  const labels:Record<string,string>={width:'ширину в метрах',height:'высоту в метрах',quantity:'целое количество изделий',city:'город',letterHeight:'высоту буквы в сантиметрах',thickness:'толщину материала',eyeletStep:'шаг люверсов',material:'материал'};
  return [...new Set(error.issues.map(issue=>{
   const field=labels[String(issue.path[0])]||'параметры строки';
   if(issue.code==='too_small')return 'Проверьте '+field+': значение должно быть '+(issue.inclusive?'не меньше ':'больше ')+issue.minimum+'.';
   if(issue.code==='too_big')return 'Проверьте '+field+': максимум '+issue.maximum+'.';
   return 'Проверьте '+field+': укажите корректное значение.';
  }))].join(' ');
 }
 return error instanceof Error?error.message:'Проверьте параметры строки.';
}
export function calculateProgram(rows:Record<string,unknown>[],p:Prices):AddressResult[]{
 if(rows.length>10000)throw new Error('В программе больше 10 000 строк. Разделите файл на части.');const charged=new Set<string>();const supplies=p.interior.find(r=>r.id==='supplies-basic');
 return rows.map((raw,i)=>{const input=normalizeRow(raw,p);try{if(!input.city||!input.address)throw new Error('Укажите город и адрес');if(input.density!==undefined&&(!Number.isFinite(input.density)||input.density<=0))throw Error('Плотность должна быть положительной, в г/м²');let calculation:Calculation;
 if(input.recipe){if(!recipes.recipes.some(r=>r.id===input.recipe))throw Error('Неизвестный рецепт изделия');if(input.recipe==='letters'&&input.letterHeight===undefined)throw Error('Укажите колонку высота буквы, в сантиметрах');calculation=calculateProduct({...initialProduct,...Object.fromEntries(Object.entries(input).filter(([,v])=>v!==undefined)),recipe:input.recipe},p);}else{const interior=!p.wide.some(r=>r.id===input.material)&&p.interior.some(r=>r.id===input.material);calculation=calculate({...initialOrder,...Object.fromEntries(Object.entries(input).filter(([,v])=>v!==undefined)),mode:interior?'interior':'wide'},p);}
 if(input.mount&&supplies&&!supplies.verify){const lines=calculation.lines.filter(l=>l.name!==supplies.name);const key=addressKey(input);if(!charged.has(key)){lines.push({name:supplies.name,unit:supplies.unit,quantity:1,rate:supplies.price,amount:supplies.price,group:'mount'});charged.add(key);}const net=round(lines.reduce((sum,l)=>sum+l.amount,0));calculation={...calculation,lines,...addVat(net,p.vatRate,calculation.order.vat)};}
 return {row:i+2,input,calculation,error:''};}catch(e){return {row:i+2,input,calculation:null,error:rowError(e)};}});
}
export function summarizeProgram(results:AddressResult[]){const valid=results.filter(r=>r.calculation);const groups=new Map<string,{city:string;address:string;items:number;rows:number[];mount:boolean;warehouse:boolean;weightKg:number|null;bubbleSquareMeters:number;vehicle:string;district:string;packing:Set<string>}>();
 for(const r of valid){const row=r.input,key=addressKey(row);let group=groups.get(key);if(!group){group={city:row.city,address:row.address,items:0,rows:[],mount:false,warehouse:!!row.warehouse,weightKg:0,bubbleSquareMeters:0,vehicle:'Легковой транспорт',district:districtFor(row.city)?.name||'Уточняется',packing:new Set()};groups.set(key,group);}group.items+=row.quantity;group.rows.push(r.row);group.mount ||= row.mount;group.warehouse ||= !!row.warehouse;
 const rateId=row.material;const density=row.density??(rateId==='banner-330'?330:rateId==='banner-440'?440:rateId==='cast-400'?400:rateId==='cast-510'||rateId==='frontlit-510'?510:null);const rigid=['pvc-film','pvc-direct','pavement','sign','letters'].includes(row.recipe||'')||['pvc-3','pvc-5','pvc-8','pvc-printed','acrylic-clear','acrylic-milk','composite','sign-lit','sign-unlit','sign-interior'].includes(rateId);
 const pack=packaging({width:row.width,height:row.height,quantity:row.quantity,density,rigid});group.weightKg=group.weightKg===null||pack.weightKg===null?null:round(group.weightKg+pack.weightKg);if(pack.vehicle==='Газель')group.vehicle='Газель';const shape=[rateId,row.recipe,row.width,row.height].join('|');if(!group.packing.has(shape)){group.packing.add(shape);group.bubbleSquareMeters=round(group.bubbleSquareMeters+pack.bubbleSquareMeters);}}
 const shipments=Array.from(groups.values()).map(({packing,...group})=>({...group,tapeMeters:2,deliveryOnRequest:group.weightKg===null||group.weightKg>=500}));const byCity=new Map<string,{mount:number;warehouse:number}>();for(const g of shipments){if(!g.mount)continue;const count=byCity.get(g.city)||{mount:0,warehouse:0};if(g.warehouse)count.warehouse++;else count.mount++;byCity.set(g.city,count);}
 return {shipments,shipmentCount:shipments.length,items:shipments.reduce((s,g)=>s+g.items,0),visits:Array.from(byCity.values()).reduce((s,c)=>s+Math.ceil(c.mount/3)+c.warehouse,0),net:round(valid.reduce((s,r)=>s+r.calculation!.net,0)),total:round(valid.reduce((s,r)=>s+r.calculation!.total,0))};
}
