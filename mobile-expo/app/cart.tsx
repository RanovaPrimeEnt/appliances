import { useCallback, useEffect, useState } from 'react';
import { useFocusEffect, router } from 'expo-router';
import { ActivityIndicator, Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getCartRows, putCartItem } from '../src/cart';
import { supabase } from '../src/auth';

type Product={id:string;name:string;price:number|null;currency:string|null;primary_image_url:string|null;store_id:string;moq:number|null};
type Entry={product:Product;quantity:number};
export default function Cart(){
 const [items,setItems]=useState<Entry[]>([]);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState('');
 const load=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const rows=await getCartRows();
   const quantities=new Map<string,number>();
   rows.forEach(r=>Object.entries(r.items).forEach(([id,q])=>quantities.set(id,Number(q))));
   if(!quantities.size){setItems([]);return;}
   const {data,error:err}=await supabase.from('ranova_seller_products')
    .select('id,name,price,currency,primary_image_url,store_id,moq')
    .in('id',Array.from(quantities.keys()));
   if(err)throw err;
   setItems(((data||[]) as Product[]).map(product=>({product,quantity:quantities.get(product.id)||1})));
  }catch(e){setError(e instanceof Error?e.message:'Unable to load cart');}
  finally{setLoading(false);}
 },[]);
 useFocusEffect(useCallback(()=>{void load();},[load]));
 async function change(entry:Entry,quantity:number){
  const {product}=entry;
  setBusy(product.id);
  try{await putCartItem(product.store_id,product.id,quantity);await load();}
  catch(e){Alert.alert('Cart update failed',e instanceof Error?e.message:'Please retry');}
  finally{setBusy('');}
 }
 const totals=new Map<string,number>();
 items.forEach(({product,quantity})=>{if(product.price!=null){const currency=product.currency||'GHS';totals.set(currency,(totals.get(currency)||0)+Number(product.price)*quantity);}});
 return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
  <Text style={styles.heading}>Your Cart</Text>
  {loading?<ActivityIndicator color="#FF7A00"/>:error?<><Text style={styles.error}>{error}</Text><Pressable onPress={()=>router.push('/account')}><Text style={styles.link}>Sign in or manage account</Text></Pressable><Pressable onPress={()=>void load()}><Text style={styles.link}>Retry</Text></Pressable></>:items.length===0?<Text>Your cart is empty. Browse products to get started.</Text>:<>
   {items.map(({product,quantity})=><View key={product.id} style={styles.item}>
    {product.primary_image_url?<Image source={{uri:product.primary_image_url}} style={styles.image}/>:null}
    <View style={{flex:1,gap:8}}><Text style={styles.name}>{product.name}</Text>
     <Text style={styles.price}>{product.price==null?'Ask for quote':(product.currency||'GHS')+' '+Number(product.price).toFixed(2)}</Text>
     <View style={styles.actions}>
      <Pressable disabled={busy===product.id||quantity<=Math.max(1,Number(product.moq)||1)} onPress={()=>void change({product,quantity},quantity-1)} style={styles.control}><Text>−</Text></Pressable>
      <Text>{quantity}</Text>
      <Pressable disabled={busy===product.id} onPress={()=>void change({product,quantity},quantity+1)} style={styles.control}><Text>+</Text></Pressable>
      <Pressable disabled={busy===product.id} onPress={()=>void change({product,quantity},0)}><Text style={styles.remove}>Remove</Text></Pressable>
     </View>
    </View>
   </View>)}
   {Array.from(totals).map(([currency,total])=><Text key={currency} style={styles.total}>Subtotal ({currency}): {total.toFixed(2)}</Text>)}
   <Text style={styles.notice}>Checkout is not connected in this native version yet. No payment will be requested here.</Text>
  </>}
  <Pressable onPress={()=>router.replace('/')} style={styles.back}><Text style={styles.backText}>Continue shopping</Text></Pressable>
 </ScrollView>;
}
const styles=StyleSheet.create({page:{flex:1,backgroundColor:'#F8F7FC'},content:{padding:16,gap:15},heading:{fontSize:24,fontWeight:'900',color:'#183330'},item:{flexDirection:'row',backgroundColor:'#fff',padding:12,borderRadius:12,gap:12},image:{width:95,height:95},name:{fontWeight:'700',fontSize:15},price:{color:'#E85C26',fontWeight:'800'},actions:{flexDirection:'row',alignItems:'center',gap:12},control:{padding:8,backgroundColor:'#F0F0F0',borderRadius:8},remove:{color:'#A72B2B'},total:{fontSize:18,fontWeight:'800'},notice:{padding:12,backgroundColor:'#FFF0E5',color:'#65452D'},error:{color:'#A72B2B'},link:{color:'#176B61',fontWeight:'700'},back:{backgroundColor:'#183330',padding:14,borderRadius:10,alignItems:'center'},backText:{color:'#fff',fontWeight:'800'}});
