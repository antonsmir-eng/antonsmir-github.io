'use client';
import {z} from 'zod';
const ProjectSchema=z.object({id:z.string(),title:z.string(),kind:z.enum(['calculation','brief']),date:z.string(),url:z.string().optional(),data:z.unknown()});
export type LocalProject=z.infer<typeof ProjectSchema>;
const key='streetart-projects-v2';
export function readProjects():LocalProject[]{try{return z.array(ProjectSchema).parse(JSON.parse(localStorage.getItem(key)||'[]'));}catch{return [];}}
export function saveProject(input:Omit<LocalProject,'id'|'date'>){const id=crypto.randomUUID?.()||'local-'+Date.now().toString(36)+'-'+Array.from(crypto.getRandomValues(new Uint32Array(2))).map(x=>x.toString(36)).join('');const project={...input,id,date:new Date().toISOString()};localStorage.setItem(key,JSON.stringify([project,...readProjects()].slice(0,50)));window.dispatchEvent(new Event('streetart-projects'));return project;}
export function removeProject(id:string){const previous=readProjects();localStorage.setItem(key,JSON.stringify(previous.filter(p=>p.id!==id)));window.dispatchEvent(new Event('streetart-projects'));return ()=>{const removed=previous.find(p=>p.id===id);const current=readProjects();localStorage.setItem(key,JSON.stringify(removed?[removed,...current.filter(p=>p.id!==id)].sort((a,b)=>b.date.localeCompare(a.date)):current));window.dispatchEvent(new Event('streetart-projects'));};}
