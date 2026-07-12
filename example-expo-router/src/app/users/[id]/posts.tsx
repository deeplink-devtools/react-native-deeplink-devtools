import { useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';

export default function UserPostsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>Posts of user {id} - static child of a dynamic segment</Text>
    </View>
  );
}
