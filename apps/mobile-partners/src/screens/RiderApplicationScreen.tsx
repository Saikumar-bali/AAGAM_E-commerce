import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PermissionsAndroid, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import Toast from 'react-native-toast-message';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { apiClient } from '@aagam/mobile-shared';
import { Bike, Check, MapPin, UserRound, WalletCards } from 'lucide-react-native';
import {
  FormField,
  OnboardingShell,
  palette,
  PrimaryButton,
  ProgressBar,
  Section,
} from '../components/PartnerOnboardingUI';
import { riderResumeStep } from '../navigation/applicantRoute';
import { usePartnerOnboardingStore } from '../onboarding/usePartnerOnboardingStore';

const VEHICLES = [['MOTORCYCLE', 'Motorcycle'], ['SCOOTER', 'Scooter'], ['BICYCLE', 'Bicycle'], ['WALKER', 'Walker']] as const;
const AVAILABILITY = ['Full day', 'Morning', 'Evening', 'Weekends'];
const EXPERIENCE = ['First-time Rider', 'Less than 1 year', '1–3 years', '3+ years'];
const STEP_TITLES = ['About you', 'Delivery setup', 'Emergency contact', 'Payout account'];

function ChoiceGrid({ values, selected, onChange, multiple = false }: any) {
  const chosen = Array.isArray(selected) ? selected : [selected];
  return <View style={styles.choiceGrid}>{values.map((item: any) => {
    const value = Array.isArray(item) ? item[0] : item;
    const title = Array.isArray(item) ? item[1] : item;
    const active = chosen.includes(value);
    return <TouchableOpacity key={value} style={[styles.choice, active && styles.choiceActive]} onPress={() => onChange(multiple ? (active ? chosen.filter((entry: string) => entry !== value) : [...chosen, value]) : value)}>{active ? <Check size={15} color={palette.teal} /> : null}<Text style={[styles.choiceText, active && styles.choiceTextActive]}>{title}</Text></TouchableOpacity>;
  })}</View>;
}

export function RiderApplicationScreen({ navigation }: any) {
  const { response, update, isLoading } = usePartnerOnboardingStore();
  const application = response?.application;
  const saved = application?.applicantPayload || {};
  const initializedId = useRef<string | null>(null);
  const [step, setStep] = useState(0);
  const [zones, setZones] = useState<string[]>([]);
  const [form, setForm] = useState<Record<string, any>>({
    dateOfBirth: '', addressLine1: '', city: '', state: '', pincode: '', latitude: '', longitude: '',
    vehicleType: 'MOTORCYCLE', vehicleNumber: '', preferredZones: [], availability: 'Full day', experience: 'First-time Rider',
    emergencyContactName: '', emergencyContactPhone: '', bankAccountHolderName: '', bankAccountNumber: '', bankAccountConfirmation: '', bankIfsc: '',
  });

  useEffect(() => {
    if (!application?.id || initializedId.current === application.id) return;
    initializedId.current = application.id;
    setStep(riderResumeStep(saved) ?? 0);
    setForm((current) => ({
      ...current,
      dateOfBirth: String(saved.dateOfBirth || ''), addressLine1: String(saved.addressLine1 || ''), city: String(saved.city || ''), state: String(saved.state || ''), pincode: String(saved.pincode || ''),
      latitude: saved.latitude == null ? '' : String(saved.latitude), longitude: saved.longitude == null ? '' : String(saved.longitude),
      vehicleType: String(saved.vehicleType || 'MOTORCYCLE'), vehicleNumber: String(saved.vehicleNumber || ''), preferredZones: Array.isArray(saved.preferredZones) ? saved.preferredZones : [], availability: String(saved.availability || 'Full day'), experience: String(saved.experience || 'First-time Rider'),
      emergencyContactName: String(saved.emergencyContactName || ''), emergencyContactPhone: String(saved.emergencyContactPhone || ''), bankAccountHolderName: String(saved.bankAccountHolderName || ''),
      bankAccountNumber: '', bankAccountConfirmation: '', bankIfsc: '',
    }));
  }, [application?.id, saved]);

  useEffect(() => {
    apiClient.get('/stores/delivery-zones')
      .then((result) => setZones((result.data || []).map((zone: any) => zone.name)))
      .catch(() => {
        setZones([]);
        Toast.show({ type: 'error', text1: 'Delivery zones unavailable', text2: 'Refresh before completing delivery setup.' });
      });
  }, []);

  const set = (key: string, value: any) => setForm((current) => ({ ...current, [key]: value }));
  const motorVehicle = !['BICYCLE', 'WALKER'].includes(form.vehicleType);
  const hasStoredBank = Boolean(saved.bankAccountLast4 && saved.bankIfscLast4);
  const completion = useMemo(() => Math.round(((step + 1) / STEP_TITLES.length) * 100), [step]);

  const useLocation = async () => {
    if (Platform.OS === 'android') {
      const permission = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, {
        title: 'Allow Rider location',
        message: 'AAGAM uses your location to suggest service areas and verify operational availability.',
        buttonPositive: 'Allow',
        buttonNegative: 'Not now',
      });
      if (permission !== PermissionsAndroid.RESULTS.GRANTED) {
        Toast.show({ type: 'error', text1: 'Location permission needed', text2: 'Allow precise location in Android settings and try again.' });
        return;
      }
    }
    Geolocation.getCurrentPosition(async (position) => {
      const { latitude, longitude } = position.coords;
      set('latitude', String(latitude));
      set('longitude', String(longitude));
      try {
        const result = await apiClient.get('/geo/reverse', { params: { lat: latitude, lng: longitude } });
        const address = result.data?.address;
        if (address) setForm((current) => ({ ...current, addressLine1: address.line1 || current.addressLine1, city: address.city || current.city, state: address.state || current.state, pincode: address.pincode || current.pincode }));
      } catch {}
      Toast.show({ type: 'success', text1: 'Current location added', text2: 'Address fields were filled where available.' });
    }, () => Toast.show({ type: 'error', text1: 'Location unavailable', text2: 'Turn on precise location and try again.' }), { enableHighAccuracy: true, timeout: 15000, maximumAge: 10000 });
  };

  const openDatePicker = () => {
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(form.dateOfBirth) ? new Date(`${form.dateOfBirth}T00:00:00`) : new Date(1995, 0, 1);
    const maximumDate = new Date();
    maximumDate.setFullYear(maximumDate.getFullYear() - 18);
    DateTimePickerAndroid.open({
      value: parsed > maximumDate ? maximumDate : parsed,
      maximumDate,
      minimumDate: new Date(1940, 0, 1),
      mode: 'date',
      onChange: (_event, date) => { if (date) set('dateOfBirth', date.toISOString().slice(0, 10)); },
    });
  };

  const validate = () => {
    if (step === 0) {
      if (!['dateOfBirth', 'addressLine1', 'city', 'state', 'pincode'].every((key) => String(form[key] || '').trim())) throw new Error('Complete your birth date and current address.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(form.dateOfBirth)) throw new Error('Use date format YYYY-MM-DD.');
      if (!/^\d{6}$/.test(form.pincode)) throw new Error('Enter a valid 6-digit pincode.');
    }
    if (step === 1) {
      if (motorVehicle && !form.vehicleNumber.trim()) throw new Error('Enter the registered vehicle number.');
      if (!form.preferredZones.length) throw new Error('Choose at least one delivery zone.');
    }
    if (step === 2 && (!form.emergencyContactName.trim() || !/^\+?[0-9]{10,15}$/.test(form.emergencyContactPhone.replace(/\s/g, '')))) throw new Error('Enter a valid emergency contact.');
    if (step === 3 && !hasStoredBank) {
      if (!form.bankAccountHolderName.trim()) throw new Error('Enter the bank account holder name.');
      if (!/^\d{8,20}$/.test(form.bankAccountNumber)) throw new Error('Enter a valid bank account number.');
      if (form.bankAccountNumber !== form.bankAccountConfirmation) throw new Error('Bank account numbers do not match.');
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(form.bankIfsc)) throw new Error('Enter a valid IFSC code.');
    }
  };

  const payload = () => {
    if (step === 0) return { dateOfBirth: form.dateOfBirth.trim(), addressLine1: form.addressLine1.trim(), city: form.city.trim(), state: form.state.trim(), pincode: form.pincode.trim(), latitude: form.latitude ? Number(form.latitude) : null, longitude: form.longitude ? Number(form.longitude) : null };
    if (step === 1) return { vehicleType: form.vehicleType, vehicleNumber: motorVehicle ? form.vehicleNumber.trim().toUpperCase() : null, preferredZones: form.preferredZones, availability: form.availability, experience: form.experience };
    if (step === 2) return { emergencyContactName: form.emergencyContactName.trim(), emergencyContactPhone: form.emergencyContactPhone.replace(/\s/g, '') };
    const payout: Record<string, any> = { bankAccountHolderName: form.bankAccountHolderName.trim() || saved.bankAccountHolderName };
    if (form.bankAccountNumber) payout.bankAccountNumber = form.bankAccountNumber;
    if (form.bankIfsc) payout.bankIfsc = form.bankIfsc;
    return payout;
  };

  const next = async () => {
    try {
      validate();
      await update({ payload: payload() });
      if (step < 3) setStep((value) => value + 1);
      else navigation.navigate('ApplicationDocuments');
    } catch (error: any) { Toast.show({ type: 'error', text1: 'Check this step', text2: error.message || 'Complete the required information.' }); }
  };

  return <OnboardingShell title="Become an AAGAM Rider" subtitle={`Step ${step + 1} of 4 · ${STEP_TITLES[step]}`} onBack={() => step > 0 ? setStep((value) => value - 1) : navigation.goBack()}>
    <ProgressBar value={completion} />
    {step === 0 ? <Section title="About you" subtitle="Your address helps assign nearby delivery zones."><View style={styles.stepIcon}><UserRound size={22} color={palette.teal} /></View><Text style={styles.fieldLabel}>Date of birth</Text><TouchableOpacity style={styles.datePicker} onPress={openDatePicker}><Text style={form.dateOfBirth ? styles.dateValue : styles.datePlaceholder}>{form.dateOfBirth || 'Select date of birth'}</Text></TouchableOpacity><FormField label="Current address" value={form.addressLine1} onChangeText={(value) => set('addressLine1', value)} placeholder="House, street and area" multiline /><FormField label="Pincode" value={form.pincode} onChangeText={(value) => set('pincode', value.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" placeholder="6-digit pincode" /><FormField label="City" value={form.city} onChangeText={(value) => set('city', value)} placeholder="City" /><FormField label="State" value={form.state} onChangeText={(value) => set('state', value)} placeholder="State" /><TouchableOpacity style={styles.locationButton} onPress={useLocation}><MapPin size={18} color={palette.teal} /><Text style={styles.locationText}>{form.latitude ? 'Update current location' : 'Use live location'}</Text></TouchableOpacity></Section> : null}
    {step === 1 ? <Section title="Delivery setup" subtitle="Choose how and where you plan to deliver."><View style={styles.stepIcon}><Bike size={22} color={palette.teal} /></View><Text style={styles.fieldLabel}>Vehicle type</Text><ChoiceGrid values={VEHICLES} selected={form.vehicleType} onChange={(value: string) => set('vehicleType', value)} />{motorVehicle ? <FormField label="Vehicle number" value={form.vehicleNumber} onChangeText={(value) => set('vehicleNumber', value.toUpperCase().replace(/\s/g, ''))} autoCapitalize="characters" placeholder="AP00AA0000" /> : null}<Text style={styles.fieldLabel}>Preferred zones</Text>{zones.length ? <ChoiceGrid values={zones} selected={form.preferredZones} multiple onChange={(value: string[]) => set('preferredZones', value)} /> : <Text style={styles.zoneEmpty}>No active zones are available. Contact AAGAM operations.</Text>}<Text style={styles.fieldLabel}>Availability</Text><ChoiceGrid values={AVAILABILITY} selected={form.availability} onChange={(value: string) => set('availability', value)} /><Text style={styles.fieldLabel}>Experience</Text><ChoiceGrid values={EXPERIENCE} selected={form.experience} onChange={(value: string) => set('experience', value)} /></Section> : null}
    {step === 2 ? <Section title="Emergency contact" subtitle="Used only when Rider safety requires it."><FormField label="Contact name" value={form.emergencyContactName} onChangeText={(value) => set('emergencyContactName', value)} placeholder="Full name" /><FormField label="Contact phone" value={form.emergencyContactPhone} onChangeText={(value) => set('emergencyContactPhone', value.replace(/[^+0-9]/g, ''))} keyboardType="phone-pad" placeholder="+91 9876543210" /></Section> : null}
    {step === 3 ? <Section title="Payout account" subtitle="Bank details are encrypted and used only for payouts."><View style={styles.stepIcon}><WalletCards size={22} color={palette.teal} /></View>{saved.bankAccountLast4 ? <View style={styles.savedAccount}><Check size={18} color={palette.green} /><Text style={styles.savedAccountText}>Account saved ···· {saved.bankAccountLast4}</Text></View> : null}<FormField label="Account holder name" value={form.bankAccountHolderName} onChangeText={(value) => set('bankAccountHolderName', value)} placeholder="Name as shown by bank" /><FormField label="Bank account number" value={form.bankAccountNumber} onChangeText={(value) => set('bankAccountNumber', value.replace(/\D/g, ''))} keyboardType="number-pad" secureTextEntry placeholder={hasStoredBank ? 'Enter only to replace saved account' : 'Account number'} />{form.bankAccountNumber ? <FormField label="Confirm account number" value={form.bankAccountConfirmation} onChangeText={(value) => set('bankAccountConfirmation', value.replace(/\D/g, ''))} keyboardType="number-pad" secureTextEntry placeholder="Re-enter account number" /> : null}<FormField label="IFSC code" value={form.bankIfsc} onChangeText={(value) => set('bankIfsc', value.toUpperCase().replace(/\s/g, '').slice(0, 11))} autoCapitalize="characters" placeholder={hasStoredBank ? 'Enter only to replace saved IFSC' : 'ABCD0123456'} /></Section> : null}
    <PrimaryButton label={step === 3 ? 'Save and continue to documents' : 'Save and continue'} onPress={next} loading={isLoading} />
    {step > 0 ? <PrimaryButton label="Previous step" onPress={() => setStep((value) => value - 1)} secondary disabled={isLoading} /> : null}
    <Text style={styles.note}>Your progress is saved after every step. Editing after submission reopens the application for resubmission.</Text>
  </OnboardingShell>;
}

const styles = StyleSheet.create({
  datePicker: { minHeight: 50, borderRadius: 15, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC', paddingHorizontal: 14, justifyContent: 'center' }, dateValue: { color: palette.ink, fontSize: 14, fontWeight: '800' }, datePlaceholder: { color: '#94A3B8', fontSize: 14, fontWeight: '700' }, zoneEmpty: { borderRadius: 14, backgroundColor: '#FFF7ED', padding: 12, color: '#9A3412', fontSize: 12, fontWeight: '800' },
  stepIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: '#ECFEFF', alignItems: 'center', justifyContent: 'center' }, choiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, choice: { minHeight: 42, borderRadius: 13, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC', paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 5 }, choiceActive: { borderColor: '#2DD4BF', backgroundColor: '#CCFBF1' }, choiceText: { color: palette.muted, fontSize: 12, fontWeight: '800' }, choiceTextActive: { color: palette.teal }, fieldLabel: { color: palette.ink, fontSize: 12, fontWeight: '900' }, locationButton: { minHeight: 48, borderRadius: 15, borderWidth: 1, borderColor: '#99F6E4', backgroundColor: '#F0FDFA', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, locationText: { color: palette.teal, fontSize: 12, fontWeight: '900' }, savedAccount: { borderRadius: 15, backgroundColor: '#ECFDF5', padding: 13, flexDirection: 'row', alignItems: 'center', gap: 8 }, savedAccountText: { color: palette.green, fontSize: 12, fontWeight: '900' }, note: { color: palette.muted, fontSize: 11, lineHeight: 17, textAlign: 'center' },
});
