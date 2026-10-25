const URL_BASE='https://igaerssbzobutlwvjfwt.supabase.co';
const PUBLIC_KEY='sb_publishable_NMzJFpXOIJMEH3LW50Cs9g_Otc6tlYr';
export type CatalogueProduct={id:string;name:string;brand:string|null;price:number|null;currency:string;image_url:string|null;images:string[];description?:string|null;details?:Record<string,unknown>};
type RawProduct=Record<string,unknown>&{id:string;name:string;brand?:string|null;price?:number|string|null;currency?:string|null;product_images?:{image_url:string;sort_order?:number;is_primary?:boolean}[]|null};
const headers={apikey:PUBLIC_KEY,Authorization:'Bearer '+PUBLIC_KEY};
async function request(path:string):Promise<RawProduct[]>{
 const response=await fetch(URL_BASE+'/rest/v1/'+path,{headers});
 if(!response.ok)throw new Error('Catalogue request failed ('+response.status+').');
 return response.json();
}
function normalize(p:RawProduct):CatalogueProduct{
 const images=(p.product_images||[]).slice().sort((a,b)=>Number(Boolean(b.is_primary))-Number(Boolean(a.is_primary))||Number(a.sort_order||0)-Number(b.sort_order||0)).map(i=>i.image_url).filter(Boolean);
 const description=typeof p.description==='string'?p.description:null;
 return {id:p.id,name:p.name,brand:p.brand||null,price:p.price==null?null:Number(p.price),currency:p.currency||'GHS',image_url:images[0]||null,images,description,details:p};
}
const PAGE_SIZE=30;
export async function getCataloguePage(page=0):Promise<CatalogueProduct[]>{
 const from=page*PAGE_SIZE;
 const rows=await request('products?select=id,name,brand,price,currency,product_images(image_url,sort_order,is_primary)&active=eq.true&order=created_at.desc&offset='+from+'&limit='+PAGE_SIZE);
 return rows.map(normalize);
}
export async function getCatalogue():Promise<CatalogueProduct[]>{return getCataloguePage(0);}
export async function getProduct(id:string):Promise<CatalogueProduct|null>{
 const rows=await request('products?select=*,product_images(image_url,sort_order,is_primary)&id=eq.'+encodeURIComponent(id)+'&active=eq.true&limit=1');
 return rows.length?normalize(rows[0]):null;
}
export const CATALOGUE_PAGE_SIZE=PAGE_SIZE;
