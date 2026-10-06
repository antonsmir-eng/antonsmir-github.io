import { SitePage } from '@/components/site-page';
import {faq} from '@/data/content';
import {publicArticles} from '@/lib/blog-store';
export default async function Home() { const articles=await publicArticles();return <><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify({'@context':'https://schema.org','@type':'FAQPage',mainEntity:faq.map(([name,text])=>({'@type':'Question',name,acceptedAnswer:{'@type':'Answer',text}}))})}}/><SitePage route="" blogArticles={articles.slice(0,3)} /></>; }
