"use client";
import Link from 'next/link';
import {usePathname} from 'next/navigation';
import {useEffect,useState} from 'react';
import {Menu,Moon,Sun,X,MessageSquare,UserRound} from 'lucide-react';
import {Toaster} from '@/components/ui/sonner';
import {Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {Sheet,SheetTrigger,SheetContent,SheetHeader,SheetTitle,SheetDescription,SheetClose} from '@/components/ui/sheet';
import {LeadForm} from '@/components/lead-form';

const links=[['/catalog','Продукция'],['/calculator','Калькулятор'],['/services','Услуги'],['/cases','Кейсы'],['/blog','Блог'],['/contacts','Контакты']];
const secondaryLinks=[['/how-to-order','Как заказать'],['/pricing','Стоимость'],['/delivery','Доставка'],['/payment','Оплата'],['/downloads','Шаблоны'],['/faq','Вопросы']];
const mobileLinks=[...links,...secondaryLinks,['/federal','Федеральные кампании'],['/about','О компании'],['/quality','Контроль качества'],['/for-agencies','Агентствам'],['/brief','Бриф проекта'],['/account','Личный кабинет'],['/projects','Черновики на устройстве'],['/tenders','Тендеры и закупки'],['/requirements','Проверка макета'],['/knowledge','База знаний']];
export function Shell({children}:{children:React.ReactNode}){
 const [dark,setDark]=useState(false),[menu,setMenu]=useState(false),[contact,setContact]=useState(false);
 const pathname=usePathname();
 useEffect(()=>{setDark(document.documentElement.dataset.theme==='dark');},[]);
 useEffect(()=>setMenu(false),[pathname]);
 function theme(){
  const next=!dark;setDark(next);document.documentElement.dataset.theme=next?'dark':'light';
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',next?'#212323':'#faf8f5');
  try{localStorage.setItem('streetart-theme',next?'dark':'light');}catch{}
 }
 const active=(url:string)=>pathname===url||pathname.startsWith(url+'/');
 return <>
  <a href="#main" className="skip-link">Перейти к содержанию</a>
  <header className="header"><div className="container header-inner">
   <Link className="brand" href="/" aria-label="StreetArt — главная"><img src="/assets/logo.svg" alt="StreetArt" width="225" height="65" translate="no"/></Link>
   <nav className="desktop-nav" aria-label="Основная навигация">{links.map(([url,title])=><Link aria-current={active(url)?'page':undefined} key={url} href={url}>{title}</Link>)}</nav>
   <div className="header-actions">
    <button className="icon-button" onClick={theme} aria-label={dark?'Светлая тема':'Тёмная тема'}>{dark?<Sun size={19} aria-hidden="true"/>:<Moon size={19} aria-hidden="true"/>}</button>
    <Link className="btn btn-small header-project" href="/account?view=new">Создать заявку</Link>
    <Link className="btn btn-outline btn-small header-account" href="/account" aria-label="Личный кабинет"><UserRound size={19} aria-hidden="true"/><span>Личный кабинет</span></Link>
    <Sheet open={menu} onOpenChange={setMenu}><SheetTrigger asChild><button className="icon-button mobile-toggle" aria-label="Открыть меню"><Menu aria-hidden="true"/></button></SheetTrigger><SheetContent className="mobile-menu" showCloseButton={false}>
     <SheetHeader><SheetTitle>Меню StreetArt</SheetTitle><SheetDescription className="sr-only">Разделы сайта</SheetDescription><SheetClose asChild><button className="icon-button menu-close" aria-label="Закрыть меню"><X aria-hidden="true"/></button></SheetClose></SheetHeader>
     <nav className="mobile-nav" aria-label="Мобильная навигация">{mobileLinks.map(([url,title])=><Link href={url} aria-current={active(url)?'page':undefined} onClick={()=>setMenu(false)} key={url}>{title}</Link>)}</nav>
    </SheetContent></Sheet>
   </div>
  </div><nav className="secondary-nav" aria-label="Условия заказа"><div className="container">{secondaryLinks.map(([url,title])=><Link key={url} href={url} aria-current={active(url)?"page":undefined}>{title}</Link>)}</div></nav></header>
  <main id="main" tabIndex={-1}>{children}</main>
  <footer className="footer"><div className="container"><div className="footer-top">
   <div><Link className="footer-brand" href="/" aria-label="StreetArt — главная"><img src="/assets/logo.svg" alt="StreetArt" width="225" height="65" loading="lazy"/></Link><p>Большие задачи.<br/>Один производственный партнёр.</p></div>
   <div><b>Ваш проект</b><Link href="/catalog">Каталог продукции</Link><Link href="/calculator">Рассчитать стоимость</Link><Link href="/federal">Федеральная кампания</Link><Link href="/brief">Бриф проекта</Link><Link href="/account">Личный кабинет</Link><Link href="/projects">Черновики на устройстве</Link></div>
   <div><b>Полезное</b><Link href="/services">Все услуги</Link><Link href="/blog">Блог</Link><Link href="/how-to-order">Как заказать</Link><Link href="/pricing">Стоимость</Link><Link href="/payment">Оплата</Link><Link href="/downloads">Шаблоны</Link><Link href="/faq">Вопросы и ответы</Link><Link href="/requirements">Требования к макетам</Link><Link href="/delivery">Доставка и география</Link><Link href="/knowledge">База знаний</Link><Link href="/contacts">Контакты</Link></div>
   <div><b>Связаться</b><a href="tel:88003023991">8 (800) 302-39-91</a><a href="mailto:hello@str-art.ru">hello@str-art.ru</a><span>Екатеринбург, Луначарского 240, к. 1</span><small>Данные сайта 2022 года.<br/>Актуальность контактов уточняется.</small></div>
  </div><div className="footer-bottom"><span>© StreetArt, 2020–{new Date().getFullYear()}</span><Link href="/privacy">Обработка персональных данных</Link><Link href="/offer">Условия заказа</Link><span>Юридические реквизиты уточняются</span></div></div></footer>
  {pathname!=='/account'&&<button className="floating-contact" onClick={()=>setContact(true)} aria-label="Подготовить заявку"><MessageSquare size={22} aria-hidden="true"/></button>}
  <Dialog open={contact} onOpenChange={setContact}><DialogContent><DialogHeader><DialogTitle>Ваш проект</DialogTitle><DialogDescription>Опишите задачу и продолжите оформление в личном кабинете.</DialogDescription></DialogHeader><LeadForm source="Обсудить проект"/></DialogContent></Dialog>
  <Toaster richColors position="top-center"/>
 </>;
}
