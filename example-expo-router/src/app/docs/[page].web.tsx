import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

export default function DocPageWebScreen() {
  const { page } = useLocalSearchParams<{ page: string }>();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>Doc page (web variant): {page}</Text>
    </View>
  );
}
