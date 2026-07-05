import { Link, usePathname } from 'expo-router';
import { Text, View } from 'react-native';

export default function NotFoundScreen() {
  const pathname = usePathname();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <Text>No route matches {pathname}</Text>
      <Link href="/">Go home</Link>
    </View>
  );
}
