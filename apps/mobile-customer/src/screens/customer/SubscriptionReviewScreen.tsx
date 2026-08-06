import React, { type ReactNode, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute, type NavigationProp, type RouteProp } from '@react-navigation/native';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, Check, Clock3, MapPin, ShieldCheck, WalletCards } from 'lucide-react-native';
import { apiClient } from '../../api/client';
import {
  subscriptionService,
  type CustomerAddress,
  type SubscriptionDeliveryMethod,
  type SubscriptionPlan,
} from '../../api/subscriptionService';
import type { CustomerStackParamList } from '../../navigation/customerNavigationTypes';
import { getUserSafeError, notify } from '../../ui/notify';

const money = (paise: number) => `₹${(Number(paise || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString().slice(0, 10); };
const time = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;

type MethodOption = {
  value: SubscriptionDeliveryMethod;
  label: string;
  copy: string;
  isAllowed: (plan: SubscriptionPlan) => boolean;
};

const methodOptions: MethodOption[] = [
  { value: 'PERSONAL_HANDOVER', label: 'Personal OTP', copy: 'Customer OTP + GPS', isAllowed: (plan) => plan.allowPersonalHandover },
  { value: 'TRUSTED_DROP', label: 'Trusted doorstep', copy: 'Secure token + proof', isAllowed: (plan) => plan.allowTrustedDrop },
  { value: 'SECURITY_RECEPTION', label: 'Security / reception', copy: 'OTP + named handover', isAllowed: (plan) => plan.allowSecurityHandover },
];

export const SubscriptionReviewScreen = () => {
  const route = useRoute<RouteProp<CustomerStackParamList, 'SubscriptionReview'>>();
  const navigation = useNavigation<NavigationProp<CustomerStackParamList>>();
  const { planId } = route.params;
  const planQuery = useQuery({ queryKey: ['subscription-plan', planId], queryFn: () => subscriptionService.plan(planId) });
  const addressQuery = useQuery({
    queryKey: ['customer-addresses'],
    queryFn: async () => {
      const response = await apiClient.get<CustomerAddress[]>('/customer/addresses');
      return Array.isArray(response.data) ? response.data : [];
    },
  });
  const [addressId, setAddressId] = useState('');
  const [startDate, setStartDate] = useState(tomorrow());
  const [method, setMethod] = useState<SubscriptionDeliveryMethod>('PERSONAL_HANDOVER');
  const [dropToken, setDropToken] = useState('');
  const [dropInstructions, setDropInstructions] = useState('');
  const plan = planQuery.data;
  const addresses = addressQuery.data ?? [];

  useEffect(() => {
    if (!addressId && addresses.length) {
      setAddressId((addresses.find((address) => address.isDefault) ?? addresses[0]).id);
    }
  }, [addressId, addresses]);

  useEffect(() => {
    if (!plan) return;
    if (methodOptions.find((option) => option.value === method)?.isAllowed(plan)) return;
    const firstAllowed = methodOptions.find((option) => option.isAllowed(plan));
    if (firstAllowed) setMethod(firstAllowed.value);
  }, [method, plan]);

  const quotePayload = useMemo(() => plan ? ({
    addressId,
    startDate,
    deliveryMethod: method,
    deliveryWindowStartMinute: plan.defaultWindowStartMinute,
    deliveryWindowEndMinute: plan.defaultWindowEndMinute,
  }) : null, [addressId, method, plan, startDate]);

  const quote = useMutation({
    mutationFn: () => {
      if (!quotePayload) throw new Error('The subscription plan is not ready.');
      return subscriptionService.quote(planId, quotePayload);
    },
    onError: (error) => notify.error('Review failed', getUserSafeError(error)),
  });
  const create = useMutation({
    mutationFn: () => {
      if (!quotePayload) throw new Error('The subscription plan is not ready.');
      return subscriptionService.create({
        ...quotePayload,
        planId,
        trustedDropInstructions: dropInstructions.trim() || undefined,
        dropPointToken: method === 'TRUSTED_DROP' ? dropToken.trim() : undefined,
      });
    },
    onSuccess: (result) => {
      notify.success('Subscription requested', result.confirmationMessage || 'Cash will be collected on the first verified delivery.');
      navigation.navigate('SubscriptionDetail', { subscriptionId: result.id });
    },
    onError: (error) => notify.error('Subscription could not be created', getUserSafeError(error)),
  });

  useEffect(() => {
    if (quotePayload && addressId) quote.mutate();
  }, [addressId, method, planId, startDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const canSubmit = Boolean(plan && addressId && /^\d{4}-\d{2}-\d{2}$/.test(startDate) && (method !== 'TRUSTED_DROP' || dropToken.trim().length >= 6));

  if (planQuery.isLoading || addressQuery.isLoading) return <View style={styles.center}><ActivityIndicator size="large" color="#087B5B" /></View>;
  if (!plan || planQuery.isError) return <View style={styles.center}><Text style={styles.error}>Unable to prepare this subscription.</Text><Pressable onPress={() => navigation.goBack()}><Text style={styles.link}>Go back</Text></Pressable></View>;
  const q = quote.data;
  return <SafeAreaView style={styles.screen}>
    <View style={styles.header}><Pressable onPress={() => navigation.goBack()} style={styles.iconButton}><ArrowLeft size={22} color="#173D32" /></Pressable><View><Text style={styles.eyebrow}>FINAL CHECK</Text><Text style={styles.title}>Review subscription</Text></View></View>
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.planCard}>{plan.mobileImageUrl || plan.imageUrl ? <Image source={{ uri: plan.mobileImageUrl || plan.imageUrl || undefined }} style={styles.planImage} /> : null}<View style={styles.flex}><Text style={styles.planName}>{plan.name}</Text><Text style={styles.planMeta}>{plan.totalDeliveries} deliveries · {plan.fundingCycle === 'WEEKLY' ? 'Weekly cash funding' : 'Full plan funding'}</Text><Text style={styles.planPrice}>{money(plan.pricePaise)}</Text></View></View>
      <Section icon={<MapPin size={18} color="#087B5B" />} title="Delivery address">
        <View style={styles.optionGrid}>{addresses.map((address) => <Pressable key={address.id} onPress={() => setAddressId(address.id)} style={[styles.optionCard, addressId === address.id && styles.optionCardSelected]}><View style={styles.optionTop}><Text style={styles.optionTitle}>{address.label || 'Address'}</Text>{addressId === address.id ? <Check size={17} color="#087B5B" /> : null}</View><Text style={styles.optionText}>{address.line1 || address.addressLine1 || 'Saved address'}{address.city ? `, ${address.city}` : ''}</Text></Pressable>)}</View>
      </Section>
      <Section icon={<CalendarDays size={18} color="#087B5B" />} title="Start date"><TextInput value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" style={styles.input} autoCapitalize="none" /><Text style={styles.help}>Use YYYY-MM-DD. The first order is created only near its delivery window.</Text></Section>
      <Section icon={<Clock3 size={18} color="#087B5B" />} title="Delivery slot"><View style={styles.readOnly}><Text style={styles.readOnlyText}>{time(plan.defaultWindowStartMinute)} – {time(plan.defaultWindowEndMinute)}</Text></View></Section>
      <Section icon={<ShieldCheck size={18} color="#087B5B" />} title="Handover method">
        <View style={styles.methodList}>
          {methodOptions.filter((option) => option.isAllowed(plan)).map((option) => <Pressable key={option.value} style={[styles.method, method === option.value && styles.methodSelected]} onPress={() => setMethod(option.value)}><View style={[styles.radio, method === option.value && styles.radioSelected]}>{method === option.value ? <View style={styles.radioDot} /> : null}</View><View><Text style={styles.methodTitle}>{option.label}</Text><Text style={styles.methodCopy}>{option.copy}</Text></View></Pressable>)}
        </View>
        {method === 'TRUSTED_DROP' ? <View style={styles.dropFields}><TextInput value={dropToken} onChangeText={setDropToken} placeholder="Drop-point token (minimum 6 characters)" secureTextEntry style={styles.input} /><TextInput value={dropInstructions} onChangeText={setDropInstructions} placeholder="Milk box / doorstep instructions" multiline style={[styles.input, styles.multiline]} /></View> : null}
      </Section>
      <Section icon={<WalletCards size={18} color="#087B5B" />} title="Cash funding summary">
        {quote.isPending ? <ActivityIndicator color="#087B5B" /> : <View style={styles.summary}><Row label="First verified delivery" value={money(q?.firstCashCollectionPaise ?? plan.pricePaise)} strong /><Row label="Later funded deliveries" value="₹0" /><Row label="Proof" value={method === 'TRUSTED_DROP' ? 'Secure drop proof' : 'OTP + GPS'} /><Row label="Skip policy" value={plan.allowSkip ? `Up to ${plan.maximumSkips}` : 'Not available'} /></View>}
        <Text style={styles.cashNotice}>{q?.confirmationMessage || `Subscription requested — ${money(plan.pricePaise)} will be collected during the first verified delivery.`}</Text>
      </Section>
    </ScrollView>
    <View style={styles.footer}><Pressable testID="confirm_subscription" disabled={!canSubmit || create.isPending} onPress={() => create.mutate()} style={[styles.submit, (!canSubmit || create.isPending) && styles.disabled]}>{create.isPending ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.submitText}>Request subscription</Text>}</Pressable></View>
  </SafeAreaView>;
};

const Section = ({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) => <View style={styles.section}><View style={styles.sectionHeader}>{icon}<Text style={styles.sectionTitle}>{title}</Text></View>{children}</View>;
const Row = ({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) => <View style={styles.row}><Text style={styles.rowLabel}>{label}</Text><Text style={[styles.rowValue, strong && styles.rowStrong]}>{value}</Text></View>;
const styles = StyleSheet.create({ screen: { flex: 1, backgroundColor: '#F5F8F6' }, flex: { flex: 1 }, center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }, error: { color: '#9F2F2F', fontWeight: '800' }, link: { color: '#087B5B', fontWeight: '900' }, header: { backgroundColor: '#FFFFFF', paddingHorizontal: 18, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: 1, borderBottomColor: '#E5ECE8' }, iconButton: { width: 44, height: 44, borderRadius: 15, backgroundColor: '#EFF7F3', alignItems: 'center', justifyContent: 'center' }, eyebrow: { color: '#087B5B', fontWeight: '900', fontSize: 10, letterSpacing: 1.2 }, title: { color: '#163B31', fontSize: 23, fontWeight: '900' }, content: { padding: 16, paddingBottom: 118, gap: 14 }, planCard: { flexDirection: 'row', gap: 14, backgroundColor: '#0C7659', borderRadius: 24, padding: 17, alignItems: 'center' }, planImage: { width: 74, height: 74, borderRadius: 18, backgroundColor: '#FFFFFF' }, planName: { color: '#FFFFFF', fontSize: 19, fontWeight: '900' }, planMeta: { color: '#D5F3E7', fontSize: 12, marginTop: 3 }, planPrice: { color: '#FFFFFF', fontSize: 22, fontWeight: '900', marginTop: 8 }, section: { backgroundColor: '#FFFFFF', borderRadius: 22, padding: 16, borderWidth: 1, borderColor: '#E1EAE5' }, sectionHeader: { flexDirection: 'row', gap: 9, alignItems: 'center', marginBottom: 13 }, sectionTitle: { color: '#1A4034', fontSize: 16, fontWeight: '900' }, optionGrid: { gap: 9 }, optionCard: { borderWidth: 1, borderColor: '#DDE7E2', borderRadius: 16, padding: 13 }, optionCardSelected: { borderColor: '#087B5B', backgroundColor: '#F0FAF5' }, optionTop: { flexDirection: 'row', justifyContent: 'space-between' }, optionTitle: { fontWeight: '900', color: '#264A3E' }, optionText: { color: '#687A72', fontSize: 12, marginTop: 4 }, input: { minHeight: 50, borderWidth: 1, borderColor: '#D9E4DE', borderRadius: 15, paddingHorizontal: 14, color: '#1F3F35', backgroundColor: '#FBFDFC' }, multiline: { minHeight: 84, textAlignVertical: 'top', paddingTop: 13 }, help: { fontSize: 10, color: '#75857E', marginTop: 7 }, readOnly: { minHeight: 50, borderRadius: 15, backgroundColor: '#F2F7F4', justifyContent: 'center', paddingHorizontal: 14 }, readOnlyText: { color: '#274A3E', fontWeight: '900' }, methodList: { gap: 9 }, method: { flexDirection: 'row', gap: 11, padding: 13, borderRadius: 16, borderWidth: 1, borderColor: '#DDE7E2' }, methodSelected: { borderColor: '#087B5B', backgroundColor: '#F0FAF5' }, radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#AABBB3', alignItems: 'center', justifyContent: 'center' }, radioSelected: { borderColor: '#087B5B' }, radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#087B5B' }, methodTitle: { color: '#23473B', fontWeight: '900' }, methodCopy: { color: '#718079', fontSize: 11, marginTop: 2 }, dropFields: { gap: 9, marginTop: 10 }, summary: { gap: 10 }, row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 }, rowLabel: { color: '#677A72', fontSize: 12 }, rowValue: { color: '#2E4A40', fontSize: 12, fontWeight: '800', textAlign: 'right' }, rowStrong: { color: '#B45C00', fontSize: 15 }, cashNotice: { marginTop: 14, borderRadius: 15, padding: 13, backgroundColor: '#FFF3DF', color: '#854800', fontSize: 12, fontWeight: '800', lineHeight: 18 }, footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 15, backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#E3EAE6' }, submit: { minHeight: 54, borderRadius: 18, backgroundColor: '#087B5B', alignItems: 'center', justifyContent: 'center' }, disabled: { opacity: 0.45 }, submitText: { color: '#FFFFFF', fontWeight: '900', fontSize: 16 } });
