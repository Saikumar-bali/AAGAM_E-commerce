import React, { type ReactNode, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useNavigation, useRoute, type NavigationProp, type RouteProp } from '@react-navigation/native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CalendarDays, CheckCircle2, Clock3, MapPin, Pause, Play, ReceiptIndianRupee, Route, Settings2, SkipForward, TriangleAlert, X } from 'lucide-react-native';
import {
  subscriptionService,
  type CustomerSubscription,
  type SubscriptionDelivery,
  type SubscriptionDeliveryMethod,
} from '../../api/subscriptionService';
import type { CustomerStackParamList } from '../../navigation/customerNavigationTypes';
import { getUserSafeError, notify } from '../../ui/notify';

const date = (value?: string | null) => value ? new Date(value).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : '—';
const tomorrow = () => { const d = new Date(); d.setDate(d.getDate() + 1); return d.toISOString(); };
const minuteTime = (minute: number) => `${Math.floor(minute / 60).toString().padStart(2, '0')}:${(minute % 60).toString().padStart(2, '0')}`;
const activeDeliveryStatuses = ['SCHEDULED', 'ORDER_GENERATED', 'PREPARING', 'PACKED', 'ASSIGNED', 'OUT_FOR_DELIVERY'];
const issueTypes = [
  { value: 'MISSING_DELIVERY', label: 'Missing delivery' },
  { value: 'INCORRECT_ITEMS', label: 'Incorrect items' },
  { value: 'DAMAGED_ITEMS', label: 'Damaged items' },
  { value: 'PROOF_DISPUTE', label: 'Proof dispute' },
  { value: 'OTHER', label: 'Other' },
];

type Sheet = 'issue' | 'preferences' | 'cancel' | null;
type LifecycleAction = 'skip' | 'pause' | 'resume';

export const SubscriptionDetailScreen = () => {
  const navigation = useNavigation<NavigationProp<CustomerStackParamList>>();
  const route = useRoute<RouteProp<CustomerStackParamList, 'SubscriptionDetail'>>();
  const id = route.params.subscriptionId;
  const queryClient = useQueryClient();
  const [showAll, setShowAll] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [issueType, setIssueType] = useState('MISSING_DELIVERY');
  const [issueDescription, setIssueDescription] = useState('');
  const [cancelReason, setCancelReason] = useState('');
  const [preferenceMethod, setPreferenceMethod] = useState<SubscriptionDeliveryMethod>('PERSONAL_HANDOVER');
  const [dropInstructions, setDropInstructions] = useState('');
  const [dropToken, setDropToken] = useState('');

  const query = useQuery({ queryKey: ['my-subscription', id], queryFn: () => subscriptionService.one(id) });
  const deliveriesQuery = useQuery({ queryKey: ['subscription-deliveries', id], queryFn: () => subscriptionService.deliveries(id) });
  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['my-subscription', id] }),
      queryClient.invalidateQueries({ queryKey: ['subscription-deliveries', id] }),
      queryClient.invalidateQueries({ queryKey: ['my-subscriptions'] }),
    ]);
  };

  const lifecycle = useMutation({
    mutationFn: async (kind: LifecycleAction) => {
      if (kind === 'pause') return subscriptionService.pause(id, tomorrow(), 'Customer requested pause');
      if (kind === 'resume') return subscriptionService.resume(id);
      const next = (deliveriesQuery.data ?? []).find((delivery) => delivery.status === 'SCHEDULED');
      if (next) return subscriptionService.skip(id, next.id, 'Customer requested skip');
      throw new Error('No upcoming delivery is available');
    },
    onSuccess: async (_, kind) => {
      notify.success(kind === 'skip' ? 'Delivery skipped' : kind === 'pause' ? 'Subscription paused' : 'Subscription resumed');
      await refresh();
    },
    onError: (error) => notify.error('Action failed', getUserSafeError(error)),
  });
  const tracking = useMutation({
    mutationFn: () => subscriptionService.tracking(id),
    onSuccess: (data) => {
      if (data.orderId) navigation.navigate('OrderDetail', { orderId: data.orderId });
      else notify.info('No active delivery', 'Tracking becomes available after the next order is generated.');
    },
    onError: (error) => notify.error('Tracking unavailable', getUserSafeError(error)),
  });

  const deliveries = deliveriesQuery.data ?? [];
  const reportableDelivery = useMemo(() => deliveries.find((delivery) => delivery.status === 'DELIVERED') ?? deliveries[0], [deliveries]);
  const issue = useMutation({
    mutationFn: () => {
      if (!reportableDelivery) throw new Error('No delivery is available to report.');
      return subscriptionService.reportIssue(id, reportableDelivery.id, issueType, issueDescription.trim());
    },
    onSuccess: () => { notify.success('Issue reported', 'Aagaam operations can now review this delivery.'); setIssueDescription(''); setSheet(null); },
    onError: (error) => notify.error('Report failed', getUserSafeError(error)),
  });
  const preferences = useMutation({
    mutationFn: () => subscriptionService.preferences(id, {
      deliveryMethod: preferenceMethod,
      trustedDropInstructions: preferenceMethod === 'TRUSTED_DROP' ? dropInstructions.trim() : undefined,
      dropPointToken: preferenceMethod === 'TRUSTED_DROP' ? dropToken.trim() : undefined,
    }),
    onSuccess: async () => { notify.success('Preferences updated', 'Future eligible deliveries will use the new handover preference.'); setSheet(null); await refresh(); },
    onError: (error) => notify.error('Update failed', getUserSafeError(error)),
  });
  const cancel = useMutation({
    mutationFn: () => subscriptionService.cancel(id, cancelReason.trim()),
    onSuccess: async () => { notify.success('Subscription cancelled', 'Future ungenerated deliveries have been cancelled safely.'); setSheet(null); await refresh(); },
    onError: (error) => notify.error('Cancellation failed', getUserSafeError(error)),
  });

  if (query.isLoading) return <View style={styles.center}><ActivityIndicator size="large" color="#087B5B" /></View>;
  if (!query.data) return <View style={styles.center}><Text>Subscription could not be loaded.</Text></View>;
  const subscription = query.data;
  const total = Number(subscription.planVersion?.totalDeliveries || deliveries.length || 1);
  const percent = Math.min(100, Math.round(Number(subscription.completedDeliveries || 0) / total * 100));
  const next = deliveries.find((delivery) => activeDeliveryStatuses.includes(delivery.status));
  const visible = showAll ? deliveries : deliveries.slice(0, 8);
  const canChange = !['CANCELLED', 'COMPLETED'].includes(subscription.status);

  const openPreferences = () => {
    setPreferenceMethod(subscription.deliveryMethod);
    setDropInstructions(subscription.trustedDropInstructions ?? '');
    setDropToken('');
    setSheet('preferences');
  };

  return <SafeAreaView style={styles.screen}><View style={styles.header}><Pressable onPress={() => navigation.goBack()} style={styles.icon}><ArrowLeft size={22} color="#173D32" /></Pressable><View style={styles.flex}><Text style={styles.eyebrow}>SUBSCRIPTION</Text><Text style={styles.title}>{subscription.plan.name}</Text></View><Pressable style={styles.icon} onPress={openPreferences} accessibilityLabel="Edit subscription preferences"><Settings2 size={21} color="#173D32" /></Pressable></View><ScrollView contentContainerStyle={styles.content}>
    <View style={styles.hero}><View style={styles.heroTop}><View><Text style={styles.heroLabel}>PLAN PROGRESS</Text><Text style={styles.heroNumber}>{subscription.completedDeliveries} of {total}</Text><Text style={styles.heroSub}>deliveries completed</Text></View><View style={styles.ring}><Text style={styles.ringText}>{percent}%</Text></View></View><View style={styles.track}><View style={[styles.fill, { width: `${percent}%` }]} /></View><View style={styles.heroFacts}><Text style={styles.heroFact}>Funded left <Text style={styles.heroFactStrong}>{subscription.remainingFundedDeliveries}</Text></Text><Text style={styles.heroFact}>Skipped <Text style={styles.heroFactStrong}>{subscription.skippedDeliveries}</Text></Text></View></View>
    <View style={styles.nextCard}><View style={styles.nextIcon}><CalendarDays size={25} color="#FFFFFF" /></View><View style={styles.flex}><Text style={styles.nextLabel}>NEXT DELIVERY</Text><Text style={styles.nextDate}>{date(next?.serviceDate || subscription.nextDeliveryDate)}</Text><Text style={styles.nextMeta}>{next && next.cashDuePaise > 0 ? `Cash due ₹${(next.cashDuePaise / 100).toLocaleString('en-IN')}` : 'Subscription funded · Customer due ₹0'}</Text></View><Pressable style={styles.trackButton} onPress={() => tracking.mutate()}><Route size={18} color="#087B5B" /><Text style={styles.trackButtonText}>Track</Text></Pressable></View>
    <View style={styles.actions}><Pressable disabled={lifecycle.isPending || subscription.status === 'PAUSED' || !canChange} onPress={() => lifecycle.mutate('skip')} style={styles.action}><SkipForward size={20} color="#087B5B" /><Text style={styles.actionText}>Skip next</Text></Pressable>{subscription.status === 'PAUSED' ? <Pressable disabled={lifecycle.isPending || !canChange} onPress={() => lifecycle.mutate('resume')} style={styles.action}><Play size={20} color="#087B5B" /><Text style={styles.actionText}>Resume</Text></Pressable> : <Pressable disabled={lifecycle.isPending || !canChange} onPress={() => lifecycle.mutate('pause')} style={styles.action}><Pause size={20} color="#087B5B" /><Text style={styles.actionText}>Pause</Text></Pressable>}<Pressable onPress={() => setSheet('issue')} style={styles.action}><TriangleAlert size={20} color="#B96600" /><Text style={styles.actionText}>Report</Text></Pressable></View>
    <View style={styles.section}><View style={styles.sectionHead}><Text style={styles.sectionTitle}>Delivery preferences</Text>{canChange ? <Pressable onPress={openPreferences}><Text style={styles.link}>Edit</Text></Pressable> : null}</View><Info icon={<Clock3 size={18} color="#087B5B" />} label="Window" value={`${minuteTime(subscription.deliveryWindowStartMinute)} – ${minuteTime(subscription.deliveryWindowEndMinute)}`} /><Info icon={<MapPin size={18} color="#087B5B" />} label="Handover" value={subscription.deliveryMethod.replaceAll('_', ' ')} /><Info icon={<ReceiptIndianRupee size={18} color="#B96600" />} label="Funding" value={subscription.fundingCycle === 'WEEKLY' ? 'Cash every seven deliveries' : 'Full amount on first delivery'} /></View>
    <View style={styles.section}><View style={styles.sectionHead}><Text style={styles.sectionTitle}>Calendar & history</Text><Pressable onPress={() => setShowAll((value) => !value)}><Text style={styles.link}>{showAll ? 'Show less' : 'View all'}</Text></Pressable></View>{deliveriesQuery.isLoading ? <ActivityIndicator color="#087B5B" /> : visible.map((delivery) => <DeliveryRow key={delivery.id} delivery={delivery} />)}</View>
    {subscription.fundingAllocations?.length ? <View style={styles.section}><Text style={styles.sectionTitle}>Cash funding receipts</Text>{subscription.fundingAllocations.map((allocation) => <View key={allocation.id} style={styles.receipt}><ReceiptIndianRupee size={20} color="#087B5B" /><View style={styles.flex}><Text style={styles.deliveryDate}>₹{(allocation.amountPaise / 100).toLocaleString('en-IN')} funded</Text><Text style={styles.deliveryMeta}>Deliveries {allocation.startsAtSequence}–{allocation.endsAtSequence} · {date(allocation.createdAt)}</Text></View><Text style={styles.receiptStatus}>RECEIVED</Text></View>)}</View> : null}
    {canChange ? <Pressable onPress={() => setSheet('cancel')} style={styles.cancelButton}><Text style={styles.cancelText}>Cancel subscription</Text></Pressable> : null}
  </ScrollView>
  <ActionSheet visible={sheet === 'issue'} title="Report a delivery problem" onClose={() => setSheet(null)}>
    <Text style={styles.sheetCopy}>{reportableDelivery ? `Reporting day ${reportableDelivery.sequenceNumber} · ${date(reportableDelivery.serviceDate)}` : 'No delivery available'}</Text>
    <View style={styles.chips}>{issueTypes.map((type) => <Pressable key={type.value} onPress={() => setIssueType(type.value)} style={[styles.chip, issueType === type.value && styles.chipActive]}><Text style={[styles.chipText, issueType === type.value && styles.chipTextActive]}>{type.label}</Text></Pressable>)}</View>
    <TextInput value={issueDescription} onChangeText={setIssueDescription} placeholder="Describe what was missing or incorrect" multiline style={[styles.input, styles.multiline]} />
    <PrimaryButton label="Submit report" busy={issue.isPending} disabled={!reportableDelivery || issueDescription.trim().length < 5} onPress={() => issue.mutate()} />
  </ActionSheet>
  <ActionSheet visible={sheet === 'preferences'} title="Delivery preferences" onClose={() => setSheet(null)}>
    <View style={styles.methodList}>{availableMethods(subscription).map((method) => <Pressable key={method.value} onPress={() => setPreferenceMethod(method.value)} style={[styles.method, preferenceMethod === method.value && styles.methodActive]}><Text style={styles.methodTitle}>{method.label}</Text><Text style={styles.methodCopy}>{method.copy}</Text></Pressable>)}</View>
    {preferenceMethod === 'TRUSTED_DROP' ? <><TextInput value={dropToken} onChangeText={setDropToken} placeholder="Secure drop token (minimum 6 characters)" secureTextEntry style={styles.input} /><TextInput value={dropInstructions} onChangeText={setDropInstructions} placeholder="Milk box / doorstep instructions" multiline style={[styles.input, styles.multiline]} /></> : null}
    <PrimaryButton label="Save preferences" busy={preferences.isPending} disabled={preferenceMethod === 'TRUSTED_DROP' && dropToken.trim().length < 6} onPress={() => preferences.mutate()} />
  </ActionSheet>
  <ActionSheet visible={sheet === 'cancel'} title="Cancel subscription?" onClose={() => setSheet(null)}>
    <Text style={styles.sheetCopy}>Generated orders remain in the normal order workflow. Future ungenerated occurrences will be cancelled with an audit record.</Text>
    <TextInput value={cancelReason} onChangeText={setCancelReason} placeholder="Reason for cancellation" multiline style={[styles.input, styles.multiline]} />
    <PrimaryButton label="Confirm cancellation" danger busy={cancel.isPending} disabled={cancelReason.trim().length < 5} onPress={() => cancel.mutate()} />
  </ActionSheet>
  </SafeAreaView>;
};

const availableMethods = (subscription: CustomerSubscription): Array<{ value: SubscriptionDeliveryMethod; label: string; copy: string }> => [
  ...(subscription.plan.allowPersonalHandover ? [{ value: 'PERSONAL_HANDOVER' as const, label: 'Personal OTP', copy: 'Customer OTP and GPS proof' }] : []),
  ...(subscription.plan.allowTrustedDrop ? [{ value: 'TRUSTED_DROP' as const, label: 'Trusted doorstep', copy: 'Secure token and drop proof' }] : []),
  ...(subscription.plan.allowSecurityHandover ? [{ value: 'SECURITY_RECEPTION' as const, label: 'Security / reception', copy: 'Named reception handover proof' }] : []),
];
const Info = ({ icon, label, value }: { icon: ReactNode; label: string; value: string }) => <View style={styles.info}>{icon}<View style={styles.flex}><Text style={styles.infoLabel}>{label}</Text><Text style={styles.infoValue}>{value}</Text></View></View>;
const DeliveryRow = ({ delivery }: { delivery: SubscriptionDelivery }) => <View style={styles.deliveryRow}><View style={[styles.dot, delivery.status === 'DELIVERED' && styles.dotDone, delivery.status === 'SKIPPED' && styles.dotSkipped]}>{delivery.status === 'DELIVERED' ? <CheckCircle2 size={15} color="#FFFFFF" /> : null}</View><View style={styles.flex}><Text style={styles.deliveryDate}>{date(delivery.serviceDate)}</Text><Text style={styles.deliveryMeta}>Day {delivery.sequenceNumber} · {delivery.status.replaceAll('_', ' ')}</Text></View><Text style={[styles.cash, delivery.cashDuePaise > 0 && styles.cashDue]}>{delivery.cashDuePaise > 0 ? `₹${(delivery.cashDuePaise / 100).toLocaleString('en-IN')}` : '₹0'}</Text></View>;
const ActionSheet = ({ visible, title, onClose, children }: { visible: boolean; title: string; onClose: () => void; children: ReactNode }) => <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}><View style={styles.modalBackdrop}><Pressable style={styles.modalDismiss} onPress={onClose} /><View style={styles.sheet}><View style={styles.sheetHandle} /><View style={styles.sheetHeader}><Text style={styles.sheetTitle}>{title}</Text><Pressable onPress={onClose} style={styles.close}><X size={20} color="#25463B" /></Pressable></View><ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">{children}</ScrollView></View></View></Modal>;
const PrimaryButton = ({ label, onPress, disabled = false, busy = false, danger = false }: { label: string; onPress: () => void; disabled?: boolean; busy?: boolean; danger?: boolean }) => <Pressable onPress={onPress} disabled={disabled || busy} style={[styles.primaryButton, danger && styles.dangerButton, (disabled || busy) && styles.disabled]}>{busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.primaryButtonText}>{label}</Text>}</Pressable>;
const styles = StyleSheet.create({screen:{flex:1,backgroundColor:'#F4F8F6'},flex:{flex:1},center:{flex:1,alignItems:'center',justifyContent:'center'},header:{flexDirection:'row',alignItems:'center',gap:12,padding:16,backgroundColor:'#FFFFFF'},icon:{width:44,height:44,borderRadius:15,backgroundColor:'#EFF7F3',alignItems:'center',justifyContent:'center'},eyebrow:{fontSize:10,fontWeight:'900',letterSpacing:1.1,color:'#087B5B'},title:{fontSize:21,fontWeight:'900',color:'#173D32'},content:{padding:16,paddingBottom:42,gap:14},hero:{backgroundColor:'#087B5B',borderRadius:25,padding:18},heroTop:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},heroLabel:{color:'#BFEADA',fontSize:10,fontWeight:'900',letterSpacing:1.1},heroNumber:{color:'#FFFFFF',fontSize:34,fontWeight:'900',marginTop:4},heroSub:{color:'#D3F3E6'},ring:{width:72,height:72,borderRadius:36,borderWidth:8,borderColor:'#65C7A7',alignItems:'center',justifyContent:'center'},ringText:{color:'#FFFFFF',fontWeight:'900'},track:{height:8,borderRadius:99,backgroundColor:'rgba(255,255,255,.18)',overflow:'hidden',marginTop:16},fill:{height:'100%',backgroundColor:'#D4F7E9'},heroFacts:{flexDirection:'row',justifyContent:'space-between',marginTop:12},heroFact:{color:'#CDEEE1',fontSize:12},heroFactStrong:{color:'#FFFFFF',fontWeight:'900'},nextCard:{backgroundColor:'#FFFFFF',borderRadius:22,padding:15,flexDirection:'row',alignItems:'center',gap:12,borderWidth:1,borderColor:'#E0E9E4'},nextIcon:{width:48,height:48,borderRadius:16,backgroundColor:'#D66B00',alignItems:'center',justifyContent:'center'},nextLabel:{fontSize:9,fontWeight:'900',letterSpacing:1,color:'#92704D'},nextDate:{fontSize:18,fontWeight:'900',color:'#173D32',marginTop:2},nextMeta:{fontSize:11,color:'#65766F',marginTop:3},trackButton:{minHeight:44,paddingHorizontal:12,borderRadius:14,backgroundColor:'#E7F7EF',alignItems:'center',justifyContent:'center',gap:2},trackButtonText:{fontSize:10,fontWeight:'900',color:'#087B5B'},actions:{flexDirection:'row',gap:8},action:{flex:1,minHeight:70,borderRadius:18,backgroundColor:'#FFFFFF',alignItems:'center',justifyContent:'center',gap:6,borderWidth:1,borderColor:'#E1E9E5'},actionText:{fontSize:11,fontWeight:'900',color:'#29483D'},section:{backgroundColor:'#FFFFFF',borderRadius:22,padding:16,borderWidth:1,borderColor:'#E1E9E5'},sectionHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},sectionTitle:{fontSize:17,fontWeight:'900',color:'#183D32',marginBottom:13},link:{color:'#087B5B',fontWeight:'900'},info:{flexDirection:'row',gap:10,alignItems:'center',paddingVertical:9,borderTopWidth:1,borderTopColor:'#EFF3F1'},infoLabel:{fontSize:10,color:'#75857E'},infoValue:{fontSize:13,fontWeight:'800',color:'#29483D',marginTop:2,textTransform:'capitalize'},deliveryRow:{flexDirection:'row',alignItems:'center',gap:11,paddingVertical:11,borderTopWidth:1,borderTopColor:'#EFF3F1'},dot:{width:30,height:30,borderRadius:15,backgroundColor:'#DDE7E2',alignItems:'center',justifyContent:'center'},dotDone:{backgroundColor:'#0B8E66'},dotSkipped:{backgroundColor:'#D7A24F'},deliveryDate:{fontSize:13,fontWeight:'900',color:'#29483D'},deliveryMeta:{fontSize:10,color:'#718079',marginTop:2,textTransform:'capitalize'},cash:{fontWeight:'900',color:'#087B5B'},cashDue:{color:'#B85D00'},receipt:{flexDirection:'row',gap:10,alignItems:'center',paddingVertical:12,borderTopWidth:1,borderTopColor:'#EFF3F1'},receiptStatus:{fontSize:9,fontWeight:'900',color:'#087B5B',backgroundColor:'#E7F7EF',paddingHorizontal:8,paddingVertical:5,borderRadius:99},cancelButton:{minHeight:50,borderRadius:17,borderWidth:1,borderColor:'#E7B5B5',alignItems:'center',justifyContent:'center',backgroundColor:'#FFF8F8'},cancelText:{color:'#A33131',fontWeight:'900'},modalBackdrop:{flex:1,justifyContent:'flex-end',backgroundColor:'rgba(9,31,24,.45)'},modalDismiss:{flex:1},sheet:{maxHeight:'84%',backgroundColor:'#FFFFFF',borderTopLeftRadius:28,borderTopRightRadius:28,paddingTop:9},sheetHandle:{width:48,height:5,borderRadius:99,backgroundColor:'#D7E1DC',alignSelf:'center'},sheetHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',paddingHorizontal:18,paddingVertical:12},sheetTitle:{fontSize:20,fontWeight:'900',color:'#173D32'},close:{width:42,height:42,borderRadius:14,backgroundColor:'#EFF7F3',alignItems:'center',justifyContent:'center'},sheetContent:{paddingHorizontal:18,paddingBottom:34,gap:13},sheetCopy:{color:'#687A72',fontSize:12,lineHeight:18},chips:{flexDirection:'row',flexWrap:'wrap',gap:8},chip:{minHeight:40,paddingHorizontal:12,borderRadius:13,borderWidth:1,borderColor:'#DCE6E1',alignItems:'center',justifyContent:'center'},chipActive:{borderColor:'#087B5B',backgroundColor:'#EAF8F1'},chipText:{fontSize:11,fontWeight:'800',color:'#64766E'},chipTextActive:{color:'#087B5B'},input:{minHeight:50,borderWidth:1,borderColor:'#D9E4DE',borderRadius:15,paddingHorizontal:14,color:'#1F3F35',backgroundColor:'#FBFDFC'},multiline:{minHeight:92,textAlignVertical:'top',paddingTop:13},primaryButton:{minHeight:52,borderRadius:17,backgroundColor:'#087B5B',alignItems:'center',justifyContent:'center'},dangerButton:{backgroundColor:'#A73535'},disabled:{opacity:.45},primaryButtonText:{color:'#FFFFFF',fontSize:15,fontWeight:'900'},methodList:{gap:9},method:{padding:13,borderRadius:16,borderWidth:1,borderColor:'#DCE6E1'},methodActive:{borderColor:'#087B5B',backgroundColor:'#EEFAF4'},methodTitle:{fontWeight:'900',color:'#24483C'},methodCopy:{fontSize:11,color:'#6E7E77',marginTop:3}});
