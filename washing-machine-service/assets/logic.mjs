export const normalizeCode=value=>String(value||'').trim().toUpperCase().replace(/\s+/g,'');
export function replacementAdvice({age,repair,replacement,otherProblems=false}){
 age=Number(age);repair=Number(repair);replacement=Number(replacement);
 if(!Number.isFinite(age)||!Number.isFinite(repair)||!Number.isFinite(replacement)||age<0||age>40||repair<=0||replacement<=0||repair>1000000||replacement>3000000)throw new Error('Проверьте возраст и стоимость: значения должны быть положительными.');
 const ratio=repair/replacement,percent=Math.round(ratio*100);
 const level=ratio>=.65||otherProblems&&ratio>=.4?'replace':ratio<=.35&&!otherProblems?'repair':'compare';
 const titles={repair:'Ремонт стоит рассмотреть',compare:'Полезно сравнить две сметы',replace:'Внимательно оцените замену'};
 return {percent,level,title:titles[level],saving:replacement-repair,details:level==='repair'?'Бюджет ремонта составляет небольшую часть стоимости замены. Решение имеет смысл после подтверждения причины и состояния остальных узлов.':level==='replace'?'Доля расходов на ремонт велика или есть дополнительные неисправности. Сравните полный бюджет замены и получите второе мнение.':'Суммы недостаточно для уверенного выбора. Уточните состояние техники, доступность детали и окончательную стоимость.'};
}
export function estimateAdvice({labor,parts,extra,low,high,confirmed=false}){
 const values=[labor,parts,extra].map(Number);if(values.some(x=>!Number.isFinite(x)||x<0||x>1000000))throw new Error('Введите корректные суммы.');
 const total=values.reduce((a,b)=>a+b,0);if(total<=0)throw new Error('Укажите хотя бы одну сумму.');
 const level=total<low?'below':total>high?'above':'within';
 return {total,level,title:!confirmed?'Сначала подтвердите причину неисправности':level==='above'?'Уточните состав и сложность работ':level==='below'?'Проверьте, всё ли включено в цену':'Сумма в пределах расчётного сценария',questions:[...(!confirmed?['Какими проверками подтверждена неисправность?']:[]),...(Number(parts)===0?['Включена ли деталь в стоимость работы или оплачивается отдельно?']:[]),'Указаны ли точная деталь, её состояние и совместимость?','Изменится ли сумма после разборки и как это согласуют?','Как оплачивается диагностика при отказе от ремонта?','Какие документы и условия гарантии вы получите?']};
}
export function validPhone(value){return /^(7|8)\d{10}$/.test(String(value).replace(/\D/g,''));}
export function normalizePhone(value){const n=String(value).replace(/\D/g,'');return validPhone(n)?'7'+n.slice(1):null;}
