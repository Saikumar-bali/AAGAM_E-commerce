import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Banknote, Bike, Save, ShieldCheck } from 'lucide-react-native';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { riderService } from '../../api/riderService';

function errorMessage(error: any) {
  const value = error?.response?.data?.message;
  return Array.isArray(value) ? value.join(', ') : value || error?.message || 'Profile update failed.';
}

export const RiderProfileDetailsScreen = ({ navigation }: { navigation: any }) => {
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ['rider', 'profile'], queryFn: riderService.getProfile, retry: 1 });
  const profile: any = query.data || {};
  const [vehicleType, setVehicleType] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');

  useEffect(() => {
    if (!query.data) return;
    setVehicleType(profile.vehicleType || '');
    setVehicleNumber(profile.vehicleNumber || '');
    setEmergencyName(profile.emergencyContactName || '');
    setEmergencyPhone(profile.emergencyContactPhone || '');
  }, [query.data]);

  const mutation = useMutation({
    mutationFn: () => riderService.updateProfile({
      vehicleType: vehicleType.trim() || undefined,
      vehicleNumber: vehicleNumber.trim().toUpperCase() || undefined,
      emergencyContactName: emergencyName.trim() || undefined,
      emergencyContactPhone: emergencyPhone.trim() || undefined,
      bankAccountNumber: bankAccount.trim() || undefined,
      bankIfsc: bankIfsc.trim().toUpperCase() || undefined,
    }),
    onSuccess: async () => {
      setBankAccount('');
      setBankIfsc('');
      await queryClient.invalidateQueries({ queryKey: ['rider', 'profile'] });
      Toast.show({ type: 'success', text1: 'Profile updated', text2: 'Protected bank fields were stored securely.' });
    },
    onError: (error: any) => Toast.show({ type: 'error', text1: 'Profile update failed', text2: errorMessage(error) }),
  });

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar barStyle="light-content" backgroundColor="#067B5C" />
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 20) + 8 }]}>
        <TouchableOpacity accessibilityRole="button" accessibilityLabel="Back to Rider profile" style={styles.back} onPress={() => navigation.goBack()}><ArrowLeft size={23} color="#FFFFFF" /></TouchableOpacity>
        <View style={styles.flex}><Text style={styles.eyebrow}>PROTECTED ACCOUNT</Text><Text style={styles.title}>Profile, vehicle and bank</Text></View>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}>
        {query.isLoading ? <View style={styles.state}><ActivityIndicator size="large" color="#0F766E" /></View> : (
          <>
            <View style={styles.card}>
              <SectionTitle icon={<Bike size={21} color="#0F766E" />} title="Vehicle and emergency contact" />
              <Field label="Vehicle type" value={vehicleType} onChangeText={setVehicleType} placeholder="Bike, scooter, EV" />
              <Field label="Vehicle number" value={vehicleNumber} onChangeText={setVehicleNumber} placeholder="AP00AB1234" autoCapitalize="characters" />
              <Field label="Emergency contact name" value={emergencyName} onChangeText={setEmergencyName} placeholder="Full name" />
              <Field label="Emergency contact phone" value={emergencyPhone} onChangeText={setEmergencyPhone} placeholder="+919876543210" keyboardType="phone-pad" />
            </View>

            <View style={styles.card}>
              <SectionTitle icon={<Banknote size={21} color="#0F766E" />} title="Bank payout account" />
              <View style={styles.safeNote}><ShieldCheck size={19} color="#15803D" /><Text style={styles.safeText}>The app never retrieves the full bank account. Current account: {profile.bank?.accountMasked || 'not added'} · {String(profile.bankStatus || 'PENDING').replaceAll('_', ' ')}</Text></View>
              <Field label="New account number" value={bankAccount} onChangeText={(value: string) => setBankAccount(value.replace(/\D/g, ''))} placeholder="Enter only to replace" keyboardType="number-pad" secureTextEntry />
              <Field label="IFSC" value={bankIfsc} onChangeText={setBankIfsc} placeholder="ABCD0123456" autoCapitalize="characters" />
            </View>

            <TouchableOpacity accessibilityRole="button" accessibilityState={{ disabled: mutation.isPending }} disabled={mutation.isPending} style={styles.save} onPress={() => mutation.mutate()}>
              {mutation.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Save size={20} color="#FFFFFF" />}
              <Text style={styles.saveText}>Save profile changes</Text>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return <View style={styles.sectionTitle}>{icon}<Text style={styles.sectionTitleText}>{title}</Text></View>;
}

function Field({ label, ...props }: any) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput {...props} placeholderTextColor="#94A3B8" style={styles.input} /></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' }, flex: { flex: 1 },
  header: { backgroundColor: '#067B5C', paddingHorizontal: 16, paddingBottom: 18, flexDirection: 'row', alignItems: 'center', gap: 12 }, back: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.14)', alignItems: 'center', justifyContent: 'center' },
  eyebrow: { color: '#A7F3D0', fontSize: 9, fontWeight: '900', letterSpacing: 1 }, title: { color: '#FFFFFF', fontSize: 20, fontWeight: '900' },
  content: { padding: 14 }, card: { borderRadius: 18, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 15, marginBottom: 12 },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 5 }, sectionTitleText: { color: '#0F172A', fontSize: 16, fontWeight: '900' },
  field: { marginTop: 12 }, label: { color: '#475569', fontSize: 11, fontWeight: '800', marginBottom: 6 }, input: { minHeight: 50, borderRadius: 13, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC', paddingHorizontal: 13, color: '#0F172A', fontSize: 14 },
  safeNote: { borderRadius: 13, backgroundColor: '#F0FDF4', padding: 12, flexDirection: 'row', gap: 8 }, safeText: { flex: 1, color: '#166534', fontSize: 11, lineHeight: 17 },
  save: { minHeight: 54, borderRadius: 15, backgroundColor: '#067B5C', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, saveText: { color: '#FFFFFF', fontWeight: '900' },
  state: { minHeight: 420, alignItems: 'center', justifyContent: 'center' },
});
