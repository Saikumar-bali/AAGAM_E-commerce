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

export function StoreApplicationScreen({ navigation }: any) {
  const { response, update, isLoading } = usePartnerOnboardingStore();
  const application = response?.application;
  const saved = application?.applicantPayload || {};
  const [form, setForm] = useState<Record<string, string>>({
    legalName: '',
    displayName: '',
    businessType: '',
    storeAddress: '',
    city: '',
    state: '',
    pincode: '',
    latitude: '',
    longitude: '',
    operatingHours: '',
    serviceRadiusKm: '5',
    orderCapacity: '50',
    packingCapacity: '',
    categories: '',
    pickupInstructions: '',
    bankAccountNumber: '',
    bankIfsc: '',
    taxIdentifier: '',
  });

  useEffect(() => {
    setForm((current) => ({
      ...current,
      legalName: String(saved.legalName || ''),
      displayName: String(saved.displayName || ''),
      businessType: String(saved.businessType || ''),
      storeAddress: String(saved.storeAddress || ''),
      city: String(saved.city || ''),
      state: String(saved.state || ''),
      pincode: String(saved.pincode || ''),
      latitude: saved.latitude === undefined ? '' : String(saved.latitude),
      longitude: saved.longitude === undefined ? '' : String(saved.longitude),
      operatingHours: String(saved.operatingHours || ''),
      serviceRadiusKm: String(saved.serviceRadiusKm || '5'),
      orderCapacity: String(saved.orderCapacity || '50'),
      packingCapacity: String(saved.packingCapacity || ''),
      categories: Array.isArray(saved.categories)
        ? saved.categories.join(', ')
        : String(saved.categories || ''),
      pickupInstructions: String(saved.pickupInstructions || ''),
      bankAccountNumber: '',
      bankIfsc: '',
      taxIdentifier: '',
    }));
  }, [application?.id, application?.updatedAt]);

  const set = (key: string, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  const save = async () => {
    const required = [
      'legalName',
      'displayName',
      'businessType',
      'storeAddress',
      'city',
      'state',
      'pincode',
      'latitude',
      'longitude',
      'operatingHours',
      'serviceRadiusKm',
      'orderCapacity',
    ];
    const missing = required.filter((key) => !form[key]?.trim());
    const hasStoredBank = Boolean(saved.bankAccountLast4 && saved.bankIfscLast4);
    if (!hasStoredBank && (!form.bankAccountNumber.trim() || !form.bankIfsc.trim())) {
      missing.push('settlement bank details');
    }
    const latitude = Number(form.latitude);
    const longitude = Number(form.longitude);
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      missing.push('valid latitude');
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      missing.push('valid longitude');
    }
    if (missing.length) {
      Alert.alert('Store application incomplete', `Complete: ${missing.join(', ')}`);
      return;
    }

    try {
      const payload: Record<string, any> = {
        legalName: form.legalName.trim(),
        displayName: form.displayName.trim(),
        businessType: form.businessType.trim(),
        storeAddress: form.storeAddress.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        pincode: form.pincode.trim(),
        latitude,
        longitude,
        operatingHours: form.operatingHours.trim(),
        serviceRadiusKm: Number(form.serviceRadiusKm),
        orderCapacity: Number(form.orderCapacity),
        packingCapacity: form.packingCapacity
          ? Number(form.packingCapacity)
          : null,
        categories: form.categories
          .split(',')
          .map((value) => value.trim())
          .filter(Boolean),
        pickupInstructions: form.pickupInstructions.trim(),
      };
      if (form.bankAccountNumber.trim()) {
        payload.bankAccountNumber = form.bankAccountNumber.trim();
      }
      if (form.bankIfsc.trim()) payload.bankIfsc = form.bankIfsc.trim();
      if (form.taxIdentifier.trim()) payload.taxIdentifier = form.taxIdentifier.trim();
      await update({ payload });
      navigation.navigate('ApplicationDocuments');
    } catch (error: any) {
      Alert.alert('Could not save Store application', error.message);
    }
  };

  return (
    <OnboardingShell
      title="Store and business profile"
      subtitle="Admin will verify the owner, physical location, operating capacity, settlement details, and submitted business evidence."
      onBack={() => navigation.goBack()}
    >
      <Section title="Business identity">
        <FormField label="Legal business name" value={form.legalName} onChangeText={(value) => set('legalName', value)} placeholder="Registered or legal name" />
        <FormField label="Customer-facing store name" value={form.displayName} onChangeText={(value) => set('displayName', value)} placeholder="Store display name" />
        <FormField label="Business type" value={form.businessType} onChangeText={(value) => set('businessType', value)} placeholder="Grocery, pharmacy, restaurant..." />
        <FormField label="Categories" value={form.categories} onChangeText={(value) => set('categories', value)} placeholder="Groceries, dairy, snacks" hint="Separate categories with commas." />
      </Section>

      <Section title="Physical location" subtitle="Use the exact entrance or pickup location coordinates.">
        <FormField label="Store address" value={form.storeAddress} onChangeText={(value) => set('storeAddress', value)} placeholder="Full store address" multiline />
        <FormField label="City" value={form.city} onChangeText={(value) => set('city', value)} placeholder="City" />
        <FormField label="State" value={form.state} onChangeText={(value) => set('state', value)} placeholder="State" />
        <FormField label="Pincode" value={form.pincode} onChangeText={(value) => set('pincode', value.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" placeholder="6-digit pincode" />
        <FormField label="Latitude" value={form.latitude} onChangeText={(value) => set('latitude', value)} keyboardType="decimal-pad" placeholder="17.7231" />
        <FormField label="Longitude" value={form.longitude} onChangeText={(value) => set('longitude', value)} keyboardType="decimal-pad" placeholder="83.3013" />
      </Section>

      <Section title="Operating capacity">
        <FormField label="Operating hours" value={form.operatingHours} onChangeText={(value) => set('operatingHours', value)} placeholder="Daily 7 AM–11 PM" />
        <FormField label="Service radius (km)" value={form.serviceRadiusKm} onChangeText={(value) => set('serviceRadiusKm', value)} keyboardType="decimal-pad" placeholder="5" />
        <FormField label="Estimated daily orders" value={form.orderCapacity} onChangeText={(value) => set('orderCapacity', value.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="50" />
        <FormField label="Simultaneous packing capacity" value={form.packingCapacity} onChangeText={(value) => set('packingCapacity', value.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="Optional" />
        <FormField label="Rider pickup instructions" value={form.pickupInstructions} onChangeText={(value) => set('pickupInstructions', value)} placeholder="Entrance, counter, parking guidance" multiline />
      </Section>

      <Section title="Settlement and tax details" subtitle="Sensitive values are encrypted. Tax or licence details are configurable review evidence, not claimed as universally required.">
        {saved.bankAccountLast4 ? (
          <Text style={styles.masked}>Settlement account saved •••• {saved.bankAccountLast4}</Text>
        ) : null}
        <FormField label="Bank account number" value={form.bankAccountNumber} onChangeText={(value) => set('bankAccountNumber', value.replace(/\s/g, ''))} secureTextEntry keyboardType="number-pad" placeholder={saved.bankAccountLast4 ? 'Enter only to replace' : 'Account number'} />
        <FormField label="IFSC" value={form.bankIfsc} onChangeText={(value) => set('bankIfsc', value.toUpperCase())} secureTextEntry autoCapitalize="characters" placeholder={saved.bankIfscLast4 ? 'Enter only to replace' : 'IFSC code'} />
        <FormField label="Tax or registration identifier" value={form.taxIdentifier} onChangeText={(value) => set('taxIdentifier', value.toUpperCase())} secureTextEntry autoCapitalize="characters" placeholder={saved.taxIdentifierLast4 ? 'Enter only to replace' : 'Optional identifier'} />
      </Section>

      <PrimaryButton label="Save and continue to documents" onPress={save} loading={isLoading} />
      <Text style={styles.note}>Admin can correct operational display fields during review, but every change is audited.</Text>
    </OnboardingShell>
  );
}

const styles = StyleSheet.create({
  masked: { color: palette.green, fontSize: 13, fontWeight: '800', backgroundColor: '#ECFDF5', padding: 12, borderRadius: 14 },
  note: { color: palette.muted, fontSize: 11, lineHeight: 17, textAlign: 'center' },
});
