import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ClipboardList,
  Grid2X2,
  House,
  ShoppingCart,
  UserRound,
} from 'lucide-react-native';
import { useCartStore } from '../store/cartStore';
import { getCartItemCount } from '../utils/customerCommerce';

type TabName = 'Home' | 'Categories' | 'Cart' | 'Orders' | 'Profile';
type CustomerBottomNavProps = {
  active?: TabName;
  navigation?: any;
  state?: { index: number; routes: Array<{ name: string }> };
};

const tabs: Array<{ name: TabName; label: string; icon: typeof House }> = [
  { name: 'Home', label: 'Home', icon: House },
  { name: 'Categories', label: 'Categories', icon: Grid2X2 },
  { name: 'Cart', label: 'Cart', icon: ShoppingCart },
  { name: 'Orders', label: 'Orders', icon: ClipboardList },
  { name: 'Profile', label: 'Profile', icon: UserRound },
];

export const CustomerBottomNav = ({ active, navigation: providedNavigation, state }: CustomerBottomNavProps) => {
  const hookNavigation = useNavigation<any>();
  const navigation = providedNavigation || hookNavigation;
  const route = useRoute<any>();
  const insets = useSafeAreaInsets();
  const cartCount = useCartStore((state) => getCartItemCount(state.items));
  const currentRoute = (state?.routes?.[state.index]?.name || route.name) as TabName;
  const activeTab = active || (tabs.some((tab) => tab.name === currentRoute) ? currentRoute : undefined);

  const routeNames = useMemo(() => {
    if (state?.routes?.length) return state.routes.map((item) => item.name);
    try {
      return navigation.getState?.()?.routeNames || [];
    } catch {
      return [];
    }
  }, [navigation, state]);

  const goTo = (name: TabName) => {
    if (state?.routes?.length) {
      navigation.navigate(name);
      return;
    }
    if (routeNames.includes('MainTabs')) {
      navigation.navigate('MainTabs', { screen: name });
      return;
    }
    if (routeNames.includes(name)) {
      navigation.navigate(name);
      return;
    }
    navigation.getParent?.()?.navigate('MainTabs', { screen: name });
  };

  return (
    <View style={[styles.shell, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      {tabs.map(({ name, label, icon: Icon }) => {
        const selected = activeTab === name;
        const color = selected ? '#0F766E' : '#64748B';
        return (
          <TouchableOpacity
            key={name}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={`Open ${label}`}
            style={styles.item}
            onPress={() => goTo(name)}
            activeOpacity={0.78}
          >
            <View style={[styles.iconWrap, selected && styles.iconWrapActive]}>
              <Icon size={22} color={color} strokeWidth={selected ? 2.6 : 2} />
              {name === 'Cart' && cartCount > 0 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{cartCount > 99 ? '99+' : cartCount}</Text>
                </View>
              ) : null}
            </View>
            <Text style={[styles.label, { color }]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};

export const CustomerScreenWithNav = ({
  children,
  active,
}: {
  children: React.ReactNode;
  active?: TabName;
}) => (
  <View style={styles.screen}>
    {children}
    <CustomerBottomNav active={active} />
  </View>
);

const styles = StyleSheet.create({
  screen: { flex: 1 },
  shell: {
    position: 'absolute',
    left: 14,
    right: 14,
    bottom: 10,
    minHeight: 74,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-around',
    paddingTop: 8,
    borderRadius: 26,
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.14,
    shadowRadius: 22,
    elevation: 18,
    zIndex: 20,
  },
  item: { minWidth: 54, alignItems: 'center', justifyContent: 'center' },
  iconWrap: { position: 'relative', minWidth: 42, minHeight: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 15 },
  iconWrapActive: { backgroundColor: '#E6FFFA' },
  label: { marginTop: 3, fontSize: 10, fontWeight: '900' },
  badge: { position: 'absolute', right: -5, top: -4, minWidth: 19, height: 19, borderRadius: 10, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0F766E' },
  badgeText: { color: '#FFFFFF', fontSize: 9, fontWeight: '900' },
});
