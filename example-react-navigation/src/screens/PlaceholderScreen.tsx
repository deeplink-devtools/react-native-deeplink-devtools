import { useRoute } from '@react-navigation/native';
import { StyleSheet, Text, View } from 'react-native';

/**
 * Shared screen body: shows which route rendered and with which params, so a
 * fired deep link is immediately verifiable on-device.
 */
export function PlaceholderScreen() {
  const route = useRoute();
  return (
    <View style={styles.container}>
      <Text style={styles.name}>{route.name}</Text>
      <Text style={styles.params}>{JSON.stringify(route.params ?? {}, null, 2)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  name: { fontSize: 24, fontWeight: '600' },
  params: { fontFamily: 'monospace', color: '#666' },
});
