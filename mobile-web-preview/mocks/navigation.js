/* Web mock for @react-navigation.
 *
 * The app code uses React Navigation's dynamic API (createNativeStackNavigator /
 * createBottomTabNavigator + Screen) with the repo's copy of react-native-web.
 * The navigation packages are pure JS in v7, so instead of hand-rolling a fake
 * navigator we reuse the real `@react-navigation/core` builder and render a very
 * thin view layer. That keeps route state, params, nested navigators,
 * useNavigation/useRoute, refs and goBack working exactly like the native app.
 */
import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import {
  BaseNavigationContainer,
  ThemeProvider,
  useNavigationBuilder,
  StackRouter,
  TabRouter,
  createNavigatorFactory,
} from '@react-navigation/core';

// `Screen`/`Group` are not part of core's public index; `createNavigatorFactory`
// hands back the exact same objects the builder compares against, so reusing
// them keeps `child.type === Screen` working.
const { Screen, Group } = createNavigatorFactory(() => null)();

const DefaultTheme = {
  dark: false,
  colors: {
    primary: 'rgb(0, 122, 255)',
    background: 'rgb(242, 242, 242)',
    card: 'rgb(255, 255, 255)',
    text: 'rgb(28, 28, 30)',
    border: 'rgb(216, 216, 216)',
    notification: 'rgb(255, 59, 48)',
  },
  fonts: {
    regular: { fontFamily: 'System', fontWeight: '400' },
    medium: { fontFamily: 'System', fontWeight: '500' },
    bold: { fontFamily: 'System', fontWeight: '600' },
    heavy: { fontFamily: 'System', fontWeight: '700' },
  },
};

const DarkTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    primary: 'rgb(10, 132, 255)',
    background: 'rgb(1, 1, 1)',
    card: 'rgb(18, 18, 18)',
    text: 'rgb(229, 229, 231)',
    border: 'rgb(39, 39, 41)',
    notification: 'rgb(255, 69, 58)',
  },
};

// Base container + theme. `ref` is forwarded so the app's container refs
// (navigationRef / partnerNavigationRef) keep working.
const NavigationContainer = React.forwardRef(function NavigationContainer(props, ref) {
  const { theme, children, ...rest } = props;
  return React.createElement(
    BaseNavigationContainer,
    { ref, ...rest },
    React.createElement(ThemeProvider, { value: theme || DefaultTheme }, children),
  );
});
NavigationContainer.displayName = 'NavigationContainer';

function BaseNavigator({ createRouter, navigatorType, tabBar, children, ...options }) {
  const { state, descriptors, navigation } = useNavigationBuilder(createRouter, {
    ...options,
    children,
  });

  // Lazy mounting, like the real navigators: a route is rendered the first time
  // it gains focus and stays mounted afterwards (it is only hidden, not
  // unmounted, when focus moves away). Without this every registered screen —
  // including hidden drill-downs such as RiderRunDetail — mounts on first paint
  // with no route params and crashes the app.
  const focusedKey = state.routes[state.index]?.key;
  const [mountedKeys, setMountedKeys] = React.useState(() => new Set([focusedKey]));
  React.useEffect(() => {
    setMountedKeys((prev) => (prev.has(focusedKey) ? prev : new Set(prev).add(focusedKey)));
  }, [focusedKey]);

  const screens = state.routes.map((route, index) => {
    const descriptor = descriptors[route.key];
    const focused = state.index === index;
    if (!mountedKeys.has(route.key)) return null;
    return React.createElement(
      View,
      {
        key: route.key,
        style: [styles.scene, !focused && styles.hidden],
        pointerEvents: focused ? 'auto' : 'none',
      },
      descriptor.render(),
    );
  });

  // The app's custom tab bar (e.g. CustomerBottomNav) is passed through `tabBar`.
  const customBar = typeof tabBar === 'function'
    ? tabBar({
        state,
        descriptors,
        navigation,
        insets: { top: 0, bottom: 0, left: 0, right: 0 },
      })
    : null;

  const fallbackBar = !customBar && navigatorType === 'tab'
    ? React.createElement(
        View,
        { style: styles.tabBar },
        state.routes
          .filter((r) => descriptors[r.key]?.options?.tabBarItemStyle?.display !== 'none')
          .map((route) => {
            const focused = state.routes[state.index].key === route.key;
            const opts = descriptors[route.key]?.options || {};
            const label = opts.title || route.name;
            // Honour the screen's `tabBarIcon` (defined for store/rider tabs);
            // without it icons silently vanish because this fallback bar is the
            // only tab chrome those navigators get on web.
            const color = focused ? styles.tabLabelActive.color : styles.tabLabel.color;
            const icon = typeof opts.tabBarIcon === 'function'
              ? opts.tabBarIcon({ color, size: 24, focused })
              : null;
            return React.createElement(
              Pressable,
              {
                key: route.key,
                style: [styles.tabItem, focused && styles.tabItemActive],
                onPress: () => {
                  const event = navigation.emit({
                    type: 'tabPress',
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
                },
              },
              icon,
              React.createElement(Text, { style: [styles.tabLabel, focused && styles.tabLabelActive] }, String(label)),
            );
          }),
      )
    : null;

  return React.createElement(
    View,
    { style: styles.container },
    React.createElement(View, { style: styles.container }, screens),
    customBar || fallbackBar,
  );
}

const createNativeStackNavigator = () => ({
  Navigator: (props) =>
    React.createElement(BaseNavigator, { ...props, createRouter: StackRouter, navigatorType: 'stack' }),
  Screen,
  Group,
});

const createBottomTabNavigator = () => ({
  Navigator: (props) =>
    React.createElement(BaseNavigator, { ...props, createRouter: TabRouter, navigatorType: 'tab' }),
  Screen,
  Group,
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  scene: { ...StyleSheet.absoluteFillObject },
  hidden: { display: 'none' },
  tabBar: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    paddingVertical: 6,
  },
  tabItem: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 6 },
  tabItemActive: { opacity: 1 },
  tabLabel: { fontSize: 11, color: '#64748B', fontWeight: '600' },
  tabLabelActive: { color: '#0F766E' },
});

// Re-export everything the app imports from @react-navigation/native (and the
// other @react-navigation/* subpackages, which the webpack alias points here).
export {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
  createNativeStackNavigator,
  createBottomTabNavigator,
  Screen,
};

export {
  useNavigation,
  useRoute,
  useIsFocused,
  useFocusEffect,
  useNavigationState,
  useNavigationContainerRef,
  useTheme,
  usePreventRemove,
  createNavigationContainerRef,
  getFocusedRouteNameFromRoute,
  getStateFromPath,
  getPathFromState,
  CommonActions,
  StackActions,
  TabActions,
  DrawerActions,
} from '@react-navigation/core';

export default {
  NavigationContainer,
  DefaultTheme,
  DarkTheme,
  createNativeStackNavigator,
  createBottomTabNavigator,
};
