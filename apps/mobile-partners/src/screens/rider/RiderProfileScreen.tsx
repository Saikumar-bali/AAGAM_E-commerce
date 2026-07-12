import React from 'react';
import { ScrollView, StatusBar, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Bike, LogOut, Mail, Phone, ShieldCheck, User } from 'lucide-react-native';
import { useAuthStore } from '@aagam/mobile-shared';

export const RiderProfileScreen = () => {
  const { user, logout } = useAuthStore();
  const initial = (user?.name || user?.email || 'R').slice(0, 1).toUpperCase();

  return (
    <ScrollView style={styles.page} contentContainerStyle={styles.content}>
      <StatusBar barStyle="light-content" />
      <View style={styles.hero}>
        <Text style={styles.eyebrow}>AAGAM PARTNERS</Text>
        <Text style={styles.title}>Rider profile</Text>
        <View style={styles.avatar}><Text style={styles.avatarText}>{initial}</Text></View>
        <Text style={styles.name}>{user?.name || 'AAGAM Rider'}</Text>
        <View style={styles.roleBadge}>
          <Bike size={15} color="#0F766E" />
          <Text style={styles.roleText}>RIDER</Text>
        </View>
      </View>

      <View style={styles.card}>
        <InfoRow icon={Mail} label="Email" value={user?.email || 'Not available'} />
        <InfoRow icon={Phone} label="Phone" value={(user as any)?.phone || 'Not available'} />
        <InfoRow icon={ShieldCheck} label="Account" value="Authenticated partner account" />
        <InfoRow icon={User} label="User ID" value={user?.id || 'Not available'} last />
      </View>

      <Text style={styles.help}>
        Availability and active delivery controls remain on the Dashboard tab. Signing out deactivates only this device's push subscription.
      </Text>

      <TouchableOpacity style={styles.logoutButton} onPress={() => void logout()}>
        <LogOut size={19} color="#B91C1C" />
        <Text style={styles.logoutText}>Sign out</Text>
      </TouchableOpacity>
      <View style={styles.bottomSpace} />
    </ScrollView>
  );
};

const InfoRow = ({ icon: Icon, label, value, last = false }: { icon: any; label: string; value: string; last?: boolean }) => (
  <View style={[styles.row, !last && styles.rowBorder]}>
    <View style={styles.rowIcon}><Icon size={18} color="#0F766E" /></View>
    <View style={styles.rowCopy}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={2}>{value}</Text>
    </View>
  </View>
);

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F5F3EE' },
  content: { paddingBottom: 120 },
  hero: { backgroundColor: '#0F172A', paddingTop: 58, paddingBottom: 30, paddingHorizontal: 24, alignItems: 'center', borderBottomLeftRadius: 34, borderBottomRightRadius: 34 },
  eyebrow: { color: '#94A3B8', fontSize: 11, fontWeight: '900', letterSpacing: 1.3 },
  title: { color: '#FFFFFF', fontSize: 28, fontWeight: '900', marginTop: 5 },
  avatar: { width: 82, height: 82, borderRadius: 28, backgroundColor: '#14B8A6', alignItems: 'center', justifyContent: 'center', marginTop: 24 },
  avatarText: { color: '#FFFFFF', fontSize: 34, fontWeight: '900' },
  name: { color: '#FFFFFF', fontSize: 21, fontWeight: '900', marginTop: 14 },
  roleBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, backgroundColor: '#CCFBF1', borderRadius: 999, paddingHorizontal: 12, paddingVertical: 6 },
  roleText: { color: '#0F766E', fontSize: 11, fontWeight: '900', letterSpacing: 0.8 },
  card: { margin: 20, backgroundColor: '#FFFFFF', borderRadius: 26, paddingHorizontal: 18, borderWidth: 1, borderColor: '#E7E5E4' },
  row: { flexDirection: 'row', alignItems: 'center', minHeight: 76 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  rowIcon: { width: 42, height: 42, borderRadius: 15, backgroundColor: '#F0FDFA', alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1, marginLeft: 13 },
  rowLabel: { color: '#78716C', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
  rowValue: { color: '#0F172A', fontSize: 14, fontWeight: '800', marginTop: 4 },
  help: { marginHorizontal: 24, color: '#57534E', fontSize: 13, lineHeight: 20 },
  logoutButton: { marginHorizontal: 20, marginTop: 20, height: 56, borderRadius: 18, backgroundColor: '#FEE2E2', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  logoutText: { color: '#B91C1C', fontSize: 15, fontWeight: '900' },
  bottomSpace: { height: 24 },
});
