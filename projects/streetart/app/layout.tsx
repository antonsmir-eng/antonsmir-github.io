import type { Metadata,Viewport } from 'next';
import { Shell } from '@/components/shell';
import './globals.css';
export const metadata: Metadata = {
 metadataBase: new URL('https://streetart-print.mossy-seal-0693.chatgpt.site'),
 title: { default: 'StreetArt — печать и брендирование по всей России', template: '%s · StreetArt' },
 description: 'Рекламная печать, вывески и брендирование в каждом регионе России. Расчёт заказа, конструктор изделий и адресные программы.',
 icons: { icon: '/favicon.svg', shortcut: '/favicon.svg' }, robots: { index: false, follow: false },
};
export const viewport:Viewport={width:"device-width",initialScale:1,themeColor:"#faf8f5"};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>) {
 return <html lang="ru" suppressHydrationWarning><head><link rel="preload" href="/fonts/streetart-bold.woff" as="font" type="font/woff" crossOrigin="anonymous"/><link rel="preload" href="/fonts/streetart-regular.woff" as="font" type="font/woff" crossOrigin="anonymous"/><script dangerouslySetInnerHTML={{__html:"try{document.documentElement.dataset.theme=localStorage.getItem('streetart-theme')==='dark'?'dark':'light'}catch{document.documentElement.dataset.theme='light'}"}}/></head><body><script type="application/ld+json" dangerouslySetInnerHTML={{__html:JSON.stringify({"@context":"https://schema.org","@type":"Organization",name:"StreetArt",foundingDate:"2020-07-28",founder:{"@type":"Person",name:"Андрей Показаньев"},url:"https://streetart-print.mossy-seal-0693.chatgpt.site",logo:"https://streetart-print.mossy-seal-0693.chatgpt.site/assets/logo.svg"})}}/><Shell>{children}</Shell></body></html>;
}
