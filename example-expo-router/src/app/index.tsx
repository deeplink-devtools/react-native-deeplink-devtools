import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Deep-link playground</Text>
      <Link href="/about">/about</Link>
      <Link href="/contact">/contact</Link>
      <Link href="/home">/home (tabs group)</Link>
      <Link href="/settings">/settings</Link>
      <Link href="/users/42">/users/42</Link>
      <Link href="/users/42/posts">/users/42/posts</Link>
      <Link href="/posts/2026/07/hello">/posts/2026/07/hello (catch-all)</Link>
      <Link href="/promo">/promo (shared route)</Link>
      <Link href="/docs/install">/docs/install (platform variant)</Link>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  title: { fontSize: 20, fontWeight: 'bold', marginBottom: 12 },
});
