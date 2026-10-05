'use client';
import {useEffect,useState} from 'react';
import {PricesSchema,seedPrices,type Prices} from './pricing';
import {FormatsSchema,TiersSchema} from './production';

export function validatePrices(value:unknown){const p=PricesSchema.parse(value);FormatsSchema.parse(p.outdoorFormats??[]);TiersSchema.parse(p.polygraphyTiers??[]);return p;}
export function localPriceOverride(){try{const value=localStorage.getItem('streetart-price-override');return value?validatePrices(JSON.parse(value)):null;}catch{return null;}}
export function setLocalPrices(p:unknown){localStorage.setItem('streetart-price-override',JSON.stringify(validatePrices(p)));window.dispatchEvent(new Event('streetart-prices'));}
export function resetLocalPrices(){localStorage.removeItem('streetart-price-override');window.dispatchEvent(new Event('streetart-prices'));}

let priceRequest:Promise<Prices>|undefined;
function loadPrices(){
 if(!priceRequest)priceRequest=fetch('/data/prices.json',{cache:'no-store'})
  .then(response=>{if(!response.ok)throw new Error('Прайс недоступен');return response.json();})
  .then(value=>PricesSchema.parse(value))
  .catch(error=>{priceRequest=undefined;throw error;});
 return priceRequest;
}
export function usePrices(){
 const [state,setState]=useState({prices:seedPrices,priceError:false});
 useEffect(()=>{let active=true;const refresh=()=>{const override=localPriceOverride();if(override){setState({prices:override,priceError:false});return;}loadPrices().then(prices=>{if(active)setState({prices:localPriceOverride()||prices,priceError:false});})
  .catch(()=>{if(active)setState({prices:seedPrices,priceError:true});});};refresh();window.addEventListener('streetart-prices',refresh);window.addEventListener('storage',refresh);
  return()=>{active=false;window.removeEventListener('streetart-prices',refresh);window.removeEventListener('storage',refresh);};
 },[]);
 return state;
}
