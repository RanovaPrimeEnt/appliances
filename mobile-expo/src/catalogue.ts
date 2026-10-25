// The Supabase URL and publishable key are already public in rpe-v2/config.js.
// No service-role keys or private credentials belong in a mobile client.
const URL_BASE='https://igaerssbzobutlwvjfwt.supabase.co';
const PUBLIC_KEY='sb_publishable_NMzJFpXOIJMEH3LW50Cs9g_Otc6tlYr';
export type CatalogueProduct={id:string;name:string;brand:string|null;price:number|null;currency:string;image_url:string|null};
type RawProduct={id:string;name:string;brand:string|null;price:number|string|null;currency:string;product_images?:{image_url:string;sort_order:number;is_primary:boolean}[]|null};
export async function getCatalogue():Promise<CatalogueProduct[]>{
 const url=URL_BASE+'/rest/v1/products?select=id,name,brand,price,currency,product_images(image_url,sort_order,is_primary)&active=eq.true&order=created_at.desc&limit=60';
 const response=await fetch(url,{headers:{apikey:PUBLIC_KEY,Authorization:'Bearer '+PUBLIC_KEY}});
 if(!response.ok)throw new Error('Catalogue request failed ('+response.status+'). Check backend access and policies.');
 const rows=await response.json() as RawProduct[];
 return rows.map(p=>({id:p.id,name:p.name,brand:p.brand,price:p.price==null?null:Number(p.price),currency:p.currency||'GHS',image_url:(p.product_images||[]).slice().sort((a,b)=>Number(b.is_primary)-Number(a.is_primary)||a.sort_order-b.sort_order)[0]?.image_url||null}));
}
