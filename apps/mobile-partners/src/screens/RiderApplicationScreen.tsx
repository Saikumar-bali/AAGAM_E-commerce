import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import Geolocation from 'react-native-geolocation-service';
import { Bike, Check, MapPin, UserRound, WalletCards } from 'lucide-react-native';
import {
  FormField,
  OnboardingShell,
  palette,
  PrimaryButton,
  ProgressBar,
  Section,
} from '../components/PartnerOnboardingUI';
import { usePartnerOnboardingStore } from '../onboarding/usePartnerOnboardingStore';

const VEHICLES = [
  ['MOTORCYCLE', 'Motorcycle'],
  ['SCOOTER', 'Scooter'],
  ['BICYCLE', 'Bicycle'],
  ['WALKER', 'Walker'],
] as const;
const ZONES = ['Madhurawada', 'PM Palem', 'MVP Colony', 'Dwaraka Nagar', 'Gajuwaka'];
const AVAILABILITY = ['Full day', 'Morning', 'Evening', 'Weekends'];
const EXPERIENCE = ['First-time Rider', 'Less than 1 year', '1–3 years', '3+ years'];
const STEP_TITLES = ['About you', 'Delivery setup', 'Emergency contact', 'Payout account'];

function ChoiceGrid({
  values,
  selected,
  onChange,
  multiple = false,
}: {
  values: readonly (readonly [string, string] | string)[];
  selected: string | string[];
  onChange: (value: string | string[]) => void;
  multiple?: boolean;
}) {
  const selectedValues = Array.isArray(selected) ? selected : [selected];
  return (
    <View style={styles.choiceGrid}>
      {values.map((item) => {
        const value = Array.isArray(item) ? item[0] : item;
        const label = Array.isArray(item) ? item[1] : item;
        const active = selectedValues.includes(value);
        return (
          <TouchableOpacity
            key={value}
            style={[styles.choice, active && styles.choiceActive]}
            onPress={() => {
              if (!multiple) return onChange(value);
              onChange(
                active
                  ? selectedValues.filter((entry) => entry !== value)
                  : [...selectedValues, value],
              );
            }}
          >
            {active ? <Check size={15} color={palette.teal} /> : null}
            <Text style={[styles.choiceText, active && styles.choiceTextActive]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function RiderApplicationScreen({ navigation }: any) {
  const { response, update, isLoading } = usePartnerOnboardingStore();
  const application = response?.application;
  const saved = application?.applicantPayload || {};
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Record<string, any>>({
    dateOfBirth: '',
    addressLine1: '',
    city: '',
    state: '',
    pincode: '',
    latitude: '',
    longitude: '',
    vehicleType: 'MOTORCYCLE',
    vehicleNumber: '',
    preferredZones: [],
    availability: 'Full day',
    experience: 'First-time Rider',
    emergencyContactName: '',
    emergencyContactPhone: '',
    bankAccountNumber: '',
    bankAccountConfirmation: '',
    bankIfsc: '',
    bankAccountHolderName: '',
  });

  useEffect(() => {
    setForm((current) => ({
      ...current,
      dateOfBirth: String(saved.dateOfBirth || ''),
      addressLine1: String(saved.addressLine1 || ''),
      city: String(saved.city || ''),
      state: String(saved.state || ''),
      pincode: String(saved.pincode || ''),
      latitude: saved.latitude === undefined ? '' : String(saved.latitude),
      longitude: saved.longitude === undefined ? '' : String(saved.longitude),
      vehicleType: String(saved.vehicleType || 'MOTORCYCLE'),
      vehicleNumber: String(saved.vehicleNumber || ''),
      preferredZones: Array.isArray(saved.preferredZones) ? saved.preferredZones : [],
      availability: String(saved.availability || 'Full day'),
      experience: String(saved.experience || 'First-time Rider'),
      emergencyContactName: String(saved.emergencyContactName || ''),
      emergencyContactPhone: String(saved.emergencyContactPhone || ''),
      bankAccountHolderName: String(saved.bankAccountHolderName || ''),
      bankAccountNumber: '',
      bankAccountConfirmation: '',
      bankIfsc: '',
    }));
  }, [application?.id, application?.updatedAt]);

  const set = (key: string, value: any) =>
    setForm((current) => ({ ...current, [key]: value }));
  const motorVehicle = !['BICYCLE', 'WALKER'].includes(form.vehicleType);
  const hasStoredBank = Boolean(saved.bankAccountLast4 && saved.bankIfscLast4);
  const completion = useMemo(() => Math.round(((step + 1) / STEP_TITLES.length) * 100), [step]);

  const useLocation = () => {
    Geolocation.getCurrentPosition(
      (position) => {
        set('latitude', String(position.coords.latitude));
        set('longitude', String(position.coords.longitude));
        Alert.alert('Location added', 'Your current coordinates were attached to the application.');
      },
      () => Alert.alert('Location unavailable', 'Enable location permission and try again.'),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 },
    );
  };

  const validate = () => {
    if (step === 0) {
      const missing = ['dateOfBirth', 'addressLine1', 'city', 'state', 'pincode'].filter(
        (key) => !String(form[key] || '').trim(),
      );
      if (missing.length) throw new Error('Complete your birth date and current address.');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(form.dateOfBirth)) {
        throw new Error('Use date of birth format YYYY-MM-DD.');
      }
      if (!/^\d{6}$/.test(form.pincode)) throw new Error('Enter a valid 6-digit pincode.');
    }
    if (step === 1) {
      if (motorVehicle && !form.vehicleNumber.trim()) {
        throw new Error('Enter the registered vehicle number.');
      }
      if (!form.preferredZones.length) throw new Error('Choose at least one preferred delivery zone.');
    }
    if (step === 2) {
      if (!form.emergencyContactName.trim() || !/^\+?[0-9]{10,15}$/.test(form.emergencyContactPhone.replace(/\s/g, ''))) {
        throw new Error('Enter a valid emergency contact name and phone number.');
      }
    }
    if (step === 3 && !hasStoredBank) {
      if (!form.bankAccountHolderName.trim()) throw new Error('Enter the bank account holder name.');
      if (!/^\d{8,20}$/.test(form.bankAccountNumber)) throw new Error('Enter a valid bank account number.');
      if (form.bankAccountNumber !== form.bankAccountConfirmation) {
        throw new Error('Bank account numbers do not match.');
      }
      if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(form.bankIfsc)) throw new Error('Enter a valid IFSC code.');
    }
  };

  const payloadForStep = () => {
    if (step === 0) {
      return {
        dateOfBirth: form.dateOfBirth.trim(),
        addressLine1: form.addressLine1.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        pincode: form.pincode.trim(),
        latitude: form.latitude ? Number(form.latitude) : null,
        longitude: form.longitude ? Number(form.longitude) : null,
      };
    }
    if (step === 1) {
      return {
        vehicleType: form.vehicleType,
        vehicleNumber: motorVehicle ? form.vehicleNumber.trim().toUpperCase() : null,
        preferredZones: form.preferredZones,
        availability: form.availability,
        experience: form.experience,
      };
    }
    if (step === 2) {
      return {
        emergencyContactName: form.emergencyContactName.trim(),
        emergencyContactPhone: form.emergencyContactPhone.replace(/\s/g, ''),
      };
    }
    const payout: Record<string, any> = {
      bankAccountHolderName: form.bankAccountHolderName.trim() || saved.bankAccountHolderName,
    };
    if (form.bankAccountNumber) payout.bankAccountNumber = form.bankAccountNumber;
    if (form.bankIfsc) payout.bankIfsc = form.bankIfsc;
    return payout;
  };

  const continueStep = async () => {
    try {
      validate();
      await update({ payload: payloadForStep() });
      if (step < STEP_TITLES.length - 1) setStep((current) => current + 1);
      else navigation.navigate('ApplicationDocuments');
    } catch (error: any) {
      Alert.alert('Check this step', error.message || 'Complete the required information.');
    }
  };

  return (
    <OnboardingShell
      title="Become an AAGAM Rider"
      subtitle={`Step ${step + 1} of ${STEP_TITLES.length} · ${STEP_TITLES[step]}`}
      onBack={() => (step > 0 ? setStep((current) => current - 1) : navigation.goBack())}
    >
      <ProgressBar value={completion} />

      {step === 0 ? (
        <Section title="About you" subtitle="Your address helps AAGAM assign nearby delivery zones.">
          <View style={styles.stepIcon}><UserRound size={22} color={palette.teal} /></View>
          <FormField label="Date of birth" value={form.dateOfBirth} onChangeText={(value) => set('dateOfBirth', value.replace(/[^0-9-]/g, '').slice(0, 10))} placeholder="YYYY-MM-DD" keyboardType="number-pad" />
          <FormField label="Current address" value={form.addressLine1} onChangeText={(value) => set('addressLine1', value)} placeholder="House, street and area" multiline />
          <FormField label="Pincode" value={form.pincode} onChangeText={(value) => set('pincode', value.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" placeholder="6-digit pincode" />
          <FormField label="City" value={form.city} onChangeText={(value) => set('city', value)} placeholder="City" />
          <FormField label="State" value={form.state} onChangeText={(value) => set('state', value)} placeholder="State" />
          <TouchableOpacity style={styles.locationButton} onPress={useLocation}>
            <MapPin size={18} color={palette.teal} />
            <Text style={styles.locationText}>{form.latitude ? 'Update current location' : 'Add current location'}</Text>
          </TouchableOpacity>
        </Section>
      ) : null}

      {step === 1 ? (
        <Section title="Delivery setup" subtitle="Choose how and where you plan to deliver.">
          <View style={styles.stepIcon}><Bike size={22} color={palette.teal} /></View>
          <Text style={styles.fieldLabel}>Vehicle type</Text>
          <ChoiceGrid values={VEHICLES} selected={form.vehicleType} onChange={(value) => set('vehicleType', value)} />
          {motorVehicle ? (
            <FormField label="Vehicle number" value={form.vehicleNumber} onChangeText={(value) => set('vehicleNumber', value.toUpperCase().replace(/\s/g, ''))} autoCapitalize="characters" placeholder="AP00AA0000" />
          ) : null}
          <Text style={styles.fieldLabel}>Preferred zones</Text>
          <ChoiceGrid values={ZONES} selected={form.preferredZones} multiple onChange={(value) => set('preferredZones', value)} />
          <Text style={styles.fieldLabel}>Availability</Text>
          <ChoiceGrid values={AVAILABILITY} selected={form.availability} onChange={(value) => set('availability', value)} />
          <Text style={styles.fieldLabel}>Delivery experience</Text>
          <ChoiceGrid values={EXPERIENCE} selected={form.experience} onChange={(value) => set('experience', value)} />
        </Section>
      ) : null}

      {step === 2 ? (
        <Section title="Emergency contact" subtitle="Choose someone AAGAM can contact only when Rider safety requires it.">
          <FormField label="Contact name" value={form.emergencyContactName} onChangeText={(value) => set('emergencyContactName', value)} placeholder="Full name" />
          <FormField label="Contact phone" value={form.emergencyContactPhone} onChangeText={(value) => set('emergencyContactPhone', value.replace(/[^+0-9]/g, ''))} keyboardType="phone-pad" placeholder="+91 9876543210" />
        </Section>
      ) : null}

      {step === 3 ? (
        <Section title="Payout account" subtitle="Your bank details are encrypted and used only for Rider payouts.">
          <View style={styles.stepIcon}><WalletCards size={22} color={palette.teal} /></View>
          {saved.bankAccountLast4 ? (
            <View style={styles.savedAccount}>
              <Check size={18} color={palette.green} />
              <Text style={styles.savedAccountText}>Account saved ···· {saved.bankAccountLast4}</Text>
            </View>
          ) : null}
          <FormField label="Account holder name" value={form.bankAccountHolderName} onChangeText={(value) => set('bankAccountHolderName', value)} placeholder="Name as shown by the bank" />
          <FormField label="Bank account number" value={form.bankAccountNumber} onChangeText={(value) => set('bankAccountNumber', value.replace(/\D/g, ''))} keyboardType="number-pad" secureTextEntry placeholder={hasStoredBank ? 'Enter only to replace saved account' : 'Account number'} />
          {form.bankAccountNumber ? (
            <FormField label="Confirm account number" value={form.bankAccountConfirmation} onChangeText={(value) => set('bankAccountConfirmation', value.replace(/\D/g, ''))} keyboardType="number-pad" secureTextEntry placeholder="Re-enter account number" />
          ) : null}
          <FormField label="IFSC code" value={form.bankIfsc} onChangeText={(value) => set('bankIfsc', value.toUpperCase().replace(/\s/g, '').slice(0, 11))} autoCapitalize="characters" placeholder={hasStoredBank ? 'Enter only to replace saved IFSC' : 'ABCD0123456'} />
        </Section>
      ) : null}

      <PrimaryButton
        label={step === STEP_TITLES.length - 1 ? 'Save and continue to documents' : 'Save and continue'}
        onPress={continueStep}
        loading={isLoading}
      />
      {step > 0 ? <PrimaryButton label="Previous step" onPress={() => setStep((current) => current - 1)} secondary disabled={isLoading} /> : null}
      <Text style={styles.note}>Your progress is saved after every step.</Text>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  stepIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: '#ECFEFF', alignItems: 'center', justifyContent: 'center' },
  choiceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  choice: { minHeight: 42, borderRadius: 13, borderWidth: 1, borderColor: '#CBD5E1', backgroundColor: '#F8FAFC', paddingHorizontal: 12, paddingVertical: 9, flexDirection: 'row', alignItems: 'center', gap: 5 },
  choiceActive: { borderColor: '#2DD4BF', backgroundColor: '#CCFBF1' },
  choiceText: { color: palette.muted, fontSize: 12, fontWeight: '800' },
  choiceTextActive: { color: palette.teal },
  fieldLabel: { color: palette.ink, fontSize: 12, fontWeight: '900', marginBottom: -2 },
  locationButton: { minHeight: 48, borderRadius: 15, borderWidth: 1, borderColor: '#99F6E4', backgroundColor: '#F0FDFA', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  locationText: { color: palette.teal, fontSize: 12, fontWeight: '900' },
  savedAccount: { borderRadius: 15, backgroundColor: '#ECFDF5', padding: 13, flexDirection: 'row', alignItems: 'center', gap: 8 },
  savedAccountText: { color: palette.green, fontSize: 12, fontWeight: '900' },
  note: { color: palette.muted, fontSize: 11, lineHeight: 17, textAlign: 'center' },
});
