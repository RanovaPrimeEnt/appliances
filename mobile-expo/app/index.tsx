import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, Pressable, RefreshControl, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { CATALOGUE_PAGE_SIZE, getCataloguePage, type CatalogueProduct } from '../src/catalogue';

const ORANGE='#F46630';
const sections=['Trending Picks','New Products','Store Deals','Popular Today'];
const price=(p:CatalogueProduct)=>p.price===null?'Ask for price':new Intl.NumberFormat('en-GH',{style:'currency',currency:p.currency||'GHS',maximumFractionDigits:2}).format(p.price);
export default function Home(){
 const [tab,setTab]=useState<'Products'|'Stores'|'Categories'>('Products');
 const [query,setQuery]=useState('');
 const [products,setProducts]=useState<CatalogueProduct[]>([]);
 const [loading,setLoading]=useState(true);
 const [refreshing,setRefreshing]=useState(false);
 const [more,setMore]=useState(false);
 const [hasMore,setHasMore]=useState(true);
 const [error,setError]=useState('');
 const page=useRef(0),busy=useRef(false);
 async function load(refresh=false){
  if(busy.current)return;
  busy.current=true;if(refresh)setRefreshing(true);else setLoading(true);
  setError('');
  try{const rows=await getCataloguePage(0);setProducts(rows);page.current=1;setHasMore(rows.length===CATALOGUE_PAGE_SIZE);}
  catch(e){setError(e instanceof Error?e.message:'Could not load products');}
  finally{busy.current=false;setLoading(false);setRefreshing(false);}
 }
 async function loadMore(){
  if(busy.current||!hasMore||loading||query.trim()||tab!=='Products')return;
  busy.current=true;setMore(true);
  try{const rows=await getCataloguePage(page.current);page.current++;setProducts(prev=>[...prev,...rows.filter(r=>!prev.some(p=>p.id===r.id))]);setHasMore(rows.length===CATALOGUE_PAGE_SIZE);}
  catch(e){setError(e instanceof Error?e.message:'Could not load more products');}
  finally{busy.current=false;setMore(false);}
 }
 useEffect(()=>{void load();},[]);
 const filtered=useMemo(()=>products.filter(p=>[p.name,p.brand||''].some(x=>x.toLowerCase().includes(query.trim().toLowerCase()))),[products,query]);
 const open=(p:CatalogueProduct)=>router.push({pathname:'/product',params:{id:p.id}});
 const categories=useMemo(()=>Array.from(new Set(products.map(p=>String(p.details?.category||'')).filter(Boolean))),[products]);
 const header=<View style={s.top}>
  <View style={s.tabs}>{(['Products','Stores','Categories'] as const).map(t=><Pressable key={t} onPress={()=>setTab(t)} style={s.tab}><Text style={[s.tabText,tab===t&&s.tabActive]}>{t}</Text>{tab===t?<View style={s.underline}/>:null}</Pressable>)}</View>
  <View style={s.search}><Text style={s.searchIcon}>⌕</Text><TextInput value={query} onChangeText={setQuery} placeholder="Search products, stores or categories" style={s.searchInput} returnKeyType="search"/><Pressable style={s.searchButton}><Text style={s.searchButtonText}>Search</Text></Pressable></View>
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.filters}>{['All categories','All locations','Recommended'].map(f=><View key={f} style={s.filter}><Text style={s.filterText}>{f}  ⌄</Text></View>)}</ScrollView>
  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.shortcuts}>{['Top Factories','Custom Orders','Official Stores','New Products','Bulk Quotes'].map((x,i)=><View key={x} style={s.shortcut}><Text style={s.shortcutIcon}>{['▤','☑','▣','✦','☏'][i]}</Text><Text style={s.shortcutText}>{x}</Text></View>)}</ScrollView>
 </View>;
 const promos=<View style={s.promoGrid}>{sections.map((title,i)=><View key={title} style={s.promo}><Text style={s.promoTitle}>{title}</Text><View style={s.promoRow}>{filtered.slice(i*2,i*2+2).map(p=><Pressable key={p.id} onPress={()=>open(p)} style={s.promoItem}>{p.image_url?<Image source={{uri:p.image_url}} style={s.promoImage}/>:<View style={s.promoImage}/>}<Text style={s.promoPrice} numberOfLines={2}>{price(p)}</Text></Pressable>)}</View></View>)}</View>;
 return <SafeAreaView style={s.page}>
  <FlatList data={tab==='Products'?filtered:[]} keyExtractor={p=>p.id} numColumns={2} columnWrapperStyle={tab==='Products'?s.columns:undefined}
   ListHeaderComponent={<>{header}{tab==='Products'?<>{!query.trim()?promos:null}<View style={s.section}><Text style={s.heading}>Products for You</Text><Text style={s.count}>{products.length}{hasMore?'+':''} loaded</Text></View></>:<View style={s.placeholder}><Text style={s.heading}>{tab}</Text><Text style={s.muted}>{tab==='Stores'?'The native store directory is being connected to the existing seller marketplace.':'Category browsing is being connected to the website catalogue.'}</Text>{tab==='Categories'&&categories.map(c=><Text key={c} style={s.category}>{c}</Text>)}</View>}</>}
   renderItem={({item})=><Pressable style={s.product} onPress={()=>open(item)}>{item.image_url?<Image source={{uri:item.image_url}} style={s.productImage} resizeMode="contain"/>:<View style={s.productImage}/>}<Text numberOfLines={2} style={s.productName}>{item.name}</Text><Text style={s.productPrice}>{price(item)}</Text></Pressable>}
   onEndReached={()=>void loadMore()} onEndReachedThreshold={0.35}
   refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>void load(true)} tintColor={ORANGE}/>}
   ListFooterComponent={<View style={s.footer}>{loading||more?<ActivityIndicator color={ORANGE}/>:null}{error?<Text style={s.muted}>{error}</Text>:null}</View>}
   contentContainerStyle={s.list}/>
  <View style={s.bottom}>{[{label:'Home',symbol:'⌂',action:()=>setTab('Products')},{label:'Message',symbol:'▢',action:()=>router.push('/account')},{label:'Cart',symbol:'🛒',action:()=>router.push('/account')},{label:'Me',symbol:'♙',action:()=>router.push('/account')}].map((x,i)=><Pressable key={x.label} onPress={x.action} style={s.bottomItem}><Text style={[s.bottomIcon,i===0&&s.active]}>{x.symbol}</Text><Text style={[s.bottomLabel,i===0&&s.active]}>{x.label}</Text></Pressable>)}</View>
 </SafeAreaView>;
}
const s=StyleSheet.create({
 page:{flex:1,backgroundColor:'#F7F7F7'},list:{paddingBottom:24},top:{backgroundColor:'#fff',paddingTop:8},tabs:{flexDirection:'row',justifyContent:'space-around'},tab:{flex:1,alignItems:'center',paddingVertical:13},tabText:{fontSize:16,fontWeight:'700',color:'#666'},tabActive:{color:'#172D27'},underline:{height:4,width:48,backgroundColor:ORANGE,borderRadius:3,marginTop:10},search:{height:52,marginHorizontal:12,marginVertical:10,borderWidth:2,borderColor:'#202020',borderRadius:30,flexDirection:'row',alignItems:'center',overflow:'hidden'},searchIcon:{fontSize:25,marginLeft:14,color:'#555'},searchInput:{flex:1,fontSize:14,paddingHorizontal:8,minWidth:0},searchButton:{backgroundColor:ORANGE,height:'100%',justifyContent:'center',paddingHorizontal:18},searchButtonText:{color:'#fff',fontWeight:'800'},filters:{paddingHorizontal:12,paddingBottom:12,gap:8},filter:{borderWidth:1,borderColor:'#E2E4E3',backgroundColor:'#F5F7F6',borderRadius:25,paddingHorizontal:17,paddingVertical:10},filterText:{fontWeight:'700',color:'#384B45'},shortcuts:{paddingHorizontal:12,paddingVertical:14,gap:18,borderTopWidth:1,borderColor:'#F2F2F2'},shortcut:{flexDirection:'row',alignItems:'center',gap:7},shortcutIcon:{fontSize:22,color:'#52635E'},shortcutText:{fontSize:12,color:'#444'},promoGrid:{flexDirection:'row',flexWrap:'wrap',paddingHorizontal:8,paddingTop:14},promo:{width:'50%',padding:8},promoTitle:{fontSize:18,fontWeight:'800',color:'#253E37',marginBottom:9},promoRow:{flexDirection:'row',gap:5},promoItem:{flex:1,minWidth:0},promoImage:{width:'100%',height:94,backgroundColor:'#fff',borderRadius:10},promoPrice:{color:'#E84E31',fontSize:12,fontWeight:'900',marginTop:5},section:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',padding:14,marginTop:12},heading:{fontSize:19,fontWeight:'800',color:'#253E37'},count:{fontSize:12,color:'#777'},columns:{paddingHorizontal:8,gap:8},product:{flex:1,minWidth:0,backgroundColor:'#fff',borderRadius:14,padding:10,marginBottom:10,borderWidth:1,borderColor:'#EAEAEA'},productImage:{width:'100%',height:155,backgroundColor:'#fff'},productName:{fontSize:13,color:'#263A34',fontWeight:'600',marginTop:7,minHeight:36},productPrice:{fontSize:15,color:'#E84E31',fontWeight:'900',marginTop:5},footer:{padding:15,alignItems:'center'},muted:{color:'#66736E',lineHeight:22},placeholder:{padding:20,gap:12},category:{backgroundColor:'#fff',padding:12,borderRadius:9},bottom:{height:66,backgroundColor:'#fff',borderTopWidth:1,borderColor:'#EAEAEA',flexDirection:'row'},bottomItem:{flex:1,alignItems:'center',justifyContent:'center'},bottomIcon:{fontSize:25,color:'#222'},bottomLabel:{fontSize:12,color:'#222',marginTop:2},active:{color:ORANGE}
});
