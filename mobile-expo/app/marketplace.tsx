import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { WebView } from 'react-native-webview';

const MARKETPLACE_URL = 'https://ranovaprimeent.github.io/appliances/rpe-v2/?source=android';

export default function Marketplace() {
  const [error, setError] = useState(false);
  return (
    <View style={styles.container}>
      {error ? (
        <View style={styles.message}>
          <Text style={styles.title}>Marketplace could not load</Text>
          <Text style={styles.help}>Check your internet connection or open the RANOVA website in your browser.</Text>
          <Pressable onPress={() => void Linking.openURL(MARKETPLACE_URL)} style={styles.button}>
            <Text style={styles.buttonText}>Open marketplace website</Text>
          </Pressable>
        </View>
      ) : (
        <WebView
          source={{ uri: MARKETPLACE_URL }}
          javaScriptEnabled
          domStorageEnabled
          startInLoadingState
          renderLoading={() => <ActivityIndicator style={styles.loading} color="#FF7A00" size="large" />}
          onError={() => setError(true)}
          originWhitelist={['https://*']}
          onShouldStartLoadWithRequest={request => {
            if (/^https:\/\//i.test(request.url)) return true;
            if (/^(mailto:|tel:)/i.test(request.url)) {
              void Linking.openURL(request.url).catch(() => {});
            }
            return false;
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  loading: { flex: 1, justifyContent: 'center' },
  message: { flex: 1, padding: 24, alignItems: 'center', justifyContent: 'center', gap: 18 },
  title: { fontSize: 22, fontWeight: '800', color: '#183330' },
  help: { color: '#66756E', textAlign: 'center' },
  button: { backgroundColor: '#FF7A00', padding: 14, borderRadius: 10 },
  buttonText: { color: '#fff', fontWeight: '800' },
});
