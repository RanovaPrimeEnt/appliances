import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';

const base='https://igaerssbzobutlwvjfwt.supabase.co/rest/v1/';
const key='sb_publishable_NMzJFpXOIJMEH3LW50Cs9g_Otc6tlYr';
const headers={apikey:key,Authorization:'Bearer '+key};
type Product={id:string;store_id:string;name:string;category:string|null;short_description:string|null;price:number|null;currency:string|null;primary_image_url:string|null;created_at:string};
type Store={id:string;store_name:string;business_location:string|null;logo_url:string|null;tagline:string|null};
async function rows<T>(path:string):Promise<T[]>{
 const res=await fetch(base+path,{headers});
 if(!res.ok)throw Error('Marketplace request failed ('+res.status+')');
 return res.json();
}
function money(p:Product){if(p.price==null)return 'Ask for quote';try{return new Intl.NumberFormat('en-GH',{style:'currency',currency:p.currency||'GHS',maximumFractionDigits:2}).format(Number(p.price));}catch{return (p.currency||'GHS')+' '+p.price;}}
export default function NativeMarketplace(){
 const [products,setProducts]=useState<Product[]>([]);
 const [stores,setStores]=useState<Store[]>([]);
 const [tab,setTab]=useState<'Products'|'Stores'|'Categories'>('Products');
 const [query,setQuery]=useState('');
 const [category,setCategory]=useState('');
 const [loading,setLoading]=useState(true);
 const [refreshing,setRefreshing]=useState(false);
 const [error,setError]=useState('');
 async function load(refresh=false){
  if(refresh)setRefreshing(true);else setLoading(true);
  setError('');
  const [p,s]=await Promise.allSettled([
   rows<Product>('ranova_seller_products?select=id,store_id,name,category,short_description,price,currency,primary_image_url,created_at&product_status=eq.active&order=created_at.desc&limit=240'),
   rows<Store>('ranova_seller_stores?select=id,store_name,business_location,logo_url,tagline&store_status=eq.active&limit=60')
  ]);
  if(p.status==='fulfilled')setProducts(p.value);
  if(s.status==='fulfilled')setStores(s.value);
  if(p.status==='rejected'||s.status==='rejected')setError('Some marketplace information could not load. Pull down to retry.');
  setLoading(false);setRefreshing(false);
 }
 useEffect(()=>{void load();},[]);
 const categories=useMemo(()=>Array.from(new Set(products.map(p=>p.category).filter((c):c is string=>Boolean(c)))).sort(),[products]);
 const shown=useMemo(()=>products.filter(p=>(!category||p.category===category)&&(!query.trim()||[p.name,p.category,p.short_description].some(x=>String(x||'').toLowerCase().includes(query.trim().toLowerCase())))),[products,category,query]);
 const shownStores=useMemo(()=>stores.filter(s=>!query.trim()||[s.store_name,s.business_location,s.tagline].some(x=>String(x||'').toLowerCase().includes(query.trim().toLowerCase()))),[stores,query]);
 function productCard(p:Product,mini=false){return <View key={p.id} style={[styles.product,mini&&styles.mini]}>{p.primary_image_url?<Image source={{uri:p.primary_image_url}} style={mini?styles.miniImage:styles.image} resizeMode="contain"/>:<View style={mini?styles.miniImage:styles.image}/>}<Text numberOfLines={mini?1:2} style={styles.name}>{p.name}</Text><Text style={styles.price}>{money(p)}</Text></View>;}
 return <SafeAreaView style={styles.page}><ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void load(true)}/>}>
  <View style={styles.top}><View style={styles.tabs}>{(['Products','Stores','Categories'] as const).map(t=><Pressable key={t} onPress={()=>setTab(t)} style={styles.tab}><Text style={[styles.tabText,tab===t&&styles.selected]}>{t}</Text>{tab===t?<View style={styles.underline}/>:null}</Pressable>)}</View>
  <View style={styles.search}><TextInput style={styles.input} placeholder="Search products, stores or categories" value={query} onChangeText={setQuery}/><View style={styles.searchButton}><Text style={styles.searchText}>Search</Text></View></View>
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}><Pressable onPress={()=>{setTab('Categories');}} style={styles.chip}><Text>{category||'All categories'}  ▾</Text></Pressable><View style={styles.chip}><Text>All locations</Text></View><View style={styles.chip}><Text>Recommended</Text></View></ScrollView>
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.shortcuts}>{['Top Factories','Custom Orders','Official Stores','New Products'].map((x,i)=><Pressable key={x} onPress={()=>setTab(i===3?'Products':'Stores')} style={styles.shortcut}><Text style={styles.shortcutIcon}>{['▤','◇','▣','✦'][i]}</Text><Text style={styles.shortcutText}>{x}</Text></Pressable>)}</ScrollView></View>
  {loading?<ActivityIndicator style={{margin:30}} color="#FF672F"/>:null}
  {error?<Text style={styles.error}>{error}</Text>:null}
  {tab==='Products'?<>
   {!query.trim()&&!category?<View style={styles.promos}>{['Trending Picks','New Products','Store Deals','Popular Today'].map((name,i)=><View key={name} style={styles.promo}><Text style={styles.promoTitle}>{name}</Text><View style={styles.promoPair}>{products.slice(i*2,i*2+2).map(p=>productCard(p,true))}</View></View>)}</View>:null}
   <View style={styles.headingRow}><Text style={styles.heading}>Products for You</Text><Text style={styles.summary}>{shown.length} products</Text></View>
   <View style={styles.grid}>{shown.map(p=>productCard(p))}</View>
  </>:tab==='Stores'?<><Text style={styles.heading}>Active Stores</Text>{shownStores.map(s=><View key={s.id} style={styles.store}>{s.logo_url?<Image source={{uri:s.logo_url}} style={styles.storeLogo}/>:null}<View style={{flex:1}}><Text style={styles.storeName}>{s.store_name}</Text><Text style={styles.muted}>{s.business_location||'Marketplace seller'}</Text><Text style={styles.muted} numberOfLines={2}>{s.tagline||''}</Text></View></View>)}</>:<><Text style={styles.heading}>Categories</Text><Pressable onPress={()=>{setCategory('');setTab('Products');}} style={styles.category}><Text>All categories</Text></Pressable>{categories.map(c=><Pressable key={c} onPress={()=>{setCategory(c);setTab('Products');}} style={styles.category}><Text>{c}</Text></Pressable>)}</>}
  <View style={{height:24}}/>
 </ScrollView>
 <View style={styles.nav}>{['Home','Message','Cart','Me'].map((label,i)=><Pressable key={label} onPress={()=>i===0?setTab('Products'):router.push('/account')} style={styles.navItem}><Text style={[styles.navIcon,i===0&&styles.orange]}>{['⌂','▢','▣','♙'][i]}</Text><Text style={[styles.navLabel,i===0&&styles.orange]}>{label}</Text></Pressable>)}</View>
 </SafeAreaView>;
}
const styles=StyleSheet.create({page:{flex:1,backgroundColor:'#F5F5F5'},top:{backgroundColor:'#fff'},tabs:{flexDirection:'row'},tab:{flex:1,alignItems:'center',paddingTop:15,paddingBottom:8},tabText:{fontWeight:'800',fontSize:15,color:'#333'},selected:{fontSize:19},underline:{height:4,width:45,backgroundColor:'#FF672F',borderRadius:3,marginTop:7},search:{margin:10,borderWidth:2,borderColor:'#222',borderRadius:26,height:48,flexDirection:'row',overflow:'hidden'},input:{flex:1,paddingHorizontal:12,fontSize:13},searchButton:{backgroundColor:'#FF672F',justifyContent:'center',paddingHorizontal:18},searchText:{color:'#fff',fontWeight:'900'},filters:{paddingHorizontal:10,paddingBottom:12,gap:8},chip:{backgroundColor:'#F5F5F5',borderWidth:1,borderColor:'#E4E4E4',borderRadius:20,padding:10},shortcuts:{padding:12,gap:22},shortcut:{alignItems:'center'},shortcutIcon:{fontSize:24,color:'#F56632'},shortcutText:{fontSize:11,fontWeight:'600'},promos:{flexDirection:'row',flexWrap:'wrap',padding:5},promo:{width:'50%',padding:5},promoTitle:{fontWeight:'900',fontSize:14,marginBottom:5},promoPair:{flexDirection:'row',gap:4},mini:{flex:1,padding:3},miniImage:{width:'100%',height:78,backgroundColor:'#eee'},headingRow:{flexDirection:'row',justifyContent:'space-between',alignItems:'center',paddingHorizontal:12,marginVertical:12},heading:{fontSize:18,fontWeight:'900',padding:12},summary:{fontSize:12,color:'#777'},grid:{flexDirection:'row',flexWrap:'wrap',paddingHorizontal:6},product:{width:'48%',margin:'1%',backgroundColor:'#fff',borderRadius:10,padding:9},image:{width:'100%',height:155,backgroundColor:'#F9F9F9'},name:{fontSize:12,fontWeight:'600',marginTop:5},price:{fontSize:13,fontWeight:'900',color:'#E84E31',marginTop:4},store:{flexDirection:'row',gap:12,backgroundColor:'#fff',marginHorizontal:10,marginBottom:8,padding:12,borderRadius:12},storeLogo:{width:65,height:65},storeName:{fontWeight:'800',fontSize:15},muted:{color:'#777',fontSize:12,marginTop:5},category:{backgroundColor:'#fff',padding:17,marginHorizontal:12,marginBottom:8,borderRadius:10},nav:{height:66,backgroundColor:'#fff',borderTopWidth:1,borderColor:'#ddd',flexDirection:'row'},navItem:{flex:1,alignItems:'center',justifyContent:'center'},navIcon:{fontSize:23,color:'#222'},navLabel:{fontSize:11,color:'#222'},orange:{color:'#FF672F'},error:{color:'#A33030',padding:12}});
