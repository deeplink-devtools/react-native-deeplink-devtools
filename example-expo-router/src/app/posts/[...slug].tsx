import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

export default function PostScreen() {
  const { slug } = useLocalSearchParams<{ slug: string[] }>();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>Catch-all route /posts/[...slug] matched: {JSON.stringify(slug)}</Text>
    </View>
  );
}
