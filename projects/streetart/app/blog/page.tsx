import {publicArticles} from '@/lib/blog-store';
import {BlogIndex} from '@/components/blog';
export const dynamic='force-dynamic';
export const metadata={title:'Блог StreetArt — печать, оформление и работа с заказами',description:'Практические статьи о макетах, материалах, бюджете, приёмке и федеральных программах.',alternates:{canonical:'/blog'}};
export default async function Blog(){return <BlogIndex articles={await publicArticles()}/>;}
