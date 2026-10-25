import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getProduct, type CatalogueProduct } from '../src/catalogue';

export default function ProductDetails(){
 const {id}=useLocalSearchParams<{id:string}>();
 const [product,setProduct]=useState<CatalogueProduct|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 useEffect(()=>{let active=true;setLoading(true);getProduct(id).then(p=>{if(active)setProduct(p);}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Unable to load product');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[id]);
 const fields=product?.details||{};
 const extra=['category','condition','stock_quantity','quantity','sku','model','warranty','location'].filter(k=>fields[k]!==null&&fields[k]!==undefined&&typeof fields[k]!=='object'&&String(fields[k]).trim()!=='');
 return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
  {loading?<ActivityIndicator size="large" color="#176B61"/>:product?<>
   {product.image_url?<Image source={{uri:product.image_url}} style={styles.image} resizeMode="contain"/>:<View style={styles.placeholder}><Text>No image available</Text></View>}
   {product.images.length>1?<ScrollView horizontal showsHorizontalScrollIndicator={false}>{product.images.slice(1).map((url,i)=><Image key={url+i} source={{uri:url}} style={styles.thumb} resizeMode="contain"/>)}</ScrollView>:null}
   {product.brand?<Text style={styles.brand}>{product.brand}</Text>:null}
   <Text style={styles.name}>{product.name}</Text>
   <Text style={styles.price}>{product.price===null?'Ask for price':new Intl.NumberFormat('en-GH',{style:'currency',currency:product.currency||'GHS'}).format(product.price)}</Text>
   {product.description?<><Text style={styles.label}>Description</Text><Text style={styles.body}>{product.description}</Text></>:null}
   {extra.map(k=><View key={k}><Text style={styles.label}>{k.replace(/_/g,' ')}</Text><Text style={styles.body}>{String(fields[k])}</Text></View>)}
   <Text style={styles.note}>More marketplace features, including cart and checkout, are still in development.</Text>
  </>:<Text style={styles.error}>{error||'Product not found. It may no longer be available.'}</Text>}
  <Pressable onPress={()=>router.back()} style={styles.back}><Text style={styles.backText}>Back to products</Text></Pressable>
 </ScrollView>;
}
const styles=StyleSheet.create({page:{flex:1,backgroundColor:'#F8F7FC'},content:{padding:20,gap:12},image:{width:'100%',height:310,backgroundColor:'#fff',borderRadius:16},thumb:{width:100,height:100,marginRight:8,backgroundColor:'#fff',borderRadius:10},placeholder:{height:240,alignItems:'center',justifyContent:'center',backgroundColor:'#fff',borderRadius:16},brand:{fontSize:14,color:'#64756F'},name:{fontSize:25,fontWeight:'800',color:'#183330'},price:{fontSize:22,fontWeight:'800',color:'#176B61'},label:{fontSize:16,fontWeight:'700',color:'#183330',textTransform:'capitalize',marginTop:10},body:{fontSize:15,lineHeight:23,color:'#384B45'},note:{marginTop:15,lineHeight:23,color:'#56665F'},error:{fontSize:16,color:'#A33030'},back:{backgroundColor:'#176B61',padding:16,borderRadius:12,alignItems:'center',marginTop:16},backText:{color:'#fff',fontWeight:'700'}});
