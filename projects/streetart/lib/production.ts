import {z} from 'zod';
import {addVat,initialOrder,round,type Prices,type Line,type Calculation} from './pricing';
import recipeData from '@/data/recipes.json';
import regionData from '@/data/regions.json';
import constructionData from '@/data/catalog.json';
import claimData from '@/data/claims.json';

export const FormatsSchema=z.array(z.object({format:z.string(),width:z.number().positive(),height:z.number().positive(),material:z.string(),price:z.number().nonnegative()}));
export const TiersSchema=z.array(z.object({product:z.string(),min:z.number().int().positive(),max:z.number().int().positive(),observations:z.number().int().nonnegative(),price:z.number().nonnegative(),source:z.string()}));
export const RecipesSchema=z.object({version:z.string(),effectiveDate:z.string(),recipes:z.array(z.object({id:z.string(),name:z.string(),pending:z.array(z.string())})),packaging:z.object({tapeMetersPerShipment:z.number(),rollBubbleAreaMultiplier:z.number(),sheetBubbleAreaMultiplier:z.number(),ratesApproved:z.boolean()}),installation:z.object({dayPercentage:z.number(),nightPercentage:z.number(),percentageApproved:z.boolean(),addressesPerVisit:z.number().positive(),largeSheetSideMeters:z.number().positive()}),pvcThicknesses:z.array(z.number().positive())});
export const RegionsSchema=z.object({version:z.string(),effectiveDate:z.string(),approved:z.boolean(),districts:z.array(z.object({id:z.string(),name:z.string(),coefficient:z.number().positive(),cities:z.array(z.string())})),onRequest:z.array(z.string()),hubs:z.array(z.string()),missing:z.string()});
export const ConstructionsSchema=z.object({version:z.string(),effectiveDate:z.string(),source:z.string(),types:z.array(z.object({id:z.string(),name:z.string(),count:z.number().int(),variants:z.array(z.string()),recipe:z.string(),logoApproved:z.boolean()})),materialGroups:z.array(z.string()),products:z.array(z.object({name:z.string(),slug:z.string(),category:z.enum(['wide','poly','branding']),mode:z.enum(['wide','interior','poly']),rateId:z.string().nullable()}))});
export const ClaimsSchema=z.object({version:z.string(),effectiveDate:z.string(),claims:z.array(z.object({id:z.string(),text:z.string(),approved:z.boolean()}))});
export const claims=ClaimsSchema.parse(claimData);
export const recipes=RecipesSchema.parse(recipeData),regions=RegionsSchema.parse(regionData),constructions=ConstructionsSchema.parse(constructionData);
export function formatPrices(p:Prices){return FormatsSchema.parse(p.outdoorFormats??[]);}
export function polyTiers(p:Prices){return TiersSchema.parse(p.polygraphyTiers??[]);}
export const districtFor=(city:string)=>regions.districts.find(d=>d.cities.some(c=>c.toLocaleLowerCase('ru')===city.trim().toLocaleLowerCase('ru')));

export const ProductInputSchema=z.object({recipe:z.string(),width:z.number().positive().max(1000),height:z.number().positive().max(1000),quantity:z.number().int().positive().max(1000000),city:z.string().trim().min(1).max(100),vat:z.boolean(),thickness:z.number().positive().max(8),material:z.string(),laminate:z.boolean(),mount:z.boolean(),demount:z.boolean(),night:z.boolean(),letterHeight:z.number().positive().max(1000),addresses:z.number().int().positive().max(10000),eyeletStep:z.number().positive().max(10)});
export type ProductInput=z.infer<typeof ProductInputSchema>;
export const initialProduct:ProductInput={recipe:'pvc-film',width:1,height:.6,quantity:1,city:'Екатеринбург',vat:true,thickness:3,material:'sign-lit',laminate:true,mount:false,demount:false,night:false,letterHeight:30,addresses:1,eyeletStep:.2};
export type Estimate=Calculation&{title:string;pending:string[];configuration?:unknown;logistics?:ReturnType<typeof packaging>};
export function pvcThickness(value:number){const result=recipes.pvcThicknesses.find(x=>x>=value);if(!result)throw Error('Толщина ПВХ выше 8 мм: индивидуальный расчёт.');return result;}
export function packaging(input:{width:number;height:number;quantity:number;density:number|null;rigid:boolean;shipments?:number;addresses?:number;warehouse?:boolean}){
 const {width:w,height:h,quantity:n,density,rigid}=input;if(![w,h,n].every(x=>Number.isFinite(x)&&x>0)||!Number.isInteger(n)||density!==null&&(!Number.isFinite(density)||density<=0))throw Error('Проверьте размеры, количество и плотность.');
 const shipments=input.shipments??1,area=w*h;
 return {weightKg:density===null?null:round(area*n*density/1000),shipments,tapeMeters:recipes.packaging.tapeMetersPerShipment*shipments,bubbleSquareMeters:round(area*(rigid?recipes.packaging.sheetBubbleAreaMultiplier:recipes.packaging.rollBubbleAreaMultiplier)*shipments),vehicle:rigid&&Math.max(w,h)>recipes.installation.largeSheetSideMeters?'Газель':'Легковой транспорт',visits:input.warehouse?1:Math.ceil((input.addresses??1)/recipes.installation.addressesPerVisit),deliveryOnRequest:density===null||area*n*density/1000>=500};
}
function estimate(lines:Line[],pending:string[],warnings:string[],p:Prices,input:ProductInput,title:string):Estimate{
 const subtotal=round(lines.reduce((s,l)=>s+l.amount,0));
 if(p.retail_threshold!==null&&input.recipe!=='poly'){const basis=p.retail_threshold_unit==='area'?input.width*input.height*input.quantity:subtotal;if(basis<p.retail_threshold&&p.retail_markup!==1){const amount=round(subtotal*(p.retail_markup-1));lines.push({name:'Розничная корректировка',unit:'заказ',quantity:1,rate:amount,amount,group:'modifier'});}}
 const net=round(lines.reduce((s,l)=>s+l.amount,0));
 if(!p.priceApproval)warnings.push('Предварительный прайс. Итог требует подтверждения.');
 warnings.push('Доставка рассчитывается отдельно. Сроки согласуются по вашему заказу.');
 return {...addVat(net,p.vatRate,input.vat),area:round(input.width*input.height*input.quantity),billableArea:round(input.width*input.height*input.quantity),lines,warnings:[...new Set([...warnings,...pending.map(x=>'Уточнить: '+x)])],from:true,order:{...initialOrder,width:input.width,height:input.height,quantity:input.quantity,city:input.city,vat:input.vat,mode:'interior',material:input.material,letterHeight:input.letterHeight,mount:input.mount},version:p.version,effectiveDate:p.effectiveDate,title,pending,configuration:input};
}
export function calculateProduct(raw:unknown,p:Prices):Estimate{
 const o=ProductInputSchema.parse(raw),definition=recipes.recipes.find(x=>x.id===o.recipe);
 if(!definition)throw Error('Рецепт не найден.');
 if(o.recipe==='banner'&&!['frontlit-510','blackout-one','blackout-two'].includes(o.material))throw Error('Выберите материал баннера из рецепта');
 const lines:Line[]=[],pending=[...definition.pending],warnings:string[]=[];
 const S=o.width*o.height*o.quantity,P=2*(o.width+o.height)*o.quantity;
 const add=(id:string,q:number,group='material')=>{const r=p.interior.find(x=>x.id===id)||p.wide.find(x=>x.id===id);if(!r||r.verify){pending.push(r?.name||id);return;}lines.push({name:r.name,unit:r.unit,quantity:round(q),rate:r.price,amount:round(q*r.price),group});};
 let rigid=false,mountRate='mount-sign',removeRate='remove-sign';
 if(o.recipe==='pvc-film'||o.recipe==='pvc-direct'){
  rigid=true;const thickness=pvcThickness(o.thickness);add('pvc-'+thickness,S);add('uv-white',S);mountRate='mount-pvc';removeRate='remove-pvc';
  if(o.recipe==='pvc-film'){add('edge-cut',P,'post');add('application',S,'post');}
  if(o.laminate)add('lamination',S,'post');
  if(thickness!==o.thickness)warnings.push('Толщина '+o.thickness+' мм округлена вверх до '+thickness+' мм.');
 }else if(o.recipe==='film'){add('orajet-1440',S);add('edge-cut',P,'post');if(o.laminate)add('lamination',S,'post');mountRate='mount-film';removeRate='remove-film';}
 else if(o.recipe==='sticker'){add('uv',S);add('lamination',S,'post');add('cut',S,'post');mountRate='mount-film';removeRate='remove-film';}
 else if(o.recipe==='banner'){
  add(['frontlit-510','blackout-one','blackout-two'].includes(o.material)?o.material:'frontlit-510',S);add('edge-cut',P,'post');add('glue',P,'post');
  add('eyelet',Math.ceil((2*(o.width+o.height))/o.eyeletStep-1e-9)*o.quantity,'post');mountRate='mount-banner';removeRate='remove-banner';
 }else if(o.recipe==='fabric'){add('fabric',S);if(o.mount)pending.push('Монтаж тканевой вставки');}
 else if(o.recipe==='pavement'){add('pavement',o.quantity);add('poster',1.139*.595*2*o.quantity,'post');rigid=true;}
 else if(o.recipe==='rollup'){add(o.material==='x-stand'?'x-stand':'rollup',o.quantity);}
 else if(o.recipe==='letters'){add('letters',o.letterHeight*o.quantity);rigid=true;if(o.mount)pending.push('Площадь или процент монтажа световых букв');}
 else if(o.recipe==='sign'){const id=['sign-lit','sign-unlit','sign-letters','sign-interior','bracket-small'].includes(o.material)?o.material:'sign-lit';add(id,S);rigid=true;}
 else if(o.recipe==='poly'){pending.push('Перейдите в режим полиграфии и выберите продукт и тираж.');}
 if(o.mount&&!['fabric','letters','manual','poly','pavement','rollup'].includes(o.recipe))add(mountRate,S,'mount');
 if(o.mount&&['pavement','rollup'].includes(o.recipe))pending.push('Установка мобильной конструкции');
 if(o.demount){if(['manual','letters','fabric','pavement','rollup'].includes(o.recipe))pending.push('Демонтаж по условиям объекта');else add(removeRate,S,'mount');}
 if(o.mount){add('supplies-basic',o.addresses,'mount');pending.push('Выезд монтажной бригады');if(o.night)pending.push('Коэффициент ночного монтажа');}
 pending.push('Упаковочный скотч и воздушно-пузырчатая плёнка');
 const result=estimate(lines,[...new Set(pending)],warnings,p,o,definition.name);
 const density=o.recipe==='banner'?510:null;
 return {...result,logistics:packaging({width:o.width,height:o.height,quantity:o.quantity,density,rigid,addresses:o.addresses})};
}
export function calculateOutdoor(input:{material:string;width:number;height:number;quantity:number;city:string;vat:boolean},p:Prices):Estimate{
 const o=ProductInputSchema.parse({...initialProduct,...input,recipe:'banner'});
 const fixed=formatPrices(p).find(f=>f.material===input.material&&f.width===input.width&&f.height===input.height);
 const rate=p.wide.find(x=>x.id===input.material);if(!rate)throw Error('Материал не найден.');
 const q=fixed?input.quantity:input.width*input.height*input.quantity;
 const lines=[{name:fixed?rate.name+' '+input.width+' × '+input.height+' м':rate.name,unit:fixed?'шт.':'м²',quantity:round(q),rate:fixed?.price??rate.price,amount:round(q*(fixed?.price??rate.price)),group:'material'}];
 const warnings=fixed?[]:['Для сочетания формата и материала нет штучного тарифа. Рассчитано по площади.'];
 const district=districtFor(input.city);
 if(regions.onRequest.includes(input.city))warnings.push('Для этого города нужен индивидуальный расчёт.');
 else if(regions.approved&&district){const amount=round(lines[0].amount*(district.coefficient-1));lines.push({name:'Региональный пересчёт '+district.name,unit:'заказ',quantity:1,rate:amount,amount,group:'modifier'});}
 return estimate(lines,[],warnings,p,o,'Наружная реклама');
}
export const PolyInputSchema=z.object({product:z.string().min(1).max(200),quantity:z.number().int().min(1).max(10000000),city:z.string().trim().min(1).max(100),vat:z.boolean(),paper:z.string().max(500),color:z.string().max(20),density:z.number().positive().max(10000).nullable().optional()});
export function calculatePolygraphy(raw:z.input<typeof PolyInputSchema>,p:Prices):Estimate|null{
 const input=PolyInputSchema.parse(raw);
 const tier=polyTiers(p).find(t=>t.product===input.product&&input.quantity>=t.min&&input.quantity<=t.max);if(!tier)return null;
 const size=input.product.includes('А5')?[.148,.210]:input.product.includes('А6')?[.105,.148]:input.product.includes('А4')?[.210,.297]:null;
 const o={...initialProduct,recipe:'poly',width:size?.[0]??1,height:size?.[1]??1,quantity:input.quantity,city:input.city,vat:input.vat};
 const amount=round(tier.price*input.quantity);
 const result=estimate([{name:input.product+'; '+input.paper+'; '+input.color,unit:'шт.',quantity:input.quantity,rate:tier.price,amount,group:'material'}],[],['Ориентир по тиражу. Бумага, красочность и отделка не образуют утверждённую матрицу цен.',...(tier.observations<5?['Мало наблюдений: уточните стоимость у менеджера.']:[])],p,o,input.product);
 return {...result,area:size?result.area:0,billableArea:size?result.billableArea:0,configuration:input,...(size?{logistics:packaging({width:o.width,height:o.height,quantity:input.quantity,density:input.density??null,rigid:false})}:{})};
}
