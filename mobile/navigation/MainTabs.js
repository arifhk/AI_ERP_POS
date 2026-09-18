import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';

import DashboardScreen from '../screens/DashboardScreen';
import POSScreen from '../screens/POSScreen';
import ProductsScreen from '../screens/ProductsScreen';
import OrdersScreen from '../screens/OrdersScreen';
import SettingsScreen from '../screens/SettingsScreen';

const Tab = createBottomTabNavigator();

function TabIcon({ label, focused }) {
  return (
    <Text style={{ fontSize: 16, opacity: focused ? 1 : 0.55 }}>{label}</Text>
  );
}

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#4f46e5',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: '#e2e8f0',
          height: 62,
          paddingTop: 6,
          paddingBottom: 8,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
        },
      }}
    >
      <Tab.Screen
        name="Home"
        component={DashboardScreen}
        options={{
          title: 'Home',
          tabBarIcon: ({ focused }) => <TabIcon label="⌂" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="POS"
        component={POSScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="▣" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Products"
        component={ProductsScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="▤" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Orders"
        component={OrdersScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="☰" focused={focused} />,
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarIcon: ({ focused }) => <TabIcon label="⚙" focused={focused} />,
        }}
      />
    </Tab.Navigator>
  );
}
