import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { countries } from "npm:countries-list";

const ALLOWED_ORIGIN="https://ranovaprimeent.github.io";
const GOOGLE_KEY=Deno.env.get("GOOGLE_MAPS_API_KEY")||"";

function headers(origin:string|null){
  const allow=origin===ALLOWED_ORIGIN||origin?.startsWith("http://localhost")?origin:ALLOWED_ORIGIN;
  return {
    "Content-Type":"application/json",
    "Access-Control-Allow-Origin":allow||ALLOWED_ORIGIN,
    "Access-Control-Allow-Headers":"content-type,x-ranova-client",
    "Access-Control-Allow-Methods":"POST,OPTIONS"
  };
}
function response(h:Record<string,string>,status:number,payload:any){
  return new Response(JSON.stringify(payload),{status,headers:h});
}
function listCountries(){
  return Object.entries(countries)
    .map(([code,v]:any)=>({code,name:v.name}))
    .sort((a:any,b:any)=>a.name.localeCompare(b.name));
}
function validCode(v:any){
  const code=String(v||"").trim().toUpperCase();
  return /^[A-Z]{2}$/.test(code)&&!!(countries as any)[code]?code:"";
}
async function googleResolve(address:string){
  if(!GOOGLE_KEY)return null;
  const u=new URL("https://maps.googleapis.com/maps/api/geocode/json");
  u.searchParams.set("address",address);
  u.searchParams.set("key",GOOGLE_KEY);
  const r=await fetch(u.toString());
  if(!r.ok)throw new Error("Google country lookup failed.");
  const j=await r.json();
  if(j.status!=="OK"||!Array.isArray(j.results)||!j.results.length)return null;
  const result=j.results[0];
  const part=(result.address_components||[]).find((x:any)=>Array.isArray(x.types)&&x.types.includes("country"));
  if(!part)return null;
  const code=validCode(part.short_name);
  if(!code)return null;
  return {
    code,
    name:part.long_name||(countries as any)[code]?.name||code,
    place_id:result.place_id||null,
    formatted_address:result.formatted_address||address,
    source:"google_geocoding"
  };
}
Deno.serve(async(req:Request)=>{
  const h=headers(req.headers.get("origin"));
  if(req.method==="OPTIONS")return new Response(null,{status:204,headers:h});
  if(req.method!=="POST")return response(h,405,{ok:false,error:"Method not allowed"});
  if(req.headers.get("x-ranova-client")!=="ranova-site-v1")return response(h,403,{ok:false,error:"Invalid client"});
  let b:any={};
  try{b=await req.json()}catch{}
  const action=String(b.action||"countries");

  try{
    if(action==="countries"){
      return response(h,200,{ok:true,countries:listCountries(),google_available:!!GOOGLE_KEY});
    }
    if(action==="resolve_address_country"){
      const address=String(b.address||"").trim().slice(0,500);
      const selected=validCode(b.country_code);
      if(!address&&!selected)return response(h,400,{ok:false,error:"Choose a country or enter an address."});
      if(address&&GOOGLE_KEY){
        const resolved=await googleResolve(address);
        if(resolved)return response(h,200,{ok:true,country:resolved,google_available:true});
      }
      if(selected){
        return response(h,200,{ok:true,country:{
          code:selected,
          name:(countries as any)[selected]?.name||selected,
          place_id:null,
          formatted_address:address||null,
          source:"selected_country"
        },google_available:!!GOOGLE_KEY});
      }
      return response(h,400,{ok:false,error:"Google could not determine the country. Please select it manually.",google_available:!!GOOGLE_KEY});
    }
    return response(h,400,{ok:false,error:"Unknown action."});
  }catch(e){
    console.error(e);
    return response(h,500,{ok:false,error:"Country lookup could not be completed.",google_available:!!GOOGLE_KEY});
  }
});