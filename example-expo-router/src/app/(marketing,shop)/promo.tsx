import { useSegments } from 'expo-router';
import { Text, View } from 'react-native';

export default function PromoScreen() {
  const segments = useSegments();
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Text>
        Shared route /promo - one file serving the (marketing) and (shop) groups. Active:{' '}
        {segments.join('/')}
      </Text>
    </View>
  );
}
