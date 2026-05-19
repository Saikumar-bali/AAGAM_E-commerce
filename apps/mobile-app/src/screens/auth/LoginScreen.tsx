import React, {useState} from 'react';
import {Alert, StyleSheet, Text, TextInput, TouchableOpacity, View} from 'react-native';

import {useAuth} from '../../context/AuthContext';
import type {UserRole} from '../../types/auth';

export function LoginScreen() {
  const {login, isLoggingIn} = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>('CUSTOMER');

  const handleLogin = async () => {
    if (!email || !password) {
      Alert.alert('Missing fields', 'Please enter email and password.');
      return;
    }

    try {
      await login({email, password, preferredRole: role});
    } catch (error: any) {
      const message =
        error?.response?.data?.message ||
        error?.message ||
        'Login failed. Ensure API gateway is running.';
      Alert.alert('Authentication error', message);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Aagam Super App</Text>
      <Text style={styles.subtitle}>Unified customer + rider login</Text>

      <View style={styles.roleRow}>
        <RoleButton label="Customer" selected={role === 'CUSTOMER'} onPress={() => setRole('CUSTOMER')} />
        <RoleButton label="Rider" selected={role === 'RIDER'} onPress={() => setRole('RIDER')} />
      </View>

      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="Email"
        keyboardType="email-address"
        autoCapitalize="none"
        style={styles.input}
      />

      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Password"
        secureTextEntry
        style={styles.input}
      />

      <TouchableOpacity style={[styles.loginButton, isLoggingIn && styles.loginButtonDisabled]} onPress={handleLogin} disabled={isLoggingIn}>
        <Text style={styles.loginButtonText}>{isLoggingIn ? 'Logging in...' : 'Login'}</Text>
      </TouchableOpacity>
    </View>
  );
}

function RoleButton({label, selected, onPress}: {label: string; selected: boolean; onPress: () => void}) {
  return (
    <TouchableOpacity style={[styles.roleButton, selected && styles.roleButtonSelected]} onPress={onPress}>
      <Text style={[styles.roleButtonText, selected && styles.roleButtonTextSelected]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    backgroundColor: '#f8fafc',
  },
  title: {
    fontSize: 30,
    fontWeight: '800',
    color: '#111827',
  },
  subtitle: {
    marginTop: 8,
    marginBottom: 22,
    color: '#6b7280',
    fontSize: 14,
  },
  roleRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  roleButton: {
    flex: 1,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
    paddingVertical: 11,
    alignItems: 'center',
  },
  roleButtonSelected: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  roleButtonText: {
    color: '#374151',
    fontWeight: '600',
  },
  roleButtonTextSelected: {
    color: '#1d4ed8',
  },
  input: {
    height: 48,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d1d5db',
    backgroundColor: '#ffffff',
    paddingHorizontal: 14,
    marginBottom: 12,
  },
  loginButton: {
    marginTop: 6,
    height: 48,
    borderRadius: 10,
    backgroundColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loginButtonDisabled: {
    backgroundColor: '#93c5fd',
  },
  loginButtonText: {
    color: '#ffffff',
    fontWeight: '700',
    fontSize: 16,
  },
});

