import catalog from '@/data/catalog.json';
const products=catalog.products;
import {cases,industries,categories} from '@/data/content';
import {constructions} from '@/lib/production';
import {marketingRoutes} from '@/data/marketing';
import {publicArticles} from '@/lib/blog-store';
export async function GET(){const articles=await publicArticles();const origin='https://streetart-print.mossy-seal-0693.chatgpt.site';const paths=[...new Set([...marketingRoutes,'blog',...articles.map(a=>'blog/'+a.slug),'knowledge/banner','knowledge/artwork','knowledge/federal','knowledge/fire','','catalog','calculator','federal','cases','industries','tenders','requirements','about','contacts','delivery','knowledge','brief','projects','catalog/structures',...constructions.types.map(t=>'catalog/structures/'+t.id),...products.map(p=>'catalog/'+p.slug),...categories.map(c=>'catalog/'+c.path),...cases.map(c=>'cases/'+c.slug),...industries.map(i=>'industries/'+i.slug)])];return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+paths.map(p=>'<url><loc>'+origin+'/'+p+'</loc></url>').join('')+'</urlset>',{headers:{'Content-Type':'application/xml'}});}
