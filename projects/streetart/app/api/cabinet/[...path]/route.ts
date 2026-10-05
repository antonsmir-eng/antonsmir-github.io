import {env} from 'cloudflare:workers';
import {handleCabinetRequest,type CabinetEnv} from '@/lib/cabinet-server';
export const dynamic='force-dynamic';
const handle=(request:Request)=>handleCabinetRequest(request,env as CabinetEnv);
export const GET=handle;
export const POST=handle;
export const PATCH=handle;
export const PUT=handle;
export const DELETE=handle;
