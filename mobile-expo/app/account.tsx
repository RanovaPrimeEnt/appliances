import { View, Text, StyleSheet } from 'react-native';
export default function Account(){return <View style={styles.page}><Text style={styles.title}>Your account</Text><Text>Native sign-in and account management will be connected to the existing Supabase backend after authentication review.</Text></View>}
const styles=StyleSheet.create({page:{flex:1,padding:24,backgroundColor:'#F8F7FC'},title:{fontSize:26,fontWeight:'800',marginBottom:12,color:'#183330'}});
