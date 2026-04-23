import React from 'react';
import {SafeAreaProvider} from 'react-native-safe-area-context';

import {AuthProvider} from './context/AuthContext';
import {AppNavigator} from './navigation/AppNavigator';

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <AppNavigator />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

