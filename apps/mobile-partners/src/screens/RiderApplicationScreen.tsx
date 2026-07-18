import React, { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import {
  FormField,
  OnboardingShell,
  palette,
  PrimaryButton,
  Section,
} from '../components/PartnerOnboardingUI';
import { usePartnerOnboardingStore } from '../onboarding/usePartnerOnboardingStore';

export function RiderApplicationScreen({ navigation }: any) {
  const { response, update, isLoading } = usePartnerOnboardingStore();
  const application = response?.application;
  const saved = application?.applicantPayload || {};
  const [form, setForm] = useState<Record<string, string>>({
    dateOfBirth: '',
    addressLine1: '',
    city: '',
    state: '',
    pincode: '',
    vehicleType: 'MOTORCYCLE',
    vehicleNumber: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    preferredZones: '',
    availability: '',
    experience: '',
    bankAccountNumber: '',
    bankIfsc: '',
  });

  useEffect(() => {
    setForm((current) => ({
      ...current,
      dateOfBirth: String(saved.dateOfBirth || ''),
      addressLine1: String(saved.addressLine1 || ''),
      city: String(saved.city || ''),
      state: String(saved.state || ''),
      pincode: String(saved.pincode || ''),
      vehicleType: String(saved.vehicleType || 'MOTORCYCLE'),
      vehicleNumber: String(saved.vehicleNumber || ''),
      emergencyContactName: String(saved.emergencyContactName || ''),
      emergencyContactPhone: String(saved.emergencyContactPhone || ''),
      preferredZones: Array.isArray(saved.preferredZones)
        ? saved.preferredZones.join(', ')
        : String(saved.preferredZones || ''),
      availability: String(saved.availability || ''),
      experience: String(saved.experience || ''),
      bankAccountNumber: '',
      bankIfsc: '',
    }));
  }, [application?.id, application?.updatedAt]);

  const set = (key: string, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    const required = [
      'dateOfBirth',
      'addressLine1',
      'city',
      'state',
      'pincode',
      'vehicleType',
      'emergencyContactName',
      'emergencyContactPhone',
    ];
    const missing = required.filter((key) => !form[key]?.trim());
    const hasStoredBank = Boolean(saved.bankAccountLast4 && saved.bankIfscLast4);
    if (!hasStoredBank && (!form.bankAccountNumber.trim() || !form.bankIfsc.trim())) {
      missing.push('bank details');
    }
    if (missing.length) {
      Alert.alert(
        'Application incomplete',
        `Complete: ${missing.join(', ')}`,
      );
      return;
    }
    try {
      const payload: Record<string, any> = {
        dateOfBirth: form.dateOfBirth.trim(),
        addressLine1: form.addressLine1.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        pincode: form.pincode.trim(),
        vehicleType: form.vehicleType.trim().toUpperCase(),
        vehicleNumber: form.vehicleNumber.trim().toUpperCase() || null,
        emergencyContactName: form.emergencyContactName.trim(),
        emergencyContactPhone: form.emergencyContactPhone.trim(),
        preferredZones: form.preferredZones
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        availability: form.availability.trim(),
        experience: form.experience.trim(),
      };
      if (form.bankAccountNumber.trim()) {
        payload.bankAccountNumber = form.bankAccountNumber.trim();
      }
      if (form.bankIfsc.trim()) payload.bankIfsc = form.bankIfsc.trim();
      await update({ payload });
      navigation.navigate('ApplicationDocuments');
    } catch (error: any) {
      Alert.alert('Could not save Rider application', error.message);
    }
  };

  return (
    <OnboardingShell
      title="Rider profile"
      subtitle="Provide the details Admin needs to verify identity, delivery eligibility, emergency readiness, and payout setup."
      onBack={() => navigation.goBack()}
    >
      <Section title="Personal and address details">
        <FormField label="Date of birth" value={form.dateOfBirth} onChangeText={(value) => set('dateOfBirth', value)} placeholder="YYYY-MM-DD" />
        <FormField label="Current address" value={form.addressLine1} onChangeText={(value) => set('addressLine1', value)} placeholder="House, street, area" multiline />
        <FormField label="City" value={form.city} onChangeText={(value) => set('city', value)} placeholder="City" />
        <FormField label="State" value={form.state} onChangeText={(value) => set('state', value)} placeholder="State" />
        <FormField label="Pincode" value={form.pincode} onChangeText={(value) => set('pincode', value.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" placeholder="6-digit pincode" />
      </Section>

      <Section title="Delivery vehicle" subtitle="Use WALKER or BICYCLE only when no registered motor vehicle will be used.">
        <FormField label="Vehicle type" value={form.vehicleType} onChangeText={(value) => set('vehicleType', value)} autoCapitalize="characters" placeholder="MOTORCYCLE / SCOOTER / BICYCLE" />
        <FormField label="Vehicle number" value={form.vehicleNumber} onChangeText={(value) => set('vehicleNumber', value)} autoCapitalize="characters" placeholder="AP00AA0000" />
        <FormField label="Preferred zones" value={form.preferredZones} onChangeText={(value) => set('preferredZones', value)} placeholder="Madhurawada, MVP Colony" hint="Separate multiple zones with commas." />
        <FormField label="Availability" value={form.availability} onChangeText={(value) => set('availability', value)} placeholder="Mon–Sat, 9 AM–8 PM" />
        <FormField label="Delivery experience" value={form.experience} onChangeText={(value) => set('experience', value)} placeholder="Previous work or first-time rider" multiline />
      </Section>

      <Section title="Emergency contact">
        <FormField label="Contact name" value={form.emergencyContactName} onChangeText={(value) => set('emergencyContactName', value)} placeholder="Full name" />
        <FormField label="Contact phone" value={form.emergencyContactPhone} onChangeText={(value) => set('emergencyContactPhone', value)} keyboardType="phone-pad" placeholder="+91..." />
      </Section>

      <Section title="Payout account" subtitle="Account and IFSC values are encrypted before storage. Only masked values are shown after saving.">
        {saved.bankAccountLast4 ? (
          <Text style={styles.masked}>Account saved •••• {saved.bankAccountLast4}</Text>
        ) : null}
        <FormField label="Bank account number" value={form.bankAccountNumber} onChangeText={(value) => set('bankAccountNumber', value.replace(/\s/g, ''))} keyboardType="number-pad" secureTextEntry placeholder={saved.bankAccountLast4 ? 'Enter only to replace saved account' : 'Account number'} />
        <FormField label="IFSC" value={form.bankIfsc} onChangeText={(value) => set('bankIfsc', value.toUpperCase())} autoCapitalize="characters" secureTextEntry placeholder={saved.bankIfscLast4 ? 'Enter only to replace saved IFSC' : 'IFSC code'} />
      </Section>

      <PrimaryButton label="Save and continue to documents" onPress={save} loading={isLoading} />
      <Text style={styles.note}>Saving creates an audited draft update. It does not submit the application.</Text>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  masked: { color: palette.green, fontSize: 13, fontWeight: '800', backgroundColor: '#ECFDF5', padding: 12, borderRadius: 14 },
  note: { color: palette.muted, fontSize: 11, lineHeight: 17, textAlign: 'center' },
});
