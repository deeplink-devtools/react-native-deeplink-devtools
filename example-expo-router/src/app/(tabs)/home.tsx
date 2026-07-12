import { Text, View } from 'react-native';

export default function TabHomeScreen() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>Home tab - /home (the (tabs) group is stripped from the URL)</Text>
    </View>
  );
}
