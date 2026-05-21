import React from 'react';
import { View, Text, Button, StyleSheet } from 'react-native';
import { useAuthStore } from '../store/authStore';

export const HomeScreen = ({ role }: { role: string }) => {
  const { user, logout } = useAuthStore();

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{role} Dashboard</Text>
      <Text>Welcome, {user?.name || user?.email}</Text>
      <View style={styles.spacer} />
      <Button title="Logout" onPress={logout} color="red" />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  title: { fontSize: 22, fontWeight: 'bold', marginBottom: 10 },
  spacer: { height: 20 },
});
