'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@aagam/utils';
import DashboardLayout from '@/components/DashboardLayout';
import { useToast, getToastErrorMessage } from '@/components/ToastProvider';
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
  Users,
  X,
} from 'lucide-react';
import { formatDate, formatPaise } from '@/components/subscriptions/SubscriptionPlanCard';

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
  ['plans', 'Plans', CalendarDays],
  ['subscribers', 'Subscribers', Users],
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

const fundingLabel = (value: string) => (value === 'WEEKLY' ? 'Weekly' : 'Full plan');

export default function AdminSubscriptionsPage() {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>('plans');
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
      setStores(Array.isArray(storesResponse.data) ? storesResponse.data : []);
      setZones(Array.isArray(zonesResponse.data) ? zonesResponse.data : []);
    } catch (error) {
      toast.error(getToastErrorMessage(error, 'Subscription operations could not be loaded.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
        ? plan.items.map((item: any) => ({
            productId: item.productId,
            quantityPerDelivery: String(item.quantityPerDelivery),
          }))
        : [{ productId: '', quantityPerDelivery: '1' }],
      storeIds: (plan.stores || []).map((item: any) => item.storeId),
      zoneIds: (plan.zones || []).map((item: any) => item.zoneId),
    });
    setFormOpen(true);
  };

  const payload = () => ({
    // These are backend contract fields. They are intentionally hidden from the Admin form.
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
    // Admin works only in rupees. API/database continue to use integer paise.
    pricePaise: rupeesToPaise(form.priceRupees),
    mrpPaise: rupeesToPaise(form.mrpRupees || form.priceRupees),
    currency: 'INR',
    // Admin chooses normal clock times. Minutes remain an internal scheduling representation.
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
      .map((item) => ({
        productId: item.productId,
        quantityPerDelivery: Number(item.quantityPerDelivery),
        substituteRules: { mode: 'MANUAL_APPROVAL' },
      })),
    storeIds: form.storeIds,
    zoneIds: form.zoneIds,
  });

  const uploadPlanImage = async (event: React.ChangeEvent<HTMLInputElement>) => {
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
      setForm((current) => ({
        ...current,
        imageUrl: response.data.publicUrl,
        mobileImageUrl: current.mobileImageUrl || response.data.publicUrl,
      }));
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
    if (form.name.trim().length < 3) {
      toast.warning('Enter a plan name of at least 3 characters.');
      return;
    }
    if (pricePaise < 1 || mrpPaise < pricePaise) {
      toast.warning('Enter a valid price in rupees. MRP cannot be below the plan price.');
      return;
    }
    if (!form.items.some((item) => item.productId)) {
      toast.warning('Add at least one product to the subscription plan.');
      return;
    }
    if (form.deliveryStartTime === form.deliveryEndTime) {
      toast.warning('Choose different delivery start and end times.');
      return;
    }
    if (form.deliveryFrequency === 'SELECTED_WEEKDAYS' && !form.selectedWeekdays.length) {
      toast.warning('Choose at least one delivery weekday.');
      return;
    }

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

  const cards = [
    ['Published plans', plans.filter((item) => item.status === 'ACTIVE').length, CalendarDays],
    ['Live subscribers', subscribers.filter((item) => ['ACTIVE', 'PAYMENT_DUE', 'GRACE_PERIOD'].includes(item.status)).length, Users],
    ['Today runs', runs.filter((item) => new Date(item.serviceDate).toDateString() === new Date().toDateString()).length, Route],
    ['Cash variance', cash.filter((item) => item.status === 'VARIANCE_REVIEW').length, ShieldAlert],
  ];

  return (
    <DashboardLayout allowedRole="ADMIN">
      <div className="space-y-6 p-4 sm:p-7">
        <section className="rounded-[30px] bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-700 p-6 text-white shadow-xl">
          <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-center">
            <div>
              <p className="text-xs font-black uppercase tracking-[.22em] text-emerald-200">Recurring delivery operations</p>
              <h1 className="mt-3 text-3xl font-black">Subscriptions, runs & cash</h1>
              <p className="mt-2 max-w-3xl leading-7 text-emerald-100">
                Create recurring plans, follow deliveries, prepare runs and reconcile cash from one place.
              </p>
            </div>
            <div className="flex gap-3">
              <button onClick={() => void load()} className="inline-flex min-h-12 items-center gap-2 rounded-2xl border border-white/25 bg-white/10 px-5 font-black">
                <RefreshCw className="h-4 w-4" /> Refresh
              </button>
              <button onClick={openCreate} className="inline-flex min-h-12 items-center gap-2 rounded-2xl bg-white px-5 font-black text-emerald-800">
                <Plus className="h-5 w-5" /> New plan
              </button>
            </div>
          </div>
        </section>

        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {cards.map(([cardLabel, value, Icon]: any) => (
            <div key={cardLabel} className="rounded-[22px] border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <span className="rounded-2xl bg-emerald-50 p-3 text-emerald-700"><Icon className="h-5 w-5" /></span>
                <strong className="text-3xl text-slate-900">{value}</strong>
              </div>
              <p className="mt-4 text-sm font-black text-slate-600">{cardLabel}</p>
            </div>
          ))}
        </section>

        <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-1.5">
          {tabs.map(([key, tabLabel, Icon]) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-black ${tab === key ? 'bg-emerald-100 text-emerald-800' : 'text-slate-500 hover:bg-slate-50'}`}
            >
              <Icon className="h-4 w-4" /> {tabLabel}
            </button>
          ))}
        </nav>

        {loading ? (
          <div className="flex min-h-72 items-center justify-center"><Loader2 className="h-9 w-9 animate-spin text-emerald-700" /></div>
        ) : (
          <main>
            {tab === 'plans' ? <Plans plans={plans} onEdit={openEdit} onLifecycle={lifecycle} />
              : tab === 'subscribers' ? <Subscribers rows={subscribers} />
              : tab === 'calendar' ? <Calendar rows={calendar} />
              : tab === 'runs' ? <Runs rows={runs} />
              : tab === 'cash' ? <Cash rows={cash} />
              : tab === 'exceptions' ? <Exceptions data={exceptions} />
              : <Analytics data={analytics} />}
          </main>
        )}

        {formOpen ? (
          <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-label="Subscription plan form">
            <div className="max-h-[96vh] w-full max-w-4xl overflow-y-auto rounded-t-[28px] bg-white shadow-2xl sm:rounded-[28px]">
              <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white p-5">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-emerald-700">Simple plan setup</p>
                  <h2 className="mt-1 text-2xl font-black text-slate-900">{editing ? 'Edit subscription plan' : 'Create subscription plan'}</h2>
                  <p className="mt-1 text-sm font-semibold text-slate-500">Technical codes, paise conversion and scheduler defaults are handled automatically.</p>
                </div>
                <button onClick={() => setFormOpen(false)} aria-label="Close subscription plan form" className="rounded-xl bg-slate-100 p-3"><X className="h-5 w-5" /></button>
              </div>

              <div className="space-y-6 p-5">
                <section className="grid gap-5 lg:grid-cols-2">
                  <Field label="Plan name">
                    <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="e.g. Daily Milk - 30 Days" />
                  </Field>
                  <Field label="Payment cadence">
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        ['ONE_TIME', 'One-time', '1 delivery'],
                        ['WEEKLY', 'Weekly', '7 days'],
                        ['MONTHLY', 'Monthly', '30 days'],
                      ].map(([mode, label, copy]) => {
                        const active = mode === 'ONE_TIME'
                          ? form.durationDays === '1' && form.fundingCycle === 'FULL_PLAN'
                          : mode === 'WEEKLY'
                            ? form.fundingCycle === 'WEEKLY' && form.durationDays === '7'
                            : form.fundingCycle === 'FULL_PLAN' && form.durationDays === '30';
                        return <button
                          key={mode}
                          type="button"
                          onClick={() => setForm((current) => ({
                            ...current,
                            fundingCycle: mode === 'WEEKLY' ? 'WEEKLY' : 'FULL_PLAN',
                            durationDays: mode === 'ONE_TIME' ? '1' : mode === 'WEEKLY' ? '7' : '30',
                            totalDeliveries: mode === 'ONE_TIME' ? '1' : mode === 'WEEKLY' ? '7' : '30',
                            deliveryFrequency: 'DAILY',
                          }))}
                          className={`min-h-14 rounded-xl px-2 text-center ${active ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600'}`}
                        >
                          <span className="block text-sm font-black">{label}</span>
                          <span className={`block text-[10px] font-bold ${active ? 'text-emerald-100' : 'text-slate-400'}`}>{copy}</span>
                        </button>;
                      })}
                    </div>
                    <p className="mt-2 text-xs font-semibold text-slate-500">
                      One-time collects once for one delivery, Weekly funds the next seven deliveries, and Monthly collects once for the 30-day plan.
                    </p>
                  </Field>
                  <div className="lg:col-span-2">
                    <Field label="Description (optional)">
                      <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Short customer-facing explanation" />
                    </Field>
                  </div>
                </section>

                <section className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-sm font-black text-slate-800">Plan image <span className="font-semibold text-slate-400">(optional)</span></p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">One upload is automatically reused for mobile.</p>
                    </div>
                    <label className="inline-flex min-h-11 cursor-pointer items-center justify-center rounded-xl border border-dashed border-emerald-300 bg-white px-4 text-sm font-black text-emerald-800">
                      <input className="hidden" type="file" accept="image/jpeg,image/png,image/webp,image/gif" onChange={(event) => void uploadPlanImage(event)} />
                      {uploadingImage ? 'Uploading…' : form.imageUrl ? 'Replace image' : 'Upload plan image'}
                    </label>
                  </div>
                  {form.imageUrl ? <p className="mt-3 truncate text-xs font-semibold text-emerald-700">Image ready</p> : null}
                </section>

                <section>
                  <h3 className="text-base font-black text-slate-900">Delivery schedule</h3>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <Field label="How often">
                      <select
                        value={form.deliveryFrequency}
                        onChange={(event) => {
                          const deliveryFrequency = event.target.value;
                          setForm((current) => ({
                            ...current,
                            deliveryFrequency,
                            totalDeliveries: deliveryFrequency === 'DAILY' ? current.durationDays : current.totalDeliveries,
                          }));
                        }}
                      >
                        {frequencyOptions.map(([value, optionLabel]) => <option key={value} value={value}>{optionLabel}</option>)}
                      </select>
                    </Field>
                    <Field label="Plan duration (days)">
                      <div className="flex gap-2">
                        {[['7', '7 days'], ['30', '30 days']].map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => setForm((current) => ({
                              ...current,
                              durationDays: value,
                              totalDeliveries: current.deliveryFrequency === 'DAILY' ? value : current.totalDeliveries,
                            }))}
                            className={`min-h-12 flex-1 rounded-xl px-3 text-sm font-black ${form.durationDays === value ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600'}`}
                          >
                            {label}
                          </button>
                        ))}
                        <input
                          aria-label="Custom plan duration"
                          className="min-h-12 w-28 rounded-xl border border-slate-200 px-3"
                          type="number"
                          min="1"
                          max="366"
                          value={form.durationDays}
                          onChange={(event) => {
                            const durationDays = event.target.value;
                            setForm((current) => ({
                              ...current,
                              durationDays,
                              totalDeliveries: current.deliveryFrequency === 'DAILY' ? durationDays : current.totalDeliveries,
                            }));
                          }}
                        />
                      </div>
                      <p className="mt-2 text-xs font-semibold text-slate-500">Choose a standard 7-day or 30-day plan, or enter a custom duration.</p>
                    </Field>
                    {form.deliveryFrequency === 'DAILY' ? (
                      <div className="rounded-xl bg-emerald-50 px-4 py-3">
                        <p className="text-xs font-black uppercase tracking-wide text-emerald-700">Deliveries</p>
                        <p className="mt-2 font-black text-slate-900">{form.totalDeliveries || '0'} daily deliveries</p>
                      </div>
                    ) : (
                      <Field label="Number of deliveries">
                        <input type="number" min="1" max="366" value={form.totalDeliveries} onChange={(event) => setForm({ ...form, totalDeliveries: event.target.value })} />
                      </Field>
                    )}
                  </div>

                  {form.deliveryFrequency === 'SELECTED_WEEKDAYS' ? (
                    <div className="mt-4">
                      <p className="text-sm font-black text-slate-700">Delivery days</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {weekdayLabels.map((day, index) => (
                          <button
                            type="button"
                            key={day}
                            onClick={() => setForm((current) => ({
                              ...current,
                              selectedWeekdays: current.selectedWeekdays.includes(index)
                                ? current.selectedWeekdays.filter((value) => value !== index)
                                : [...current.selectedWeekdays, index],
                            }))}
                            className={`rounded-xl px-3 py-2 text-sm font-black ${form.selectedWeekdays.includes(index) ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600'}`}
                          >
                            {day}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </section>

                <section>
                  <h3 className="text-base font-black text-slate-900">Price & delivery time</h3>
                  <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <Field label="Plan price (₹)">
                      <input type="number" min="0.01" step="0.01" inputMode="decimal" value={form.priceRupees} onChange={(event) => setForm({ ...form, priceRupees: event.target.value })} placeholder="499" />
                    </Field>
                    <Field label="MRP (₹)">
                      <input type="number" min="0.01" step="0.01" inputMode="decimal" value={form.mrpRupees} onChange={(event) => setForm({ ...form, mrpRupees: event.target.value })} placeholder="599" />
                    </Field>
                    <Field label="Delivery from">
                      <input type="time" value={form.deliveryStartTime} onChange={(event) => setForm({ ...form, deliveryStartTime: event.target.value })} />
                    </Field>
                    <Field label="Delivery until">
                      <input type="time" value={form.deliveryEndTime} onChange={(event) => setForm({ ...form, deliveryEndTime: event.target.value })} />
                    </Field>
                  </div>
                  <p className="mt-2 text-xs font-semibold text-slate-500">Amounts are shown in rupees here and safely converted to paise only when sent to the backend.</p>
                </section>

                <section>
                  <h3 className="text-base font-black text-slate-900">Products in each delivery</h3>
                  <div className="mt-3 space-y-2">
                    {form.items.map((item, index) => (
                      <div key={index} className="grid grid-cols-[1fr_92px_auto] gap-2">
                        <select
                          aria-label={`Product ${index + 1}`}
                          value={item.productId}
                          onChange={(event) => setForm({
                            ...form,
                            items: form.items.map((current, itemIndex) => itemIndex === index ? { ...current, productId: event.target.value } : current),
                          })}
                          className="min-h-12 rounded-xl border border-slate-200 px-4"
                        >
                          <option value="">Select product</option>
                          {products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
                        </select>
                        <input
                          aria-label={`Quantity ${index + 1}`}
                          className="min-h-12 rounded-xl border border-slate-200 px-3"
                          type="number"
                          min="1"
                          value={item.quantityPerDelivery}
                          onChange={(event) => setForm({
                            ...form,
                            items: form.items.map((current, itemIndex) => itemIndex === index ? { ...current, quantityPerDelivery: event.target.value } : current),
                          })}
                        />
                        <button type="button" aria-label={`Remove product ${index + 1}`} onClick={() => setForm({ ...form, items: form.items.filter((_, itemIndex) => itemIndex !== index) })} className="rounded-xl bg-red-50 px-3 text-red-700">
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    <button type="button" onClick={() => setForm({ ...form, items: [...form.items, { productId: '', quantityPerDelivery: '1' }] })} className="min-h-10 rounded-xl bg-emerald-50 px-4 font-black text-emerald-700">
                      + Add product
                    </button>
                  </div>
                </section>

                <details className="rounded-2xl border border-slate-200 bg-slate-50/70 p-4">
                  <summary className="cursor-pointer text-sm font-black text-slate-800">Availability & customer options <span className="font-semibold text-slate-400">(optional)</span></summary>
                  <div className="mt-5 grid gap-5 lg:grid-cols-2">
                    <Field label="Limit to stores"><Multi rows={stores} selected={form.storeIds} onChange={(storeIds) => setForm({ ...form, storeIds })} /></Field>
                    <Field label="Limit to zones"><Multi rows={zones} selected={form.zoneIds} onChange={(zoneIds) => setForm({ ...form, zoneIds })} /></Field>
                    <div className="lg:col-span-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                      {[
                        ['allowPause', 'Allow pause'],
                        ['allowSkip', 'Allow skip'],
                        ['allowTrustedDrop', 'Trusted drop'],
                        ['allowPersonalHandover', 'Personal handover'],
                        ['allowSecurityHandover', 'Security handover'],
                      ].map(([key, optionLabel]) => (
                        <label key={key} className="flex min-h-12 items-center gap-3 rounded-xl bg-white px-4 font-bold text-slate-700">
                          <input type="checkbox" checked={(form as any)[key]} onChange={(event) => setForm({ ...form, [key]: event.target.checked })} />
                          {optionLabel}
                        </label>
                      ))}
                    </div>
                  </div>
                </details>
              </div>

              <div className="sticky bottom-0 flex justify-end gap-3 border-t border-slate-200 bg-white p-5">
                <button onClick={() => setFormOpen(false)} className="min-h-12 rounded-2xl border border-slate-200 px-5 font-black">Cancel</button>
                <button disabled={saving} onClick={() => void save()} className="inline-flex min-h-12 min-w-40 items-center justify-center gap-2 rounded-2xl bg-emerald-700 px-5 font-black text-white disabled:opacity-50">
                  {saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />} Save draft
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </DashboardLayout>
  );
}

function Plans({ plans, onEdit, onLifecycle }: any) {
  const groups = new Map<string, any[]>();
  plans.forEach((plan: any) => {
    const productName = plan.items?.[0]?.product?.name || plan.name.replace(/\s+-\s+(One-time|Weekly|Monthly).*$/i, '').replace(/\s+\d+\s+Days.*$/i, '').trim();
    groups.set(productName, [...(groups.get(productName) || []), plan]);
  });
  const variant = (rows: any[], type: string) => rows.find((plan) => type === 'ONE_TIME'
    ? plan.durationDays === 1
    : type === 'WEEKLY' ? plan.fundingCycle === 'WEEKLY' : plan.durationDays === 30 && plan.fundingCycle === 'FULL_PLAN');
  return (
    <div className="space-y-5">
      {[...groups.entries()].map(([productName, rows]) => (
        <article key={productName} className="overflow-hidden rounded-[24px] border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-4 border-b border-slate-100 bg-emerald-50/60 p-5">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-emerald-50">
              {rows[0]?.imageUrl ? <img src={rows[0].imageUrl} alt="" className="h-full w-full object-contain" /> : <CalendarDays className="h-7 w-7 text-emerald-700" />}
            </div>
            <div><p className="text-xs font-black uppercase tracking-wider text-emerald-700">Product plan family</p><h2 className="mt-1 text-xl font-black text-slate-900">{productName}</h2></div>
          </div>
          <div className="grid gap-3 p-5 md:grid-cols-3">
            {([['ONE_TIME', 'One-time', '1 delivery'], ['WEEKLY', 'Weekly', '7 days'], ['MONTHLY', 'Monthly', '30 days']] as const).map(([type, label, copy]) => {
              const plan = variant(rows, type);
              return <div key={type} className="rounded-2xl border border-slate-200 p-4">
                <div className="flex items-center justify-between"><div><p className="font-black text-slate-900">{label}</p><p className="text-xs font-bold text-slate-400">{copy}</p></div>{plan ? <span className={`rounded-full px-2 py-1 text-[10px] font-black ${plan.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>{plan.status}</span> : null}</div>
                {plan ? <><p className="mt-4 text-2xl font-black text-slate-900">{formatPaise(plan.pricePaise)}</p><p className="text-xs font-bold text-slate-400">MRP {formatPaise(plan.mrpPaise)}</p><div className="mt-4 flex flex-wrap gap-2"><button onClick={() => onEdit(plan)} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-black">Edit</button><button onClick={() => onLifecycle(plan, 'archive')} className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-black text-slate-600">Archive</button></div></> : <p className="mt-5 rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-800">Not created yet</p>}
              </div>;
            })}
          </div>
        </article>
      ))}
    </div>
  );
}

/* Legacy card layout retained below for archived-plan compatibility. */
function LegacyPlans({ plans, onEdit, onLifecycle }: any) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {plans.map((plan: any) => (
        <article key={plan.id} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-start gap-4">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-emerald-50">
              {plan.imageUrl ? <img src={plan.imageUrl} alt="" className="h-full w-full object-contain" /> : <CalendarDays className="h-7 w-7 text-emerald-700" />}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${plan.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : plan.status === 'PAUSED' ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{plan.status}</span>
                <span className="text-xs font-bold text-slate-400">Version {plan.versions?.[0]?.version || 0}</span>
              </div>
              <h2 className="mt-2 text-xl font-black text-slate-900">{plan.name}</h2>
              <p className="mt-1 text-sm text-slate-500">{plan.totalDeliveries} deliveries · {fundingLabel(plan.fundingCycle)} · {formatPaise(plan.pricePaise)}</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {(plan.items || []).map((item: any) => <span key={item.productId} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-700">{item.quantityPerDelivery}× {item.product?.name}</span>)}
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button onClick={() => onEdit(plan)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-black"><Edit3 className="h-4 w-4" /> Edit draft</button>
            <button onClick={() => onLifecycle(plan, 'publish')} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-700 px-4 text-sm font-black text-white"><CheckCircle2 className="h-4 w-4" /> Publish version</button>
            {plan.status === 'ACTIVE'
              ? <button onClick={() => onLifecycle(plan, 'pause')} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-amber-50 px-4 text-sm font-black text-amber-800"><Pause className="h-4 w-4" /> Pause</button>
              : <button onClick={() => onLifecycle(plan, 'activate')} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-emerald-50 px-4 text-sm font-black text-emerald-800"><Play className="h-4 w-4" /> Activate</button>}
            <button onClick={() => onLifecycle(plan, 'archive')} className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-slate-100 px-4 text-sm font-black text-slate-600"><Archive className="h-4 w-4" /> Archive</button>
          </div>
        </article>
      ))}
    </div>
  );
}

function Subscribers({ rows }: any) {
  return <Table headers={['Customer', 'Plan', 'Status', 'Progress', 'Funding', 'Next delivery']} rows={rows.map((item: any) => [item.customer?.name || item.customer?.email, item.plan?.name, String(item.status).replaceAll('_', ' '), `${item.completedDeliveries}/${item.planVersion?.totalDeliveries || '—'}`, `${formatPaise(item.amountCollectedPaise)} collected`, formatDate(item.nextDeliveryDate)])} />;
}

function Calendar({ rows }: any) {
  return <Table headers={['Service date', 'Plan / customer', 'Sequence', 'Status', 'Store', 'Cash due']} rows={rows.map((item: any) => [formatDate(item.serviceDate), `${item.subscription?.plan?.name || ''} · ${item.subscription?.customer?.name || item.subscription?.customer?.email || ''}`, `Day ${item.sequenceNumber}`, String(item.status).replaceAll('_', ' '), item.store?.name || 'Unresolved', formatPaise(item.cashDuePaise)])} />;
}

function Runs({ rows }: any) {
  return <Table headers={['Route', 'Service / slot', 'Store', 'Rider', 'Stops', 'Status', 'Cash']} rows={rows.map((item: any) => [item.routeCode, `${formatDate(item.serviceDate)} · ${new Date(item.slotStart).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`, item.store?.name, item.rider?.user?.name || 'Unassigned', `${item.completedStopCount}/${item.totalStopCount}`, item.status, `${formatPaise(item.collectedCashPaise)} / ${formatPaise(item.expectedCashPaise)}`])} />;
}

function Cash({ rows }: any) {
  return <Table headers={['Batch', 'Run / Rider', 'Expected', 'Submitted', 'Verified', 'Variance', 'Status']} rows={rows.map((item: any) => [item.reference, `${item.deliveryRun?.routeCode || ''} · ${item.rider?.user?.name || ''}`, formatPaise(item.expectedAmountPaise), formatPaise(item.submittedAmountPaise), formatPaise(item.verifiedAmountPaise), formatPaise(item.variancePaise), item.status])} />;
}

function Exceptions({ data }: any) {
  const rows = [
    ...(data.deliveries || []).map((item: any) => [formatDate(item.serviceDate), item.subscription?.plan?.name, item.subscription?.customer?.email, item.deferredReason || String(item.status).replaceAll('_', ' '), item.failureReason || item.generationAttemptRows?.[0]?.message || item.skipReason || 'Review required']),
    ...(data.issues || []).map((item: any) => [formatDate(item.createdAt), item.subscription?.plan?.name, item.customer?.email, item.type, item.description]),
    ...(data.cashVariances || []).map((item: any) => [formatDate(item.updatedAt || item.createdAt), 'Cash settlement', item.rider?.user?.name || 'Rider', 'CASH_VARIANCE', item.varianceReason || `Variance ${formatPaise(Number(item.variancePaise || 0))}`]),
    ...(data.workerFailures || []).map((item: any) => [formatDate(item.failedAt || item.updatedAt || item.createdAt), 'Subscription worker', 'System', 'WORKER_FAILURE', item.lastError || 'Terminal worker failure']),
  ];
  return <Table headers={['Date', 'Plan', 'Customer', 'Type', 'Reason']} rows={rows} />;
}

function Analytics({ data }: any) {
  const entries = Object.entries(data || {});
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {entries.map(([key, value]: any) => (
        <div key={key} className="rounded-[22px] border border-slate-200 bg-white p-5">
          <p className="text-xs font-black uppercase tracking-wider text-slate-400">{key.replaceAll('_', ' ')}</p>
          <p className="mt-3 text-3xl font-black text-slate-900">{typeof value === 'number' ? value : JSON.stringify(value)}</p>
        </div>
      ))}
    </div>
  );
}

function Table({ headers, rows }: { headers: string[]; rows: any[][] }) {
  return (
    <div className="overflow-x-auto rounded-[24px] border border-slate-200 bg-white">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr>{headers.map((header) => <th key={header} className="px-5 py-4 font-black">{header}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100">{rows.map((row, rowIndex) => <tr key={rowIndex} className="hover:bg-emerald-50/30">{row.map((cell, cellIndex) => <td key={cellIndex} className="whitespace-nowrap px-5 py-4 font-semibold text-slate-700">{cell ?? '—'}</td>)}</tr>)}</tbody>
      </table>
      {!rows.length ? <div className="p-12 text-center text-slate-500">No records in this view.</div> : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm font-black text-slate-700">
      <span>{label}</span>
      <div className="mt-2 [&_input]:min-h-12 [&_input]:w-full [&_input]:rounded-xl [&_input]:border [&_input]:border-slate-200 [&_input]:px-4 [&_select]:min-h-12 [&_select]:w-full [&_select]:rounded-xl [&_select]:border [&_select]:border-slate-200 [&_select]:px-4 [&_textarea]:min-h-24 [&_textarea]:w-full [&_textarea]:rounded-xl [&_textarea]:border [&_textarea]:border-slate-200 [&_textarea]:p-4">{children}</div>
    </label>
  );
}

function Multi({ rows, selected, onChange }: { rows: any[]; selected: string[]; onChange: (ids: string[]) => void }) {
  return (
    <div className="flex max-h-40 flex-wrap gap-2 overflow-y-auto rounded-xl border border-slate-200 bg-white p-3">
      {rows.map((row) => (
        <button
          type="button"
          key={row.id}
          onClick={() => onChange(selected.includes(row.id) ? selected.filter((id) => id !== row.id) : [...selected, row.id])}
          className={`rounded-full px-3 py-1.5 text-xs font-black ${selected.includes(row.id) ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600'}`}
        >
          {row.name}
        </button>
      ))}
    </div>
  );
}
