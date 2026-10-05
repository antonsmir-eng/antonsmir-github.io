import type {Metadata} from 'next';
import {Cabinet} from '@/components/cabinet';
export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Личный кабинет StreetArt',description:'Заявки, заказы, сметы и оплата StreetArt.',robots:{index:false,follow:false},alternates:{canonical:'/account'}};
export default function Account(){return <Cabinet/>;}
