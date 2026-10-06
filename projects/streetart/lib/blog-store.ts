import {env} from 'cloudflare:workers';
import {mergeArticles,type BlogArticle} from '@/data/blog';
export async function publicArticles(){const db=(env as unknown as {DB?:D1Database}).DB;if(!db)return mergeArticles([]);const result=await db.prepare('SELECT slug,title,excerpt,category,body,status,published_at AS publishedAt,updated_at AS updatedAt FROM cabinet_articles').all<BlogArticle>();return mergeArticles(result.results);}
