import React from 'react';
import { getFocusedRouteNameFromRoute } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { BarChart3, House, Navigation, Route, UserRound } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PartnerNotificationsScreen } from '../screens/PartnerNotificationsScreen';
import { RiderAccountStatusScreen } from '../screens/rider/RiderAccountStatusScreen';
import { RiderCodScreen } from '../screens/rider/RiderCodScreen';
import { RiderDashboard } from '../screens/rider/RiderDashboard';
import { RiderDocumentPreviewScreen } from '../screens/rider/RiderDocumentPreviewScreen';
import { RiderDocumentsScreen } from '../screens/rider/RiderDocumentsScreen';
import { RiderEarningsScreen } from '../screens/rider/RiderEarningsScreen';
import { RiderNotificationSettingsScreen } from '../screens/rider/RiderNotificationSettingsScreen';
import { RiderOperationsRouterScreen } from '../screens/rider/RiderOperationsRouterScreen';
import { RiderRunDetailScreen } from '../screens/rider/RiderRunDetailScreen';
import { RiderRunsScreen } from '../screens/rider/RiderRunsScreen';
import { RiderPayoutHistoryScreen } from '../screens/rider/RiderPayoutHistoryScreen';
import { RiderProfileDetailsScreen } from '../screens/rider/RiderProfileDetailsScreen';
import { RiderProfileScreen } from '../screens/rider/RiderProfileScreen';
import { RouteConsoleScreen } from '../screens/rider/RouteConsoleScreen';
import { RiderScheduleScreen } from '../screens/rider/RiderScheduleScreen';
import { RiderSupportConversationScreen } from '../screens/rider/RiderSupportConversationScreen';
import { RiderSupportScreen } from '../screens/rider/RiderSupportScreen';
import { RiderTrackingDiagnosticsScreen } from '../screens/rider/RiderTrackingDiagnosticsScreen';
import type { RiderTabParamList } from './partnerNavigationTypes';

const Tab = createBottomTabNavigator<RiderTabParamList>();
// Preserve tab context for deep-linked detail routes without reserving visible
// tab-bar width for each hidden screen.
const hidden = { tabBarButton: () => null, tabBarItemStyle: { display: 'none' as const } } as const;

export const RiderNavigator = () => {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, 6);

  return (
    <Tab.Navigator
      screenOptions={{
        tabBarActiveTintColor: '#087B5B',
        tabBarInactiveTintColor: '#4F565D',
        headerShown: false,
        tabBarHideOnKeyboard: true,
        sceneStyle: { backgroundColor: '#FFFFFF' },
        tabBarStyle: {
          height: 58 + bottomPadding,
          paddingBottom: bottomPadding,
          paddingTop: 7,
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#E6E9E7',
          elevation: 22,
          shadowColor: '#111827',
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.08,
          shadowRadius: 10,
        },
        tabBarItemStyle: { borderRadius: 15 },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '500', marginTop: 2 },
      }}
    >
      <Tab.Screen
        name="Dashboard"
        component={RiderDashboard}
        options={{
          title: 'Home',
          tabBarButtonTestID: 'tab_dashboard',
          tabBarAccessibilityLabel: 'Rider dashboard',
          tabBarIcon: ({ color, size, focused }) => (
            <House size={focused ? size + 2 : size} color={color} fill={focused ? color : 'none'} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
      <Tab.Screen
        name="Route"
        component={RouteConsoleScreen}
        options={{
          title: 'Route',
          tabBarButtonTestID: 'tab_route',
          tabBarAccessibilityLabel: 'Live route console',
          tabBarIcon: ({ color, size, focused }) => (
            <Navigation size={focused ? size + 2 : size} color={color} fill={focused ? color : 'none'} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
      <Tab.Screen
        name="Runs"
        component={RiderRunsScreen}
        options={{
          title: 'Runs',
          tabBarButtonTestID: 'tab_runs',
          tabBarAccessibilityLabel: 'Subscription delivery runs',
          tabBarIcon: ({ color, size, focused }) => (
            <Route size={focused ? size + 2 : size} color={color} strokeWidth={focused ? 2.7 : 2} />
          ),
        }}
      />
      <Tab.Screen
        name="History"
        component={RiderEarningsScreen}
        options={{
          title: 'Earnings',
          tabBarButtonTestID: 'tab_earnings',
          tabBarAccessibilityLabel: 'Rider earnings ledger',
          tabBarIcon: ({ color, size, focused }) => (
            <BarChart3 size={focused ? size + 2 : size} color={color} fill={focused ? color : 'none'} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={RiderProfileScreen}
        options={{
          title: 'Profile',
          tabBarButtonTestID: 'tab_profile',
          tabBarAccessibilityLabel: 'Rider profile and account',
          tabBarIcon: ({ color, size, focused }) => (
            <UserRound size={focused ? size + 2 : size} color={color} fill={focused ? color : 'none'} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
      <Tab.Screen
        name="Operations"
        component={RiderOperationsRouterScreen}
        options={({ route }) => ({
          ...hidden,
          // Keep the immersive full-screen delivery experience: hide the tab
          // bar while the rider is inside an active job flow.
          tabBarStyle: ['RiderActiveJob', 'RiderPickup', 'RiderDelivery', 'RiderReturn'].includes(getFocusedRouteNameFromRoute(route) || 'RiderJobs')
            ? { display: 'none' }
            : undefined,
        })}
      />
      <Tab.Screen name="RiderRunDetail" component={RiderRunDetailScreen} options={hidden} />
      <Tab.Screen name="Notifications" component={PartnerNotificationsScreen} options={hidden} />
      <Tab.Screen name="NotificationSettings" component={RiderNotificationSettingsScreen} options={hidden} />
      <Tab.Screen name="TrackingDiagnostics" component={RiderTrackingDiagnosticsScreen} options={hidden} />
      <Tab.Screen name="RiderProfileDetails" component={RiderProfileDetailsScreen} options={hidden} />
      <Tab.Screen name="RiderAccountStatus" component={RiderAccountStatusScreen} options={hidden} />
      <Tab.Screen name="RiderDocuments" component={RiderDocumentsScreen} options={hidden} />
      <Tab.Screen name="RiderDocumentPreview" component={RiderDocumentPreviewScreen} options={hidden} />
      <Tab.Screen name="RiderSchedule" component={RiderScheduleScreen} options={hidden} />
      <Tab.Screen name="RiderCod" component={RiderCodScreen} options={hidden} />
      <Tab.Screen name="RiderSupport" component={RiderSupportScreen} options={hidden} />
      <Tab.Screen name="RiderSupportConversation" component={RiderSupportConversationScreen} options={hidden} />
      <Tab.Screen name="RiderPayoutHistory" component={RiderPayoutHistoryScreen} options={hidden} />
    </Tab.Navigator>
  );
};
