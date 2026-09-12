'use client';

import { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import { apiClient } from '@aagam/utils';
import DashboardLayout from '@/components/DashboardLayout';
import { getToastErrorMessage, useToast } from '@/components/ToastProvider';
import OfflineCustomerTracker from '@/components/offline-customers/OfflineCustomerTracker';
import {
  Archive,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Edit3,
  Loader2,
  Pause,
  Play,
  Plus,
  RefreshCw,
  Route,
  Save,
  ShieldAlert,
  Truck,
  Users,
  X,
} from 'lucide-react';
import { formatDate, formatPaise } from './SubscriptionPlanCard';

type Tab = 'plans' | 'subscribers' | 'calendar' | 'runs' | 'cash' | 'exceptions' | 'analytics';

type PlanForm = {
  name: string;
  description: string;
  imageUrl: string;
  mobileImageUrl: string;
  fundingCycle: string;
  durationDays: string;
  totalDeliveries: string;
  deliveryFrequency: string;
  selectedWeekdays: number[];
  priceRupees: string;
  mrpRupees: string;
  deliveryStartTime: string;
  deliveryEndTime: string;
  allowPause: boolean;
  allowSkip: boolean;
  allowTrustedDrop: boolean;
  allowPersonalHandover: boolean;
  allowSecurityHandover: boolean;
  items: Array<{ productId: string; quantityPerDelivery: string }>;
  storeIds: string[];
  zoneIds: string[];
};

type AggregateRow = {
  status?: string;
  _count?: { _all?: number };
  _sum?: Record<string, number | null | undefined>;
};

const DEFAULT_PROOF_POLICY = {
  trustedDrop: [
    'ASSIGNED_RIDER',
    'SIGNED_QR_CHALLENGE',
    'ARRIVAL_GEOFENCE',
    'COMPLETION_GEOFENCE',
    'PHOTO_EVIDENCE',
    'QUANTITY',
    'TIMESTAMP',
  ],
  personalHandover: ['OTP', 'GPS'],
  securityReception: ['OTP', 'GPS', 'RECIPIENT_NOTE'],
};

const frequencyOptions = [
  ['DAILY', 'Daily'],
  ['ALTERNATE_DAYS', 'Every other day'],
  ['WEEKDAYS', 'Weekdays'],
  ['SELECTED_WEEKDAYS', 'Selected weekdays'],
  ['WEEKLY', 'Weekly'],
  ['CUSTOM', 'Custom schedule'],
] as const;

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const tabs: Array<[Tab, string, any]> = [
  ['subscribers', 'Subscribers', Users],
  ['plans', 'Plans', CalendarDays],
  ['calendar', 'Calendar', CalendarDays],
  ['runs', 'Delivery runs', Route],
  ['cash', 'Cash control', CircleDollarSign],
  ['exceptions', 'Exceptions', ShieldAlert],
  ['analytics', 'Analytics', BarChart3],
];

const emptyForm = (): PlanForm => ({
  name: '',
  description: '',
  imageUrl: '',
  mobileImageUrl: '',
  fundingCycle: 'FULL_PLAN',
  durationDays: '30',
  totalDeliveries: '30',
  deliveryFrequency: 'DAILY',
  selectedWeekdays: [],
  priceRupees: '',
  mrpRupees: '',
  deliveryStartTime: '06:00',
  deliveryEndTime: '09:00',
  allowPause: true,
  allowSkip: true,
  allowTrustedDrop: true,
  allowPersonalHandover: true,
  allowSecurityHandover: true,
  items: [{ productId: '', quantityPerDelivery: '1' }],
  storeIds: [],
  zoneIds: [],
});

const paiseToRupeesInput = (value: unknown) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return '';
  return (amount / 100).toFixed(2).replace(/\.00$/, '');
};

const rupeesToPaise = (value: string) => Math.round(Number(value || 0) * 100);

const minutesToTime = (value: unknown) => {
  const total = Number(value);
  if (!Number.isFinite(total)) return '06:00';
  const hours = Math.floor(total / 60) % 24;
  const minutes = total % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const timeToMinutes = (value: string) => {
  const [hours, minutes] = value.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
};

const generatedPlanCode = (name: string) => {
  const slug = name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 34) || 'PLAN';
  return `SUB-${slug}-${Date.now().toString(36).toUpperCase()}`.slice(0, 60);
};

const humanize = (value: unknown) => String(value || 'Unknown')
  .replaceAll('_', ' ')
  .toLowerCase()
  .replace(/\b\w/g, (letter) => letter.toUpperCase());

const fundingLabel = (value: string) => (value === 'WEEKLY' ? 'Weekly funding' : 'Full-plan funding');

const aggregateRows = (value: unknown): AggregateRow[] => Array.isArray(value) ? value as AggregateRow[] : [];
const aggregateCount = (rows: AggregateRow[]) => rows.reduce((total, row) => total + Number(row._count?._all || 0), 0);
const aggregateMoney = (rows: AggregateRow[], field: string) => rows.reduce((total, row) => total + Number(row._sum?.[field] || 0), 0);
const aggregateStatusCount = (rows: AggregateRow[], statuses: string[]) => rows
  .filter((row) => statuses.includes(String(row.status)))
  .reduce((total, row) => total + Number(row._count?._all || 0), 0);

export default function AdminSubscriptionsPage() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('subscribers');
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<any[]>([]);
  const [subscribers, setSubscribers] = useState<any[]>([]);
  const [calendar, setCalendar] = useState<any[]>([]);
  const [runs, setRuns] = useState<any[]>([]);
  const [cash, setCash] = useState<any[]>([]);
  const [exceptions, setExceptions] = useState<any>({ deliveries: [], issues: [] });
  const [analytics, setAnalytics] = useState<any>({});
  const [products, setProducts] = useState<any[]>([]);
  const [stores, setStores] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<any>();
  const [form, setForm] = useState<PlanForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const [manualMode, setManualMode] = useState<'plan' | 'custom'>('plan');
  const [manualForm, setManualForm] = useState({
    storeId: '',
    planId: '',
    customerName: '',
    customerPhone: '',
    line1: '',
    line2: '',
    city: 'Anakapalle',
    state: 'Andhra Pradesh',
    pincode: '',
    latitude: 0,
    longitude: 0,
    startDate: new Date().toISOString().slice(0, 10),
    totalDeliveries: '30',
    deliverySlot: 'MORNING' as 'MORNING' | 'EVENING' | 'BOTH',
    initialCashRupees: '0',
    note: '',
    storeDelivery: true,
  });

  const [customDeliveries, setCustomDeliveries] = useState<Array<{
    date: string;
    slot: 'AM' | 'PM' | 'BOTH';
    items: Array<{ productId: string; quantity: number; pricePaise: number }>;
  }>>([]);
  const [customTotalPrice, setCustomTotalPrice] = useState('');

  const [offlineCustomers, setOfflineCustomers] = useState<any[]>([]);
  const [offlineCustomersLoading, setOfflineCustomersLoading] = useState(false);
  const [offlineCustomerSearch, setOfflineCustomerSearch] = useState('');
  const [selectedOfflineCustomer, setSelectedOfflineCustomer] = useState<any>(null);
  const [manualErrors, setManualErrors] = useState<Record<string, boolean>>({});

  const [editManualModalOpen, setEditManualModalOpen] = useState(false);
  const [editingSubscriber, setEditingSubscriber] = useState<any>(null);
  const [editSubscriberForm, setEditSubscriberForm] = useState({
    startDate: '',
    totalDeliveries: '30',
    deliverySlot: 'MORNING' as 'MORNING' | 'EVENING' | 'BOTH',
    amountDueRupees: '0',
    amountCollectedRupees: '0',
    note: '',
  });

  const submitManualSubscription = async () => {
    const errors: Record<string, boolean> = {};
    if (!manualForm.storeId) errors.storeId = true;
    if (!manualForm.customerName.trim()) errors.customerName = true;
    const phoneDigits = manualForm.customerPhone.trim().replace(/[\s().-]/g, '');
    if (!/^\d{10}$/.test(phoneDigits) && !/^0\d{10}$/.test(phoneDigits)) errors.customerPhone = true;
    if (!manualForm.line1.trim()) errors.line1 = true;
    if (!manualForm.city.trim()) errors.city = true;
    if (!/^\d{6}$/.test(manualForm.pincode.trim())) errors.pincode = true;
    if (manualMode === 'plan' && !manualForm.planId) errors.planId = true;
    if (manualMode === 'custom' && customDeliveries.length === 0) errors.customDeliveries = true;
    if (manualMode === 'custom' && Math.round(Number(customTotalPrice || 0) * 100) < 1) errors.customTotalPrice = true;

    setManualErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast.warning('Please fill all required fields highlighted in red.');
      return;
    }

    setSavingManual(true);
    try {
      // Reuse the picked offline customer's record when the address was not
      // edited; only create/re-resolve via manual-customer for new customers
      // or changed addresses (that endpoint reuses the user by phone).
      const existingAddress = selectedOfflineCustomer?.addresses?.[0];
      const normalizedPhone = phoneDigits.replace(/^0/, '');
      const detailsUnchanged = Boolean(
        selectedOfflineCustomer &&
        existingAddress &&
        manualForm.customerName.trim() === (selectedOfflineCustomer.name || '') &&
        normalizedPhone === (selectedOfflineCustomer.phone || '').replace(/[\s().-]/g, '').replace(/^0/, '') &&
        manualForm.line1.trim() === (existingAddress.line1 || '') &&
        manualForm.line2.trim() === (existingAddress.line2 || '') &&
        manualForm.city.trim() === (existingAddress.city || '') &&
        manualForm.state.trim() === (existingAddress.state || '') &&
        manualForm.pincode.trim() === (existingAddress.pincode || ''),
      );

      let customerId: string;
      let addressId: string;
      if (detailsUnchanged && existingAddress) {
        customerId = selectedOfflineCustomer.id;
        addressId = existingAddress.id;
      } else {
        const custRes = await apiClient.post('/admin/subscriptions/manual-customer', {
          name: manualForm.customerName.trim(),
          phone: normalizedPhone,
          line1: manualForm.line1.trim(),
          line2: manualForm.line2.trim() || undefined,
          city: manualForm.city.trim(),
          state: manualForm.state.trim(),
          pincode: manualForm.pincode.trim(),
          latitude: manualForm.latitude || undefined,
          longitude: manualForm.longitude || undefined,
        });
        customerId = custRes.data.customer.id;
        addressId = custRes.data.address.id;
      }

      if (manualMode === 'custom') {
        await apiClient.post('/admin/subscriptions/custom-subscribe', {
          storeId: manualForm.storeId,
          customerId,
          addressId,
          totalPricePaise: Math.round(Number(customTotalPrice || 0) * 100),
          initialCashCollectedPaise: Math.round(Number(manualForm.initialCashRupees || 0) * 100),
          storeDelivery: manualForm.storeDelivery,
          note: manualForm.note.trim() || undefined,
          deliveries: customDeliveries.map((d) => ({
            date: d.date,
            slot: d.slot,
            items: d.items,
          })),
        });
      } else {
        await apiClient.post('/admin/subscriptions/manual-subscribe', {
          storeId: manualForm.storeId,
          planId: manualForm.planId,
          customerId,
          addressId,
          startDate: manualForm.startDate,
          totalDeliveries: Number(manualForm.totalDeliveries || 30),
          deliverySlot: manualForm.deliverySlot,
          initialCashCollectedPaise: Math.round(Number(manualForm.initialCashRupees || 0) * 100),
          storeDelivery: manualForm.storeDelivery,
          note: manualForm.note.trim() || undefined,
        });
      }

      toast.success('Subscription created successfully for offline customer!');
      setManualModalOpen(false);
      setCustomDeliveries([]);
      setCustomTotalPrice('');
      await load();
    } catch (error) {
      toast.error(getToastErrorMessage(error, 'Subscription creation failed.'));
    } finally {
      setSavingManual(false);
    }
  };

  const openSubscriberEdit = (sub: any) => {
    setEditingSubscriber(sub);
    setEditSubscriberForm({
      startDate: sub.startDate ? new Date(sub.startDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
      totalDeliveries: String(sub.fundedDeliveryCount || 30),
      deliverySlot: sub.deliveryWindowStartMinute >= 17 * 60 ? 'EVENING' : 'MORNING',
      amountDueRupees: paiseToRupeesInput(sub.amountDuePaise),
      amountCollectedRupees: paiseToRupeesInput(sub.amountCollectedPaise),
      note: '',
    });
    setEditManualModalOpen(true);
  };

  const saveSubscriberEdit = async () => {
    if (!editingSubscriber) return;
    setSavingManual(true);
    try {
      await apiClient.patch(`/admin/subscriptions/subscribers/${editingSubscriber.id}/manual-edit`, {
        startDate: editSubscriberForm.startDate,
        totalDeliveries: Number(editSubscriberForm.totalDeliveries || 30),
        deliverySlot: editSubscriberForm.deliverySlot,
        amountDuePaise: Math.round(Number(editSubscriberForm.amountDueRupees || 0) * 100),
        amountCollectedPaise: Math.round(Number(editSubscriberForm.amountCollectedRupees || 0) * 100),
        note: editSubscriberForm.note.trim() || undefined,
      });
      toast.success('Subscriber updated successfully.');
      setEditManualModalOpen(false);
      await load();
    } catch (error) {
      toast.error(getToastErrorMessage(error, 'Subscriber update failed.'));
    } finally {
      setSavingManual(false);
    }
  };

  const load = async () => {
    setLoading(true);
    try {
      const [p, s, c, r, cc, e, a, productsResponse, storesResponse, zonesResponse] = await Promise.all([
        apiClient.get('/admin/subscriptions/plans'),
        apiClient.get('/admin/subscriptions/subscribers'),
        apiClient.get('/admin/subscriptions/delivery-calendar'),
        apiClient.get('/admin/subscriptions/runs'),
        apiClient.get('/admin/subscriptions/cash-control'),
        apiClient.get('/admin/subscriptions/exceptions'),
        apiClient.get('/admin/subscriptions/analytics'),
        apiClient.get('/admin/products'),
        apiClient.get('/stores'),
        apiClient.get('/stores/delivery-zones/admin'),
      ]);
      setPlans(Array.isArray(p.data) ? p.data : []);
      setSubscribers(Array.isArray(s.data) ? s.data : []);
      setCalendar(Array.isArray(c.data) ? c.data : []);
      setRuns(Array.isArray(r.data) ? r.data : []);
      setCash(Array.isArray(cc.data) ? cc.data : []);
      setExceptions(e.data || { deliveries: [], issues: [] });
      setAnalytics(a.data || {});
      setProducts(Array.isArray(productsResponse.data) ? productsResponse.data : productsResponse.data?.items || []);
      setStores(Array.isArray(storesResponse.data) ? storesResponse.data : storesResponse.data?.items || []);
      setZones(Array.isArray(zonesResponse.data) ? zonesResponse.data : zonesResponse.data?.items || []);
    } catch (error) {
      toast.error(getToastErrorMessage(error, 'Subscription operations could not be loaded.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Lazy-load the offline customer directory when the manual subscription
  // modal opens, so existing customers can be picked from a dropdown instead
  // of retyping their details every time.
  useEffect(() => {
    if (!manualModalOpen) return;
    let active = true;
    setOfflineCustomersLoading(true);
    apiClient
      .get('/admin/subscriptions/offline-customers', {
        params: {
          page: 1,
          pageSize: 200,
          ...(offlineCustomerSearch.trim() ? { search: offlineCustomerSearch.trim() } : {}),
        },
      })
      .then((res) => {
        if (active) setOfflineCustomers(res.data?.customers || []);
      })
      .catch(() => {
        if (active) setOfflineCustomers([]);
      })
      .finally(() => {
        if (active) setOfflineCustomersLoading(false);
      });
    return () => {
      active = false;
    };
  }, [manualModalOpen, offlineCustomerSearch]);

  const selectOfflineCustomer = (customerId: string) => {
    const customer = offlineCustomers.find((entry) => entry.id === customerId) || null;
    setSelectedOfflineCustomer(customer);
    if (!customer) {
      setManualForm((current) => ({
        ...current,
        customerName: '',
        customerPhone: '',
        line1: '',
        line2: '',
        city: 'Anakapalle',
        state: 'Andhra Pradesh',
        pincode: '',
        latitude: 0,
        longitude: 0,
      }));
      return;
    }
    const address = customer.addresses?.[0];
    const lastSubscription = customer.customerSubscriptions?.[0];
    const preferredStoreId =
      lastSubscription?.homeStore?.id && stores.some((s) => s.id === lastSubscription.homeStore.id)
        ? lastSubscription.homeStore.id
        : null;
    const normalizedCustomerPhone = (customer.phone || '').replace(/[\s().-]/g, '').replace(/^0/, '');
    setManualForm((current) => ({
      ...current,
      storeId: preferredStoreId || current.storeId,
      customerName: customer.name || '',
      customerPhone: customer.phone || '',
      line1: address?.line1 || '',
      line2: address?.line2 || '',
      city: address?.city || 'Anakapalle',
      state: address?.state || 'Andhra Pradesh',
      pincode: address?.pincode || '',
      latitude: address?.latitude || 0,
      longitude: address?.longitude || 0,
    }));
  };

  const openCreate = () => {
    setEditing(undefined);
    setForm(emptyForm());
    setFormOpen(true);
  };

  const openEdit = (plan: any) => {
    setEditing(plan);
    setForm({
      ...emptyForm(),
      name: plan.name || '',
      description: plan.description || '',
      imageUrl: plan.imageUrl || '',
      mobileImageUrl: plan.mobileImageUrl || '',
      fundingCycle: plan.fundingCycle || 'FULL_PLAN',
      durationDays: String(plan.durationDays ?? 30),
      totalDeliveries: String(plan.totalDeliveries ?? 30),
      deliveryFrequency: plan.deliveryFrequency || 'DAILY',
      selectedWeekdays: plan.selectedWeekdays || [],
      priceRupees: paiseToRupeesInput(plan.pricePaise),
      mrpRupees: paiseToRupeesInput(plan.mrpPaise),
      deliveryStartTime: minutesToTime(plan.defaultWindowStartMinute),
      deliveryEndTime: minutesToTime(plan.defaultWindowEndMinute),
      allowPause: plan.allowPause ?? true,
      allowSkip: plan.allowSkip ?? true,
      allowTrustedDrop: plan.allowTrustedDrop ?? true,
      allowPersonalHandover: plan.allowPersonalHandover ?? true,
      allowSecurityHandover: plan.allowSecurityHandover ?? true,
      items: (plan.items || []).length
        ? plan.items.map((item: any) => ({ productId: item.productId, quantityPerDelivery: String(item.quantityPerDelivery) }))
        : [{ productId: '', quantityPerDelivery: '1' }],
      storeIds: (plan.stores || []).map((item: any) => item.storeId),
      zoneIds: (plan.zones || []).map((item: any) => item.zoneId),
    });
    setFormOpen(true);
  };

  const payload = () => ({
    code: editing?.code || generatedPlanCode(form.name),
    internalName: editing?.internalName || form.name.trim(),
    name: form.name.trim(),
    description: form.description.trim() || undefined,
    imageUrl: form.imageUrl || undefined,
    mobileImageUrl: form.mobileImageUrl || form.imageUrl || undefined,
    fundingCycle: form.fundingCycle,
    durationDays: Number(form.durationDays),
    totalDeliveries: Number(form.totalDeliveries),
    deliveryFrequency: form.deliveryFrequency,
    selectedWeekdays: form.selectedWeekdays,
    customSchedule: editing?.customSchedule || undefined,
    pricePaise: rupeesToPaise(form.priceRupees),
    mrpPaise: rupeesToPaise(form.mrpRupees || form.priceRupees),
    currency: 'INR',
    defaultWindowStartMinute: timeToMinutes(form.deliveryStartTime),
    defaultWindowEndMinute: timeToMinutes(form.deliveryEndTime),
    orderGenerationHoursBefore: editing?.orderGenerationHoursBefore ?? 18,
    skipCutoffHours: editing?.skipCutoffHours ?? 12,
    allowPause: form.allowPause,
    allowSkip: form.allowSkip,
    maximumSkips: editing?.maximumSkips ?? 3,
    allowTrustedDrop: form.allowTrustedDrop,
    allowPersonalHandover: form.allowPersonalHandover,
    allowSecurityHandover: form.allowSecurityHandover,
    proofPolicy: editing?.proofPolicy || DEFAULT_PROOF_POLICY,
    isAutoRenewEnabled: editing?.isAutoRenewEnabled ?? false,
    startsAt: editing?.startsAt || undefined,
    endsAt: editing?.endsAt || undefined,
    sortOrder: editing?.sortOrder ?? 0,
    items: form.items
      .filter((item) => item.productId)
      .map((item) => ({ productId: item.productId, quantityPerDelivery: Number(item.quantityPerDelivery), substituteRules: { mode: 'MANUAL_APPROVAL' } })),
    storeIds: form.storeIds,
    zoneIds: form.zoneIds,
  });

  const uploadPlanImage = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      toast.error('Plan images must be JPEG, PNG, WebP, or GIF under 5MB.');
      event.target.value = '';
      return;
    }
    setUploadingImage(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const response = await apiClient.post('/upload/image', body);
      setForm((current) => ({ ...current, imageUrl: response.data.publicUrl, mobileImageUrl: current.mobileImageUrl || response.data.publicUrl }));
      toast.success('Plan image uploaded. It will also be used on mobile.');
    } catch (error) {
      toast.error(getToastErrorMessage(error, 'Plan image upload failed.'));
    } finally {
      setUploadingImage(false);
      event.target.value = '';
    }
  };

  const save = async () => {
    const pricePaise = rupeesToPaise(form.priceRupees);
    const mrpPaise = rupeesToPaise(form.mrpRupees || form.priceRupees);
    if (form.name.trim().length < 3) return toast.warning('Enter a plan name of at least 3 characters.');
    if (pricePaise < 1 || mrpPaise < pricePaise) return toast.warning('Enter a valid price in rupees. MRP cannot be below the plan price.');
    if (!form.items.some((item) => item.productId)) return toast.warning('Add at least one product to the subscription plan.');
    if (form.deliveryStartTime === form.deliveryEndTime) return toast.warning('Choose different delivery start and end times.');
    if (form.deliveryFrequency === 'SELECTED_WEEKDAYS' && !form.selectedWeekdays.length) return toast.warning('Choose at least one delivery weekday.');

    setSaving(true);
    try {
      if (editing) await apiClient.patch(`/admin/subscriptions/plans/${editing.id}`, payload());
      else await apiClient.post('/admin/subscriptions/plans', payload());
      toast.success(editing ? 'Plan draft updated.' : 'Plan draft created.');
      setFormOpen(false);
      await load();
    } catch (error) {
      toast.error(getToastErrorMessage(error, 'Plan could not be saved.'));
    } finally {
      setSaving(false);
    }
  };

  const lifecycle = async (plan: any, action: 'publish' | 'pause' | 'activate' | 'archive') => {
    try {
      if (action === 'publish') await apiClient.post(`/admin/subscriptions/plans/${plan.id}/publish`);
      else if (action === 'archive') await apiClient.delete(`/admin/subscriptions/plans/${plan.id}`);
      else await apiClient.patch(`/admin/subscriptions/plans/${plan.id}/status`, { status: action === 'pause' ? 'PAUSED' : 'ACTIVE' });
      toast.success(`Plan ${action} completed.`);
      await load();
    } catch (error) {
      toast.error(getToastErrorMessage(error, 'Plan status could not be changed.'));
    }
  };

  const cards = useMemo(() => [
    ['Published plans', plans.filter((item) => item.status === 'ACTIVE').length, CalendarDays],
    ['Live subscribers', subscribers.filter((item) => ['ACTIVE', 'PAYMENT_DUE', 'GRACE_PERIOD'].includes(item.status)).length, Users],
    ['Today runs', runs.filter((item) => new Date(item.serviceDate).toDateString() === new Date().toDateString()).length, Route],
    ['Cash variance', cash.filter((item) => item.status === 'VARIANCE_REVIEW').length, ShieldAlert],
  ], [plans, subscribers, runs, cash]);

  return (
    <DashboardLayout allowedRole="ADMIN">
      <div className="space-y-3 p-3 sm:p-4">
        <section className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-black text-slate-900">Subscriptions, runs & cash</h1>
            <p className="text-xs font-semibold text-slate-500">Customer subscriptions first; plan definitions stay separate from billing presets.</p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => void load()} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50"><RefreshCw className="h-3.5 w-3.5" /> Refresh</button>
            <button onClick={() => { setSelectedOfflineCustomer(null); setManualModalOpen(true); }} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-amber-400 px-3 text-xs font-black text-slate-900 hover:bg-amber-300"><Plus className="h-3.5 w-3.5" /> Manual Subscription</button>
            <button onClick={openCreate} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-emerald-700 px-3 text-xs font-black text-white hover:bg-emerald-800"><Plus className="h-3.5 w-3.5" /> New plan</button>
          </div>
        </section>

        <section className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(([cardLabel, value, Icon]: any) => (
            <div key={cardLabel} className="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
              <div className="flex items-center gap-2 text-emerald-700"><span className="rounded-lg bg-emerald-50 p-1.5"><Icon className="h-3.5 w-3.5" /></span><span className="text-xs font-black text-slate-600">{cardLabel}</span></div>
              <strong className="text-lg text-slate-900">{value}</strong>
            </div>
          ))}
        </section>

        <nav className="flex gap-0.5 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1">
          {tabs.map(([key, tabLabel, Icon]) => (
            <button key={key} onClick={() => setTab(key)} className={`flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-black ${tab === key ? 'bg-emerald-100 text-emerald-800' : 'text-slate-500 hover:bg-slate-50'}`}>
              <Icon className="h-3.5 w-3.5" /> {tabLabel}
            </button>
          ))}
        </nav>

        {loading ? <div className="flex min-h-48 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-emerald-700" /></div> : (
          <main>
            {tab === 'subscribers' ? <Subscribers rows={subscribers} onEditSubscriber={openSubscriberEdit} />
              : tab === 'plans' ? <Plans plans={plans} onEdit={openEdit} onLifecycle={lifecycle} />
              : tab === 'calendar' ? <Calendar rows={calendar} onReload={load} />
              : tab === 'runs' ? <Runs rows={runs} />
              : tab === 'cash' ? <Cash rows={cash} />
              : tab === 'exceptions' ? <Exceptions data={exceptions} />
              : <Analytics data={analytics} />}
          </main>
        )}

        {manualModalOpen ? (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Manual offline subscription form">
            <div className="max-h-[96vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white p-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-amber-700">Offline Customer Subscription</p>
                  <h2 className="mt-0.5 text-lg font-black text-slate-900">Create Subscription</h2>
                  <p className="text-xs font-semibold text-slate-500">For offline store customers. Choose plan-based or custom schedule.</p>
                </div>
                <button onClick={() => setManualModalOpen(false)} aria-label="Close form" className="rounded-lg bg-slate-100 p-2"><X className="h-4 w-4" /></button>
              </div>

              <div className="space-y-3 p-4">
                <div className="flex gap-2 rounded-xl bg-slate-100 p-1">
                  <button onClick={() => setManualMode('plan')} className={`flex-1 rounded-lg py-2.5 text-sm font-black ${manualMode === 'plan' ? 'bg-white text-emerald-700 shadow-sm' : 'text-slate-500'}`}>Plan-Based</button>
                  <button onClick={() => setManualMode('custom')} className={`flex-1 rounded-lg py-2.5 text-sm font-black ${manualMode === 'custom' ? 'bg-white text-amber-700 shadow-sm' : 'text-slate-500'}`}>Custom Schedule</button>
                </div>

                <section className="grid gap-4 sm:grid-cols-2">
                  <Field label="Target Store" error={manualErrors.storeId}>
                    <select value={manualForm.storeId} onChange={(e) => { setManualForm({ ...manualForm, storeId: e.target.value }); setManualErrors((prev) => ({ ...prev, storeId: false })); }} className={manualErrors.storeId ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''}>
                      <option value="">Select Store</option>
                      {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </Field>
                  {manualMode === 'plan' && (
                    <Field label="Subscription Plan" error={manualErrors.planId}>
                      <select value={manualForm.planId} onChange={(e) => {
                        const selPlan = plans.find((p) => p.id === e.target.value);
                        setManualForm({ ...manualForm, planId: e.target.value, totalDeliveries: selPlan ? String(selPlan.totalDeliveries) : manualForm.totalDeliveries });
                        setManualErrors((prev) => ({ ...prev, planId: false }));
                      }} className={manualErrors.planId ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''}>
                        <option value="">Select Plan</option>
                        {plans.map((p) => <option key={p.id} value={p.id}>{p.name} ({formatPaise(p.pricePaise)})</option>)}
                      </select>
                    </Field>
                  )}
                  {manualMode === 'custom' && (
                    <Field label="Total Price (₹)" error={manualErrors.customTotalPrice}>
                      <input type="number" min="0" step="1" value={customTotalPrice} onChange={(e) => { setCustomTotalPrice(e.target.value); setManualErrors((prev) => ({ ...prev, customTotalPrice: false })); }} placeholder="e.g. 1500" className={manualErrors.customTotalPrice ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''} />
                    </Field>
                  )}
                </section>

                <section className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-700">Customer Information (No Login Required)</h3>
                  <Field label="Existing Offline Customer">
                    <div className="space-y-1.5">
                      <input
                        value={offlineCustomerSearch}
                        onChange={(e) => {
                          setOfflineCustomerSearch(e.target.value);
                          setSelectedOfflineCustomer(null);
                        }}
                        placeholder="Search existing customers by name or phone…"
                        className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
                      />
                      <select
                        value={selectedOfflineCustomer?.id || ''}
                        onChange={(e) => selectOfflineCustomer(e.target.value)}
                        disabled={offlineCustomersLoading}
                      >
                        <option value="">
                          {offlineCustomersLoading ? 'Loading customers…' : '— New customer (enter details below) —'}
                        </option>
                        {offlineCustomers
                          .filter((c) => {
                            if (!offlineCustomerSearch.trim()) return true;
                            const q = offlineCustomerSearch.trim().toLowerCase();
                            return (c.name || '').toLowerCase().includes(q) || (c.phone || '').includes(q);
                          })
                          .map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.name || 'Unnamed'}{c.phone ? ` — ${c.phone}` : c.email ? ` — ${c.email}` : ''}
                            </option>
                          ))}
                      </select>
                      {offlineCustomers.length === 0 && !offlineCustomersLoading && (
                        <p className="text-[10px] font-bold text-slate-400">No existing customers match your search. Enter details below to create a new one.</p>
                      )}
                    </div>
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Customer Full Name" error={manualErrors.customerName}>
                      <input value={manualForm.customerName} onChange={(e) => { setManualForm({ ...manualForm, customerName: e.target.value }); setManualErrors((prev) => ({ ...prev, customerName: false })); }} placeholder="e.g. Ramesh Kumar" className={manualErrors.customerName ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''} />
                    </Field>
                    <Field label="10-Digit Mobile Number" error={manualErrors.customerPhone}>
                      <input value={manualForm.customerPhone} onChange={(e) => { setManualForm({ ...manualForm, customerPhone: e.target.value }); setManualErrors((prev) => ({ ...prev, customerPhone: false })); }} placeholder="e.g. 9876543210" maxLength={15} className={manualErrors.customerPhone ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''} />
                    </Field>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="House / Street / Flat" error={manualErrors.line1}>
                      <input value={manualForm.line1} onChange={(e) => { setManualForm({ ...manualForm, line1: e.target.value }); setManualErrors((prev) => ({ ...prev, line1: false })); }} placeholder="Flat 201, Balaji Heights" className={manualErrors.line1 ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''} />
                    </Field>
                    <Field label="Area / Locality">
                      <input value={manualForm.line2} onChange={(e) => setManualForm({ ...manualForm, line2: e.target.value })} placeholder="Kukatpally, Main Road" />
                    </Field>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label="City" error={manualErrors.city}><input value={manualForm.city} onChange={(e) => { setManualForm({ ...manualForm, city: e.target.value }); setManualErrors((prev) => ({ ...prev, city: false })); }} className={manualErrors.city ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''} /></Field>
                    <Field label="State"><input value={manualForm.state} onChange={(e) => setManualForm({ ...manualForm, state: e.target.value })} /></Field>
                    <Field label="Pincode" error={manualErrors.pincode}><input value={manualForm.pincode} onChange={(e) => { setManualForm({ ...manualForm, pincode: e.target.value }); setManualErrors((prev) => ({ ...prev, pincode: false })); }} placeholder="500072" maxLength={6} className={manualErrors.pincode ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''} /></Field>
                  </div>
                </section>

                {manualMode === 'plan' ? (
                  <section className="grid gap-4 sm:grid-cols-3">
                    <Field label="Start Month / Date">
                      <input type="date" value={manualForm.startDate} onChange={(e) => setManualForm({ ...manualForm, startDate: e.target.value })} />
                    </Field>
                    <Field label="Total Deliveries">
                      <input type="number" min="1" max="366" value={manualForm.totalDeliveries} onChange={(e) => setManualForm({ ...manualForm, totalDeliveries: e.target.value })} />
                    </Field>
                    <Field label="Delivery Slot">
                      <select value={manualForm.deliverySlot} onChange={(e) => setManualForm({ ...manualForm, deliverySlot: e.target.value as any })}>
                        <option value="MORNING">Morning (6 AM - 9 AM)</option>
                        <option value="EVENING">Evening (5 PM - 8 PM)</option>
                        <option value="BOTH">Both (Morning & Evening)</option>
                      </select>
                    </Field>
                  </section>
                ) : (
                  <section className={`rounded-xl border p-3 space-y-2 ${manualErrors.customDeliveries ? 'border-red-400 bg-red-50/50' : 'border-amber-200 bg-amber-50/50'}`}>
                    <div className="flex items-center justify-between">
                      <h3 className={`text-xs font-black uppercase tracking-wider ${manualErrors.customDeliveries ? 'text-red-700' : 'text-amber-700'}`}>Custom Delivery Schedule{manualErrors.customDeliveries ? ' *' : ''}</h3>
                      <button
                        type="button"
                        onClick={() => {
                          const today = new Date().toISOString().slice(0, 10);
                          setCustomDeliveries([...customDeliveries, { date: today, slot: 'AM' as const, items: [] }]);
                          setManualErrors((prev) => ({ ...prev, customDeliveries: false }));
                        }}
                        className="rounded-lg bg-amber-600 px-2.5 py-1 text-[10px] font-black text-white hover:bg-amber-700"
                      >+ Add Day</button>
                    </div>
                    <p className="text-[10px] text-amber-600">Add delivery days with specific dates and slots. Example: 10 days with 5 consecutive + 5 alternating.</p>
                    {customDeliveries.length === 0 && (
                      <div className="rounded-lg border border-dashed border-amber-300 bg-white p-4 text-center">
                        <p className="text-xs font-bold text-amber-400">No delivery days added yet. Click "+ Add Day" to start.</p>
                      </div>
                    )}
                    {customDeliveries.map((d, idx) => (
                      <div key={idx} className="rounded-lg bg-white p-2.5 border border-amber-200 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <input type="date" value={d.date} onChange={(e) => {
                            const updated = [...customDeliveries];
                            updated[idx].date = e.target.value;
                            setCustomDeliveries(updated);
                          }} className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold" />
                          <select value={d.slot} onChange={(e) => {
                            const updated = [...customDeliveries];
                            updated[idx].slot = e.target.value as 'AM' | 'PM' | 'BOTH';
                            setCustomDeliveries(updated);
                          }} className="rounded-lg border border-slate-200 px-2 py-1 text-[10px] font-bold">
                            <option value="AM">AM</option>
                            <option value="PM">PM</option>
                            <option value="BOTH">Both</option>
                          </select>
                          <button type="button" onClick={() => setCustomDeliveries(customDeliveries.filter((_, i) => i !== idx))} className="rounded bg-red-100 p-1 text-red-600 hover:bg-red-200"><X className="h-3 w-3" /></button>
                        </div>
                        <div className="space-y-1">
                          {d.items.map((item, itemIdx) => (
                            <div key={itemIdx} className="flex items-center gap-1">
                              <select value={item.productId} onChange={(e) => {
                                const updated = [...customDeliveries];
                                const product = products.find((p) => p.id === e.target.value);
                                updated[idx].items[itemIdx] = {
                                  ...updated[idx].items[itemIdx],
                                  productId: e.target.value,
                                  pricePaise: product?.pricePaise || 0,
                                };
                                setCustomDeliveries(updated);
                              }} className="flex-1 rounded-lg border border-slate-200 px-2 py-0.5 text-[10px]">
                                <option value="">Select product</option>
                                {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                              </select>
                              <input type="number" min="1" value={item.quantity} onChange={(e) => {
                                const updated = [...customDeliveries];
                                updated[idx].items[itemIdx].quantity = Math.max(1, parseInt(e.target.value) || 1);
                                setCustomDeliveries(updated);
                              }} className="w-12 rounded-lg border border-slate-200 px-1 py-0.5 text-[10px] text-center" />
                              <button type="button" onClick={() => {
                                const updated = [...customDeliveries];
                                updated[idx].items = updated[idx].items.filter((_, i) => i !== itemIdx);
                                setCustomDeliveries(updated);
                              }} className="rounded bg-red-50 p-0.5 text-red-500 hover:bg-red-100"><X className="h-2.5 w-2.5" /></button>
                            </div>
                          ))}
                          <button type="button" onClick={() => {
                            const updated = [...customDeliveries];
                            updated[idx].items = [...updated[idx].items, { productId: '', quantity: 1, pricePaise: 0 }];
                            setCustomDeliveries(updated);
                          }} className="text-[10px] font-bold text-amber-600 hover:text-amber-700">+ Add Product</button>
                        </div>
                      </div>
                    ))}
                    <div className="text-[10px] font-bold text-amber-600">
                      Total delivery slots: {customDeliveries.reduce((sum, d) => sum + (d.slot === 'BOTH' ? 2 : 1), 0)}
                    </div>
                  </section>
                )}

                <section className="grid gap-4 sm:grid-cols-2">
                  <Field label="Initial Cash Picked / Paid (₹)">
                    <input type="number" min="0" step="1" value={manualForm.initialCashRupees} onChange={(e) => setManualForm({ ...manualForm, initialCashRupees: e.target.value })} placeholder="0" />
                  </Field>
                  <div className="flex items-center gap-3 pt-6">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={manualForm.storeDelivery} onChange={(e) => setManualForm({ ...manualForm, storeDelivery: e.target.checked })} className="h-4 w-4 rounded border-slate-300" />
                      <span className="text-sm font-bold text-slate-700">Store self-delivery</span>
                    </label>
                  </div>
                  <Field label="Admin / Store Note (Optional)">
                    <input value={manualForm.note} onChange={(e) => setManualForm({ ...manualForm, note: e.target.value })} placeholder="e.g. Paid ₹500 in advance at store counter" />
                  </Field>
                </section>
              </div>

              <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white p-4">
                <button onClick={() => setManualModalOpen(false)} className="min-h-10 rounded-xl border border-slate-200 px-4 text-xs font-black">Cancel</button>
                <button disabled={savingManual} onClick={() => void submitManualSubscription()} className="inline-flex min-h-10 min-w-32 items-center justify-center gap-1.5 rounded-xl bg-amber-500 px-4 text-xs font-black text-slate-950 disabled:opacity-50">
                  {savingManual ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} {manualMode === 'custom' ? 'Create Custom Subscription' : 'Create Subscription'}
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {editManualModalOpen && editingSubscriber ? (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Edit subscriber modal">
            <div className="max-h-[96vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white p-4">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Subscriber Management</p>
                  <h2 className="mt-0.5 text-lg font-black text-slate-900">Edit Subscription #{editingSubscriber.id.slice(-6)}</h2>
                  <p className="text-xs font-semibold text-slate-500">Customer: {editingSubscriber.customer?.name || editingSubscriber.customer?.email}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {editingSubscriber.homeStore && (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-2 py-0.5 text-[10px] font-black text-emerald-700">
                        Store: {editingSubscriber.homeStore.name}
                      </span>
                    )}
                    {editingSubscriber.storeDelivery ? (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-orange-100 px-2 py-0.5 text-[10px] font-black text-orange-700">
                        <Truck className="h-3 w-3" /> Store Delivery
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-blue-100 px-2 py-0.5 text-[10px] font-black text-blue-700">
                        <Route className="h-3 w-3" /> Rider Delivery
                      </span>
                    )}
                    <span className="rounded-lg bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600">
                      {editingSubscriber.completedDeliveries}/{editingSubscriber.fundedDeliveryCount || '—'} delivered
                    </span>
                    <span className="rounded-lg bg-amber-100 px-2 py-0.5 text-[10px] font-black text-amber-700">
                      {formatPaise(editingSubscriber.amountCollectedPaise)} / {formatPaise(editingSubscriber.amountDuePaise)}
                    </span>
                  </div>
                </div>
                <button onClick={() => setEditManualModalOpen(false)} aria-label="Close edit form" className="rounded-lg bg-slate-100 p-2"><X className="h-4 w-4" /></button>
              </div>

              <div className="space-y-3 p-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Start Month / Date">
                    <input type="date" value={editSubscriberForm.startDate} onChange={(e) => setEditSubscriberForm({ ...editSubscriberForm, startDate: e.target.value })} />
                  </Field>
                  <Field label="Total Deliveries">
                    <input type="number" min="1" max="366" value={editSubscriberForm.totalDeliveries} onChange={(e) => setEditSubscriberForm({ ...editSubscriberForm, totalDeliveries: e.target.value })} />
                  </Field>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  <Field label="Delivery Slot">
                    <select value={editSubscriberForm.deliverySlot} onChange={(e) => setEditSubscriberForm({ ...editSubscriberForm, deliverySlot: e.target.value as any })}>
                      <option value="MORNING">Morning (6 AM - 9 AM)</option>
                      <option value="EVENING">Evening (5 PM - 8 PM)</option>
                      <option value="BOTH">Both (Morning & Evening)</option>
                    </select>
                  </Field>
                  <Field label="Amount Due (₹)">
                    <input type="number" min="0" step="0.01" value={editSubscriberForm.amountDueRupees} onChange={(e) => setEditSubscriberForm({ ...editSubscriberForm, amountDueRupees: e.target.value })} />
                  </Field>
                  <Field label="Amount Collected (₹)">
                    <input type="number" min="0" step="0.01" value={editSubscriberForm.amountCollectedRupees} onChange={(e) => setEditSubscriberForm({ ...editSubscriberForm, amountCollectedRupees: e.target.value })} />
                  </Field>
                </div>
                <Field label="Reason / Audit Note">
                  <input value={editSubscriberForm.note} onChange={(e) => setEditSubscriberForm({ ...editSubscriberForm, note: e.target.value })} placeholder="e.g. Adjusted delivery schedule & cash received" />
                </Field>
              </div>

              <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white p-4">
                <button onClick={() => setEditManualModalOpen(false)} className="min-h-10 rounded-xl border border-slate-200 px-4 text-xs font-black">Cancel</button>
                <button disabled={savingManual} onClick={() => void saveSubscriberEdit()} className="inline-flex min-h-10 min-w-32 items-center justify-center gap-1.5 rounded-xl bg-emerald-700 px-4 text-xs font-black text-white disabled:opacity-50">
                  {savingManual ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save Changes
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {formOpen ? (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Subscription plan form">
            <div className="max-h-[96vh] w-full max-w-4xl overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white p-4">
                <div><p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">Plan definition</p><h2 className="mt-0.5 text-lg font-black text-slate-900">{editing ? 'Edit subscription plan' : 'Create subscription plan'}</h2><p className="text-xs font-semibold text-slate-500">Technical codes, paise conversion and scheduler defaults are handled automatically.</p></div>
                <button onClick={() => setFormOpen(false)} aria-label="Close subscription plan form" className="rounded-lg bg-slate-100 p-2"><X className="h-4 w-4" /></button>
              </div>

              <div className="space-y-4 p-4">
                <section className="grid gap-3 lg:grid-cols-2">
                  <Field label="Plan name"><input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Daily Milk - 30 Days" /></Field>
                  <Field label="Payment cadence" group>
                    <div className="grid grid-cols-3 gap-2">
                      {([['ONE_TIME', 'One-time', '1 delivery'], ['WEEKLY', 'Weekly', '7 days'], ['MONTHLY', 'Monthly', '30 days']] as const).map(([mode, label, copy]) => {
                        const active = mode === 'ONE_TIME' ? form.durationDays === '1' && form.fundingCycle === 'FULL_PLAN' : mode === 'WEEKLY' ? form.fundingCycle === 'WEEKLY' && form.durationDays === '7' : form.fundingCycle === 'FULL_PLAN' && form.durationDays === '30';
                        return <button key={mode} type="button" onClick={() => setForm((current) => ({ ...current, fundingCycle: mode === 'WEEKLY' ? 'WEEKLY' : 'FULL_PLAN', durationDays: mode === 'ONE_TIME' ? '1' : mode === 'WEEKLY' ? '7' : '30', totalDeliveries: mode === 'ONE_TIME' ? '1' : mode === 'WEEKLY' ? '7' : '30', deliveryFrequency: 'DAILY' }))} className={`min-h-14 rounded-xl px-2 text-center ${active ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600'}`}><span className="block text-sm font-black">{label}</span><span className={`block text-[10px] font-bold ${active ? 'text-emerald-100' : 'text-slate-400'}`}>{copy}</span></button>;
                      })}
                    </div>
                  </Field>
                  <div className="lg:col-span-2"><Field label="Description (optional)"><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Short customer-facing explanation" /></Field></div>
                </section>

                <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-black text-slate-800">Plan image <span className="font-semibold text-slate-400">(optional)</span></p><p className="text-[10px] font-semibold text-slate-500">One upload is automatically reused for mobile.</p></div><label className="inline-flex min-h-9 cursor-pointer items-center justify-center rounded-lg border border-dashed border-emerald-300 bg-white px-3 text-xs font-black text-emerald-800"><input className="hidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => void uploadPlanImage(event)} />{uploadingImage ? 'Uploading…' : form.imageUrl ? 'Replace image' : 'Upload plan image'}</label></div>
                  {form.imageUrl ? <p className="mt-2 truncate text-[10px] font-semibold text-emerald-700">Image ready</p> : null}
                </section>

                <section>
                  <h3 className="text-sm font-black text-slate-900">Delivery schedule</h3>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="How often"><select value={form.deliveryFrequency} onChange={(event) => { const deliveryFrequency = event.target.value; setForm((current) => ({ ...current, deliveryFrequency, totalDeliveries: deliveryFrequency === 'DAILY' ? current.durationDays : current.totalDeliveries })); }}>{frequencyOptions.map(([value, optionLabel]) => <option key={value} value={value}>{optionLabel}</option>)}</select></Field>
                    <Field label="Plan duration (days)"><input type="number" min="1" max="366" value={form.durationDays} onChange={(event) => { const durationDays = event.target.value; setForm((current) => ({ ...current, durationDays, totalDeliveries: current.deliveryFrequency === 'DAILY' ? durationDays : current.totalDeliveries })); }} /></Field>
                    {form.deliveryFrequency === 'DAILY' ? <div className="rounded-xl bg-emerald-50 px-4 py-3"><p className="text-xs font-black uppercase tracking-wide text-emerald-700">Deliveries</p><p className="mt-2 font-black text-slate-900">{form.totalDeliveries || '0'} daily deliveries</p></div> : <Field label="Number of deliveries"><input type="number" min="1" max="366" value={form.totalDeliveries} onChange={(event) => setForm({ ...form, totalDeliveries: event.target.value })} /></Field>}
                  </div>
                  {form.deliveryFrequency === 'SELECTED_WEEKDAYS' ? <div className="mt-2"><p className="text-xs font-black text-slate-700">Delivery days</p><div className="mt-1.5 flex flex-wrap gap-1.5">{weekdayLabels.map((day, index) => <button type="button" key={day} onClick={() => setForm((current) => ({ ...current, selectedWeekdays: current.selectedWeekdays.includes(index) ? current.selectedWeekdays.filter((value) => value !== index) : [...current.selectedWeekdays, index] }))} className={`rounded-lg px-2.5 py-1.5 text-xs font-black ${form.selectedWeekdays.includes(index) ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600'}`}>{day}</button>)}</div></div> : null}
                </section>

                <section>
                  <h3 className="text-sm font-black text-slate-900">Price & delivery time</h3>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="Plan price (₹)"><input type="number" min="0.01" step="0.01" inputMode="decimal" value={form.priceRupees} onChange={(event) => setForm({ ...form, priceRupees: event.target.value })} placeholder="499" /></Field>
                    <Field label="MRP (₹)"><input type="number" min="0.01" step="0.01" inputMode="decimal" value={form.mrpRupees} onChange={(event) => setForm({ ...form, mrpRupees: event.target.value })} placeholder="599" /></Field>
                    <Field label="Delivery from"><input type="time" value={form.deliveryStartTime} onChange={(event) => setForm({ ...form, deliveryStartTime: event.target.value })} /></Field>
                    <Field label="Delivery until"><input type="time" value={form.deliveryEndTime} onChange={(event) => setForm({ ...form, deliveryEndTime: event.target.value })} /></Field>
                  </div>
                  <p className="mt-1.5 text-[10px] font-semibold text-slate-500">Amounts are shown in rupees here and safely converted to paise only when sent to the backend.</p>
                </section>

                <section>
                  <h3 className="text-sm font-black text-slate-900">Products in each delivery</h3>
                  <div className="mt-2 space-y-1.5">
                    {form.items.map((item, index) => <div key={index} className="grid grid-cols-[1fr_92px_auto] gap-2"><select aria-label={`Product ${index + 1}`} value={item.productId} onChange={(event) => setForm({ ...form, items: form.items.map((current, itemIndex) => itemIndex === index ? { ...current, productId: event.target.value } : current) })} className="min-h-12 rounded-xl border border-slate-200 px-4"><option value="">Select product</option>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select><input aria-label={`Quantity ${index + 1}`} className="min-h-12 rounded-xl border border-slate-200 px-3" type="number" min="1" value={item.quantityPerDelivery} onChange={(event) => setForm({ ...form, items: form.items.map((current, itemIndex) => itemIndex === index ? { ...current, quantityPerDelivery: event.target.value } : current) })} /><button type="button" aria-label={`Remove product ${index + 1}`} onClick={() => setForm({ ...form, items: form.items.filter((_, itemIndex) => itemIndex !== index) })} className="rounded-xl bg-red-50 px-3 text-red-700"><X className="h-4 w-4" /></button></div>)}
                    <button type="button" onClick={() => setForm({ ...form, items: [...form.items, { productId: '', quantityPerDelivery: '1' }] })} className="min-h-8 rounded-lg bg-emerald-50 px-3 text-xs font-black text-emerald-700">+ Add product</button>
                  </div>
                </section>

                <details className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <summary className="cursor-pointer text-xs font-black text-slate-800">Availability & customer options <span className="font-semibold text-slate-400">(optional)</span></summary>
                  <div className="mt-3 grid gap-3 lg:grid-cols-2">
                    <Field label="Limit to stores" group><Multi rows={stores} selected={form.storeIds} onChange={(storeIds) => setForm({ ...form, storeIds })} /></Field>
                    <Field label="Limit to zones" group><Multi rows={zones} selected={form.zoneIds} onChange={(zoneIds) => setForm({ ...form, zoneIds })} /></Field>
                    <div className="lg:col-span-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">{([['allowPause', 'Allow pause'], ['allowSkip', 'Allow skip'], ['allowTrustedDrop', 'Trusted drop'], ['allowPersonalHandover', 'Personal handover'], ['allowSecurityHandover', 'Security handover']] as const).map(([key, optionLabel]) => <label key={key} className="flex min-h-9 items-center gap-2 rounded-lg bg-white px-3 text-xs font-bold text-slate-700"><input type="checkbox" checked={form[key]} onChange={(event) => setForm({ ...form, [key]: event.target.checked })} />{optionLabel}</label>)}</div>
                  </div>
                </details>
              </div>

              <div className="sticky bottom-0 flex justify-end gap-2 border-t border-slate-200 bg-white p-4"><button onClick={() => setFormOpen(false)} className="min-h-10 rounded-xl border border-slate-200 px-4 text-xs font-black">Cancel</button><button disabled={saving} onClick={() => void save()} className="inline-flex min-h-10 min-w-32 items-center justify-center gap-1.5 rounded-xl bg-emerald-700 px-4 text-xs font-black text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save draft</button></div>
            </div>
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}

function Plans({ plans, onEdit, onLifecycle }: any) {
  if (!plans.length) return <EmptyState title="No subscription plans" copy="Create a plan to make it available to customers." />;
  return (
    <Table
      headers={['Plan', 'Status', 'Duration', 'Deliveries', 'Schedule', 'Price', 'MRP', 'Created', 'Actions']}
      rows={plans.map((plan: any) => [
        <div key={plan.id} className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-emerald-50">{plan.imageUrl ? <img src={plan.imageUrl} alt="" className="h-full w-full object-contain" /> : <CalendarDays className="h-4 w-4 text-emerald-700" />}</div>
          <div className="min-w-0">
            <p className="font-black text-slate-900 truncate max-w-[200px]">{plan.name}</p>
            {plan.description ? <p className="text-[10px] text-slate-500 truncate max-w-[200px]">{plan.description}</p> : null}
          </div>
        </div>,
        <StatusPill key={`status-${plan.id}`} status={plan.status} />,
        `${plan.durationDays || '—'} days`,
        String(plan.totalDeliveries ?? '—'),
        humanize(plan.deliveryFrequency),
        formatPaise(plan.pricePaise),
        formatPaise(plan.mrpPaise),
        formatDate(plan.createdAt),
        <div key={`actions-${plan.id}`} className="flex flex-wrap gap-1">
          <button onClick={() => onEdit(plan)} className="inline-flex min-h-7 items-center gap-1 rounded-lg border border-slate-200 px-2 text-[10px] font-black"><Edit3 className="h-3 w-3" /> Edit</button>
          {plan.status === 'DRAFT' ? <button onClick={() => onLifecycle(plan, 'publish')} className="inline-flex min-h-7 items-center gap-1 rounded-lg bg-emerald-700 px-2 text-[10px] font-black text-white"><CheckCircle2 className="h-3 w-3" /> Publish</button> : null}
          {plan.status === 'ACTIVE' ? <button onClick={() => onLifecycle(plan, 'pause')} className="inline-flex min-h-7 items-center gap-1 rounded-lg bg-amber-50 px-2 text-[10px] font-black text-amber-800"><Pause className="h-3 w-3" /> Pause</button> : null}
          {plan.status === 'PAUSED' || plan.status === 'ARCHIVED' ? <button onClick={() => onLifecycle(plan, 'activate')} className="inline-flex min-h-7 items-center gap-1 rounded-lg bg-emerald-50 px-2 text-[10px] font-black text-emerald-800"><Play className="h-3 w-3" /> Activate</button> : null}
          {plan.status !== 'ARCHIVED' ? <button onClick={() => onLifecycle(plan, 'archive')} className="inline-flex min-h-7 items-center gap-1 rounded-lg bg-slate-100 px-2 text-[10px] font-black text-slate-600"><Archive className="h-3 w-3" /> Archive</button> : null}
        </div>,
      ])}
      empty="No subscription plans."
    />
  );
}

function Subscribers({ rows, onEditSubscriber }: { rows: any[]; onEditSubscriber?: (sub: any) => void }) {
  const [sourceFilter, setSourceFilter] = useState<'all' | 'online' | 'offline'>('all');
  const [trackerId, setTrackerId] = useState<string | null>(null);
  const filteredRows = rows.filter((item: any) => {
    if (sourceFilter === 'all') return true;
    const isOffline = item.source === 'manual' || item.source === 'custom_manual' || item.customer?.email?.startsWith('offline.') || item.customer?.acquisitionSource === 'OFFLINE';
    return sourceFilter === 'offline' ? isOffline : !isOffline;
  });

  if (trackerId) {
    return (
      <section className="space-y-3">
        <button onClick={() => setTrackerId(null)} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200">
          <X className="h-3.5 w-3.5" /> Back to Subscribers
        </button>
        <OfflineCustomerTracker subscriptionId={trackerId} />
      </section>
    );
  }

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-black text-slate-900">Customer subscriptions</h2>
          <p className="text-xs font-semibold text-slate-500">These are the actual customer subscription records (online & manual offline).</p>
        </div>
        <div className="flex gap-1.5">
          {(['all', 'online', 'offline'] as const).map((filter) => (
            <button
              key={filter}
              onClick={() => setSourceFilter(filter)}
              className={`rounded-lg px-3 py-1.5 text-xs font-black ${sourceFilter === filter ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
            >
              {filter.charAt(0).toUpperCase() + filter.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <Table
        headers={['Customer', 'Phone', 'Plan', 'Store', 'Delivery', 'Status', 'Progress', 'Collected / due', 'Actions']}
        rows={filteredRows.map((item: any) => [
          item.customer?.name || item.customer?.email,
          item.customer?.phone || item.deliveryContact?.phone || '—',
          item.plan?.name,
          item.homeStore?.name || '—',
          item.storeDelivery ? (
            <span key={`sd-${item.id}`} className="inline-flex items-center gap-1 rounded-lg bg-orange-100 px-2 py-0.5 text-[10px] font-black text-orange-700">
              <Truck className="h-3 w-3" /> Store
            </span>
          ) : (
            <span key={`rd-${item.id}`} className="inline-flex items-center gap-1 rounded-lg bg-blue-100 px-2 py-0.5 text-[10px] font-black text-blue-700">
              <Route className="h-3 w-3" /> Rider
            </span>
          ),
          <StatusPill key={item.id} status={item.status} />,
          `${item.completedDeliveries}/${item.fundedDeliveryCount || item.planVersion?.totalDeliveries || '—'}`,
          `${formatPaise(item.amountCollectedPaise)} / ${formatPaise(item.amountDuePaise)}`,
          <div key={`actions-${item.id}`} className="flex gap-1">
            <button
              onClick={() => setTrackerId(item.id)}
              className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 text-[10px] font-black text-emerald-700 hover:bg-emerald-100"
            >
              <CalendarDays className="h-3 w-3" /> Track
            </button>
            {onEditSubscriber && (
              <button
                onClick={() => onEditSubscriber(item)}
                className="inline-flex min-h-8 items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2 text-[10px] font-black text-slate-700 hover:bg-slate-100"
              >
                <Edit3 className="h-3 w-3" /> Edit
              </button>
            )}
          </div>,
        ])}
        empty="No customer subscriptions yet."
      />
    </section>
  );
}

function Calendar({ rows, onReload }: { rows: any[]; onReload?: () => void }) {
  const toast = useToast();
  const [working, setWorking] = useState('');
  const needsReconciliation = (item: any) =>
    item?.status === 'ORDER_GENERATED' && item?.order?.status === 'DELIVERED';
  const reconcile = async (item: any) => {
    setWorking(item.id);
    try {
      await apiClient.post(`/admin/subscriptions/deliveries/${item.id}/reconcile`, {}, { headers: { 'Idempotency-Key': `admin-reconcile:${item.id}` } });
      toast.success(`Subscription delivery for ${item.subscription?.customer?.name || 'the customer'} was reconciled and advanced.`);
      onReload?.();
    } catch (error) {
      toast.error(getToastErrorMessage(error, 'The subscription delivery could not be reconciled.'));
    } finally {
      setWorking('');
    }
  };
  const headers = ['Service date', 'Plan / customer', 'Sequence', 'Status', 'Store', 'Cash due', 'Action'];
  const mapped = rows.map((item: any) => [
    formatDate(item.serviceDate),
    `${item.subscription?.plan?.name || ''} · ${item.subscription?.customer?.name || item.subscription?.customer?.email || ''}`,
    `Day ${item.sequenceNumber}`,
    humanize(item.status),
    item.store?.name || 'Unresolved',
    formatPaise(item.cashDuePaise),
    needsReconciliation(item) ? (
      <button
        key={item.id}
        disabled={working === item.id}
        onClick={() => reconcile(item)}
        className="rounded-xl bg-emerald-700 px-3 py-1.5 text-xs font-black text-white hover:bg-emerald-800 disabled:opacity-60"
      >
        {working === item.id ? 'Reconciling…' : 'Reconcile'}
      </button>
    ) : null,
  ]);
  return <Table headers={headers} rows={mapped} empty="No scheduled subscription deliveries in this range." />;
}

function Runs({ rows }: any) {
  return <Table headers={['Route', 'Service / slot', 'Store', 'Rider', 'Stops', 'Status', 'Cash']} rows={rows.map((item: any) => [item.routeCode, `${formatDate(item.serviceDate)} · ${new Date(item.slotStart).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`, item.store?.name, item.rider?.user?.name || 'Unassigned', `${item.completedStopCount}/${item.totalStopCount}`, humanize(item.status), `${formatPaise(item.collectedCashPaise)} / ${formatPaise(item.expectedCashPaise)}`])} empty="No delivery runs yet." />;
}

function Cash({ rows }: any) {
  return <Table headers={['Batch', 'Run / Rider', 'Expected', 'Submitted', 'Verified', 'Variance', 'Status']} rows={rows.map((item: any) => [item.reference, `${item.deliveryRun?.routeCode || ''} · ${item.rider?.user?.name || ''}`, formatPaise(item.expectedAmountPaise), formatPaise(item.submittedAmountPaise), formatPaise(item.verifiedAmountPaise), formatPaise(item.variancePaise), humanize(item.status)])} empty="No cash settlement batches yet." />;
}

function Exceptions({ data }: any) {
  const rows = [
    ...(data.deliveries || []).map((item: any) => [formatDate(item.serviceDate), item.subscription?.plan?.name, item.subscription?.customer?.email, item.deferredReason || humanize(item.status), item.failureReason || item.generationAttemptRows?.[0]?.message || item.skipReason || 'Review required']),
    ...(data.issues || []).map((item: any) => [formatDate(item.createdAt), item.subscription?.plan?.name, item.customer?.email, humanize(item.type), item.description]),
    ...(data.cashVariances || []).map((item: any) => [formatDate(item.updatedAt || item.createdAt), 'Cash settlement', item.rider?.user?.name || 'Rider', 'Cash variance', item.varianceReason || `Variance ${formatPaise(Number(item.variancePaise || 0))}`]),
    ...(data.workerFailures || []).map((item: any) => [formatDate(item.failedAt || item.updatedAt || item.createdAt), 'Subscription worker', 'System', 'Worker failure', item.lastError || 'Terminal worker failure']),
  ];
  return <Table headers={['Date', 'Plan', 'Customer', 'Type', 'Reason']} rows={rows} empty="No subscription exceptions require review." />;
}

function Analytics({ data }: any) {
  const subscriptions = aggregateRows(data?.subscriptions);
  const deliveries = aggregateRows(data?.deliveries);
  const cash = aggregateRows(data?.cash);
  const metrics = [
    ['Total subscriptions', aggregateCount(subscriptions)],
    ['Live subscriptions', aggregateStatusCount(subscriptions, ['ACTIVE', 'PAYMENT_DUE', 'GRACE_PERIOD'])],
    ['Total deliveries', aggregateCount(deliveries)],
    ['Upcoming 7-day demand', Number(data?.upcomingSevenDayDemand || 0)],
    ['Collected', formatPaise(aggregateMoney(subscriptions, 'amountCollectedPaise'))],
    ['Subscription amount due', formatPaise(aggregateMoney(subscriptions, 'amountDuePaise'))],
    ['Cash expected', formatPaise(aggregateMoney(cash, 'expectedAmountPaise'))],
    ['Cash variance', formatPaise(aggregateMoney(cash, 'variancePaise'))],
  ];

  return (
    <section className="space-y-3">
      <div><h2 className="text-base font-black text-slate-900">Subscription analytics</h2><p className="text-xs font-semibold text-slate-500">Aggregates are converted into readable counts and rupee values instead of exposing raw database objects.</p></div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{metrics.map(([label, value]) => <div key={String(label)} className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p><p className="mt-1 text-lg font-black text-slate-900">{value}</p></div>)}</div>
      <div className="grid gap-3 xl:grid-cols-2">
        <AnalyticsGroup title="Subscriptions by status" headers={['Status', 'Count', 'Collected', 'Due']} rows={subscriptions.map((row) => [humanize(row.status), Number(row._count?._all || 0), formatPaise(Number(row._sum?.amountCollectedPaise || 0)), formatPaise(Number(row._sum?.amountDuePaise || 0))])} />
        <AnalyticsGroup title="Deliveries by status" headers={['Status', 'Count', 'Cash due']} rows={deliveries.map((row) => [humanize(row.status), Number(row._count?._all || 0), formatPaise(Number(row._sum?.cashDuePaise || 0))])} />
      </div>
      <AnalyticsGroup title="Cash batches by status" headers={['Status', 'Count', 'Expected', 'Verified', 'Variance']} rows={cash.map((row) => [humanize(row.status), Number(row._count?._all || 0), formatPaise(Number(row._sum?.expectedAmountPaise || 0)), formatPaise(Number(row._sum?.verifiedAmountPaise || 0)), formatPaise(Number(row._sum?.variancePaise || 0))])} />
      {data?.generatedAt ? <p className="text-right text-[10px] font-semibold text-slate-400">Generated {new Date(data.generatedAt).toLocaleString('en-IN')}</p> : null}
    </section>
  );
}

function AnalyticsGroup({ title, headers, rows }: { title: string; headers: string[]; rows: any[][] }) {
  return <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><div className="border-b border-slate-100 px-4 py-2.5"><h3 className="text-sm font-black text-slate-900">{title}</h3></div><TableBare headers={headers} rows={rows} empty="No data yet." /></div>;
}

function Table({ headers, rows, empty }: { headers: string[]; rows: any[][]; empty: string }) {
  return <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white"><TableBare headers={headers} rows={rows} empty={empty} /></div>;
}

function TableBare({ headers, rows, empty }: { headers: string[]; rows: any[][]; empty: string }) {
  return <><table className="min-w-full text-left text-xs"><thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500"><tr>{headers.map((header) => <th key={header} className="px-3 py-2 font-black">{header}</th>)}</tr></thead><tbody className="divide-y divide-slate-100">{rows.map((row, rowIndex) => <tr key={rowIndex} className="hover:bg-emerald-50/30">{row.map((cell, cellIndex) => <td key={cellIndex} className="whitespace-nowrap px-3 py-2 font-semibold text-slate-700">{cell ?? '—'}</td>)}</tr>)}</tbody></table>{!rows.length ? <div className="p-6 text-center text-xs font-semibold text-slate-500">{empty}</div> : null}</>;
}

function StatusPill({ status }: { status: unknown }) {
  const value = String(status || 'UNKNOWN');
  const tone = value === 'ACTIVE' || value === 'COMPLETED' || value === 'VERIFIED' ? 'bg-emerald-100 text-emerald-800' : value === 'PAUSED' || value === 'PAYMENT_DUE' || value === 'GRACE_PERIOD' || value === 'VARIANCE_REVIEW' ? 'bg-amber-100 text-amber-800' : value === 'FAILED' || value === 'CANCELLED' ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600';
  return <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-black ${tone}`}>{humanize(value)}</span>;
}

function PlanFact({ label, value }: { label: string; value: string }) {
  return <div><p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p><p className="mt-0.5 text-xs font-black text-slate-800">{value}</p></div>;
}

function EmptyState({ title, copy }: { title: string; copy: string }) {
  return <div className="rounded-xl border border-dashed border-slate-300 bg-white p-8 text-center"><h2 className="text-sm font-black text-slate-800">{title}</h2><p className="mt-1 text-xs font-semibold text-slate-500">{copy}</p></div>;
}

function Field({ label, children, group = false, error = false }: { label: string; children: ReactNode; group?: boolean; error?: boolean }) {
  const content = <><span className={`text-xs ${error ? 'text-red-600' : ''}`}>{label}{error && ' *'}</span><div className="mt-1.5 [&_input]:min-h-10 [&_input]:w-full [&_input]:rounded-lg [&_input]:border [&_input]:border-slate-200 [&_input]:px-3 [&_input]:text-sm [&_select]:min-h-10 [&_select]:w-full [&_select]:rounded-lg [&_select]:border [&_select]:border-slate-200 [&_select]:px-3 [&_select]:text-sm [&_textarea]:min-h-20 [&_textarea]:w-full [&_textarea]:rounded-lg [&_textarea]:border [&_textarea]:border-slate-200 [&_textarea]:p-3 [&_textarea]:text-sm">{children}</div></>;
  if (group) return <div role="group" aria-label={label} className="block text-xs font-black text-slate-700">{content}</div>;
  return <label className="block text-xs font-black text-slate-700">{content}</label>;
}

function Multi({ rows, selected, onChange }: { rows: any[]; selected: string[]; onChange: (ids: string[]) => void }) {
  return <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-slate-200 bg-white p-2">{rows.map((row) => <button type="button" key={row.id} onClick={() => onChange(selected.includes(row.id) ? selected.filter((id) => id !== row.id) : [...selected, row.id])} className={`rounded-full px-2.5 py-1 text-[10px] font-black ${selected.includes(row.id) ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600'}`}>{row.name}</button>)}</div>;
}
