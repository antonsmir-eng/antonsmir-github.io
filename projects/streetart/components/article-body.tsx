import type {ReactNode} from 'react';
function inline(text:string){return text.split(/(https:\/\/[^\s]+)/g).map((x,i)=>x.startsWith('https://')?<a key={i} href={x} target="_blank" rel="noopener noreferrer">Источник</a>:x);}
export function ArticleBody({body}:{body:string}){
 const blocks:ReactNode[]=[];let paragraph:string[]=[],items:string[]=[];
 function flush(){if(paragraph.length){blocks.push(<p key={blocks.length}>{inline(paragraph.join(' '))}</p>);paragraph=[];}if(items.length){blocks.push(<ul key={blocks.length}>{items.map((x,i)=><li key={i}>{inline(x)}</li>)}</ul>);items=[];}}
 for(const raw of body.split('\n')){const line=raw.trim();if(!line){flush();continue;}if(line.startsWith('## ')){flush();blocks.push(<h2 key={blocks.length}>{line.slice(3)}</h2>);}else if(line.startsWith('- ')){if(paragraph.length)flush();items.push(line.slice(2));}else{if(items.length)flush();paragraph.push(line);}}
 flush();return <article className="article-body">{blocks}</article>;
}
