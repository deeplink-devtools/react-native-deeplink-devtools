import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

export default function DocPageScreen() {
  const { page } = useLocalSearchParams<{ page: string }>();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>Doc page (native): {page}</Text>
    </View>
  );
}
