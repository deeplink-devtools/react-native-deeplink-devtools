import { Text, View } from 'react-native';

export default function AboutScreen() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>About - static route at /about</Text>
    </View>
  );
}
