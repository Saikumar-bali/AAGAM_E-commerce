import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  Bike,
  CalendarDays,
  CircleHelp,
  Clock3,
  FileCheck2,
  FolderOpen,
  LogOut,
  Save,
  ShieldCheck,
  Star,
} from 'lucide-react-native';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import Toast from 'react-native-toast-message';
import { useAuthStore } from '@aagam/mobile-shared';
import { PartnerDocumentPicker, PartnerPickedDocument } from '../../native/PartnerDocumentPicker';
import { riderService } from '../../api/riderService';
import { RiderOnlineService } from '../../services/RiderOnlineService';
import type {
  RiderAvailabilityEntry,
  RiderDocumentInput,
  RiderSupportInput,
} from '../../api/riderService';

const PROFILE_KEY = ['rider', 'profile'] as const;
const AVAILABILITY_KEY = ['rider', 'availability'] as const;
const COD_KEY = ['rider', 'cod'] as const;
const PERFORMANCE_KEY = ['rider', 'performance'] as const;
const SUPPORT_KEY = ['rider', 'support'] as const;
const EARNINGS_KEY = ['rider', 'earnings'] as const;
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DOCUMENT_TYPES: RiderDocumentInput['type'][] = [
  'DRIVING_LICENSE',
  'IDENTITY',
  'VEHICLE_REGISTRATION',
  'VEHICLE_INSURANCE',
  'OTHER',
];
const SUPPORT_CATEGORIES: RiderSupportInput['category'][] = [
  'DELIVERY',
  'PICKUP',
  'CUSTOMER',
  'STORE',
  'PAYMENT',
  'SAFETY',
  'APP',
  'OTHER',
];
type Section = 'PROFILE' | 'WORK' | 'SUPPORT';
type ScheduleDraft = RiderAvailabilityEntry & { enabled: boolean };

function errorMessage(error: any) {
  const value = error?.response?.data?.message;
  if (Array.isArray(value)) return value.join(', ');
  return value || error?.message || 'The action could not be completed.';
}

function paise(value: unknown) {
  return `₹${(Number(value || 0) / 100).toFixed(2)}`;
}

function defaultSchedule(): ScheduleDraft[] {
  return DAYS.map((_day, dayOfWeek) => ({
    dayOfWeek,
    startMinute: 540,
    endMinute: 1080,
    isAvailable: true,
    enabled: dayOfWeek >= 1 && dayOfWeek <= 6,
  }));
}

export const RiderProfileScreen = () => {
  const { user, logout } = useAuthStore();
  const queryClient = useQueryClient();
  const [section, setSection] = useState<Section>('PROFILE');
  const [vehicleType, setVehicleType] = useState('');
  const [vehicleNumber, setVehicleNumber] = useState('');
  const [emergencyName, setEmergencyName] = useState('');
  const [emergencyPhone, setEmergencyPhone] = useState('');
  const [bankAccount, setBankAccount] = useState('');
  const [bankIfsc, setBankIfsc] = useState('');
  const [schedule, setSchedule] = useState<ScheduleDraft[]>(defaultSchedule());
  const [breakReason, setBreakReason] = useState('');
  const [documentType, setDocumentType] = useState<RiderDocumentInput['type']>('DRIVING_LICENSE');
  const [documentLast4, setDocumentLast4] = useState('');
  const [documentExpiry, setDocumentExpiry] = useState('');
  const [selectedDocument, setSelectedDocument] = useState<PartnerPickedDocument | null>(null);
  const [supportCategory, setSupportCategory] = useState<RiderSupportInput['category']>('APP');
  const [supportSubject, setSupportSubject] = useState('');
  const [supportDescription, setSupportDescription] = useState('');

  const profileQuery = useQuery({ queryKey: PROFILE_KEY, queryFn: riderService.getProfile, retry: 1 });
  const availabilityQuery = useQuery({ queryKey: AVAILABILITY_KEY, queryFn: riderService.getAvailability, retry: 1 });
  const codQuery = useQuery({ queryKey: COD_KEY, queryFn: riderService.getCodLedger, retry: 1 });
  const performanceQuery = useQuery({ queryKey: PERFORMANCE_KEY, queryFn: riderService.getPerformance, retry: 1 });
  const supportQuery = useQuery({ queryKey: SUPPORT_KEY, queryFn: riderService.getSupportTickets, retry: 1 });
  const earningsQuery = useQuery({ queryKey: EARNINGS_KEY, queryFn: riderService.getEarnings, retry: 1 });

  const profile: any = profileQuery.data || {};
  const availability: any = availabilityQuery.data || {};
  const supportTickets = Array.isArray(supportQuery.data) ? supportQuery.data : [];

  useEffect(() => {
    if (!profileQuery.data) return;
    setVehicleType(profile.vehicleType || '');
    setVehicleNumber(profile.vehicleNumber || '');
    setEmergencyName(profile.emergencyContactName || '');
    setEmergencyPhone(profile.emergencyContactPhone || '');
  }, [profileQuery.data]);

  useEffect(() => {
    const entries = Array.isArray(availability.schedule) ? availability.schedule : [];
    if (!entries.length) return;
    setSchedule(DAYS.map((_day, dayOfWeek) => {
      const row = entries.find((entry: any) => Number(entry.dayOfWeek) === dayOfWeek);
      return row
        ? {
            dayOfWeek,
            startMinute: Number(row.startMinute),
            endMinute: Number(row.endMinute),
            isAvailable: Boolean(row.isAvailable),
            enabled: Boolean(row.isAvailable),
          }
        : {
            dayOfWeek,
            startMinute: 540,
            endMinute: 1080,
            isAvailable: true,
            enabled: false,
          };
    }));
  }, [availabilityQuery.data]);

  const refresh = async () => {
    await Promise.all([
      profileQuery.refetch(),
      availabilityQuery.refetch(),
      codQuery.refetch(),
      performanceQuery.refetch(),
      supportQuery.refetch(),
      earningsQuery.refetch(),
    ]);
  };

  const profileMutation = useMutation({
    mutationFn: () => riderService.updateProfile({
      ...(vehicleType.trim() ? { vehicleType: vehicleType.trim() } : {}),
      ...(vehicleNumber.trim() ? { vehicleNumber: vehicleNumber.trim().toUpperCase() } : {}),
      ...(emergencyName.trim() ? { emergencyContactName: emergencyName.trim() } : {}),
      ...(emergencyPhone.trim() ? { emergencyContactPhone: emergencyPhone.trim() } : {}),
      ...(bankAccount.trim() || bankIfsc.trim()
        ? { bankAccountNumber: bankAccount.trim(), bankIfsc: bankIfsc.trim().toUpperCase() }
        : {}),
    }),
    onSuccess: async () => {
      setBankAccount('');
      setBankIfsc('');
      await queryClient.invalidateQueries({ queryKey: PROFILE_KEY });
      Toast.show({ type: 'success', text1: 'Profile updated', text2: 'Your rider details were saved securely.' });
    },
    onError: (error: any) => Toast.show({ type: 'error', text1: 'Profile update failed', text2: errorMessage(error) }),
  });

  const scheduleMutation = useMutation({
    mutationFn: () => riderService.updateAvailabilitySchedule(
      schedule
        .filter((entry) => entry.enabled)
        .map(({ enabled: _enabled, ...entry }) => entry),
    ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: AVAILABILITY_KEY });
      Toast.show({ type: 'success', text1: 'Availability saved', text2: 'Dispatch can use your weekly work windows.' });
    },
    onError: (error: any) => Toast.show({ type: 'error', text1: 'Schedule update failed', text2: errorMessage(error) }),
  });

  const breakMutation = useMutation({
    mutationFn: () => availability.currentBreak
      ? riderService.endBreak()
      : riderService.startBreak(breakReason.trim() || undefined),
    onSuccess: async () => {
      setBreakReason('');
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: AVAILABILITY_KEY }),
        queryClient.invalidateQueries({ queryKey: ['rider', 'delivery-workspace'] }),
      ]);
      Toast.show({
        type: 'success',
        text1: availability.currentBreak ? 'Break ended' : 'Break started',
        text2: availability.currentBreak ? 'You are available for dispatch again.' : 'New offers are paused.',
      });
    },
    onError: (error: any) => Toast.show({ type: 'error', text1: 'Break update failed', text2: errorMessage(error) }),
  });

  const documentMutation = useMutation({
    mutationFn: async () => {
      if (!selectedDocument) throw new Error('Choose a photo or PDF first.');
      return riderService.uploadAndSubmitDocument(
        selectedDocument,
        {
          type: documentType,
          documentNumberLast4: documentLast4.trim() || undefined,
          expiresAt: documentExpiry.trim() || undefined,
        },
      );
    },
    onSuccess: async () => {
      setSelectedDocument(null);
      setDocumentLast4('');
      setDocumentExpiry('');
      await queryClient.invalidateQueries({ queryKey: PROFILE_KEY });
      Toast.show({ type: 'success', text1: 'Document uploaded', text2: 'The file is pending administrator review.' });
    },
    onError: (error: any) => Toast.show({ type: 'error', text1: 'Document upload failed', text2: errorMessage(error) }),
  });

  const supportMutation = useMutation({
    mutationFn: () => riderService.createSupportTicket({
      category: supportCategory,
      subject: supportSubject.trim(),
      description: supportDescription.trim(),
    }),
    onSuccess: async () => {
      setSupportSubject('');
      setSupportDescription('');
      await queryClient.invalidateQueries({ queryKey: SUPPORT_KEY });
      Toast.show({ type: 'success', text1: 'Support ticket created', text2: 'Operations can now review the issue.' });
    },
    onError: (error: any) => Toast.show({ type: 'error', text1: 'Support request failed', text2: errorMessage(error) }),
  });

  const chooseDocument = async () => {
    try {
      const file = await PartnerDocumentPicker.pickDocument();
      setSelectedDocument(file);
    } catch (error: any) {
      if (error?.code !== 'DOCUMENT_PICKER_CANCELLED') {
        Toast.show({ type: 'error', text1: 'Document unavailable', text2: error?.message || 'Could not open the document picker.' });
      }
    }
  };

  const initials = useMemo(() => String(profile.user?.name || user?.name || 'Rider')
    .split(/\s+/)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase(), [profile.user?.name, user?.name]);

  const signOutRider = async () => {
    try {
      await RiderOnlineService.stop();
    } finally {
      await logout();
    }
  };

  const profileLoading = profileQuery.isLoading || availabilityQuery.isLoading;
  const financialLoading = codQuery.isLoading || performanceQuery.isLoading || earningsQuery.isLoading;
  const financialError = codQuery.error || performanceQuery.error || earningsQuery.error;
  const cod: any = codQuery.data;
  const performance: any = performanceQuery.data;
  const earnings: any = earningsQuery.data;

  return (
    <View style={styles.screen}>
      <StatusBar barStyle="light-content" backgroundColor="#067B5C" />
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={profileQuery.isRefetching || availabilityQuery.isRefetching} onRefresh={() => void refresh()} />}
      >
        <View style={styles.hero}>
          <View style={styles.avatar}><Text style={styles.avatarText}>{initials}</Text></View>
          <View style={styles.flex}>
            <Text style={styles.eyebrow}>RIDER SELF-SERVICE</Text>
            <Text style={styles.title}>{profile.user?.name || user?.name || 'Aagaam Rider'}</Text>
            <Text style={styles.subtitle}>{profile.user?.phone || profile.user?.email || user?.email || 'Verified partner account'}</Text>
          </View>
          <ShieldCheck size={27} color="#A7F3D0" />
        </View>

        <View style={styles.tabs}>
          {(['PROFILE', 'WORK', 'SUPPORT'] as Section[]).map((item) => (
            <TouchableOpacity key={item} style={[styles.tab, section === item && styles.tabActive]} onPress={() => setSection(item)}>
              <Text style={[styles.tabText, section === item && styles.tabTextActive]}>{item === 'WORK' ? 'Work & money' : item === 'SUPPORT' ? 'Support' : 'Profile'}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {profileLoading ? (
          <StateLoading label="Loading rider profile…" />
        ) : section === 'PROFILE' ? (
          <>
            <Card icon={<Bike size={21} color="#0F766E" />} title="Vehicle & emergency contact">
              <Field label="Vehicle type" value={vehicleType} onChangeText={setVehicleType} placeholder="Bike, scooter, EV…" />
              <Field label="Vehicle number" value={vehicleNumber} onChangeText={setVehicleNumber} placeholder="AP31AB1234" autoCapitalize="characters" />
              <Field label="Emergency contact name" value={emergencyName} onChangeText={setEmergencyName} placeholder="Full name" />
              <Field label="Emergency contact phone" value={emergencyPhone} onChangeText={setEmergencyPhone} placeholder="+919876543210" keyboardType="phone-pad" />
            </Card>

            <Card icon={<Banknote size={21} color="#0F766E" />} title="Protected bank details">
              <Text style={styles.helpText}>{profile.bank?.accountMasked ? `Current account ${profile.bank.accountMasked} · ${profile.bank.status}` : 'No payout account is on file.'}</Text>
              <Field label="New account number" value={bankAccount} onChangeText={setBankAccount} placeholder="Leave blank to keep current" keyboardType="number-pad" secureTextEntry />
              <Field label="New IFSC" value={bankIfsc} onChangeText={setBankIfsc} placeholder="ABCD0123456" autoCapitalize="characters" />
            </Card>

            <TouchableOpacity style={styles.primaryButton} disabled={profileMutation.isPending} onPress={() => profileMutation.mutate()}>
              {profileMutation.isPending ? <ActivityIndicator color="#FFFFFF" /> : <><Save size={19} color="#FFFFFF" /><Text style={styles.primaryText}>Save profile</Text></>}
            </TouchableOpacity>

            <Card icon={<FileCheck2 size={21} color="#0F766E" />} title="Compliance documents">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRail}>
                {DOCUMENT_TYPES.map((type) => <Chip key={type} label={type.replaceAll('_', ' ')} active={documentType === type} onPress={() => setDocumentType(type)} />)}
              </ScrollView>
              <TouchableOpacity style={styles.filePicker} onPress={() => void chooseDocument()}>
                <FolderOpen size={22} color="#0F766E" />
                <View style={styles.flex}>
                  <Text style={styles.fileTitle}>{selectedDocument?.name || 'Choose image or PDF'}</Text>
                  <Text style={styles.fileMeta}>{selectedDocument ? `${Math.ceil(selectedDocument.size / 1024)} KB · ${selectedDocument.type}` : 'Maximum 10 MB'}</Text>
                </View>
              </TouchableOpacity>
              <Field label="Document number last 4" value={documentLast4} onChangeText={(value) => setDocumentLast4(value.slice(0, 4))} placeholder="1234" />
              <Field label="Expiry date (optional)" value={documentExpiry} onChangeText={setDocumentExpiry} placeholder="2028-12-31" />
              <TouchableOpacity style={styles.secondaryButton} disabled={documentMutation.isPending || !selectedDocument} onPress={() => documentMutation.mutate()}>
                {documentMutation.isPending ? <ActivityIndicator color="#0F766E" /> : <Text style={styles.secondaryText}>Upload and submit document</Text>}
              </TouchableOpacity>
              {(profile.documents || []).map((document: any) => (
                <View key={document.id} style={styles.row}>
                  <View style={styles.flex}>
                    <Text style={styles.rowTitle}>{String(document.type).replaceAll('_', ' ')}</Text>
                    <Text style={styles.rowText}>{document.documentNumberLast4 ? `Ending ${document.documentNumberLast4}` : 'Number hidden'}</Text>
                  </View>
                  <StatusPill value={document.status} />
                </View>
              ))}
            </Card>
          </>
        ) : section === 'WORK' ? (
          <>
            <Card icon={<CalendarDays size={21} color="#0F766E" />} title="Weekly availability">
              {schedule.map((entry, index) => (
                <View key={entry.dayOfWeek} style={styles.row}>
                  <Switch
                    value={entry.enabled}
                    onValueChange={(enabled) => setSchedule((current) => current.map((item, currentIndex) => currentIndex === index ? { ...item, enabled, isAvailable: enabled } : item))}
                  />
                  <View style={styles.flex}>
                    <Text style={styles.rowTitle}>{DAYS[entry.dayOfWeek]}</Text>
                    <Text style={styles.rowText}>{entry.enabled ? '09:00 – 18:00' : 'Unavailable'}</Text>
                  </View>
                </View>
              ))}
              <TouchableOpacity style={styles.secondaryButton} disabled={scheduleMutation.isPending} onPress={() => scheduleMutation.mutate()}>
                {scheduleMutation.isPending ? <ActivityIndicator color="#0F766E" /> : <Text style={styles.secondaryText}>Save weekly schedule</Text>}
              </TouchableOpacity>
            </Card>

            <Card icon={<Clock3 size={21} color="#0F766E" />} title="Break & shifts">
              {availability.currentBreak ? (
                <Text style={styles.warning}>Break active since {new Date(availability.currentBreak.startedAt).toLocaleTimeString('en-IN')}</Text>
              ) : (
                <Field label="Break reason (optional)" value={breakReason} onChangeText={setBreakReason} placeholder="Lunch, fuel, rest…" />
              )}
              <TouchableOpacity style={styles.secondaryButton} disabled={breakMutation.isPending} onPress={() => breakMutation.mutate()}>
                {breakMutation.isPending ? <ActivityIndicator color="#0F766E" /> : <Text style={styles.secondaryText}>{availability.currentBreak ? 'End break and go online' : 'Start break'}</Text>}
              </TouchableOpacity>
              {availability.currentShift ? <ShiftRow label="Current shift" shift={availability.currentShift} /> : <Text style={styles.helpText}>No active shift right now.</Text>}
              {(availability.upcomingShifts || []).map((shift: any) => <ShiftRow key={shift.id} label="Upcoming" shift={shift} />)}
            </Card>

            {financialLoading ? (
              <StateLoading label="Loading COD and performance data…" />
            ) : financialError ? (
              <View style={styles.errorCard}>
                <Text style={styles.errorTitle}>Financial data unavailable</Text>
                <Text style={styles.errorText}>{errorMessage(financialError)}</Text>
                <TouchableOpacity style={styles.secondaryButton} onPress={() => void Promise.all([codQuery.refetch(), performanceQuery.refetch(), earningsQuery.refetch()])}>
                  <Text style={styles.secondaryText}>Retry financial data</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.metrics}>
                  <Metric label="Cash held" value={paise(cod.cashHeldPaise)} icon={<Banknote size={20} color="#92400E" />} />
                  <Metric label="Pending earnings" value={paise(earnings.summary?.pendingPaise)} icon={<Star size={20} color="#B45309" />} />
                  <Metric label="Acceptance" value={`${Number(performance.acceptanceRate || 0).toFixed(1)}%`} icon={<ShieldCheck size={20} color="#0F766E" />} />
                  <Metric label="Completed" value={String(performance.completed || 0)} icon={<Bike size={20} color="#1D4ED8" />} />
                </View>
                <Card icon={<Banknote size={21} color="#0F766E" />} title="COD handover ledger">
                  <MetricLine label="Collected" value={paise(cod.collectedPaise)} />
                  <MetricLine label="Deposited" value={paise(cod.depositedPaise)} />
                  <MetricLine label="Variance" value={paise(cod.variancePaise)} />
                  {(cod.pendingHandovers || []).slice(0, 5).map((ledger: any) => (
                    <View key={ledger.id} style={styles.row}>
                      <View style={styles.flex}>
                        <Text style={styles.rowTitle}>Order #{String(ledger.orderId).slice(-8).toUpperCase()}</Text>
                        <Text style={styles.rowText}>{paise(ledger.riderHoldingBalancePaise)} awaiting handover</Text>
                      </View>
                      <StatusPill value={ledger.status} />
                    </View>
                  ))}
                </Card>
              </>
            )}
          </>
        ) : (
          <>
            <Card icon={<CircleHelp size={21} color="#0F766E" />} title="Create support ticket">
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRail}>
                {SUPPORT_CATEGORIES.map((category) => <Chip key={category} label={category} active={supportCategory === category} onPress={() => setSupportCategory(category)} />)}
              </ScrollView>
              <Field label="Subject" value={supportSubject} onChangeText={setSupportSubject} placeholder="Brief issue title" />
              <Field label="Description" value={supportDescription} onChangeText={setSupportDescription} placeholder="Describe what happened and the help you need" multiline />
              <TouchableOpacity style={styles.primaryButtonInside} disabled={supportMutation.isPending} onPress={() => supportMutation.mutate()}>
                {supportMutation.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryText}>Submit support ticket</Text>}
              </TouchableOpacity>
            </Card>
            <Card icon={<CircleHelp size={21} color="#0F766E" />} title="Your tickets">
              {supportQuery.isLoading ? <ActivityIndicator color="#0F766E" /> : supportQuery.isError ? <Text style={styles.errorText}>{errorMessage(supportQuery.error)}</Text> : supportTickets.length === 0 ? <Text style={styles.helpText}>No support tickets yet.</Text> : supportTickets.map((ticket: any) => (
                <View key={ticket.id} style={styles.row}>
                  <View style={styles.flex}>
                    <Text style={styles.rowTitle}>{ticket.subject}</Text>
                    <Text style={styles.rowText}>{ticket.category} · {new Date(ticket.updatedAt).toLocaleString('en-IN')}</Text>
                  </View>
                  <StatusPill value={ticket.status} />
                </View>
              ))}
            </Card>
          </>
        )}

        <TouchableOpacity
          style={styles.logoutButton}
          onPress={() => Alert.alert('Sign out of rider app?', 'Background rider services will be stopped before your session is cleared.', [
            { text: 'Stay signed in', style: 'cancel' },
            { text: 'Sign out', style: 'destructive', onPress: () => void signOutRider() },
          ])}
        >
          <LogOut size={18} color="#B91C1C" /><Text style={styles.logoutText}>Sign out</Text>
        </TouchableOpacity>
        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
};

function StateLoading({ label }: { label: string }) {
  return <View style={styles.loading}><ActivityIndicator size="large" color="#0F766E" /><Text style={styles.helpText}>{label}</Text></View>;
}
function Card({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return <View style={styles.card}><View style={styles.cardHeader}>{icon}<Text style={styles.cardTitle}>{title}</Text></View>{children}</View>;
}
function Field({ label, value, onChangeText, placeholder, keyboardType, secureTextEntry, multiline, autoCapitalize }: { label: string; value: string; onChangeText: (value: string) => void; placeholder: string; keyboardType?: any; secureTextEntry?: boolean; multiline?: boolean; autoCapitalize?: any }) {
  return <View style={styles.field}><Text style={styles.label}>{label}</Text><TextInput value={value} onChangeText={onChangeText} placeholder={placeholder} placeholderTextColor="#94A3B8" keyboardType={keyboardType} secureTextEntry={secureTextEntry} multiline={multiline} autoCapitalize={autoCapitalize} style={[styles.input, multiline && styles.multiline]} /></View>;
}
function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return <TouchableOpacity style={[styles.chip, active && styles.chipActive]} onPress={onPress}><Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text></TouchableOpacity>;
}
function StatusPill({ value }: { value: string }) {
  return <View style={styles.statusPill}><Text style={styles.statusText}>{String(value || 'PENDING').replaceAll('_', ' ')}</Text></View>;
}
function ShiftRow({ label, shift }: { label: string; shift: any }) {
  return <View style={styles.row}><CalendarDays size={18} color="#0F766E" /><View style={styles.flex}><Text style={styles.rowTitle}>{label}</Text><Text style={styles.rowText}>{new Date(shift.startsAt).toLocaleString('en-IN')} – {new Date(shift.endsAt).toLocaleTimeString('en-IN')}</Text></View><StatusPill value={shift.status} /></View>;
}
function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return <View style={styles.metric}>{icon}<Text style={styles.metricValue}>{value}</Text><Text style={styles.metricLabel}>{label}</Text></View>;
}
function MetricLine({ label, value }: { label: string; value: string }) {
  return <View style={styles.metricLine}><Text style={styles.metricLineLabel}>{label}</Text><Text style={styles.metricLineValue}>{value}</Text></View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F8FAFC' },
  content: { paddingBottom: 20 },
  flex: { flex: 1 },
  hero: { backgroundColor: '#067B5C', paddingTop: 54, paddingHorizontal: 18, paddingBottom: 22, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomLeftRadius: 30, borderBottomRightRadius: 30 },
  avatar: { width: 58, height: 58, borderRadius: 20, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#067B5C', fontSize: 22, fontWeight: '900' },
  eyebrow: { color: '#A7F3D0', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  title: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', marginTop: 3 },
  subtitle: { color: '#D1FAE5', fontSize: 10, marginTop: 4 },
  tabs: { margin: 16, marginBottom: 2, borderRadius: 16, backgroundColor: '#E2E8F0', padding: 4, flexDirection: 'row' },
  tab: { flex: 1, minHeight: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  tabActive: { backgroundColor: '#FFFFFF' },
  tabText: { color: '#64748B', fontSize: 10, fontWeight: '900' },
  tabTextActive: { color: '#0F766E' },
  loading: { minHeight: 180, alignItems: 'center', justifyContent: 'center', gap: 8 },
  card: { marginHorizontal: 16, marginTop: 13, borderRadius: 22, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 16 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  cardTitle: { color: '#0F172A', fontSize: 16, fontWeight: '900' },
  field: { marginTop: 10 },
  label: { color: '#475569', fontSize: 9, fontWeight: '900', textTransform: 'uppercase', marginBottom: 5 },
  input: { minHeight: 48, borderRadius: 14, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC', paddingHorizontal: 12, color: '#0F172A' },
  multiline: { minHeight: 100, paddingTop: 12, textAlignVertical: 'top' },
  helpText: { color: '#64748B', fontSize: 10, lineHeight: 16, marginTop: 8, textAlign: 'center' },
  primaryButton: { minHeight: 51, borderRadius: 16, backgroundColor: '#0F766E', marginHorizontal: 16, marginTop: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  primaryButtonInside: { minHeight: 49, borderRadius: 15, backgroundColor: '#0F766E', marginTop: 12, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#FFFFFF', fontSize: 12, fontWeight: '900' },
  secondaryButton: { minHeight: 47, borderRadius: 14, borderWidth: 1, borderColor: '#99F6E4', backgroundColor: '#F0FDFA', marginTop: 12, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: '#0F766E', fontSize: 11, fontWeight: '900' },
  chipRail: { gap: 7, paddingVertical: 5 },
  chip: { borderRadius: 999, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#FFFFFF', paddingHorizontal: 10, paddingVertical: 8 },
  chipActive: { backgroundColor: '#0F766E', borderColor: '#0F766E' },
  chipText: { color: '#475569', fontSize: 9, fontWeight: '900' },
  chipTextActive: { color: '#FFFFFF' },
  filePicker: { minHeight: 68, borderRadius: 15, borderWidth: 1, borderColor: '#99F6E4', backgroundColor: '#F0FDFA', padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 10 },
  fileTitle: { color: '#0F172A', fontSize: 12, fontWeight: '900' },
  fileMeta: { color: '#64748B', fontSize: 9, marginTop: 3 },
  row: { minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 9, borderTopWidth: 1, borderTopColor: '#F1F5F9', marginTop: 8, paddingTop: 8 },
  rowTitle: { color: '#0F172A', fontSize: 12, fontWeight: '900' },
  rowText: { color: '#64748B', fontSize: 9, marginTop: 3 },
  statusPill: { maxWidth: 115, borderRadius: 999, backgroundColor: '#ECFDF5', paddingHorizontal: 8, paddingVertical: 6 },
  statusText: { color: '#0F766E', fontSize: 7, fontWeight: '900', textAlign: 'center' },
  warning: { color: '#92400E', fontSize: 11, fontWeight: '800', backgroundColor: '#FFFBEB', padding: 11, borderRadius: 12 },
  metrics: { marginHorizontal: 16, marginTop: 13, flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: { width: '48%', minHeight: 105, borderRadius: 19, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', padding: 14 },
  metricValue: { color: '#0F172A', fontSize: 19, fontWeight: '900', marginTop: 12 },
  metricLabel: { color: '#64748B', fontSize: 9, fontWeight: '800', marginTop: 3 },
  metricLine: { minHeight: 39, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  metricLineLabel: { color: '#64748B', fontSize: 11 },
  metricLineValue: { color: '#0F172A', fontSize: 12, fontWeight: '900' },
  errorCard: { marginHorizontal: 16, marginTop: 13, borderRadius: 20, borderWidth: 1, borderColor: '#FECACA', backgroundColor: '#FEF2F2', padding: 16 },
  errorTitle: { color: '#991B1B', fontSize: 14, fontWeight: '900' },
  errorText: { color: '#B91C1C', fontSize: 10, lineHeight: 16, marginTop: 5 },
  logoutButton: { minHeight: 50, borderRadius: 16, backgroundColor: '#FEF2F2', marginHorizontal: 16, marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  logoutText: { color: '#B91C1C', fontWeight: '900' },
});
