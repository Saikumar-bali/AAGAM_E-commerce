import { useAuthStore } from '@aagam/mobile-shared';
import { useQuery } from '@tanstack/react-query';
import {
  Banknote,
  Bike,
  CalendarClock,
  ChevronRight,
  CircleHelp,
  FileCheck2,
  LogOut,
  Settings2,
  ShieldAlert,
  ShieldCheck,
  WalletCards,
} from 'lucide-react-native';
import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { riderService } from '../../api/riderService';
import { PartnerTabBrand } from '../../components/PartnerTabBrand';
import { RiderOnlineService } from '../../services/RiderOnlineService';

export const RiderProfileScreen = ({ navigation }: { navigation: any }) => {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuthStore();
  const query = useQuery({ queryKey: ['rider', 'profile'], queryFn: riderService.getProfile, retry: 1 });
  const profile: any = query.data || {};
  const lifecycle: any = profile.lifecycle || {};
  const initials = useMemo(() => String(profile.user?.name || user?.name || 'Rider')
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase(), [profile.user?.name, user?.name]);
  const approved = lifecycle.eligibleForOperations === true;
  const statusText = lifecycle.restricted
    ? 'RESTRICTED'
    : String(lifecycle.approvalStatus || profile.approvalStatus || 'PENDING').replaceAll('_', ' ');

  const signOut = async () => {
    try {
      await RiderOnlineService.stop();
    } finally {
      await logout();
    }
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#067B5C" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}
      >
        <View style={[styles.hero, { paddingTop: Math.max(insets.top, 20) + 12 }]}>
          <PartnerTabBrand inverse caption="RIDER PARTNER" style={styles.brandRow} />
          <View style={styles.profileRow}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
            <View style={styles.flex}>
              <Text style={styles.eyebrow}>RIDER SELF-SERVICE</Text>
              <Text style={styles.title}>{profile.user?.name || user?.name || 'Aagaam Rider'}</Text>
              <Text style={styles.subtitle}>{profile.user?.phone || profile.user?.email || user?.email || 'Partner account'}</Text>
            </View>
            {approved ? <ShieldCheck size={29} color="#A7F3D0" /> : <ShieldAlert size={29} color="#FDE68A" />}
          </View>
        </View>

        {query.isLoading ? (
          <View style={styles.state}><ActivityIndicator size="large" color="#0F766E" /><Text style={styles.stateText}>Loading Rider account…</Text></View>
        ) : (
          <View style={styles.content}>
            <TouchableOpacity
              accessibilityRole="button"
              style={[styles.statusCard, approved ? styles.statusApproved : styles.statusAttention]}
              onPress={() => navigation.navigate('RiderAccountStatus')}
            >
              {approved ? <ShieldCheck size={25} color="#15803D" /> : <ShieldAlert size={25} color="#B45309" />}
              <View style={styles.flex}>
                <Text style={styles.statusLabel}>Operational approval</Text>
                <Text style={styles.statusValue}>{statusText}</Text>
                <Text style={styles.statusHint}>{lifecycle.restrictionReason || (approved ? 'Documents and account are eligible for operations.' : 'Open this section for required changes and verification history.')}</Text>
              </View>
              <ChevronRight size={21} color={approved ? '#15803D' : '#B45309'} />
            </TouchableOpacity>

            <Text style={styles.sectionTitle}>Account</Text>
            <MenuRow icon={<Bike size={21} color="#0F766E" />} title="Profile, vehicle and bank" subtitle="Edit protected Rider information" onPress={() => navigation.navigate('RiderProfileDetails')} />
            <MenuRow icon={<FileCheck2 size={21} color="#0F766E" />} title="Documents and renewals" subtitle={`${profile.documents?.length || 0} submitted files`} onPress={() => navigation.navigate('RiderDocuments')} />
            <MenuRow icon={<CalendarClock size={21} color="#0F766E" />} title="Schedules and shifts" subtitle="Multiple work windows, timezone and calendar" onPress={() => navigation.navigate('RiderSchedule')} />

            <Text style={styles.sectionTitle}>Money and operations</Text>
            <MenuRow icon={<WalletCards size={21} color="#0F766E" />} title="COD ledger" subtitle="Deposits, settlements, variance and receipts" onPress={() => navigation.navigate('RiderCod')} />
            <MenuRow icon={<Banknote size={21} color="#0F766E" />} title="Payout history" subtitle="Paid entries from the Rider earnings ledger" onPress={() => navigation.navigate('RiderPayoutHistory')} />
            <MenuRow icon={<CircleHelp size={21} color="#0F766E" />} title="Support conversations" subtitle="Tickets, replies and evidence" onPress={() => navigation.navigate('RiderSupport')} />

            <Text style={styles.sectionTitle}>App controls</Text>
            <MenuRow icon={<Settings2 size={21} color="#0F766E" />} title="Notification settings" subtitle="Priority operations alerts" onPress={() => navigation.navigate('NotificationSettings')} />

            <TouchableOpacity accessibilityRole="button" style={styles.logout} onPress={() => void signOut()}>
              <LogOut size={20} color="#B91C1C" /><Text style={styles.logoutText}>Sign out</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
};

function MenuRow({ icon, title, subtitle, onPress }: { icon: React.ReactNode; title: string; subtitle: string; onPress: () => void }) {
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityLabel={`${title}. ${subtitle}`} style={styles.menuRow} onPress={onPress}>
      <View style={styles.menuIcon}>{icon}</View>
      <View style={styles.flex}><Text style={styles.menuTitle}>{title}</Text><Text style={styles.menuSubtitle}>{subtitle}</Text></View>
      <ChevronRight size={21} color="#64748B" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' }, flex: { flex: 1 },
  hero: { backgroundColor: '#067B5C', paddingHorizontal: 18, paddingBottom: 23 }, brandRow: { marginBottom: 17 }, profileRow: { flexDirection: 'row', alignItems: 'center', gap: 13 },
  avatar: { width: 58, height: 58, borderRadius: 19, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' }, avatarText: { color: '#067B5C', fontSize: 20, fontWeight: '900' },
  eyebrow: { color: '#A7F3D0', fontSize: 9, fontWeight: '900', letterSpacing: 1 }, title: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', marginTop: 2 }, subtitle: { color: '#D1FAE5', fontSize: 11, marginTop: 3 },
  content: { padding: 14 },
  statusCard: { borderRadius: 18, borderWidth: 1, padding: 15, flexDirection: 'row', alignItems: 'center', gap: 11 }, statusApproved: { backgroundColor: '#F0FDF4', borderColor: '#86EFAC' }, statusAttention: { backgroundColor: '#FFFBEB', borderColor: '#FCD34D' },
  statusLabel: { color: '#64748B', fontSize: 10, fontWeight: '800' }, statusValue: { color: '#0F172A', fontSize: 16, fontWeight: '900', marginTop: 2 }, statusHint: { color: '#475569', fontSize: 10, lineHeight: 15, marginTop: 3 },
  sectionTitle: { color: '#0F172A', fontSize: 15, fontWeight: '900', marginTop: 19, marginBottom: 8 },
  menuRow: { minHeight: 74, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 13, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 11 },
  menuIcon: { width: 42, height: 42, borderRadius: 13, backgroundColor: '#CCFBF1', alignItems: 'center', justifyContent: 'center' }, menuTitle: { color: '#0F172A', fontSize: 13, fontWeight: '900' }, menuSubtitle: { color: '#64748B', fontSize: 10, lineHeight: 15, marginTop: 3 },
  logout: { minHeight: 52, borderRadius: 15, backgroundColor: '#FEF2F2', borderWidth: 1, borderColor: '#FECACA', marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, logoutText: { color: '#B91C1C', fontWeight: '900' },
  state: { minHeight: 420, alignItems: 'center', justifyContent: 'center' }, stateText: { color: '#64748B', marginTop: 10 },
});
