import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Bell, BriefcaseBusiness, House, UserRound } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { notificationService } from '../api/notificationService';
import { PARTNER_NOTIFICATION_QUERY_KEY, PartnerNotificationsScreen } from '../screens/PartnerNotificationsScreen';
import { RiderAccountStatusScreen } from '../screens/rider/RiderAccountStatusScreen';
import { RiderCodScreen } from '../screens/rider/RiderCodScreen';
import { RiderDashboard } from '../screens/rider/RiderDashboard';
import { RiderDocumentPreviewScreen } from '../screens/rider/RiderDocumentPreviewScreen';
import { RiderDocumentsScreen } from '../screens/rider/RiderDocumentsScreen';
import { RiderEarningsScreen } from '../screens/rider/RiderEarningsScreen';
import { RiderNotificationSettingsScreen } from '../screens/rider/RiderNotificationSettingsScreen';
import { RiderOperationsRouterScreen } from '../screens/rider/RiderOperationsRouterScreen';
import { RiderPayoutHistoryScreen } from '../screens/rider/RiderPayoutHistoryScreen';
import { RiderProfileDetailsScreen } from '../screens/rider/RiderProfileDetailsScreen';
import { RiderProfileScreen } from '../screens/rider/RiderProfileScreen';
import { RiderScheduleScreen } from '../screens/rider/RiderScheduleScreen';
import { RiderSupportConversationScreen } from '../screens/rider/RiderSupportConversationScreen';
import { RiderSupportScreen } from '../screens/rider/RiderSupportScreen';
import { RiderTrackingDiagnosticsScreen } from '../screens/rider/RiderTrackingDiagnosticsScreen';
import type { RiderTabParamList } from './partnerNavigationTypes';

const Tab = createBottomTabNavigator<RiderTabParamList>();
const hidden = { tabBarButton: () => null } as const;

export const RiderNavigator = () => {
  const insets = useSafeAreaInsets();
  const inboxQuery = useQuery({
    queryKey: PARTNER_NOTIFICATION_QUERY_KEY,
    queryFn: () => notificationService.getInbox(1),
    staleTime: 10_000,
    retry: 1,
  });
  const unreadCount = Number(inboxQuery.data?.unreadCount || 0);
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
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', marginTop: 2 },
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
        name="Operations"
        component={RiderOperationsRouterScreen}
        options={{
          title: 'Jobs',
          tabBarButtonTestID: 'tab_deliveries',
          tabBarAccessibilityLabel: 'Rider jobs and deliveries',
          tabBarIcon: ({ color, size, focused }) => (
            <BriefcaseBusiness size={focused ? size + 2 : size} color={color} fill={focused ? color : 'none'} strokeWidth={focused ? 2.5 : 2} />
          ),
        }}
      />
      <Tab.Screen
        name="Alerts"
        component={PartnerNotificationsScreen}
        options={{
          title: 'Alerts',
          tabBarButtonTestID: 'tab_alerts',
          tabBarAccessibilityLabel: 'Rider alerts',
          tabBarBadge: unreadCount > 0 ? unreadCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: '#EF1D25',
            color: '#FFFFFF',
            fontSize: 10,
            fontWeight: '900',
            minWidth: 20,
            height: 20,
            lineHeight: 20,
          },
          tabBarIcon: ({ color, size, focused }) => (
            <Bell size={focused ? size + 2 : size} color={color} fill={focused ? color : 'none'} strokeWidth={focused ? 2.5 : 2} />
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
