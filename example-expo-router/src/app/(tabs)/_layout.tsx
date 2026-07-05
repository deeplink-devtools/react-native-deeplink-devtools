import { Tabs } from 'expo-router';

export const unstable_settings = {
  // `anchor` is the SDK 57 name; older docs call this `initialRouteName`.
  anchor: 'home',
};

export default function TabsLayout() {
  return (
    <Tabs>
      <Tabs.Screen name="home" options={{ title: 'Home' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
    </Tabs>
  );
}
