import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import type { User } from '@supabase/supabase-js';
import { loginAccount, normalizedPhone, registerAccount, supabase, type LoginMethod } from '../src/auth';

export default function Account(){
 const [user,setUser]=useState<User|null>(null);
 const [ready,setReady]=useState(false);
 const [mode,setMode]=useState<'signin'|'register'>('signin');
 const [method,setMethod]=useState<LoginMethod>('email');
 const [email,setEmail]=useState('');
 const [code,setCode]=useState('+233');
 const [phone,setPhone]=useState('');
 const [password,setPassword]=useState('');
 const [showPassword,setShowPassword]=useState(false);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState('');
 useEffect(()=>{
  let alive=true;
  supabase.auth.getUser().then(({data})=>{if(alive){setUser(data.user);setReady(true);}}).catch(()=>{if(alive)setReady(true);});
  const {data:{subscription}}=supabase.auth.onAuthStateChange((_event,session)=>setUser(session?.user||null));
  return ()=>{alive=false;subscription.unsubscribe();};
 },[]);
 async function submit(){
  if(busy)return;
  const cleanEmail=email.trim().toLowerCase();
  const digits=phone.replace(/\D/g,'').replace(/^0+/,'');
  if(password.length<8){setMessage('Use at least 8 characters for your password.');return;}
  if(method==='email'&&!cleanEmail){setMessage('Please enter your email address.');return;}
  if(method==='phone'&&digits.length<7){setMessage('Please enter a valid phone number.');return;}
  setBusy(true);setMessage('');
  try{
   const fullPhone=normalizedPhone(code,phone);
   if(mode==='register')await registerAccount(method,cleanEmail,fullPhone,password);
   else await loginAccount(method,cleanEmail,fullPhone,password);
   setPassword('');
   setMessage(mode==='register'?'Account created successfully.':'Signed in successfully.');
  }catch(e){
   const text=e instanceof Error?e.message:'Something went wrong. Please try again.';
   if(mode==='register'&&/already registered|already exists|account_exists|user already/i.test(text)){
    setMode('signin');setMessage('An account already exists with these details. Please sign in instead.');
   }else if(/invalid login credentials/i.test(text))setMessage('The account details or password are incorrect.');
   else setMessage(text);
  }finally{setBusy(false);}
 }
 async function resetPassword(){
  if(method==='phone'){setMessage('Phone accounts cannot use email password recovery. Contact RANOVA Support if you are signed out.');return;}
  if(!email.trim()){setMessage('Enter your email address first.');return;}
  setBusy(true);
  try{
   const {error}=await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase());
   if(error)throw error;
   setMessage('If a RANOVA account exists for this email, a password reset link has been sent.');
  }catch(e){setMessage(e instanceof Error?e.message:'Unable to send reset email.');}
  finally{setBusy(false);}
 }
 if(!ready)return <View style={styles.center}><ActivityIndicator size="large"/></View>;
 if(user)return <View style={styles.container}><Text style={styles.title}>Your RANOVA account</Text><Text style={styles.helper}>Signed in as {user.email||user.phone||'RANOVA user'}</Text><Pressable style={styles.primary} onPress={()=>void supabase.auth.signOut()}><Text style={styles.primaryText}>Sign out</Text></Pressable></View>;
 return <KeyboardAvoidingView style={{flex:1}} behavior={Platform.OS==='ios'?'padding':undefined}><ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
  <Text style={styles.title}>Welcome to RANOVA</Text><Text style={styles.helper}>Use your existing account or create a new one.</Text>
  <View style={styles.tabs}><Pressable style={[styles.tab,mode==='signin'&&styles.selected]} onPress={()=>{setMode('signin');setMessage('');}}><Text>Sign in</Text></Pressable><Pressable style={[styles.tab,mode==='register'&&styles.selected]} onPress={()=>{setMode('register');setMessage('');}}><Text>Create account</Text></Pressable></View>
  <Text style={styles.label}>Continue with</Text>
  <View style={styles.tabs}><Pressable style={[styles.tab,method==='email'&&styles.selected]} onPress={()=>{setMethod('email');setMessage('');}}><Text>Email</Text></Pressable><Pressable style={[styles.tab,method==='phone'&&styles.selected]} onPress={()=>{setMethod('phone');setMessage('');}}><Text>Phone</Text></Pressable></View>
  {method==='email'?<><Text style={styles.label}>Email address</Text><TextInput style={styles.input} keyboardType="email-address" autoCapitalize="none" autoComplete="email" value={email} onChangeText={setEmail} placeholder="you@example.com"/></>:<><Text style={styles.label}>Phone number</Text><View style={styles.phoneRow}><TextInput style={[styles.input,{width:85}]} keyboardType="phone-pad" value={code} onChangeText={setCode} accessibilityLabel="Country code"/><TextInput style={[styles.input,{flex:1}]} keyboardType="phone-pad" value={phone} onChangeText={setPhone} placeholder="Phone number"/></View></>}
  <Text style={styles.label}>Password</Text><View style={styles.phoneRow}><TextInput style={[styles.input,{flex:1}]} secureTextEntry={!showPassword} autoCapitalize="none" autoComplete={mode==='register'?'new-password':'current-password'} value={password} onChangeText={setPassword} placeholder="At least 8 characters"/><Pressable style={styles.show} onPress={()=>setShowPassword(v=>!v)}><Text>{showPassword?'Hide':'Show'}</Text></Pressable></View>
  {message?<Text accessibilityRole="alert" style={styles.message}>{message}</Text>:null}
  <Pressable style={[styles.primary,busy&&{opacity:.5}]} disabled={busy} onPress={()=>void submit()}><Text style={styles.primaryText}>{busy?'Please wait…':mode==='register'?'Create my account':'Sign in'}</Text></Pressable>
  {mode==='signin'?<Pressable disabled={busy} onPress={()=>void resetPassword()}><Text style={styles.link}>Forgot password?</Text></Pressable>:null}
  <Text style={styles.helper}>Seller registration will use the existing RANOVA seller application and approval process.</Text>
 </ScrollView></KeyboardAvoidingView>;
}
const styles=StyleSheet.create({container:{flexGrow:1,padding:24,backgroundColor:'#F8F7FC'},center:{flex:1,justifyContent:'center'},title:{fontSize:27,fontWeight:'800',color:'#183330',marginBottom:8},helper:{color:'#66756E',marginBottom:20,lineHeight:20},tabs:{flexDirection:'row',gap:8,marginBottom:20},tab:{flex:1,padding:14,borderRadius:10,backgroundColor:'#E8EEEA',alignItems:'center'},selected:{backgroundColor:'#B9DFD0'},label:{fontWeight:'700',marginBottom:8,color:'#183330'},input:{backgroundColor:'#fff',borderWidth:1,borderColor:'#DCE3E0',borderRadius:10,padding:13,marginBottom:18,fontSize:16},phoneRow:{flexDirection:'row',gap:8,alignItems:'flex-start'},show:{padding:14},primary:{backgroundColor:'#176B61',padding:16,borderRadius:12,alignItems:'center',marginBottom:20},primaryText:{color:'#fff',fontWeight:'800'},link:{color:'#176B61',textAlign:'center',marginBottom:22,fontWeight:'700'},message:{color:'#8A4017',marginBottom:16,lineHeight:20}});
