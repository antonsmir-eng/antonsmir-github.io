"use client";
import {useId,useRef,useState} from 'react';
import {Input} from '@/components/ui/input';
import {Textarea} from '@/components/ui/textarea';
import {usePrices} from '@/lib/use-prices';
import {orderEligibility,money} from '@/lib/pricing';

export function LeadForm({source,calculation,files=[]}:{source:string;calculation?:unknown;files?:{name:string;size:number}[]}){
 const {prices}=usePrices();const minimum=orderEligibility(0,prices).minimum;
 const [message,setMessage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const contactInput=useRef<HTMLInputElement>(null),errorId=useId();
 async function submit(e:React.FormEvent<HTMLFormElement>){
  e.preventDefault();const form=new FormData(e.currentTarget),contact=String(form.get('contact')||'').trim();
  setMessage('');
  if(!contact){setError('Укажите телефон или электронную почту.');contactInput.current?.focus();return;}
  const budget=Number(form.get('budget'));if(!Number.isFinite(budget)||budget<minimum){setMessage('Минимальный бюджет проекта — '+money(minimum)+' с НДС.');return;}
  setError('');setBusy(true);
  try{
   const draft={type:'StreetArt — черновик заявки',createdAt:new Date().toISOString(),source,budget,budgetBasis:'withVAT',name:form.get('name'),contact,comment:form.get('comment'),calculation,files:files.map(f=>({...f,note:'Исходный файл остаётся на устройстве. В заявке только имя и размер.'}))};
   const description=[String(draft.name||''),contact,String(draft.comment||''),calculation?'Расчёт: '+(JSON.stringify(calculation).length<=2500?JSON.stringify(calculation):'Подробная смета подготовлена отдельно. Приложите скачанный расчёт к заявке в кабинете.'):'',...files.map(f=>'Файл на устройстве: '+f.name)].filter(Boolean).join('\n');
   if(description.length>6000){setMessage('Описание и расчёт превышают объём заявки. Скачайте подробный расчёт и приложите его в кабинете; сократите комментарий.');return;}
   sessionStorage.setItem('streetart-inquiry',JSON.stringify({title:source.slice(0,160),product:'',material:'',city:'',address:'',width:0,height:0,quantity:1,budget,description,deadline:'',montage:false,delivery:false}));
   window.location.assign('/account?view=new&import=inquiry');
  }catch{setMessage('Не удалось перенести заявку. Разрешите хранение данных в браузере и повторите попытку.');}
  finally{setBusy(false);}
 }
 return <form className="lead-form" onSubmit={submit} aria-busy={busy}>
  <label className="field"><span>Ваше имя</span><Input name="name" autoComplete="name" className="input-control" placeholder="Как к вам обращаться…" maxLength={120}/></label>
  <label className="field"><span>Телефон или электронная почта *</span><Input ref={contactInput} name="contact" autoComplete="off" spellCheck={false} required className="input-control" placeholder="+7 или name@company.ru…" maxLength={160} aria-invalid={!!error} aria-describedby={error?errorId:undefined} onChange={()=>{if(error)setError('');}}/>{error&&<span id={errorId} className="status-error" role="alert">{error}</span>}</label>
  <label className="field"><span>Бюджет проекта с НДС, ₽ *</span><Input name="budget" type="number" inputMode="numeric" min={minimum} max={1000000000} step="0.01" defaultValue={minimum} required className="input-control"/><small>Минимальный заказ — {money(minimum)} с НДС.</small></label>
  <label className="field"><span>Задача или комментарий</span><Textarea name="comment" autoComplete="off" className="input-control" placeholder="Что печатаем и к какой дате…" maxLength={3000}/></label>
  <button className="btn" type="submit" disabled={busy}>{busy?'Переходим в кабинет…':'Продолжить в кабинете'}</button>
  {calculation!==undefined&&<button className="btn btn-outline" type="button" onClick={async()=>{try{const {downloadBlob}=await import('@/lib/exports');downloadBlob(new Blob([JSON.stringify(calculation,null,2)],{type:'application/json'}),'StreetArt_calculation.json');setMessage('Расчёт скачан. После создания заявки приложите его в кабинете.');}catch{setMessage('Не удалось скачать расчёт. Повторите попытку.');}}}>Скачать полный расчёт</button>}
  {message&&<p role="status" className="notice">{message}</p>}
  <p className="small muted">После входа сохраните заявку в кабинете. Файлы прикладываются там отдельно. До сохранения данные остаются в этой вкладке.</p>
 </form>;
}
