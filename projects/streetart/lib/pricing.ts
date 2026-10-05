import { z } from 'zod';
import defaultPrices from '@/data/prices.json';
const Rate=z.object({id:z.string(),name:z.string(),unit:z.string(),price:z.number().nonnegative(),verify:z.boolean(),source:z.string()}).passthrough();
export const PricesSchema=z.object({version:z.string(),effectiveDate:z.string(),currency:z.literal('RUB'),vatRate:z.number().min(0).max(1),minimumOrderTotal:z.number().min(15000).default(15000),retail_markup:z.number().positive(),retail_threshold:z.number().nonnegative().nullable(),retail_threshold_unit:z.enum(['area','subtotal']).nullable(),minimumArea:z.number().nonnegative().nullable(),deliveryRates:z.record(z.number().nonnegative()).nullable(),regionalCoefficients:z.record(z.number().positive()).nullable(),urgencyCoefficients:z.object({standard:z.number().positive(),urgent:z.number().positive().nullable(),overnight:z.number().positive().nullable()}),volumeDiscounts:z.array(z.object({minArea:z.number(),coefficient:z.number().positive()})).nullable(),installationVisit:z.number().nonnegative().nullable(),validityDays:z.number().int().positive().nullable(),priceApproval:z.boolean(),wide:z.array(Rate),interior:z.array(Rate),polygraphyMatrix:z.array(z.object({product:z.string(),format:z.string(),paper:z.string(),color:z.string(),quantity:z.number(),price:z.number().nonnegative()})).nullable(),featureFlags:z.object({heroVariant:z.string(),miniCalculatorVariant:z.string(),exitIntent:z.boolean()}),requirements:z.object({formats:z.array(z.string()),minimumDpi:z.number().positive().nullable(),bleedMm:z.number().nonnegative().nullable(),colorProfile:z.string().nullable()})}).passthrough();
export type Prices=z.infer<typeof PricesSchema>;
export const seedPrices=PricesSchema.parse(defaultPrices);
export function orderEligibility(net:number,prices:Prices=seedPrices){
 const minimum=typeof prices.minimumOrderTotal==='number'?Math.max(15000,prices.minimumOrderTotal):15000;
 const gross=round(net+round(net*prices.vatRate));
 return {minimum,gross,eligible:gross>=minimum,shortfall:round(Math.max(0,minimum-gross))};
}
export const OrderSchema=z.object({mode:z.enum(['wide','interior']),material:z.string().min(1),width:z.number().positive().max(10000),height:z.number().positive().max(10000),quantity:z.number().int().positive().max(100000),city:z.string().max(100),vat:z.boolean(),glue:z.boolean(),pocketMeters:z.number().min(0).max(10000),eyelets:z.number().int().min(0).max(10000),lamination:z.enum(['none','lamination','floor-lamination']),cut:z.enum(['none','cut','cut-weeding']),mount:z.boolean(),heightWork:z.boolean(),substrate:z.string(),print:z.string(),letterHeight:z.number().positive().max(10000),supplies:z.string(),lift:z.boolean(),urgency:z.enum(['standard','urgent','overnight'])});
export type Order=z.infer<typeof OrderSchema>;
export const initialOrder:Order={mode:'wide',material:'banner-330',width:6,height:3,quantity:1,city:'Екатеринбург',vat:true,glue:false,pocketMeters:0,eyelets:0,lamination:'none',cut:'none',mount:false,heightWork:false,substrate:'pvc-3',print:'uv',letterHeight:30,supplies:'none',lift:false,urgency:'standard'};
export const money=(n:number)=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:2}).format(n);
export const round=(v:number)=>Math.round((v+Number.EPSILON)*100)/100;
export function addVat(net:number,rate:number,enabled:boolean){const vat=enabled?round(net*rate):0;return {net:round(net),vat,total:round(net+vat)};}
export interface Line {name:string;unit:string;quantity:number;rate:number;amount:number;group:string}
export function calculate(orderInput:unknown,config:Prices=seedPrices){
 const o=OrderSchema.parse(orderInput), lines:Line[]=[],warnings:string[]=[];
 const all=[...config.wide,...config.interior];const rate=(id:string)=>{const item=all.find(x=>x.id===id);if(!item)throw new Error('Не найден тариф: '+id);return item;};
 const add=(id:string,quantity:number,group:string)=>{const t=rate(id);lines.push({name:t.name,unit:t.unit,quantity:round(quantity),rate:t.price,amount:round(t.price*quantity),group});if(t.verify)warnings.push('Тариф «'+t.name+'» нужно подтвердить у менеджера.');};
 const area=o.width*o.height*o.quantity,billable=(config.minimumArea===null?o.width*o.height:Math.max(o.width*o.height,config.minimumArea))*o.quantity;
 const selected=rate(o.material);
 if(o.mode==='wide'&&!config.wide.some(x=>x.id===o.material))throw new Error('Материал не относится к широкоформатной печати');
 if(o.mode==='interior'&&!config.interior.some(x=>x.id===o.material))throw new Error('Изделие не относится к интерьерному прайсу');
 if(o.mode==='wide')add(o.material,billable,'material');
 else if(o.material==='custom-panel'){throw new Error('Выберите материал основы');}
 else if(o.material==='uv'||o.material==='uv-white'){add(o.substrate,billable,'material');add(o.material,billable,'material');}
 else add(o.material,selected.unit==='см высоты'?o.letterHeight*o.quantity:selected.unit==='м²'?billable:selected.unit==='м.п.'?o.width*o.quantity:o.quantity,'material');
 const finishedUnit=selected.unit==='шт.'||selected.unit==='см высоты';
 if(!finishedUnit){if(o.glue)add('glue',2*(o.width+o.height)*o.quantity,'post');if(o.pocketMeters>0)add('glue',o.pocketMeters*o.quantity,'post');if(o.eyelets>0)add('eyelet',o.eyelets*o.quantity,'post');if(o.lamination!=='none')add(o.lamination,billable,'post');if(o.cut!=='none')add(o.cut,billable,'post');}
 if(o.mount){let id='mount-banner';if(o.mode==='interior')id=/film|orajet|perforated/.test(o.material)?'mount-film':/pvc|uv/.test(o.material)?'mount-pvc':'mount-sign';else if(/film|orajet/.test(o.material))id='mount-film';if(finishedUnit)warnings.push('Площадь монтажа готового изделия уточняется отдельно.');else add(id,area,'mount');if(o.heightWork)add('height-work',area,'mount');if(o.supplies!=='none')add(o.supplies,1,'mount');if(o.lift)add('lift',1,'mount');if(config.installationVisit===null)warnings.push('Выезд монтажной бригады и условия монтажа уточняются.');else lines.push({name:'Выезд монтажной бригады',unit:'выезд',quantity:1,rate:config.installationVisit,amount:config.installationVisit,group:'mount'});}
 let knownNet=round(lines.reduce((s,l)=>s+l.amount,0));const urgency=config.urgencyCoefficients[o.urgency];const regional=config.regionalCoefficients?.[o.city]??null;
 let coefficient=(urgency??1)*(regional??1);if(o.urgency!=='standard'&&urgency===null)warnings.push('Срочность: коэффициент требует подтверждения.');
 if(config.retail_threshold!==null){const v=config.retail_threshold_unit==='area'?billable:knownNet;if(v<config.retail_threshold)coefficient*=config.retail_markup;}
 const discount=config.volumeDiscounts?.filter(d=>d.minArea<=billable).sort((a,b)=>b.minArea-a.minArea)[0];if(discount)coefficient*=discount.coefficient;
 if(coefficient!==1)lines.push({name:'Корректировка по условиям заказа',unit:'заказ',quantity:1,rate:round(knownNet*(coefficient-1)),amount:round(knownNet*(coefficient-1)),group:'modifier'});
 const delivery=config.deliveryRates?.[o.city];if(delivery!==undefined)lines.push({name:'Доставка: '+o.city,unit:'заказ',quantity:1,rate:delivery,amount:delivery,group:'delivery'});else warnings.push('Доставка в '+o.city+' рассчитывается отдельно.');
 if(config.minimumArea===null)warnings.push('Минимальная тарифицируемая площадь ещё не утверждена.');
 if(o.city!=='Екатеринбург'&&regional===null&&o.mode==='interior')warnings.push('Интерьерный прайс относится к Екатеринбургу. Для другого города цена уточняется.');
 if(!config.priceApproval)warnings.push('Прайс для сайта ожидает утверждения.');
 knownNet=round(lines.reduce((s,l)=>s+l.amount,0));return {...addVat(knownNet,config.vatRate,o.vat),area:round(area),billableArea:round(billable),lines,warnings:[...new Set(warnings)],from:warnings.length>0,order:o,version:config.version,effectiveDate:config.effectiveDate};
}
export type Calculation=ReturnType<typeof calculate>;
export function quotePolygraphy(input:{product:string;format:string;paper:string;color:string;quantity:number},p:Prices){const row=p.polygraphyMatrix?.find(x=>Object.entries(input).every(([k,v])=>x[k as keyof typeof x]===v));return row?{...addVat(row.price,p.vatRate,true),unit:round(row.price/input.quantity)}:null;}
