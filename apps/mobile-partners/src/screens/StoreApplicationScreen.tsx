import React, { useEffect, useRef, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import { Check, MapPin, Store, WalletCards } from 'lucide-react-native';
import {
  FormField,
  OnboardingShell,
  palette,
  PrimaryButton,
  ProgressBar,
  Section,
} from '../components/PartnerOnboardingUI';
import { storeResumeStep } from '../navigation/applicantRoute';
import { usePartnerOnboardingStore } from '../onboarding/usePartnerOnboardingStore';

const BUSINESS_TYPES = ['Grocery', 'Supermarket', 'Pharmacy', 'Restaurant', 'Other'];
const CATEGORIES = ['Groceries', 'Dairy', 'Snacks', 'Beverages', 'Personal care', 'Household'];
const HOURS = ['6 AM–10 PM', '7 AM–11 PM', '8 AM–10 PM', '24 hours'];
const RADII = ['3', '5', '8', '10'];
const CAPACITY = ['25', '50', '100', '200'];
const STEP_TITLES = ['Business', 'Location', 'Operations', 'Settlement'];

function Choices({ values, selected, onChange, multiple = false }: any) {
  const chosen = Array.isArray(selected) ? selected : [selected];
  return <View style={styles.choices}>{values.map((value: string) => {
    const active = chosen.includes(value);
    return <TouchableOpacity key={value} style={[styles.choice, active && styles.choiceActive]} onPress={() => onChange(multiple ? (active ? chosen.filter((item: string) => item !== value) : [...chosen, value]) : value)}>{active ? <Check size={14} color={palette.teal} /> : null}<Text style={[styles.choiceText, active && styles.choiceTextActive]}>{value}</Text></TouchableOpacity>;
  })}</View>;
}

export function StoreApplicationScreen({ navigation }: any) {
  const { response, update, isLoading } = usePartnerOnboardingStore();
  const application = response?.application;
  const saved = application?.applicantPayload || {};
  const initializedId = useRef<string | null>(null);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Record<string, any>>({
    legalName: '', displayName: '', businessType: 'Grocery', categories: [],
    storeAddress: '', city: '', state: '', pincode: '', latitude: '', longitude: '',
    operatingHours: '7 AM–11 PM', serviceRadiusKm: '5', orderCapacity: '50', pickupInstructions: '',
    bankAccountHolderName: '', bankAccountNumber: '', bankAccountConfirmation: '', bankIfsc: '', taxIdentifier: '',
  });

  useEffect(() => {
    if (!application?.id || initializedId.current === application.id) return;
    initializedId.current = application.id;
    setStep(storeResumeStep(saved) ?? 0);
    setForm((current) => ({
      ...current,
      legalName: String(saved.legalName || ''), displayName: String(saved.displayName || ''), businessType: String(saved.businessType || 'Grocery'), categories: Array.isArray(saved.categories) ? saved.categories : [],
      storeAddress: String(saved.storeAddress || ''), city: String(saved.city || ''), state: String(saved.state || ''), pincode: String(saved.pincode || ''), latitude: saved.latitude == null ? '' : String(saved.latitude), longitude: saved.longitude == null ? '' : String(saved.longitude),
      operatingHours: String(saved.operatingHours || '7 AM–11 PM'), serviceRadiusKm: String(saved.serviceRadiusKm || '5'), orderCapacity: String(saved.orderCapacity || '50'), pickupInstructions: String(saved.pickupInstructions || ''), bankAccountHolderName: String(saved.bankAccountHolderName || ''), bankAccountNumber: '', bankAccountConfirmation: '', bankIfsc: '', taxIdentifier: '',
    }));
  }, [application?.id, saved]);

  const set = (key: string, value: any) => setForm((current) => ({ ...current, [key]: value }));
  const hasStoredBank = Boolean(saved.bankAccountLast4 && saved.bankIfscLast4);
  const useLocation = () => Geolocation.getCurrentPosition(
    (position) => { set('latitude', String(position.coords.latitude)); set('longitude', String(position.coords.longitude)); Alert.alert('Pickup location added', 'Admin can verify this pin during review.'); },
    () => Alert.alert('Location unavailable', 'Enable location permission and try again.'),
    { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
  );

  const validate = () => {
    if (step === 0 && (!form.legalName.trim() || !form.displayName.trim() || !form.categories.length)) throw new Error('Enter the business names and choose at least one category.');
    if (step === 1) {
      if (!form.storeAddress.trim() || !form.city.trim() || !form.state.trim() || !/^\d{6}$/.test(form.pincode)) throw new Error('Complete the store address and valid 6-digit pincode.');
      if (!Number.isFinite(Number(form.latitude)) || !Number.isFinite(Number(form.longitude))) throw new Error('Use current location to add the pickup pin.');
    }
    if (step === 3 && !hasStoredBank) {
      if (!form.bankAccountHolderName.trim()) throw new Error('Enter the account holder name.');
      if (!/^\d{8,20}$/.test(form.bankAccountNumber)) throw new Error('Enter a valid bank account number.');
      if (form.bankAccountNumber !== form.bankAccountConfirmation) throw new Error('Bank account numbers do not match.');
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(form.bankIfsc)) throw new Error('Enter a valid IFSC code.');
    }
  };

  const payload = () => {
    if (step === 0) return { legalName: form.legalName.trim(), displayName: form.displayName.trim(), businessType: form.businessType, categories: form.categories };
    if (step === 1) return { storeAddress: form.storeAddress.trim(), city: form.city.trim(), state: form.state.trim(), pincode: form.pincode, latitude: Number(form.latitude), longitude: Number(form.longitude) };
    if (step === 2) return { operatingHours: form.operatingHours, serviceRadiusKm: Number(form.serviceRadiusKm), orderCapacity: Number(form.orderCapacity), pickupInstructions: form.pickupInstructions.trim() };
    const payout: Record<string, any> = { bankAccountHolderName: form.bankAccountHolderName.trim() || saved.bankAccountHolderName };
    if (form.bankAccountNumber) payout.bankAccountNumber = form.bankAccountNumber;
    if (form.bankIfsc) payout.bankIfsc = form.bankIfsc;
    if (form.taxIdentifier) payout.taxIdentifier = form.taxIdentifier.trim().toUpperCase();
    return payout;
  };

  const next = async () => {
    try {
      validate();
      await update({ payload: payload() });
      if (step < 3) setStep((value) => value + 1);
      else navigation.navigate('ApplicationDocuments');
    } catch (error: any) { Alert.alert('Check this step', error.message || 'Complete the required information.'); }
  };

  return <OnboardingShell title="Join AAGAM as a Store" subtitle={`Step ${step + 1} of 4 · ${STEP_TITLES[step]}`} onBack={() => step > 0 ? setStep((value) => value - 1) : navigation.goBack()}>
    <ProgressBar value={(step + 1) * 25} />
    {step === 0 ? <Section title="Business identity" subtitle="Use the name customers will recognise."><View style={styles.icon}><Store size={22} color={palette.teal} /></View><FormField label="Legal business name" value={form.legalName} onChangeText={(value) => set('legalName', value)} placeholder="Registered name" /><FormField label="Store display name" value={form.displayName} onChangeText={(value) => set('displayName', value)} placeholder="Name shown to customers" /><Text style={styles.label}>Business type</Text><Choices values={BUSINESS_TYPES} selected={form.businessType} onChange={(value: string) => set('businessType', value)} /><Text style={styles.label}>What do you sell?</Text><Choices values={CATEGORIES} selected={form.categories} multiple onChange={(value: string[]) => set('categories', value)} /></Section> : null}
    {step === 1 ? <Section title="Store location" subtitle="Use the exact entrance where Riders collect orders."><FormField label="Store address" value={form.storeAddress} onChangeText={(value) => set('storeAddress', value)} placeholder="Building, street and area" multiline /><FormField label="Pincode" value={form.pincode} onChangeText={(value) => set('pincode', value.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" placeholder="6-digit pincode" /><FormField label="City" value={form.city} onChangeText={(value) => set('city', value)} placeholder="City" /><FormField label="State" value={form.state} onChangeText={(value) => set('state', value)} placeholder="State" /><TouchableOpacity style={styles.locationButton} onPress={useLocation}><MapPin size={18} color={palette.teal} /><Text style={styles.locationText}>{form.latitude ? 'Update pickup location' : 'Use current pickup location'}</Text></TouchableOpacity></Section> : null}
    {step === 2 ? <Section title="Store operations" subtitle="These choices help plan serviceability and pickup capacity."><Text style={styles.label}>Operating hours</Text><Choices values={HOURS} selected={form.operatingHours} onChange={(value: string) => set('operatingHours', value)} /><Text style={styles.label}>Service radius</Text><Choices values={RADII.map((value) => `${value} km`)} selected={`${form.serviceRadiusKm} km`} onChange={(value: string) => set('serviceRadiusKm', value.replace(' km', ''))} /><Text style={styles.label}>Estimated orders per day</Text><Choices values={CAPACITY} selected={form.orderCapacity} onChange={(value: string) => set('orderCapacity', value)} /><FormField label="Rider pickup instructions" value={form.pickupInstructions} onChangeText={(value) => set('pickupInstructions', value)} placeholder="Entrance, counter or parking guidance" multiline /></Section> : null}
    {step === 3 ? <Section title="Settlement account" subtitle="Bank details are encrypted and used only for settlements."><View style={styles.icon}><WalletCards size={22} color={palette.teal} /></View>{saved.bankAccountLast4 ? <View style={styles.saved}><Check size={18} color={palette.green} /><Text style={styles.savedText}>Account saved ···· {saved.bankAccountLast4}</Text></View> : null}<FormField label="Account holder name" value={form.bankAccountHolderName} onChangeText={(value) => set('bankAccountHolderName', value)} placeholder="Name shown by the bank" /><FormField label="Bank account number" value={form.bankAccountNumber} onChangeText={(value) => set('bankAccountNumber', value.replace(/\D/g, ''))} keyboardType="number-pad" secureTextEntry placeholder={hasStoredBank ? 'Enter only to replace saved account' : 'Account number'} />{form.bankAccountNumber ? <FormField label="Confirm account number" value={form.bankAccountConfirmation} onChangeText={(value) => set('bankAccountConfirmation', value.replace(/\D/g, ''))} keyboardType="number-pad" secureTextEntry placeholder="Re-enter account number" /> : null}<FormField label="IFSC code" value={form.bankIfsc} onChangeText={(value) => set('bankIfsc', value.toUpperCase().replace(/\s/g, '').slice(0, 11))} autoCapitalize="characters" placeholder={hasStoredBank ? 'Enter only to replace saved IFSC' : 'ABCD0123456'} /><FormField label="GST, FSSAI or licence number" value={form.taxIdentifier} onChangeText={(value) => set('taxIdentifier', value.toUpperCase())} autoCapitalize="characters" placeholder="Optional when not applicable" /></Section> : null}
    <PrimaryButton label={step === 3 ? 'Save and continue to documents' : 'Save and continue'} onPress={next} loading={isLoading} />
    {step > 0 ? <PrimaryButton label="Previous step" onPress={() => setStep((value) => value - 1)} secondary disabled={isLoading} /> : null}
    <Text style={styles.note}>Your progress is saved after every step. Editing after submission reopens the application for resubmission.</Text>
  </OnboardingShell>;
}

const styles = StyleSheet.create({
  icon: { width: 44, height: 44, borderRadius: 15, backgroundColor: '#ECFEFF', alignItems: 'center', justifyContent: 'center' }, label: { color: palette.ink, fontSize: 12, fontWeight: '900' }, choices: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, choice: { minHeight: 42, borderRadius: 13, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC', paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 5 }, choiceActive: { borderColor: '#2DD4BF', backgroundColor: '#CCFBF1' }, choiceText: { color: palette.muted, fontSize: 12, fontWeight: '800' }, choiceTextActive: { color: palette.teal }, locationButton: { minHeight: 50, borderRadius: 15, borderWidth: 1, borderColor: '#99F6E4', backgroundColor: '#F0FDFA', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }, locationText: { color: palette.teal, fontSize: 12, fontWeight: '900' }, saved: { borderRadius: 15, backgroundColor: '#ECFDF5', padding: 13, flexDirection: 'row', alignItems: 'center', gap: 8 }, savedText: { color: palette.green, fontSize: 12, fontWeight: '900' }, note: { color: palette.muted, fontSize: 11, lineHeight: 17, textAlign: 'center' },
});
