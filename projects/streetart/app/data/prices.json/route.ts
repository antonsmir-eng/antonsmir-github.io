import {getPrices} from '@/lib/price-server';
export async function GET(){try{return Response.json(await getPrices(),{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({message:'Не удалось загрузить действующий прайс'},{status:503});}}
