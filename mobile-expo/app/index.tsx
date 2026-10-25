import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, SafeAreaView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Link, router } from 'expo-router';
import { CATALOGUE_PAGE_SIZE, getCataloguePage, type CatalogueProduct } from '../src/catalogue';

export default function Home(){
 const [query,setQuery]=useState('');
 const [products,setProducts]=useState<CatalogueProduct[]>([]);
 const [loading,setLoading]=useState(true);
 const [refreshing,setRefreshing]=useState(false);
 const [loadingMore,setLoadingMore]=useState(false);
 const [hasMore,setHasMore]=useState(true);
 const [error,setError]=useState('');
 const page=useRef(0);
 const busy=useRef(false);
 async function load(refresh=false){
  if(busy.current)return;
  busy.current=true;
  if(refresh)setRefreshing(true);else setLoading(true);
  setError('');
  try{const rows=await getCataloguePage(0);page.current=1;setProducts(rows);setHasMore(rows.length===CATALOGUE_PAGE_SIZE);}
  catch(e){setError(e instanceof Error?e.message:'Unable to load products');}
  finally{busy.current=false;setLoading(false);setRefreshing(false);}
 }
 async function loadMore(){
  if(busy.current||!hasMore||loading||query.trim())return;
  busy.current=true;setLoadingMore(true);
  try{const rows=await getCataloguePage(page.current);page.current+=1;setProducts(prev=>[...prev,...rows.filter(item=>!prev.some(p=>p.id===item.id))]);setHasMore(rows.length===CATALOGUE_PAGE_SIZE);}
  catch(e){setError(e instanceof Error?e.message:'Could not load more products');}
  finally{busy.current=false;setLoadingMore(false);}
 }
 useEffect(()=>{void load();},[]);
 const shown=useMemo(()=>products.filter(p=>[p.name,p.brand||''].some(v=>v.toLowerCase().includes(query.toLowerCase()))),[products,query]);
 return <SafeAreaView style={styles.page}>
  <View style={styles.header}><Text style={styles.logo}>RANOVA</Text><Text style={styles.tag}>Marketplace</Text></View>
  <View style={styles.content}>
   <Text style={styles.heading}>Discover products for your home</Text>
   <TextInput accessibilityLabel="Search loaded products" placeholder="Search loaded products" value={query} onChangeText={setQuery} style={styles.input}/>
   <View style={styles.section}><Text style={styles.subheading}>Products</Text><Link href="/account" style={styles.link}>Account →</Link></View>
   {loading?<ActivityIndicator size="large" color="#176B61"/>:<FlatList data={shown} keyExtractor={p=>p.id}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void load(true)}/>}
    onEndReached={()=>void loadMore()} onEndReachedThreshold={0.35}
    renderItem={({item})=><Pressable accessibilityRole="button" accessibilityLabel={'View '+item.name} onPress={()=>router.push({pathname:'/product',params:{id:item.id}})} style={styles.card}>{item.image_url?<Image source={{uri:item.image_url}} style={styles.photo} resizeMode="contain"/>:null}<View style={{flex:1}}><Text style={styles.cardText}>{item.name}</Text>{item.brand?<Text style={styles.hint}>{item.brand}</Text>:null}<Text style={styles.price}>{item.price===null?'Ask for price':new Intl.NumberFormat('en-GH',{style:'currency',currency:item.currency||'GHS'}).format(item.price)}</Text></View></Pressable>}
    ListFooterComponent={<View style={styles.empty}>{loadingMore?<ActivityIndicator color="#176B61"/>:null}{error?<Text>{error}</Text>:null}{!hasMore&&products.length>0?<Text>All available products loaded</Text>:null}</View>}
    ListEmptyComponent={<View style={styles.empty}><Text>{error||'No products available. Pull down to refresh.'}</Text><Pressable onPress={()=>void load()} style={styles.retry}><Text style={{color:'#fff'}}>Retry</Text></Pressable></View>}/>}
  </View>
 </SafeAreaView>;
}
const styles=StyleSheet.create({page:{flex:1,backgroundColor:'#F8F7FC'},header:{backgroundColor:'#183330',padding:20},logo:{fontSize:24,fontWeight:'900',color:'#FF7A00'},tag:{color:'#fff'},content:{flex:1,padding:20},heading:{fontSize:26,fontWeight:'800',color:'#183330',marginBottom:18},input:{backgroundColor:'#fff',padding:14,borderRadius:12,borderWidth:1,borderColor:'#E0E8E4',marginBottom:18},section:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',marginBottom:12},subheading:{fontSize:18,fontWeight:'700'},card:{flexDirection:'row',gap:14,backgroundColor:'#fff',padding:12,borderRadius:16,marginBottom:12,alignItems:'center'},photo:{height:90,width:90},cardText:{fontSize:16,fontWeight:'700',color:'#183330'},hint:{fontSize:12,color:'#6E7E7A',marginTop:5},price:{fontSize:15,fontWeight:'700',color:'#176B61',marginTop:8},link:{color:'#176B61',fontWeight:'700'},empty:{padding:18,alignItems:'center',gap:12},retry:{backgroundColor:'#176B61',padding:12,borderRadius:8}});
