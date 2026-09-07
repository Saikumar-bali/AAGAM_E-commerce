'use client';

import { useEffect, useState } from 'react';
import { apiClient } from '@aagam/utils';
import DashboardLayout from '@/components/DashboardLayout';
import { getToastErrorMessage, useToast } from '@/components/ToastProvider';
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  Pause,
  Phone,
  Play,
  Plus,
  RefreshCw,
  Search,
  Users,
  X,
} from 'lucide-react';
import OfflineCustomerTracker from './OfflineCustomerTracker';

type Customer = {
  id: string;
  name: string | null;
  phone: string | null;
  email: string;
  createdAt: string;
  addresses: Array<{ id: string; line1: string; city: string; latitude: number; longitude: number }>;
  summary: {
    activeSubscriptions: number;
    totalSubscriptions: number;
    totalOrders: number;
    totalCollectedPaise: number;
    totalDuePaise: number;
    totalDelivered: number;
    lastOrderDate: string | null;
  };
};

export default function OfflineCustomersPage() {
  const toast = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [trackerSubscriptionId, setTrackerSubscriptionId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [customerDetail, setCustomerDetail] = useState<any>(null);

  const loadCustomers = async (p = page, q = search) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: '20' });
      if (q.trim()) params.set('search', q.trim());
      const res = await apiClient.get(`/admin/subscriptions/offline-customers?${params}`);
      setCustomers(res.data.customers);
      setTotal(res.data.total);
      setTotalPages(res.data.totalPages);
    } catch (err: any) {
      toast.error(getToastErrorMessage(err, 'Failed to load offline customers'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadCustomers(1, ''); }, []);

  const handleSearch = () => { setPage(1); loadCustomers(1, search); };

  const openDetail = async (customer: Customer) => {
    setSelectedCustomer(customer);
    setDetailLoading(true);
    try {
      const res = await apiClient.get(`/admin/subscriptions/offline-customers/${customer.id}`);
      setCustomerDetail(res.data);
    } catch (err: any) {
      toast.error(getToastErrorMessage(err, 'Failed to load customer detail'));
    } finally {
      setDetailLoading(false);
    }
  };

  const openTracker = (subscriptionId: string) => {
    setTrackerSubscriptionId(subscriptionId);
  };

  const formatPaise = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 0 })}`;

  if (trackerSubscriptionId) {
    return (
      <DashboardLayout allowedRole="ADMIN">
        <div className="mb-4">
          <button onClick={() => setTrackerSubscriptionId(null)} className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200">
            <X className="h-4 w-4" /> Back to Customers
          </button>
        </div>
        <OfflineCustomerTracker subscriptionId={trackerSubscriptionId} />
      </DashboardLayout>
    );
  }

  if (selectedCustomer) {
    return (
      <DashboardLayout allowedRole="ADMIN">
        <div className="mb-4">
          <button onClick={() => { setSelectedCustomer(null); setCustomerDetail(null); }} className="inline-flex items-center gap-2 rounded-xl bg-slate-100 px-4 py-2 text-sm font-bold text-slate-700 hover:bg-slate-200">
            <X className="h-4 w-4" /> Back to List
          </button>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-black text-slate-900">{selectedCustomer.name || 'Unnamed Customer'}</h2>
              <div className="mt-2 flex items-center gap-4 text-sm text-slate-500">
                <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> {selectedCustomer.phone || 'No phone'}</span>
                <span>{selectedCustomer.email}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-sm text-slate-500">Customer since</div>
              <div className="font-bold text-slate-900">{new Date(selectedCustomer.createdAt).toLocaleDateString('en-IN')}</div>
            </div>
          </div>

          {selectedCustomer.addresses[0] && (
            <div className="mt-4 rounded-2xl bg-slate-50 p-4">
              <div className="text-xs font-black uppercase tracking-wider text-slate-500">Default Address</div>
              <div className="mt-1 font-semibold text-slate-800">{selectedCustomer.addresses[0].line1}, {selectedCustomer.addresses[0].city}</div>
            </div>
          )}

          <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
            <div className="rounded-2xl bg-emerald-50 p-4 text-center">
              <div className="text-2xl font-black text-emerald-700">{selectedCustomer.summary.activeSubscriptions}</div>
              <div className="text-xs font-bold text-emerald-600">Active Subscriptions</div>
            </div>
            <div className="rounded-2xl bg-blue-50 p-4 text-center">
              <div className="text-2xl font-black text-blue-700">{selectedCustomer.summary.totalOrders}</div>
              <div className="text-xs font-bold text-blue-600">Total Orders</div>
            </div>
            <div className="rounded-2xl bg-amber-50 p-4 text-center">
              <div className="text-2xl font-black text-amber-700">{formatPaise(selectedCustomer.summary.totalCollectedPaise)}</div>
              <div className="text-xs font-bold text-amber-600">Collected</div>
            </div>
            <div className="rounded-2xl bg-red-50 p-4 text-center">
              <div className="text-2xl font-black text-red-700">{formatPaise(selectedCustomer.summary.totalDuePaise)}</div>
              <div className="text-xs font-bold text-red-600">Due</div>
            </div>
          </div>
        </div>

        {detailLoading ? (
          <div className="flex min-h-40 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-emerald-700" /></div>
        ) : customerDetail?.subscriptions?.length > 0 ? (
          <div className="mt-6 space-y-4">
            <h3 className="text-lg font-black text-slate-900">Subscriptions</h3>
            {customerDetail.subscriptions.map((sub: any) => (
              <div key={sub.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-black ${
                        sub.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' :
                        sub.status === 'COMPLETED' ? 'bg-blue-100 text-blue-700' :
                        sub.status === 'PAUSED' ? 'bg-amber-100 text-amber-700' :
                        sub.status === 'CANCELLED' ? 'bg-red-100 text-red-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>{sub.status}</span>
                      {sub.isCustom && <span className="inline-flex items-center rounded-lg bg-purple-100 px-2 py-1 text-xs font-black text-purple-700">Custom</span>}
                      {sub.storeDelivery && <span className="inline-flex items-center rounded-lg bg-orange-100 px-2 py-1 text-xs font-black text-orange-700">Store Delivery</span>}
                    </div>
                    <div className="mt-2 text-sm text-slate-500">
                      {new Date(sub.startDate).toLocaleDateString('en-IN')} - {new Date(sub.endDate).toLocaleDateString('en-IN')}
                    </div>
                    {sub.homeStore && <div className="text-xs text-slate-400">Store: {sub.homeStore.name}</div>}
                  </div>
                  <button onClick={() => openTracker(sub.id)} className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-100">
                    <ExternalLink className="h-3.5 w-3.5" /> Track
                  </button>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-3 sm:grid-cols-6">
                  <div className="text-center">
                    <div className="text-lg font-black text-slate-900">{sub._count.deliveries}</div>
                    <div className="text-[10px] font-bold text-slate-400">Total</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-black text-emerald-700">{sub.completedDeliveries}</div>
                    <div className="text-[10px] font-bold text-slate-400">Delivered</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-black text-amber-700">{sub._count.deliveries - sub.completedDeliveries - sub.failedDeliveries - sub.skippedDeliveries}</div>
                    <div className="text-[10px] font-bold text-slate-400">Pending</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-black text-red-700">{sub.failedDeliveries}</div>
                    <div className="text-[10px] font-bold text-slate-400">Failed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-black text-blue-700">{formatPaise(sub.amountCollectedPaise)}</div>
                    <div className="text-[10px] font-bold text-slate-400">Collected</div>
                  </div>
                  <div className="text-center">
                    <div className="text-lg font-black text-red-700">{formatPaise(sub.amountDuePaise)}</div>
                    <div className="text-[10px] font-bold text-slate-400">Due</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
            <Users className="mx-auto h-10 w-10 text-slate-300" />
            <p className="mt-3 text-sm font-bold text-slate-400">No subscriptions found</p>
          </div>
        )}
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout allowedRole="ADMIN">
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-gray-900">Offline Customers</h1>
        <p className="mt-1 font-medium text-gray-500">Manage offline/store customers and their subscriptions.</p>
      </div>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="relative flex-1 sm:w-80">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search by name or phone..."
              className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 text-sm font-semibold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
            />
          </div>
          <button onClick={handleSearch} className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-black text-white hover:bg-emerald-800">Search</button>
        </div>
        <div className="text-sm font-bold text-slate-500">{total} customers found</div>
      </div>

      {loading ? (
        <div className="flex min-h-60 items-center justify-center"><Loader2 className="h-9 w-9 animate-spin text-emerald-700" /></div>
      ) : customers.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-slate-50 p-12 text-center">
          <Users className="mx-auto h-12 w-12 text-slate-300" />
          <p className="mt-4 text-lg font-black text-slate-400">No offline customers found</p>
          <p className="mt-1 text-sm text-slate-400">Create manual subscriptions from the Subscriptions page to add offline customers.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {customers.map((c) => (
              <button
                key={c.id}
                onClick={() => openDetail(c)}
                className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-all hover:border-emerald-300 hover:shadow-md"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-black text-slate-900 group-hover:text-emerald-700">{c.name || 'Unnamed'}</h3>
                    <p className="mt-0.5 flex items-center gap-1 text-sm text-slate-500"><Phone className="h-3 w-3" /> {c.phone || 'No phone'}</p>
                  </div>
                  {c.summary.activeSubscriptions > 0 ? (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-700">
                      <Play className="h-3 w-3" /> Active
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs font-black text-slate-500">
                      <Pause className="h-3 w-3" /> Inactive
                    </span>
                  )}
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-sm font-black text-slate-900">{c.summary.totalSubscriptions}</div>
                    <div className="text-[10px] font-bold text-slate-400">Subs</div>
                  </div>
                  <div>
                    <div className="text-sm font-black text-slate-900">{c.summary.totalOrders}</div>
                    <div className="text-[10px] font-bold text-slate-400">Orders</div>
                  </div>
                  <div>
                    <div className="text-sm font-black text-emerald-700">{formatPaise(c.summary.totalCollectedPaise)}</div>
                    <div className="text-[10px] font-bold text-slate-400">Collected</div>
                  </div>
                </div>

                {c.addresses[0] && (
                  <p className="mt-3 truncate text-xs text-slate-400">{c.addresses[0].line1}, {c.addresses[0].city}</p>
                )}
              </button>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <button disabled={page <= 1} onClick={() => { setPage(page - 1); loadCustomers(page - 1, search); }} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold disabled:opacity-40">Previous</button>
              <span className="text-sm font-bold text-slate-500">Page {page} of {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => { setPage(page + 1); loadCustomers(page + 1, search); }} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-bold disabled:opacity-40">Next</button>
            </div>
          )}
        </>
      )}
    </DashboardLayout>
  );
}
