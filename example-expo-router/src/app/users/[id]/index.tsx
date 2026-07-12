import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

export default function UserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>User {id} - dynamic route at /users/[id]</Text>
    </View>
  );
}
