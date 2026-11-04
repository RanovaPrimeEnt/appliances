import React, { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, SafeAreaView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { isConfigured, supabase } from './src/supabase';

export default function App() {
  const [products, setProducts] = useState([]);
  const [state, setState] = useState('idle');
  const [message, setMessage] = useState('');
  async function load() {
    if (!isConfigured) { setState('setup'); return; }
    setState('loading');
    // Read-only proof of connectivity. Never bypass RLS or use a service-role key.
    const { data, error } = await supabase.from('products')
      .select('id,name,price,currency')
      .eq('active', true).limit(20);
    if (error) { setMessage(error.message); setState('error'); return; }
    setProducts(data ?? []);
    setState('ready');
  }
  useEffect(() => { load(); }, []);
  return <SafeAreaView style={styles.root}>
    <StatusBar barStyle="dark-content" />
    <View style={styles.header}><Text style={styles.brand}>RANOVA</Text><Text style={styles.sub}>Live Market · Native preview</Text></View>
    {state === 'loading' && <ActivityIndicator style={styles.center} size="large" color="#14765b" />}
    {state === 'setup' && <Text style={styles.notice}>Add the public Supabase URL and publishable key to your local .env file, then restart Expo.</Text>}
    {state === 'error' && <Text style={styles.notice}>Connection needs attention: {message}</Text>}
    {state === 'ready' && <FlatList data={products} keyExtractor={item=>String(item.id)}
      contentContainerStyle={styles.list} ListEmptyComponent={<Text>No visible products. Check the active product records and Supabase RLS policies.</Text>}
      renderItem={({item})=><View style={styles.product}><Text style={styles.name}>{item.name}</Text><Text>{item.currency || 'GHS'} {item.price ?? 'Ask seller'}</Text></View>}/>}
    <TouchableOpacity accessibilityRole="button" onPress={load} style={styles.button}><Text style={styles.buttonText}>Refresh products</Text></TouchableOpacity>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  root:{flex:1,backgroundColor:'#f7faf8'},header:{padding:24,backgroundColor:'#fff',borderBottomWidth:1,borderColor:'#e4ece7'},
  brand:{fontSize:30,fontWeight:'800',color:'#14664d'},sub:{fontSize:13,color:'#54655d',marginTop:4},
  center:{flex:1,justifyContent:'center'},notice:{padding:24,color:'#34483d',lineHeight:24},
  list:{padding:16,flexGrow:1},product:{backgroundColor:'#fff',padding:18,borderRadius:12,marginBottom:12},
  name:{fontSize:17,fontWeight:'700',color:'#183e30',marginBottom:7},
  button:{margin:16,padding:15,backgroundColor:'#14664d',borderRadius:10,alignItems:'center'},
  buttonText:{color:'#fff',fontWeight:'700'}
});
