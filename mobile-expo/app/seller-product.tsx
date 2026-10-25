import { useEffect, useState } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { supabase } from '../src/auth';

type SellerProduct={
 id:string;name:string;category:string|null;description:string|null;short_description:string|null;
 price:number|null;currency:string|null;moq:number|null;stock_quantity:number|null;stock_status:string|null;
 primary_image_url:string|null;image_urls:string[]|null;specifications:Record<string,unknown>|null;
 store_id:string;ranova_seller_stores?:{store_name:string;business_location:string|null}|null;
};
function formatPrice(p:SellerProduct){
 if(p.price==null)return 'Ask for a quote';
 try{return new Intl.NumberFormat('en-GH',{style:'currency',currency:p.currency||'GHS'}).format(Number(p.price));}
 catch{return (p.currency||'GHS')+' '+p.price;}
}
export default function SellerProductDetails(){
 const {id}=useLocalSearchParams<{id:string}>();
 const [product,setProduct]=useState<SellerProduct|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 useEffect(()=>{
  let alive=true;
  async function load(){
   setLoading(true);setError('');
   const {data,error:err}=await supabase.from('ranova_seller_products')
    .select('id,name,category,description,short_description,price,currency,moq,stock_quantity,stock_status,primary_image_url,image_urls,specifications,store_id')
    .eq('id',id).eq('product_status','active').maybeSingle();
   if(!alive)return;
   if(err)setError(err.message);else setProduct(data as SellerProduct|null);
   setLoading(false);
  }
  if(id)void load();else{setError('Missing product ID');setLoading(false);}
  return()=>{alive=false;};
 },[id]);
 const images=product?Array.from(new Set([product.primary_image_url,...(Array.isArray(product.image_urls)?product.image_urls:[])].filter((v):v is string=>typeof v==='string'&&v.length>0))):[];
 return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
  {loading?<ActivityIndicator color="#FF7A00" size="large"/>:product?<>
   {images.length?<ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>{images.map(url=><Image key={url} source={{uri:url}} style={styles.photo} resizeMode="contain"/>)}</ScrollView>:<View style={styles.placeholder}><Text>No product image available</Text></View>}
   <Text style={styles.category}>{product.category||'Marketplace product'}</Text>
   <Text style={styles.name}>{product.name}</Text>
   <Text style={styles.price}>{formatPrice(product)}</Text>
   {product.moq!=null?<Text style={styles.detail}>Minimum order: {product.moq}</Text>:null}
   {product.stock_status?<Text style={styles.detail}>Availability: {product.stock_status}</Text>:null}
   {product.short_description?<Text style={styles.detail}>{product.short_description}</Text>:null}
   {product.description?<><Text style={styles.heading}>Description</Text><Text style={styles.detail}>{product.description}</Text></>:null}
   {product.specifications&&typeof product.specifications==='object'?<><Text style={styles.heading}>Specifications</Text>{Object.entries(product.specifications).map(([key,value])=><Text key={key} style={styles.detail}>{key.replace(/_/g,' ')}: {typeof value==='object'?JSON.stringify(value):String(value)}</Text>)}</>:null}
   <View style={styles.notice}><Text style={styles.noticeText}>Cart, seller messaging and checkout are not yet connected in this native build. Purchases cannot be placed here yet.</Text></View>
  </>:<Text style={styles.error}>{error||'Product not found or no longer available.'}</Text>}
  <Pressable onPress={()=>router.back()} style={styles.back}><Text style={styles.backText}>Back to marketplace</Text></Pressable>
 </ScrollView>;
}
const styles=StyleSheet.create({page:{flex:1,backgroundColor:'#F8F7FC'},content:{padding:16,gap:12},photo:{width:320,height:300,backgroundColor:'#fff',marginRight:8,borderRadius:12},placeholder:{height:240,alignItems:'center',justifyContent:'center',backgroundColor:'#fff'},category:{color:'#65756F'},name:{fontSize:23,fontWeight:'800',color:'#183330'},price:{fontSize:23,fontWeight:'900',color:'#E85C26'},heading:{fontSize:17,fontWeight:'800',marginTop:12},detail:{fontSize:15,lineHeight:23,color:'#394A45'},notice:{padding:14,backgroundColor:'#FFF0E5',borderRadius:10},noticeText:{color:'#6E3C21',lineHeight:20},error:{color:'#B22A2A'},back:{backgroundColor:'#183330',padding:15,alignItems:'center',borderRadius:12,marginTop:12},backText:{color:'#fff',fontWeight:'800'}});
