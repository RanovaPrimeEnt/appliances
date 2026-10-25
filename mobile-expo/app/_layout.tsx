import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
export default function Layout() { return <><StatusBar style="dark" /><Stack screenOptions={{ headerStyle: { backgroundColor: '#183330' }, headerTintColor: '#fff' }} /></>; }
