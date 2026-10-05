"use client";
import {useId} from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
export function Picker({label,value,onChange,options,id}:{label:string;value:string;onChange:(s:string)=>void;options:{id:string;name:string}[];id?:string}){
 const generatedId=useId();
 const fieldId=id||generatedId;
 return <div className="field"><label htmlFor={fieldId}>{label}</label><Select value={value} onValueChange={next=>{if(next&&options.some(option=>option.id===next))onChange(next);}}><SelectTrigger id={fieldId} className="input-control"><SelectValue/></SelectTrigger><SelectContent position="popper">{options.map(o=><SelectItem className="select-option" key={o.id} value={o.id}>{o.name}</SelectItem>)}</SelectContent></Select></div>;
}
export function NumberField({label,value,onChange,min=0.01,max=10000,step='any'}:{label:string;value:number;onChange:(n:number)=>void;min?:number;max?:number;step?:number|'any'}){
 return <label className="field"><span>{label}</span><Input className="input-control" name={label} type="number" inputMode={step===1?'numeric':'decimal'} autoComplete="off" min={min} max={max} step={step} value={Number.isNaN(value)?'':value} onChange={e=>onChange(e.target.value===''?NaN:Number(e.target.value))}/></label>;
}
export function Check({label,checked,onChange}:{label:string;checked:boolean;onChange:(v:boolean)=>void}){const id=useId();return <label className="check" htmlFor={id}><Checkbox id={id} checked={checked} onCheckedChange={v=>onChange(v===true)}/><span>{label}</span></label>;}
export function Placeholder({children}:{children:React.ReactNode}){return <p className="content-note placeholder">[PLACEHOLDER: {children}]</p>;}
