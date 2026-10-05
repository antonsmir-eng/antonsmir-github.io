import { SitePage } from '@/components/site-page';
import {faq} from '@/data/content';
export default function Home() { return <><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify({'@context':'https://schema.org','@type':'FAQPage',mainEntity:faq.map(([name,text])=>({'@type':'Question',name,acceptedAnswer:{'@type':'Answer',text}}))})}}/><SitePage route="" /></>; }
