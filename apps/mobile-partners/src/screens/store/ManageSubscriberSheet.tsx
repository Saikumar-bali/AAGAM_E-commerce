import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import Toast from 'react-native-toast-message';
import {
  Banknote,
  CalendarDays,
  CheckCircle2,
  Clock,
  IndianRupee,
  Moon,
  RotateCcw,
  Sun,
  Trash2,
  XCircle,
} from 'lucide-react-native';
import { useQuery } from '@tanstack/react-query';
import { subscriptionOperationsService } from '../../api/subscriptionOperationsService';
import { palette, radius, spacing } from '../../design/tokens';
import {
  Button,
  Chip,
  Field,
  InfoRow,
  OptionCard,
  SectionTitle,
  SegmentedTabs,
  Sheet,
  StatTile,
  TextField,
  money,
} from '../../components/StoreKit';

type Tab = 'Renew' | 'Slot' | 'Cashflow' | 'Edit' | 'History';
const TABS: Tab[] = ['Renew', 'Slot', 'Cashflow', 'Edit', 'History'];
const PROTEIN = ['Buffalo Milk (1L)', 'Cow Milk (1L)', 'Buffalo Milk (0.5L)', 'Cow Milk (0.5L)', 'Curd (500g)'];

// Local (not UTC) YYYY-MM-DD so a renewal started early morning IST does not
// default to yesterday.
function localIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function ManageSubscriberSheet({
  sub,
  plans,
  onClose,
  onChanged,
}: {
  sub: any | null;
  plans: any[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<Tab>('Renew');
  const [busy, setBusy] = useState(false);

  // Renew form
  const [renewalType, setRenewalType] = useState<'same' | 'switch' | 'split'>('same');
  const [newPlanId, setNewPlanId] = useState<string>('');
  const [frequency, setFrequency] = useState<'DAILY' | 'ALTERNATE_DAYS' | 'WEEKDAYS'>('DAILY');
  const [startDate, setStartDate] = useState(() => localIso(new Date()));
  const [totalDeliveries, setTotalDeliveries] = useState('30');
  const [vacation, setVacation] = useState(false);
  const [vacFrom, setVacFrom] = useState('');
  const [vacTo, setVacTo] = useState('');
  const [vacPolicy, setVacPolicy] = useState<'EXTEND_PLAN' | 'DEDUCT_BILL'>('EXTEND_PLAN');
  const [amProduct, setAmProduct] = useState(PROTEIN[0]);
  const [pmProduct, setPmProduct] = useState(PROTEIN[1]);
  const [payMode, setPayMode] = useState<'CASH' | 'PHONE_PE' | 'DUE'>('CASH');
  const [initialPaid, setInitialPaid] = useState('');
  const [note, setNote] = useState('');

  // Slot / edit / payment forms
  const [slot, setSlot] = useState<string>(String(sub?.slot || 'AM'));
  const [dueRupees, setDueRupees] = useState('');
  const [collectedRupees, setCollectedRupees] = useState('');
  const [editNote, setEditNote] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState<'CASH' | 'PHONE_PE'>('CASH');
  const [payNote, setPayNote] = useState('');
  const [cancelReason, setCancelReason] = useState('Customer requested cancellation / plan change');

  const history = useQuery({
    queryKey: ['store-subscriber-history', sub?.id],
    queryFn: () => subscriptionOperationsService.getSubscriberHistory(sub.id),
    enabled: !!sub && tab === 'History',
    retry: 1,
  });

  const applicablePlans = plans.length ? plans : [];

  const due = Number(sub?.amountDuePaise || 0);
  const collected = Number(sub?.amountCollectedPaise || 0);
  const funded = Number(sub?.fundedDeliveryCount || sub?.planVersion?.totalDeliveries || sub?.remainingFundedDeliveries || 0);
  const completed = Number(sub?.completedDeliveries || 0);

  const notify = (text1: string, type: 'success' | 'error' = 'success', text2?: string) => {
    Toast.show({ type, text1, text2 });
  };

  const run = async (fn: () => Promise<any>, okTitle: string) => {
    try {
      setBusy(true);
      await fn();
      notify(okTitle);
      onChanged();
      onClose();
    } catch (e: any) {
      notify('Could not save', 'error', e?.response?.data?.message || 'Please retry.');
    } finally {
      setBusy(false);
    }
  };

  const submitRenew = () => {
    if (renewalType === 'switch' && !newPlanId) return notify('Choose a plan', 'error');
    const body: any = {
      isSamePlan: renewalType === 'same',
      newPlanId: renewalType === 'switch' ? newPlanId : undefined,
      frequency,
      startDate,
      totalDeliveries: Number(totalDeliveries) || 30,
      deliverySlot: sub?.slot,
      paymentMode: payMode,
      initialCashCollectedPaise: payMode === 'DUE' ? 0 : Math.round(Number(initialPaid || 0) * 100),
      note: note || undefined,
    };
    if (renewalType === 'split') {
      body.splitItems = {
        amProductName: amProduct,
        amQuantity: '1',
        pmProductName: pmProduct,
        pmQuantity: '1',
      };
    }
    if (vacation && vacFrom && vacTo) {
      body.vacationRange = { fromDate: vacFrom, toDate: vacTo, policy: vacPolicy };
    }
    void run(
      () => subscriptionOperationsService.renewSubscription(sub.id, body),
      renewalType === 'switch' ? 'Plan switched' : renewalType === 'split' ? 'Split plan renewed' : 'Subscription renewed',
    );
  };

  const submitSlot = () =>
    void run(() => subscriptionOperationsService.updateSubscription(sub.id, { deliverySlot: slot as any, note: 'Slot changed from store app' }), 'Delivery slot updated');

  const submitEdit = () =>
    void run(
      () =>
        subscriptionOperationsService.updateSubscription(sub.id, {
          amountDuePaise: dueRupees !== '' ? Math.round(Number(dueRupees) * 100) : undefined,
          amountCollectedPaise: collectedRupees !== '' ? Math.round(Number(collectedRupees) * 100) : undefined,
          note: editNote || 'Balances edited from store app',
        }),
      'Balances updated',
    );

  const submitPayment = () => {
    const rupees = Number(payAmount);
    if (!rupees || rupees <= 0) return notify('Enter an amount', 'error');
    void run(
      () => subscriptionOperationsService.recordSubscriberPayment(sub.id, { amountPaise: Math.round(rupees * 100), paymentMode: payMethod, note: payNote || undefined }),
      'Payment recorded',
    );
  };

  const submitCancel = () =>
    Alert.alert(
      'Cancel subscription?',
      'Stops all remaining future deliveries. The customer record is kept.',
      [
        { text: 'Back', style: 'cancel' },
        { text: 'Cancel subscription', style: 'destructive', onPress: () => void run(() => subscriptionOperationsService.cancelSubscription(sub.id, cancelReason), 'Subscription cancelled') },
      ],
    );

  const historyTiles = useMemo(() => {
    const d = history.data || {};
    return {
      delivered: d.completedDeliveries ?? d.summary?.deliveredDays ?? completed,
      total: d.fundedDeliveryCount ?? d.totalDeliveries ?? d.summary?.totalDays ?? funded,
      collected: d.amountCollectedPaise ?? collected,
      due: d.amountDuePaise ?? due,
    };
  }, [history.data, completed, funded, collected, due]);

  return (
    <Sheet
      visible={!!sub}
      onClose={onClose}
      title={sub?.customer?.name || 'Subscriber'}
      subtitle={`${sub?.plan?.name || 'Subscription'} · ${String(sub?.status || '').replaceAll('_', ' ')}`}
    >
      {sub ? (
        <>
          <View style={styles.profile}>
            <StatTile label="Delivered" value={`${completed}/${funded || '—'}`} />
            <View style={styles.div} />
            <StatTile label="Collected" value={money(collected)} />
            <View style={styles.div} />
            <StatTile label="Due" value={money(due)} tone={due > 0 ? palette.rose700 : undefined} />
          </View>

          <SegmentedTabs options={TABS} value={tab} onChange={(v) => setTab(v as Tab)} />

          {tab === 'Renew' ? (
            <View style={styles.body}>
              <SectionTitle>Renewal option</SectionTitle>
              <OptionCard title="Same plan" subtitle="Continue the current plan" selected={renewalType === 'same'} onPress={() => setRenewalType('same')} icon={RotateCcw} />
              <OptionCard title="Switch plan" subtitle="Change product or size" selected={renewalType === 'switch'} onPress={() => setRenewalType('switch')} icon={CalendarDays} />
              <OptionCard title="Split AM / PM" subtitle="Cow + Buffalo milk" selected={renewalType === 'split'} onPress={() => setRenewalType('split')} icon={Moon} />

              {renewalType === 'switch' ? (
                <Field label="Choose new plan">
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
                    {applicablePlans.map((p) => (
                      <Chip key={p.id} active={newPlanId === p.id} label={`${p.name} · ${money(p.pricePaise)}`} onPress={() => setNewPlanId(p.id)} />
                    ))}
                    {!applicablePlans.length ? <Text style={styles.hint}>No plans assigned to your store yet.</Text> : null}
                  </ScrollView>
                </Field>
              ) : null}

              {renewalType === 'split' ? (
                <>
                  <Field label="Morning product (AM)">
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
                      {PROTEIN.map((p) => <Chip key={p} active={amProduct === p} label={p} onPress={() => setAmProduct(p)} />)}
                    </ScrollView>
                  </Field>
                  <Field label="Evening product (PM)">
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipScroll}>
                      {PROTEIN.map((p) => <Chip key={p} active={pmProduct === p} label={p} onPress={() => setPmProduct(p)} />)}
                    </ScrollView>
                  </Field>
                </>
              ) : null}

              <SectionTitle>Delivery frequency</SectionTitle>
              <View style={styles.chipScrollRow}>
                <Chip active={frequency === 'DAILY'} label="Daily (7 days)" onPress={() => setFrequency('DAILY')} />
                <Chip active={frequency === 'ALTERNATE_DAYS'} label="Alternate days" onPress={() => setFrequency('ALTERNATE_DAYS')} />
                <Chip active={frequency === 'WEEKDAYS'} label="Weekdays (Mon–Fri)" onPress={() => setFrequency('WEEKDAYS')} />
              </View>

              <Field label="Cycle start date">
                <TextField value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" autoCapitalize="none" />
              </Field>
              <Field label="Total deliveries">
                <TextField value={totalDeliveries} onChangeText={setTotalDeliveries} keyboardType="number-pad" placeholder="30" />
              </Field>

              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Planned vacation / advance pause</Text>
                <Chip active={vacation} label={vacation ? 'On' : 'Off'} onPress={() => setVacation(!vacation)} />
              </View>
              {vacation ? (
                <>
                  <Field label="Vacation from"><TextField value={vacFrom} onChangeText={setVacFrom} placeholder="YYYY-MM-DD" autoCapitalize="none" /></Field>
                  <Field label="Vacation to"><TextField value={vacTo} onChangeText={setVacTo} placeholder="YYYY-MM-DD" autoCapitalize="none" /></Field>
                  <View style={styles.chipScrollRow}>
                    <Chip active={vacPolicy === 'EXTEND_PLAN'} label="Extend plan" onPress={() => setVacPolicy('EXTEND_PLAN')} />
                    <Chip active={vacPolicy === 'DEDUCT_BILL'} label="Deduct bill" onPress={() => setVacPolicy('DEDUCT_BILL')} />
                  </View>
                </>
              ) : null}

              <SectionTitle>Cash flow</SectionTitle>
              <View style={styles.chipScrollRow}>
                <Chip active={payMode === 'CASH'} label="Cash" onPress={() => setPayMode('CASH')} />
                <Chip active={payMode === 'PHONE_PE'} label="PhonePe / UPI" onPress={() => setPayMode('PHONE_PE')} />
                <Chip active={payMode === 'DUE'} label="Post-paid" onPress={() => setPayMode('DUE')} />
              </View>
              {payMode !== 'DUE' ? (
                <Field label="Initial payment collected now (₹)">
                  <TextField value={initialPaid} onChangeText={setInitialPaid} keyboardType="decimal-pad" placeholder="0" />
                </Field>
              ) : null}
              <Field label="Renewal note">
                <TextField value={note} onChangeText={setNote} placeholder="e.g. Renewed for this month" />
              </Field>

              <Button
                label={renewalType === 'switch' ? 'Confirm plan change' : renewalType === 'split' ? 'Confirm split renewal' : 'Confirm renewal'}
                icon={CheckCircle2}
                onPress={submitRenew}
                loading={busy}
              />
            </View>
          ) : null}

          {tab === 'Slot' ? (
            <View style={styles.body}>
              <Text style={styles.hint}>Applies to all remaining deliveries of this plan. Delivered history is never changed.</Text>
              <View style={styles.slotRow}>
                <OptionCard title="Morning (AM)" subtitle="06:00 – 09:00" selected={slot === 'AM'} onPress={() => setSlot('AM')} icon={Sun} />
                <OptionCard title="Evening (PM)" subtitle="17:00 – 20:00" selected={slot === 'PM'} onPress={() => setSlot('PM')} icon={Moon} />
                <OptionCard title="Both (AM + PM)" subtitle="Two deliveries per day" selected={slot === 'AM+PM'} onPress={() => setSlot('AM+PM')} icon={Clock} />
              </View>
              <Button label="Apply to remaining deliveries" icon={CheckCircle2} onPress={submitSlot} loading={busy} />
            </View>
          ) : null}

          {tab === 'Cashflow' ? (
            <View style={styles.body}>
              <View style={styles.ledger}>
                <InfoRow label="Total collected" value={money(collected)} />
                <InfoRow label="Balance due" value={money(due)} danger={due > 0} />
              </View>
              <SectionTitle>Record customer payment</SectionTitle>
              <View style={styles.chipScrollRow}>
                {[8000, 16000, 50000, 100000].map((p) => (
                  <Chip key={p} label={money(p)} active={false} onPress={() => setPayAmount(String(p / 100))} />
                ))}
              </View>
              <Field label="Amount (₹)">
                <TextField value={payAmount} onChangeText={setPayAmount} keyboardType="decimal-pad" placeholder={due > 0 ? String(due / 100) : '0'} />
              </Field>
              <View style={styles.chipScrollRow}>
                <Chip active={payMethod === 'CASH'} label="Cash" onPress={() => setPayMethod('CASH')} />
                <Chip active={payMethod === 'PHONE_PE'} label="PhonePe / UPI" onPress={() => setPayMethod('PHONE_PE')} />
              </View>
              <Field label="Reference / note">
                <TextField value={payNote} onChangeText={setPayNote} placeholder="e.g. UPI Ref #8932" />
              </Field>
              <Button label="Record payment now" icon={Banknote} onPress={submitPayment} loading={busy} />
            </View>
          ) : null}

          {tab === 'Edit' ? (
            <View style={styles.body}>
              <Field label="Amount due (₹)">
                <TextField value={dueRupees} onChangeText={setDueRupees} keyboardType="decimal-pad" placeholder={String(due / 100)} />
              </Field>
              <Field label="Amount collected (₹)">
                <TextField value={collectedRupees} onChangeText={setCollectedRupees} keyboardType="decimal-pad" placeholder={String(collected / 100)} />
              </Field>
              <Field label="Note">
                <TextField value={editNote} onChangeText={setEditNote} placeholder="Optional note" multiline />
              </Field>
              <Button label="Save balances" icon={CheckCircle2} onPress={submitEdit} loading={busy} />
            </View>
          ) : null}

          {tab === 'History' ? (
            <View style={styles.body}>
              {history.isLoading ? (
                <ActivityIndicator color={palette.teal700} />
              ) : (
                <>
                  <View style={styles.profile}>
                    <StatTile label="Progress" value={`${historyTiles.delivered}/${historyTiles.total || '—'}`} />
                    <View style={styles.div} />
                    <StatTile label="Collected" value={money(historyTiles.collected)} />
                    <View style={styles.div} />
                    <StatTile label="Due" value={money(historyTiles.due)} tone={Number(historyTiles.due) > 0 ? palette.rose700 : undefined} />
                  </View>
                  <Text style={styles.hint}>Delivery tracker and money history are available for this subscriber.</Text>
                </>
              )}
            </View>
          ) : null}

          <View style={styles.dangerZone}>
            <Text style={styles.dangerTitle}>Cancel subscription</Text>
            <Text style={styles.hint}>Stops all remaining future deliveries. The customer record is kept.</Text>
            <TextField value={cancelReason} onChangeText={setCancelReason} placeholder="Reason for cancellation" />
            <Button label="Cancel subscription" icon={XCircle} tone="danger" onPress={submitCancel} loading={busy} />
          </View>
        </>
      ) : null}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: 'row', backgroundColor: palette.teal050, borderRadius: radius.md, paddingVertical: spacing.md },
  div: { width: 1, backgroundColor: palette.teal100, marginVertical: spacing.xs },
  body: { gap: spacing.md, paddingTop: spacing.sm },
  chipScroll: { gap: spacing.sm, paddingVertical: spacing.xs, alignItems: 'center' },
  chipScrollRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  hint: { color: palette.slate500, fontSize: 11.5, lineHeight: 16 },
  slotRow: { gap: spacing.sm },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleLabel: { color: palette.slate700, fontSize: 13, fontWeight: '600' },
  ledger: { backgroundColor: palette.slate050, borderRadius: radius.md, paddingHorizontal: spacing.md },
  dangerZone: { marginTop: spacing.lg, padding: spacing.md, borderRadius: radius.md, backgroundColor: palette.rose050, borderWidth: 1, borderColor: palette.rose100, gap: spacing.sm },
  dangerTitle: { color: palette.rose700, fontSize: 14, fontWeight: '700' },
});
