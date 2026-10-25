import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';

export const supabase=createClient('https://igaerssbzobutlwvjfwt.supabase.co','sb_publishable_NMzJFpXOIJMEH3LW50Cs9g_Otc6tlYr',{
 auth:{storage:AsyncStorage,autoRefreshToken:true,persistSession:true,detectSessionInUrl:false}
});
AppState.addEventListener('change',state=>{if(state==='active')supabase.auth.startAutoRefresh();else supabase.auth.stopAutoRefresh();});
export type LoginMethod='email'|'phone';
export function normalizedPhone(countryCode:string,localPhone:string){
 return countryCode+localPhone.replace(/\D/g,'').replace(/^0+/,'');
}
function phoneLoginEmail(phone:string){return 'phone-'+phone.replace(/\D/g,'')+'@accounts.ranova.invalid';}
export async function registerAccount(method:LoginMethod,email:string,phone:string,password:string){
 const {data,error}=await supabase.functions.invoke('ranova-account-signup',{body:{method,email,phone,password}});
 if(error){
  let message=error.message;
  try{const details=await error.context?.json?.();message=details?.error||message;}catch{}
  throw new Error(message);
 }
 const loginEmail=(data?.login_email|| (method==='phone'?phoneLoginEmail(phone):email)) as string;
 const result=await supabase.auth.signInWithPassword({email:loginEmail,password});
 if(result.error)throw result.error;
 return result.data;
}
export async function loginAccount(method:LoginMethod,email:string,phone:string,password:string){
 const result=await supabase.auth.signInWithPassword({email:method==='phone'?phoneLoginEmail(phone):email,password});
 if(result.error)throw result.error;
 return result.data;
}
