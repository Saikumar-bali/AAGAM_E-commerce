import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  Bike,
  ChevronRight,
  CircleHelp,
  CircleUserRound,
  Info,
  LockKeyhole,
  LogOut,
  Settings,
  ShieldCheck,
  Star,
} from 'lucide-react-native';
import React from 'react';
import {
  Alert,
  Image,
  Linking,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@aagam/mobile-shared';
import { riderService } from '../../api/riderService';
import { RiderOnlineService } from '../../services/RiderOnlineService';

const WORKSPACE_KEY = ['rider', 'delivery-workspace'] as const;

function firstText(...values: unknown[]) {
  const value = values.find((item) => typeof item === 'string' && item.trim());
  return typeof value === 'string' ? value : null;
}

function errorMessage(error: any) {
  const value = error?.response?.data?.message;
  if (Array.isArray(value)) return value.join(', ');
  return value || error?.message || 'The action could not be completed.';
}

export const RiderProfileScreen = () => {
  const { user, logout } = useAuthStore();
  const queryClient = useQueryClient();
  const profileQuery = useQuery({
    queryKey: ['rider', 'profile', user?.id],
    queryFn: () => riderService.getProfile(String(user?.id)),
    enabled: Boolean(user?.id),
    retry: 1,
  });
  const workspaceQuery = useQuery({
    queryKey: WORKSPACE_KEY,
    queryFn: riderService.getWorkspace,
    refetchInterval: 15_000,
  });
  const profile: any = profileQuery.data || {};
  const rider: any = profile.rider || profile;
  const vehicle: any = rider.vehicle || profile.vehicle || rider.vehicleDetails || {};
  const isOnline = Boolean(workspaceQuery.data?.rider && workspaceQuery.data.rider.status !== 'OFFLINE');
  const displayName = firstText(user?.name, rider.name, rider.user?.name) || 'Aagaam Rider';
  const phone = firstText((user as any)?.phone, rider.phone, rider.user?.phone) || 'Phone not available';
  const initial = displayName.slice(0, 1).toUpperCase();
  const imageUri = firstText(
    rider.profileImageUrl,
    rider.photoUrl,
    rider.avatarUrl,
    rider.user?.profileImageUrl,
    (user as any)?.profileImageUrl,
  );
  const rating = typeof rider.rating === 'number' ? rider.rating : null;
  const ratingCount = Number(rider.ratingCount || rider.ratingsCount || 0);
  const verified = Boolean(rider.isVerified || rider.verifiedAt || rider.status === 'APPROVED');
  const vehicleName = firstText(vehicle.model, vehicle.name, vehicle.vehicleModel, rider.vehicleModel) || 'Vehicle not added';
  const registration = firstText(vehicle.registrationNumber, vehicle.number, rider.vehicleNumber) || 'Registration unavailable';
  const vehicleColor = firstText(vehicle.color, rider.vehicleColor);

  const availabilityMutation = useMutation({
    mutationFn: async () => {
      if (isOnline) {
        await RiderOnlineService.stop().catch(() => false);
        return riderService.updateMyStatus('OFFLINE');
      }
      const result = await riderService.updateMyStatus('ONLINE');
      await RiderOnlineService.start(displayName);
      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: WORKSPACE_KEY });
      Toast.show({
        type: 'success',
        text1: isOnline ? 'Availability paused' : 'You are online',
        text2: isOnline ? 'You will not receive new jobs.' : 'You can now receive rider jobs.',
      });
    },
    onError: (error: any) => Toast.show({
      type: 'error',
      text1: 'Could not update availability',
      text2: errorMessage(error),
    }),
  });

  const handleMenuPress = async (label: string) => {
    if (label === 'Help & Support') {
      try {
        await Linking.openURL('mailto:support@aagam.com?subject=Aagaam%20Partner%20Support');
      } catch {
        Alert.alert(label, 'Email support@aagam.com for assistance.');
      }
      return;
    }
    if (label === 'Rate the App') {
      try {
        await Linking.openURL('https://play.google.com/store/apps/details?id=com.aagampartners');
      } catch {
        Alert.alert(label, 'The app store is not available on this device.');
      }
      return;
    }
    if (label === 'About AAGAAM Partners') {
      Alert.alert(label, 'AAGAAM Partners helps riders manage delivery jobs, tracking, proof of delivery, earnings and support.');
      return;
    }
    const copy: Record<string, string> = {
      'Account Information': `Name: ${displayName}\nPhone: ${phone}\nEmail: ${user?.email || 'Not available'}`,
      'Bank & Payout Details': 'Payout account information is managed securely by Aagaam operations.',
      Permissions: 'Location, notification and delivery permissions are managed by Android and the active rider workflow.',
    };
    Alert.alert(label, copy[label] || 'This section is managed by Aagaam operations.');
  };

  const handleLogout = async () => {
    Alert.alert('Logout?', 'You will stop receiving rider jobs on this device.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: () => void (async () => {
          await RiderOnlineService.stop().catch(() => false);
          await logout();
        })(),
      },
    ]);
  };

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#067B5C" />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <View style={styles.titleRow}>
            <Text style={styles.title}>Profile</Text>
            <TouchableOpacity
              accessibilityLabel="Profile settings"
              style={styles.settingsButton}
              onPress={() => Alert.alert('Settings', 'Profile settings are managed through the options below.')}
            >
              <Settings size={32} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.profileCard}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.avatarImage} />
          ) : (
            <View style={styles.avatarFallback}><Text style={styles.avatarText}>{initial}</Text></View>
          )}
          <View style={styles.profileCopy}>
            <View style={styles.nameRow}>
              <Text style={styles.name} numberOfLines={1}>{displayName}</Text>
              {verified ? (
                <View style={styles.verifiedBadge}><ShieldCheck size={15} color="#FFFFFF" /></View>
              ) : null}
            </View>
            <Text style={styles.phone}>{phone}</Text>
            <View style={styles.ratingRow}>
              <Star size={21} color="#FFB400" fill="#FFB400" />
              <Text style={styles.ratingText}>
                {rating == null ? 'Not rated yet' : `${rating.toFixed(1)} (${ratingCount} ratings)`}
              </Text>
            </View>
          </View>
        </View>

        <View style={styles.availabilityCard}>
          <Text style={styles.availabilityTitle}>Availability</Text>
          <Text style={[styles.availabilityValue, !isOnline && styles.offlineText]}>{isOnline ? 'Online' : 'Offline'}</Text>
          <Switch
            testID="rider_profile_availability_switch"
            disabled={availabilityMutation.isPending}
            value={isOnline}
            onValueChange={() => availabilityMutation.mutate()}
            trackColor={{ false: '#CDD3D0', true: '#08A56B' }}
            thumbColor="#FFFFFF"
          />
        </View>

        <TouchableOpacity style={styles.vehicleCard} onPress={() => handleMenuPress('Vehicle Details')}>
          <Text style={styles.vehicleHeading}>Vehicle Details</Text>
          <View style={styles.vehicleRow}>
            <View style={styles.vehicleIcon}><Bike size={43} color="#15212D" /></View>
            <View style={styles.vehicleCopy}>
              <Text style={styles.vehicleName}>{vehicleName}</Text>
              <Text style={styles.vehicleMeta}>
                {registration}{vehicleColor ? `  •  ${vehicleColor}` : ''}
              </Text>
            </View>
            <ChevronRight size={28} color="#4A5156" />
          </View>
        </TouchableOpacity>

        <View style={styles.menuCard}>
          <MenuRow icon={CircleUserRound} label="Account Information" onPress={() => void handleMenuPress('Account Information')} />
          <MenuRow icon={Banknote} label="Bank & Payout Details" onPress={() => void handleMenuPress('Bank & Payout Details')} />
          <MenuRow icon={LockKeyhole} label="Permissions" onPress={() => void handleMenuPress('Permissions')} />
          <MenuRow icon={CircleHelp} label="Help & Support" onPress={() => void handleMenuPress('Help & Support')} />
          <MenuRow icon={Star} label="Rate the App" onPress={() => void handleMenuPress('Rate the App')} />
          <MenuRow icon={Info} label="About AAGAAM Partners" last onPress={() => void handleMenuPress('About AAGAAM Partners')} />
        </View>

        <TouchableOpacity testID="rider_profile_logout_button" style={styles.logoutCard} onPress={() => void handleLogout()}>
          <LogOut size={23} color="#E21822" />
          <Text style={styles.logoutText}>Logout</Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};

function MenuRow({ icon: Icon, label, last = false, onPress }: any) {
  return (
    <TouchableOpacity style={[styles.menuRow, !last && styles.menuRowBorder]} onPress={onPress}>
      <Icon size={23} color="#3F4850" />
      <Text style={styles.menuLabel}>{label}</Text>
      <ChevronRight size={25} color="#4A5156" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F8F7' },
  scroll: { flex: 1 },
  content: { paddingBottom: 112 },
  hero: { height: 235, backgroundColor: '#067B5C', paddingTop: 56, paddingHorizontal: 18 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { color: '#FFFFFF', fontSize: 31, fontWeight: '900' },
  settingsButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  profileCard: { marginHorizontal: 14, marginTop: -101, minHeight: 153, borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E4E3', padding: 14, flexDirection: 'row', alignItems: 'center', elevation: 4 },
  avatarImage: { width: 112, height: 112, borderRadius: 56, backgroundColor: '#E8EFEC' },
  avatarFallback: { width: 112, height: 112, borderRadius: 56, backgroundColor: '#078D63', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#FFFFFF', fontSize: 42, fontWeight: '900' },
  profileCopy: { flex: 1, marginLeft: 18 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { color: '#111111', fontSize: 22, fontWeight: '900', flexShrink: 1 },
  verifiedBadge: { width: 25, height: 25, borderRadius: 13, backgroundColor: '#0AA66A', alignItems: 'center', justifyContent: 'center' },
  phone: { color: '#545C62', fontSize: 16, marginTop: 7 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  ratingText: { color: '#4A5156', fontSize: 14, fontWeight: '600' },
  availabilityCard: { height: 72, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E4E3', marginHorizontal: 14, marginTop: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', elevation: 2 },
  availabilityTitle: { flex: 1, color: '#1A1D1F', fontSize: 17, fontWeight: '800' },
  availabilityValue: { color: '#08A15B', fontSize: 15, fontWeight: '800', marginRight: 10 },
  offlineText: { color: '#7A827E' },
  vehicleCard: { borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E4E3', marginHorizontal: 14, marginTop: 12, padding: 16, elevation: 2 },
  vehicleHeading: { color: '#111111', fontSize: 16, fontWeight: '800' },
  vehicleRow: { flexDirection: 'row', alignItems: 'center', marginTop: 14 },
  vehicleIcon: { width: 72, alignItems: 'center' },
  vehicleCopy: { flex: 1 },
  vehicleName: { color: '#111111', fontSize: 17, fontWeight: '900' },
  vehicleMeta: { color: '#555D63', fontSize: 14, marginTop: 5 },
  menuCard: { borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E4E3', marginHorizontal: 14, marginTop: 12, paddingHorizontal: 14, elevation: 2 },
  menuRow: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 14 },
  menuRowBorder: { borderBottomWidth: 1, borderBottomColor: '#E8EAE9' },
  menuLabel: { flex: 1, color: '#171A1C', fontSize: 15, fontWeight: '600' },
  logoutCard: { height: 66, borderRadius: 16, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E1E4E3', marginHorizontal: 14, marginTop: 12, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 13, elevation: 2 },
  logoutText: { color: '#E21822', fontSize: 17, fontWeight: '800' },
});
