import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';

import { linking } from './navigation/linking';
import type {
  FeedStackParamList,
  HomeTabsParamList,
  RootStackParamList,
  SettingsStackParamList,
} from './navigation/types';
import { PlaceholderScreen } from './screens/PlaceholderScreen';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const HomeTabs = createBottomTabNavigator<HomeTabsParamList>();
const FeedStack = createNativeStackNavigator<FeedStackParamList>();
const SettingsStack = createNativeStackNavigator<SettingsStackParamList>();

function FeedNavigator() {
  return (
    <FeedStack.Navigator initialRouteName="FeedList">
      <FeedStack.Screen name="FeedList" component={PlaceholderScreen} />
      <FeedStack.Screen name="Article" component={PlaceholderScreen} />
      <FeedStack.Screen name="Search" component={PlaceholderScreen} />
    </FeedStack.Navigator>
  );
}

function HomeTabsNavigator() {
  return (
    <HomeTabs.Navigator>
      <HomeTabs.Screen name="Feed" component={FeedNavigator} options={{ headerShown: false }} />
      <HomeTabs.Screen name="Profile" component={PlaceholderScreen} />
    </HomeTabs.Navigator>
  );
}

function SettingsNavigator() {
  return (
    <SettingsStack.Navigator>
      <SettingsStack.Screen name="Notifications" component={PlaceholderScreen} />
      <SettingsStack.Screen name="DevMenu" component={PlaceholderScreen} />
    </SettingsStack.Navigator>
  );
}

export default function App() {
  return (
    <NavigationContainer linking={linking}>
      <StatusBar style="auto" />
      <RootStack.Navigator>
        <RootStack.Screen
          name="HomeTabs"
          component={HomeTabsNavigator}
          options={{ headerShown: false }}
        />
        <RootStack.Screen name="Promo" component={PlaceholderScreen} />
        <RootStack.Screen
          name="Settings"
          component={SettingsNavigator}
          options={{ headerShown: false }}
        />
        <RootStack.Screen name="NotFound" component={PlaceholderScreen} />
      </RootStack.Navigator>
    </NavigationContainer>
  );
}
