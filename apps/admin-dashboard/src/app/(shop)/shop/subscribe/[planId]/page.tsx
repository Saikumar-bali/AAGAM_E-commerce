'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { apiClient } from '@aagam/utils';
import DashboardLayout from '@/components/DashboardLayout';
import { formatDate, formatPaise } from '@/components/subscriptions/SubscriptionPlanCard';
import { CalendarDays, Check, Clock3, Loader2, MapPin, ShieldCheck, WalletCards } from 'lucide-react';
import { useToast, getToastErrorMessage } from '@/components/ToastProvider';

const getLocalDateString = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const tomorrow = () => getLocalDateString(1);

const clock = (minute: number) => {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  const period = h < 12 ? 'AM' : 'PM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${String(h12).padStart(2, '0')}:${String(m).padStart(2, '0')} ${period}`;
};

export default function SubscribeReviewPage() {
  const { planId } = useParams<{ planId: string }>();
  const router = useRouter();
  const toast = useToast();

  const [plan, setPlan] = useState<any>();
  const [addresses, setAddresses] = useState<any[]>([]);
  const [addressId, setAddressId] = useState('');
  const [startDate, setStartDate] = useState(tomorrow());
  const [method, setMethod] = useState('PERSONAL_HANDOVER');
  const [deliverySlot, setDeliverySlot] = useState<'AM' | 'PM'>('AM');
  const DELIVERY_WINDOWS = { AM: { start: 360, end: 540 }, PM: { start: 1020, end: 1200 } };
  const [instructions, setInstructions] = useState('');
  const [quote, setQuote] = useState<any>();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    Promise.all([
      apiClient.get(`/subscriptions/plans/${encodeURIComponent(planId)}`),
      apiClient.get('/customer/addresses'),
    ])
      .then(([p, a]) => {
        setPlan(p.data);
        const rows = Array.isArray(a.data) ? a.data : [];
        setAddresses(rows);
        setAddressId((rows.find((x: any) => x.isDefault) || rows[0])?.id || '');
      })
      .catch((e) => toast.error(getToastErrorMessage(e, 'Subscription review could not be loaded.')))
      .finally(() => setLoading(false));
  }, [planId]); // eslint-disable-line react-hooks/exhaustive-deps

  const isValidStartDate = useMemo(() => {
    if (!startDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return false;
    return startDate >= tomorrow();
  }, [startDate]);

  const payload = useMemo(
    () => ({
      addressId,
      startDate,
      deliveryMethod: method,
      deliverySlot,
      deliveryWindowStartMinute: DELIVERY_WINDOWS[deliverySlot].start,
      deliveryWindowEndMinute: DELIVERY_WINDOWS[deliverySlot].end,
    }),
    [addressId, startDate, method, deliverySlot],
  );

  useEffect(() => {
    if (!addressId || !plan || !isValidStartDate) return;
    apiClient
      .post(`/subscriptions/plans/${encodeURIComponent(planId)}/quote`, payload)
      .then((r) => setQuote(r.data))
      .catch(() => {
        // Interceptor displays error toast
      });
  }, [addressId, startDate, method, planId, plan, isValidStartDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = async () => {
    if (!isValidStartDate) {
      toast.warning('Please select a valid start date (tomorrow or later).');
      return;
    }
    setSubmitting(true);
    try {
      const response = await apiClient.post(
        '/customer/subscriptions',
        { ...payload, planId, trustedDropInstructions: instructions || undefined },
        { headers: { 'Idempotency-Key': `web-subscription:${Date.now()}:${crypto.randomUUID()}` } },
      );
      toast.success(response.data?.confirmationMessage || 'Subscription requested.');
      router.replace(`/shop/subscriptions/${response.data.id}`);
    } catch (e) {
      toast.error(getToastErrorMessage(e, 'Subscription could not be created.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout allowedRole="CUSTOMER">
        <div className="flex min-h-[60vh] items-center justify-center">
          <Loader2 className="h-9 w-9 animate-spin text-emerald-700" />
        </div>
      </DashboardLayout>
    );
  }

  if (!plan) {
    return (
      <DashboardLayout allowedRole="CUSTOMER">
        <div className="p-10 text-center font-bold text-slate-600">Plan unavailable.</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout allowedRole="CUSTOMER">
      <div className="mx-auto max-w-5xl p-4 sm:p-7">
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-5">
            <header>
              <h1 className="text-3xl font-black text-slate-900">Review subscription</h1>
            </header>

            <section className="rounded-[26px] bg-gradient-to-br from-emerald-800 to-teal-700 p-6 text-white">
              <div className="flex gap-4">
                {plan.imageUrl ? (
                  <img src={plan.imageUrl} alt="" className="h-24 w-24 rounded-3xl bg-white object-contain" />
                ) : null}
                <div>
                  <h2 className="text-2xl font-black">{plan.name}</h2>
                  <p className="mt-2 text-emerald-100">
                    {plan.totalDeliveries} deliveries ·{' '}
                    {plan.fundingCycle === 'WEEKLY' ? 'Weekly cash funding' : 'Full-plan funding'}
                  </p>
                  <p className="mt-4 text-3xl font-black">{formatPaise(plan.pricePaise)}</p>
                </div>
              </div>
            </section>

            <Section icon={<MapPin />} title="Delivery address">
              <div className="grid gap-3 sm:grid-cols-2">
                {addresses.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => setAddressId(a.id)}
                    className={`min-h-24 rounded-2xl border p-4 text-left transition ${
                      addressId === a.id
                        ? 'border-emerald-600 bg-emerald-50 ring-2 ring-emerald-100'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex justify-between">
                      <span className="font-black text-slate-900">{a.label || 'Address'}</span>
                      {addressId === a.id ? <Check className="h-5 w-5 text-emerald-700" /> : null}
                    </div>
                    <p className="mt-2 text-sm leading-5 text-slate-600">
                      {a.line1}, {a.city}
                    </p>
                  </button>
                ))}
              </div>
              {!addresses.length ? (
                <p className="rounded-xl bg-amber-50 p-4 text-sm font-bold text-amber-800">
                  Add a saved address before subscribing.
                </p>
              ) : null}
            </Section>

            <div className="grid gap-5 md:grid-cols-2">
              <Section icon={<CalendarDays />} title="Start date">
                <input
                  type="date"
                  min={tomorrow()}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  onBlur={() => {
                    if (!startDate || startDate < tomorrow()) {
                      setStartDate(tomorrow());
                    }
                  }}
                  className={`min-h-12 w-full rounded-xl border px-4 font-bold text-slate-800 outline-none transition focus:ring-2 ${
                    !isValidStartDate
                      ? 'border-rose-300 bg-rose-50/40 focus:ring-rose-200'
                      : 'border-slate-200 bg-white focus:ring-emerald-200'
                  }`}
                />
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStartDate(getLocalDateString(1))}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                      startDate === getLocalDateString(1)
                        ? 'bg-emerald-700 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Tomorrow
                  </button>
                  <button
                    type="button"
                    onClick={() => setStartDate(getLocalDateString(2))}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                      startDate === getLocalDateString(2)
                        ? 'bg-emerald-700 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    In 2 days
                  </button>
                  <button
                    type="button"
                    onClick={() => setStartDate(getLocalDateString(7))}
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                      startDate === getLocalDateString(7)
                        ? 'bg-emerald-700 text-white'
                        : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                    }`}
                  >
                    Next week
                  </button>
                </div>
                {!startDate ? (
                  <p className="mt-1.5 text-xs font-bold text-rose-600">Please choose a start date</p>
                ) : startDate < tomorrow() ? (
                  <p className="mt-1.5 text-xs font-bold text-rose-600">Start date must be tomorrow or later</p>
                ) : null}
              </Section>

              <Section icon={<Clock3 />} title="Delivery slot">
                <div className="grid grid-cols-2 gap-3">
                  {(['AM', 'PM'] as const).map((slot) => {
                    const window = DELIVERY_WINDOWS[slot];
                    const isSelected = deliverySlot === slot;
                    return (
                      <button
                        key={slot}
                        onClick={() => setDeliverySlot(slot)}
                        className={`flex flex-col items-center gap-1 rounded-xl border-2 p-3 transition ${
                          isSelected 
                            ? slot === 'AM' 
                              ? 'border-amber-500 bg-amber-50' 
                              : 'border-indigo-500 bg-indigo-50'
                            : 'border-slate-200 bg-white hover:border-slate-300'
                        }`}
                      >
                        <span className={`text-lg font-black ${
                          isSelected 
                            ? slot === 'AM' ? 'text-amber-700' : 'text-indigo-700'
                            : 'text-slate-700'
                        }`}>
                          {slot}
                        </span>
                        <span className="text-xs text-slate-500">
                          {clock(window.start)} – {clock(window.end)}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </Section>
            </div>

            <Section icon={<ShieldCheck />} title="Handover proof">
              {[
                ['PERSONAL_HANDOVER', 'Personal OTP', 'OTP and GPS at the customer'],
                ['TRUSTED_DROP', 'Trusted drop', 'Geofence, secure token and proof'],
                ['SECURITY_RECEPTION', 'Security / reception', 'OTP and named handover'],
              ]
                .filter(([v]) =>
                  v === 'PERSONAL_HANDOVER'
                    ? plan.allowPersonalHandover
                    : v === 'TRUSTED_DROP'
                    ? plan.allowTrustedDrop
                    : plan.allowSecurityHandover,
                )
                .map(([value, label, copy]) => (
                  <button
                    key={value}
                    onClick={() => setMethod(value)}
                    className={`mb-2 flex min-h-16 w-full items-center gap-3 rounded-2xl border p-4 text-left transition ${
                      method === value ? 'border-emerald-600 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <span
                      className={`h-5 w-5 rounded-full border-2 p-1 ${
                        method === value ? 'border-emerald-700' : 'border-slate-300'
                      }`}
                    >
                      {method === value ? (
                        <span className="block h-full w-full rounded-full bg-emerald-700" />
                      ) : null}
                    </span>
                    <span>
                      <strong className="block text-slate-900">{label}</strong>
                      <small className="text-slate-500">{copy}</small>
                    </span>
                  </button>
                ))}
              {method === 'TRUSTED_DROP' ? (
                <div className="mt-4 grid gap-3">
                  <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold leading-5 text-emerald-800">
                    Aagaam securely creates your one-time drop QR after subscription creation. You never create or type
                    a drop secret.
                  </p>
                  <textarea
                    value={instructions}
                    onChange={(e) => setInstructions(e.target.value)}
                    placeholder="Milk box or doorstep instructions"
                    className="min-h-24 rounded-xl border border-slate-200 p-4"
                  />
                </div>
              ) : null}
            </Section>
          </div>

          <aside className="h-fit rounded-[26px] border border-slate-200 bg-white p-5 shadow-lg lg:sticky lg:top-6">
            <div className="flex items-center gap-2">
              <WalletCards className="h-5 w-5 text-amber-600" />
              <h2 className="text-lg font-black text-slate-900">Cash funding</h2>
            </div>
            <div className="mt-5 space-y-4">
              <Summary
                label="First verified delivery"
                value={formatPaise(quote?.firstCashCollectionPaise ?? plan.pricePaise)}
                strong
              />
              <Summary label="Later funded deliveries" value="₹0" />
              <Summary label="Plan end" value={formatDate(quote?.endDate)} />
              <Summary
                label="Skip policy"
                value={plan.allowSkip ? `Up to ${plan.maximumSkips}` : 'Not available'}
              />
            </div>
            <button
              disabled={!addressId || !isValidStartDate || submitting}
              onClick={() => void submit()}
              className="mt-5 flex min-h-14 w-full items-center justify-center rounded-2xl bg-emerald-700 px-5 font-black text-white transition hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : !isValidStartDate ? (
                'Select a start date'
              ) : (
                'Request subscription'
              )}
            </button>
          </aside>
        </div>
      </div>
    </DashboardLayout>
  );
}

function Section({icon,title,children}:{icon:React.ReactNode;title:string;children:React.ReactNode}){return <section className="rounded-[24px] border border-slate-200 bg-white p-5"><h2 className="mb-4 flex items-center gap-2 text-lg font-black text-slate-900"><span className="text-emerald-700 [&>svg]:h-5 [&>svg]:w-5">{icon}</span>{title}</h2>{children}</section>}
function Summary({label,value,strong}:{label:string;value:string;strong?:boolean}){return <div className="flex items-start justify-between gap-4"><span className="text-sm text-slate-500">{label}</span><strong className={strong?'text-xl text-emerald-700':'text-sm text-slate-900'}>{value}</strong></div>}
