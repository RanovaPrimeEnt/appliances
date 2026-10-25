import { useLocalSearchParams, router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getCatalogue, type CatalogueProduct } from '../src/catalogue';

export default function ProductDetails() {
 const { id } = useLocalSearchParams<{ id: string }>();
 const [product,setProduct]=useState<CatalogueProduct|null>(null);
 const [loading,setLoading]=useState(true);
 const [error,setError]=useState('');
 useEffect(()=>{let active=true;getCatalogue().then(items=>{if(active)setProduct(items.find(p=>p.id===id)||null);}).catch(e=>{if(active)setError(e instanceof Error?e.message:'Unable to load product');}).finally(()=>{if(active)setLoading(false);});return()=>{active=false;};},[id]);
 return <ScrollView style={styles.page} contentContainerStyle={styles.content}>
  {loading?<ActivityIndicator size="large" color="#176B61"/>:product?<>
   {product.image_url?<Image source={{uri:product.image_url}} style={styles.image} resizeMode="contain"/>:<View style={styles.placeholder}><Text>No image available</Text></View>}
   {product.brand?<Text style={styles.brand}>{product.brand}</Text>:null}
   <Text style={styles.name}>{product.name}</Text>
   <Text style={styles.price}>{product.price===null?'Ask for price':new Intl.NumberFormat('en-GH',{style:'currency',currency:product.currency||'GHS'}).format(product.price)}</Text>
   <Text style={styles.note}>This is a product preview. Shopping cart, checkout, seller information and live stock details are being connected to the existing RANOVA marketplace.</Text>
  </>:<Text style={styles.error}>{error||'Product not found. It may no longer be available.'}</Text>}
  <Pressable onPress={()=>router.back()} style={styles.back}><Text style={styles.backText}>Back to products</Text></Pressable>
 </ScrollView>;
}
const styles=StyleSheet.create({page:{flex:1,backgroundColor:'#F8F7FC'},content:{padding:20,gap:12},image:{width:'100%',height:310,backgroundColor:'#fff',borderRadius:16},placeholder:{height:240,alignItems:'center',justifyContent:'center',backgroundColor:'#fff',borderRadius:16},brand:{fontSize:14,color:'#64756F'},name:{fontSize:25,fontWeight:'800',color:'#183330'},price:{fontSize:22,fontWeight:'800',color:'#176B61'},note:{marginTop:15,lineHeight:23,color:'#56665F'},error:{fontSize:16,color:'#A33030'},back:{backgroundColor:'#176B61',padding:16,borderRadius:12,alignItems:'center',marginTop:16},backText:{color:'#fff',fontWeight:'700'}});
