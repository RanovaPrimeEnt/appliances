import { supabase } from './auth';

export type CartRow={store_id:string;items:Record<string,number>};
async function buyerId(){
 const {data,error}=await supabase.auth.getUser();
 if(error)throw error;
 if(!data.user)throw new Error('Please sign in to use your cart.');
 return data.user.id;
}
export async function getCartRows():Promise<CartRow[]>{
 const user_id=await buyerId();
 const {data,error}=await supabase.from('ranova_buyer_carts').select('store_id,items').eq('user_id',user_id);
 if(error)throw error;
 return (data||[]).map(r=>({store_id:r.store_id,items:r.items||{}}));
}
export async function putCartItem(store_id:string,product_id:string,quantity:number){
 const user_id=await buyerId();
 const {data,error}=await supabase.from('ranova_buyer_carts').select('items').eq('user_id',user_id).eq('store_id',store_id).maybeSingle();
 if(error)throw error;
 const items:Record<string,number>={...(data?.items||{})};
 if(quantity>0)items[product_id]=quantity;else delete items[product_id];
 if(Object.keys(items).length===0){
  const result=await supabase.from('ranova_buyer_carts').delete().eq('user_id',user_id).eq('store_id',store_id);
  if(result.error)throw result.error;
 }else{
  const result=await supabase.from('ranova_buyer_carts').upsert({user_id,store_id,items,updated_at:new Date().toISOString()},{onConflict:'user_id,store_id'});
  if(result.error)throw result.error;
 }
}
