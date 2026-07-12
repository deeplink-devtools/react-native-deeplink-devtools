import { Link } from 'expo-router';
import { Text, View } from 'react-native';

export default function SettingsScreen() {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 }}>
      <Text>Settings - index route at /settings</Text>
      <Link href="/settings/notifications">Notification settings</Link>
    </View>
  );
}
