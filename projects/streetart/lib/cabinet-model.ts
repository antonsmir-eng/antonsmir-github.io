import {z} from 'zod';
export const MINIMUM_KOPECKS=1500000;
export const statuses={draft:'Черновик',submitted:'Заявка получена',estimating:'Готовим смету',awaiting_approval:'На согласовании',awaiting_payment:'Ожидает оплаты',paid:'Оплачен',production:'В производстве',ready:'Готов к отгрузке',shipped:'Отгружен',completed:'Завершён',canceled:'Отменён'} as const;
export type OrderStatus=keyof typeof statuses;
export const transitions:Record<OrderStatus,OrderStatus[]>={draft:['submitted','canceled'],submitted:['estimating','canceled'],estimating:['awaiting_approval','canceled'],awaiting_approval:['estimating','awaiting_payment','canceled'],awaiting_payment:['paid','canceled'],paid:['production'],production:['ready'],ready:['shipped','completed'],shipped:['completed'],completed:[],canceled:[]};
export const progressStatuses:OrderStatus[]=['submitted','estimating','awaiting_approval','awaiting_payment','paid','production','ready','shipped','completed'];
const text=(max:number)=>z.string().trim().max(max,'Слишком длинное значение');
export const PasswordSchema=z.string().min(12,'Пароль должен содержать не менее 12 символов').max(128,'Пароль слишком длинный');
export const RequestSchema=z.object({
 title:text(160).min(3,'Укажите название проекта'),product:text(200).default(''),material:text(200).default(''),city:text(120).default(''),address:text(400).default(''),
 width:z.number().finite().min(0).max(100).default(0),height:z.number().finite().min(0).max(100).default(0),quantity:z.number().int('Тираж — целое число').min(1).max(10000000).default(1),
 budget:z.number().finite().min(0).max(1000000000),description:text(6000).default(''),deadline:text(10).default(''),montage:z.boolean().default(false),delivery:z.boolean().default(true)
});
export const CompanySchema=z.object({name:text(200).min(2,'Укажите получателя'),inn:z.string().regex(/^(\d{10}|\d{12})$/,'ИНН — 10 или 12 цифр'),kpp:z.string().regex(/^(\d{9})?$/,'КПП — 9 цифр'),address:text(400).min(3),bank:text(200).min(2),bik:z.string().regex(/^\d{9}$/,'БИК — 9 цифр'),account:z.string().regex(/^\d{20}$/,'Расчётный счёт — 20 цифр'),correspondent:z.string().regex(/^\d{20}$/,'Корреспондентский счёт — 20 цифр')});
export type OrderInput=z.infer<typeof RequestSchema>;
export type Company=z.infer<typeof CompanySchema>;
export type CabinetUser={id:string;email:string;role:'customer'|'admin';name:string;phone:string;company:string;inn:string;address:string;mustChangePassword:boolean};
export type CabinetOrder={id:string;number:string;userId:string;customerName:string;customerEmail:string;title:string;details:OrderInput;status:OrderStatus;budget:number;quote:number|null;quoteNote:string;paymentStatus:string;version:number;createdAt:number;updatedAt:number};
export type CabinetEvent={id:string;title:string;note:string;actorName:string;createdAt:number};
export type CabinetFile={id:string;name:string;size:number;createdAt:number};
export type CabinetPayment={id:string;amount:number;provider:string;status:string;reference:string;createdAt:number};
export type OrderDetail={order:CabinetOrder;events:CabinetEvent[];files:CabinetFile[];payments:CabinetPayment[]};
export type CabinetConfig={paymentMode:'disabled'|'test'|'live';bankReady:boolean;minimumOrder:number};
export const rubles=(kopecks:number)=>new Intl.NumberFormat('ru-RU',{style:'currency',currency:'RUB',maximumFractionDigits:2}).format(kopecks/100);
export const when=(ms:number)=>new Intl.DateTimeFormat('ru-RU',{dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Moscow'}).format(ms);
