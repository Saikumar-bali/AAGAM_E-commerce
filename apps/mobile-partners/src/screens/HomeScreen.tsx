import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar } from 'react-native';
import { ArrowRight, Bell, LogOut, PackageCheck, ShieldCheck } from 'lucide-react-native';
import { useAuthStore } from '@aagam/mobile-shared';
import { useQuery } from '@tanstack/react-query';
import { storeService } from '../api/storeService';

export const HomeScreen = ({ role, navigation }: { role: string; navigation?: any }) => {
  const { user, logout } = useAuthStore();
  const { data: stores } = useQuery({
    queryKey: ['my-stores'],
    queryFn: storeService.getMyStores,
  });
  const storeList = Array.isArray(stores) ? stores : [];
  const totalOrders = storeList.reduce((sum: number, s: any) => sum + (s._count?.orders || s.orderCount || 0), 0);

  return (
    <View style={styles.page}>
      <StatusBar barStyle="light-content" />
      <View style={styles.hero}>
        <View style={styles.glowOne} />
        <View style={styles.glowTwo} />

        <View style={styles.topRow}>
          <View>
            <Text style={styles.eyebrow}>AAGAM OPERATIONS</Text>
            <Text style={styles.title}>{role}</Text>
          </View>
          <TouchableOpacity style={styles.iconButton}>
            <Bell size={20} color="#F8FAFC" />
          </TouchableOpacity>
        </View>

        <View style={styles.profileCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{(user?.name || user?.email || 'A').slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={styles.profileCopy}>
            <Text style={styles.welcome}>Welcome back</Text>
            <Text style={styles.name}>{user?.name || user?.email || 'Aagam Partner'}</Text>
          </View>
          <ShieldCheck size={24} color="#14B8A6" />
        </View>
      </View>

      <View style={styles.content}>
        <View style={styles.summaryRow}>
          <Metric label="Stores" value={String(storeList.length)} tone="#0F766E" />
          <Metric label="Orders" value={String(totalOrders)} tone="#B45309" />
          <Metric label="Status" value={storeList.length > 0 ? 'Active' : 'Setup'} tone="#4338CA" />
        </View>

        <View style={styles.panel}>
          <View style={styles.panelIcon}>
            <PackageCheck size={28} color="#0F172A" />
          </View>
          <Text style={styles.panelTitle}>Your Workspace</Text>
          <Text style={styles.panelText}>
            {storeList.length > 0
              ? `You have ${storeList.length} store(s) assigned. Tap below to manage orders, inventory, and more.`
              : 'Contact admin to assign stores to your account, or continue to explore your dashboard.'}
          </Text>
          <TouchableOpacity
            style={styles.primaryAction}
            onPress={() => navigation?.navigate?.('StoreTabs')}
          >
            <Text style={styles.primaryActionText}>Go to Dashboard</Text>
            <ArrowRight size={18} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <TouchableOpacity style={styles.logoutButton} onPress={logout}>
          <LogOut size={18} color="#DC2626" />
          <Text style={styles.logoutText}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const Metric = ({ label, value, tone }: { label: string; value: string; tone: string }) => (
  <View style={styles.metricCard}>
    <View style={[styles.metricDot, { backgroundColor: tone }]} />
    <Text style={styles.metricValue}>{value}</Text>
    <Text style={styles.metricLabel}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F5F3EE' },
  hero: { minHeight: 292, backgroundColor: '#101827', borderBottomLeftRadius: 36, borderBottomRightRadius: 36, paddingHorizontal: 24, paddingTop: 58, overflow: 'hidden' },
  glowOne: { position: 'absolute', top: -86, right: -78, width: 230, height: 230, borderRadius: 115, backgroundColor: 'rgba(20, 184, 166, 0.24)' },
  glowTwo: { position: 'absolute', bottom: -118, left: -80, width: 260, height: 260, borderRadius: 130, backgroundColor: 'rgba(245, 158, 11, 0.16)' },
  topRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  eyebrow: { color: '#94A3B8', fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  title: { color: '#FFFFFF', fontSize: 31, fontWeight: '900', marginTop: 6 },
  iconButton: { width: 46, height: 46, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.10)', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'rgba(255,255,255,0.14)' },
  profileCard: { marginTop: 34, backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 28, padding: 18, flexDirection: 'row', alignItems: 'center', elevation: 10, shadowColor: '#020617', shadowOpacity: 0.2, shadowRadius: 18, shadowOffset: { width: 0, height: 12 } },
  avatar: { width: 58, height: 58, borderRadius: 20, backgroundColor: '#0F172A', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 24, fontWeight: '900' },
  profileCopy: { flex: 1, marginLeft: 14 },
  welcome: { color: '#64748B', fontSize: 12, fontWeight: '700' },
  name: { color: '#0F172A', fontSize: 17, fontWeight: '900', marginTop: 3 },
  content: { flex: 1, padding: 22, marginTop: -34 },
  summaryRow: { flexDirection: 'row', gap: 10 },
  metricCard: { flex: 1, backgroundColor: '#FFFFFF', borderRadius: 22, padding: 14, borderWidth: 1, borderColor: '#ECE7DD' },
  metricDot: { width: 8, height: 8, borderRadius: 4, marginBottom: 12 },
  metricValue: { color: '#111827', fontSize: 16, fontWeight: '900' },
  metricLabel: { color: '#78716C', fontSize: 11, fontWeight: '700', marginTop: 3 },
  panel: { marginTop: 18, backgroundColor: '#FFFFFF', borderRadius: 30, padding: 24, borderWidth: 1, borderColor: '#ECE7DD' },
  panelIcon: { width: 62, height: 62, borderRadius: 22, backgroundColor: '#FDE68A', alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  panelTitle: { color: '#111827', fontSize: 22, fontWeight: '900' },
  panelText: { color: '#57534E', fontSize: 14, lineHeight: 22, marginTop: 10 },
  primaryAction: { height: 56, borderRadius: 18, backgroundColor: '#0F172A', marginTop: 22, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  primaryActionText: { color: '#FFFFFF', fontSize: 15, fontWeight: '900' },
  logoutButton: { height: 54, borderRadius: 18, backgroundColor: '#FEF2F2', marginTop: 14, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8 },
  logoutText: { color: '#DC2626', fontSize: 14, fontWeight: '900' },
});
