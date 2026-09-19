'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiClient } from '@aagam/utils';
import DashboardLayout from '@/components/DashboardLayout';
import SubscriptionPlanCard, { formatDate, formatPaise } from '@/components/subscriptions/SubscriptionPlanCard';
import { ArrowLeft, CalendarClock, ChevronRight, Loader2, PauseCircle, Plus, RefreshCw, WalletCards } from 'lucide-react';
import { useToast, getToastErrorMessage } from '@/components/ToastProvider';

const segments: Record<string, string[]> = {
  Active: ['ACTIVE', 'PAYMENT_DUE', 'GRACE_PERIOD'],
  Upcoming: ['PENDING_CASH_COLLECTION'],
  Paused: ['PAUSED'],
  Completed: ['COMPLETED', 'CANCELLED'],
};

function daysUntil(date: string | undefined | null) {
  if (!date) return -1;
  return Math.ceil((new Date(date).getTime() - Date.now()) / 86_400_000);
}

const TERMINAL_STATUSES = new Set(['CANCELLED', 'COMPLETED']);

function isExpiringSoon(item: { status?: string; endDate?: string | null }) {
  if (!item.status || TERMINAL_STATUSES.has(item.status)) return false;
  const d = daysUntil(item.endDate);
  return d >= 1 && d <= 3;
}

export default function CustomerSubscriptionsPage() {
  const router = useRouter();
  const toast = useToast();
  const [plans, setPlans] = useState<any[]>([]);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [segment, setSegment] = useState('Active');

  const load = async () => {
    setLoading(true);
    try {
      const [p, s] = await Promise.all([
        apiClient.get('/subscriptions/plans'),
        apiClient.get('/customer/subscriptions'),
      ]);
      setPlans(Array.isArray(p.data) ? p.data : []);
      setSubscriptions(Array.isArray(s.data) ? s.data : []);
    } catch (error) {
      toast.error(getToastErrorMessage(error, 'Subscriptions could not be loaded.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const filtered = useMemo(() => subscriptions.filter((item) => segments[segment].includes(item.status)), [segment, subscriptions]);
  return <DashboardLayout allowedRole="CUSTOMER"><div className="mx-auto max-w-7xl space-y-4 p-3 sm:p-5">
    <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5"><div className="flex flex-col justify-between gap-3 md:flex-row md:items-center"><div className="flex items-center gap-3"><button onClick={() => router.push('/shop')} className="grid h-9 w-9 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /></button><div><p className="enterprise-kicker">Subscriptions</p><h1 className="mt-1 text-lg font-semibold text-slate-950">My subscriptions</h1></div></div><a href="#available-plans" className="enterprise-button"><Plus className="mr-2 h-4 w-4" /> New subscription</a></div></section>
    <section><div className="flex flex-wrap items-center justify-between gap-3"><div className="flex max-w-full gap-1 overflow-x-auto rounded-lg border border-slate-200 bg-white p-1">{Object.keys(segments).map((name) => <button key={name} onClick={() => setSegment(name)} className={`min-h-[36px] rounded-md px-3 text-sm font-medium ${segment === name ? 'bg-emerald-50 text-emerald-800' : 'text-slate-500 hover:bg-slate-50'}`}>{name}</button>)}</div><button onClick={() => void load()} className="enterprise-button"><RefreshCw className="mr-2 h-4 w-4" /> Refresh</button></div>
      {loading ? <div className="flex min-h-52 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-emerald-700" /></div> : filtered.length ? <div className="mt-4 grid gap-3 lg:grid-cols-2">{filtered.map((item) => { const total=Number(item.planVersion?.totalDeliveries || item.completedDeliveries + item.remainingFundedDeliveries || 1); const progress=Math.min(100,Math.round(Number(item.completedDeliveries||0)/total*100)); return <Link key={item.id} href={`/shop/subscriptions/${item.id}`} className="enterprise-card p-4 transition hover:border-emerald-300 sm:p-5"><div className="flex items-start gap-3"><div className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-lg bg-emerald-50">{item.plan?.imageUrl ? <img src={item.plan.imageUrl} alt="" className="h-full w-full object-contain"/>:<CalendarClock className="h-5 w-5 text-emerald-700"/>}</div><div className="min-w-0 flex-1"><span className="enterprise-kicker">{String(item.status).replaceAll('_',' ')}</span><h2 className="mt-1.5 truncate text-base font-semibold text-slate-900">{item.plan?.name}</h2><p className="mt-0.5 text-[11px] text-slate-500">{item.fundingCycle === 'WEEKLY' ? 'Weekly cash funding' : 'Full-plan cash funding'}</p></div><ChevronRight className="h-4 w-4 text-slate-400"/></div><div className="mt-4 flex justify-between text-[11px] font-medium text-slate-600"><span>{item.completedDeliveries} of {total} delivered</span><span className="text-emerald-700">{progress}%</span></div><div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-600" style={{ width: `${progress}%` }} /></div><div className="mt-4 grid grid-cols-3 gap-1.5"><Metric icon={<CalendarClock className="h-3.5 w-3.5"/>} label="Next" value={formatDate(item.nextDeliveryDate)}/><Metric icon={<WalletCards className="h-3.5 w-3.5"/>} label="Cash due" value={formatPaise(item.amountDuePaise)}/><Metric icon={<PauseCircle className="h-4 w-4"/>} label="Funded left" value={String(item.remainingFundedDeliveries)}/></div></Link>; })}</div> : <div className="mt-5 rounded-[24px] border border-dashed border-slate-300 bg-white p-12 text-center"><CalendarClock className="mx-auto h-10 w-10 text-slate-400"/><h2 className="mt-4 text-xl font-semibold text-slate-800">No {segment.toLowerCase()} subscriptions</h2><p className="mt-2 text-slate-500">Published plans are available below.</p></div>}
    </section>
    <section id="available-plans"><div className="mb-4"><p className="enterprise-kicker">Discover</p><h2 className="mt-2 text-lg font-semibold text-slate-950">Available plans</h2></div>{plans.length ? <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">{plans.map((plan) => <SubscriptionPlanCard key={plan.id} plan={plan}/>)}</div> : <div className="rounded-xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">No active plans are published yet.</div>}</section>
  </div></DashboardLayout>;
}
function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5 rounded-md bg-slate-50 p-2 text-center">
      <span className="text-emerald-700">{icon}</span>
      <p className="truncate text-[11px] font-semibold text-slate-900">{value}</p>
      <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">{label}</p>
    </div>
  );
}
