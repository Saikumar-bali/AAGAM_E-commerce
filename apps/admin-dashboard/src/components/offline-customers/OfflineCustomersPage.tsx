'use client';

import { useEffect, useState, type ReactNode } from 'react';
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

export default function OfflineCustomersPage({ embed = false }: { embed?: boolean }) {
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
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    phone: '',
    line1: '',
    line2: '',
    city: 'Anakapalle',
    state: 'Andhra Pradesh',
    pincode: '',
    latitude: 0,
    longitude: 0,
  });

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

  const geocodeAddress = async (line1: string, city: string, state: string, pincode: string): Promise<{ latitude: number; longitude: number } | null> => {
    const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!apiKey) return null;
    const query = [line1, city, state, pincode].filter(Boolean).join(', ');
    try {
      const res = await fetch(`https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&key=${apiKey}`);
      const data = await res.json();
      if (data.status === 'OK' && data.results?.[0]?.geometry?.location) {
        return { latitude: data.results[0].geometry.location.lat, longitude: data.results[0].geometry.location.lng };
      }
    } catch {}
    return null;
  };

  const handleCreateCustomer = async () => {
    if (!createForm.name.trim()) return toast.warning('Enter customer name.');
    if (!createForm.phone.trim() || !/^\d{10}$/.test(createForm.phone.trim().replace(/[\s().-]/g, ''))) return toast.warning('Enter a valid 10-digit phone number.');
    if (!createForm.line1.trim()) return toast.warning('Enter address line 1.');
    if (!createForm.pincode.trim() || !/^\d{6}$/.test(createForm.pincode.trim())) return toast.warning('Enter a valid 6-digit pincode.');

    setCreating(true);
    try {
      let lat = createForm.latitude;
      let lng = createForm.longitude;
      if (!lat || !lng) {
        const coords = await geocodeAddress(createForm.line1, createForm.city, createForm.state, createForm.pincode);
        if (coords) { lat = coords.latitude; lng = coords.longitude; }
      }
      await apiClient.post('/admin/subscriptions/manual-customer', {
        name: createForm.name.trim(),
        phone: createForm.phone.trim(),
        line1: createForm.line1.trim(),
        line2: createForm.line2.trim() || undefined,
        city: createForm.city.trim(),
        state: createForm.state.trim(),
        pincode: createForm.pincode.trim(),
        latitude: lat || undefined,
        longitude: lng || undefined,
      });
      toast.success('Offline customer created successfully!');
      setCreateModalOpen(false);
      setCreateForm({ name: '', phone: '', line1: '', line2: '', city: 'Anakapalle', state: 'Andhra Pradesh', pincode: '', latitude: 0, longitude: 0 });
      loadCustomers(page, search);
    } catch (err: any) {
      toast.error(getToastErrorMessage(err, 'Failed to create customer.'));
    } finally {
      setCreating(false);
    }
  };

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

  // When embedded (e.g. as a tab of /admin/customers) the host page already
  // provides the DashboardLayout shell.
  const withLayout = (node: ReactNode) =>
    embed ? <>{node}</> : <DashboardLayout allowedRole="ADMIN">{node}</DashboardLayout>;

  if (trackerSubscriptionId) {
    return withLayout(
      <>
        <div className="mb-3">
          <button onClick={() => setTrackerSubscriptionId(null)} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200">
            <X className="h-3.5 w-3.5" /> Back to Customers
          </button>
        </div>
        <OfflineCustomerTracker subscriptionId={trackerSubscriptionId} />
      </>,
    );
  }

  if (selectedCustomer) {
    return withLayout(
      <>
        <div className="mb-3">
          <button onClick={() => { setSelectedCustomer(null); setCustomerDetail(null); }} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200">
            <X className="h-3.5 w-3.5" /> Back to List
          </button>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-black text-slate-900">{selectedCustomer.name || 'Unnamed Customer'}</h2>
              <div className="mt-1 flex items-center gap-3 text-xs text-slate-500">
                <span className="flex items-center gap-1"><Phone className="h-3 w-3" /> {selectedCustomer.phone || 'No phone'}</span>
                <span>{selectedCustomer.email}</span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-slate-500">Customer since</div>
              <div className="text-xs font-bold text-slate-900">{new Date(selectedCustomer.createdAt).toLocaleDateString('en-IN')}</div>
            </div>
          </div>

          {selectedCustomer.addresses[0] && (
            <div className="mt-3 rounded-xl bg-slate-50 p-3">
              <div className="text-[10px] font-black uppercase tracking-wider text-slate-500">Default Address</div>
              <div className="mt-0.5 text-xs font-semibold text-slate-800">{selectedCustomer.addresses[0].line1}, {selectedCustomer.addresses[0].city}</div>
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <div className="rounded-xl bg-emerald-50 p-3 text-center">
              <div className="text-lg font-black text-emerald-700">{selectedCustomer.summary.activeSubscriptions}</div>
              <div className="text-[10px] font-bold text-emerald-600">Active Subs</div>
            </div>
            <div className="rounded-xl bg-blue-50 p-3 text-center">
              <div className="text-lg font-black text-blue-700">{selectedCustomer.summary.totalOrders}</div>
              <div className="text-[10px] font-bold text-blue-600">Total Orders</div>
            </div>
            <div className="rounded-xl bg-amber-50 p-3 text-center">
              <div className="text-lg font-black text-amber-700">{formatPaise(selectedCustomer.summary.totalCollectedPaise)}</div>
              <div className="text-[10px] font-bold text-amber-600">Collected</div>
            </div>
            <div className="rounded-xl bg-red-50 p-3 text-center">
              <div className="text-lg font-black text-red-700">{formatPaise(selectedCustomer.summary.totalDuePaise)}</div>
              <div className="text-[10px] font-bold text-red-600">Due</div>
            </div>
          </div>
        </div>

        {detailLoading ? (
          <div className="flex min-h-32 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-emerald-700" /></div>
        ) : customerDetail?.subscriptions?.length > 0 ? (
          <div className="mt-4 space-y-3">
            <h3 className="text-sm font-black text-slate-900">Subscriptions</h3>
            {customerDetail.subscriptions.map((sub: any) => (
              <div key={sub.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-[10px] font-black ${
                        sub.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-700' :
                        sub.status === 'COMPLETED' ? 'bg-blue-100 text-blue-700' :
                        sub.status === 'PAUSED' ? 'bg-amber-100 text-amber-700' :
                        sub.status === 'CANCELLED' ? 'bg-red-100 text-red-700' :
                        'bg-slate-100 text-slate-600'
                      }`}>{sub.status}</span>
                      {sub.isCustom && <span className="inline-flex items-center rounded-lg bg-purple-100 px-1.5 py-0.5 text-[10px] font-black text-purple-700">Custom</span>}
                      {sub.storeDelivery && <span className="inline-flex items-center rounded-lg bg-orange-100 px-1.5 py-0.5 text-[10px] font-black text-orange-700">Store Delivery</span>}
                    </div>
                    <div className="mt-1.5 text-xs text-slate-500">
                      {new Date(sub.startDate).toLocaleDateString('en-IN')} - {new Date(sub.endDate).toLocaleDateString('en-IN')}
                    </div>
                    {sub.homeStore && <div className="text-[10px] text-slate-400">Store: {sub.homeStore.name}</div>}
                  </div>
                  <button onClick={() => openTracker(sub.id)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-[10px] font-black text-emerald-700 hover:bg-emerald-100">
                    <ExternalLink className="h-3 w-3" /> Track
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
                  <div className="text-center">
                    <div className="text-sm font-black text-slate-900">{sub._count.deliveries}</div>
                    <div className="text-[10px] font-bold text-slate-400">Total</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-black text-emerald-700">{sub.completedDeliveries}</div>
                    <div className="text-[10px] font-bold text-slate-400">Delivered</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-black text-amber-700">{sub._count.deliveries - sub.completedDeliveries - sub.failedDeliveries - sub.skippedDeliveries}</div>
                    <div className="text-[10px] font-bold text-slate-400">Pending</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-black text-red-700">{sub.failedDeliveries}</div>
                    <div className="text-[10px] font-bold text-slate-400">Failed</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-black text-blue-700">{formatPaise(sub.amountCollectedPaise)}</div>
                    <div className="text-[10px] font-bold text-slate-400">Collected</div>
                  </div>
                  <div className="text-center">
                    <div className="text-sm font-black text-red-700">{formatPaise(sub.amountDuePaise)}</div>
                    <div className="text-[10px] font-bold text-slate-400">Due</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
            <Users className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-2 text-xs font-bold text-slate-400">No subscriptions found</p>
          </div>
        )}
      </>,
    );
  }

  return withLayout(
    <>
      {!embed ? (
        <div className="mb-4">
          <h1 className="text-xl font-bold text-gray-900">Offline Customers</h1>
          <p className="text-xs font-medium text-gray-500">Manage offline/store customers and their subscriptions.</p>
        </div>
      ) : null}

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
          <button onClick={() => setCreateModalOpen(true)} className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-black text-slate-900 hover:bg-amber-300">
            <Plus className="h-4 w-4" /> Create Customer
          </button>
        </div>
        <div className="text-sm font-bold text-slate-500">{total} customers found</div>
      </div>

      {loading ? (
        <div className="flex min-h-48 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-emerald-700" /></div>
      ) : customers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          <Users className="mx-auto h-10 w-10 text-slate-300" />
          <p className="mt-3 text-sm font-black text-slate-400">No offline customers found</p>
          <p className="mt-1 text-xs text-slate-400">Create manual subscriptions from the Subscriptions page to add offline customers.</p>
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {customers.map((c) => (
              <button
                key={c.id}
                onClick={() => openDetail(c)}
                className="group rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:border-emerald-300 hover:shadow-md"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-black text-slate-900 group-hover:text-emerald-700">{c.name || 'Unnamed'}</h3>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500"><Phone className="h-3 w-3" /> {c.phone || 'No phone'}</p>
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

                <div className="mt-2 grid grid-cols-3 gap-1.5 text-center">
                  <div>
                    <div className="text-xs font-black text-slate-900">{c.summary.totalSubscriptions}</div>
                    <div className="text-[10px] font-bold text-slate-400">Subs</div>
                  </div>
                  <div>
                    <div className="text-xs font-black text-slate-900">{c.summary.totalOrders}</div>
                    <div className="text-[10px] font-bold text-slate-400">Orders</div>
                  </div>
                  <div>
                    <div className="text-xs font-black text-emerald-700">{formatPaise(c.summary.totalCollectedPaise)}</div>
                    <div className="text-[10px] font-bold text-slate-400">Collected</div>
                  </div>
                </div>

                {c.addresses[0] && (
                  <p className="mt-2 truncate text-[10px] text-slate-400">{c.addresses[0].line1}, {c.addresses[0].city}</p>
                )}
              </button>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <button disabled={page <= 1} onClick={() => { setPage(page - 1); loadCustomers(page - 1, search); }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold disabled:opacity-40">Previous</button>
              <span className="text-xs font-bold text-slate-500">Page {page} of {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => { setPage(page + 1); loadCustomers(page + 1, search); }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold disabled:opacity-40">Next</button>
            </div>
          )}
        </>
      )}

      {createModalOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 backdrop-blur-sm sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Create offline customer">
          <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 p-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-amber-700">Offline Customer</p>
                <h2 className="mt-0.5 text-lg font-black text-slate-900">Create New Customer</h2>
              </div>
              <button onClick={() => setCreateModalOpen(false)} className="rounded-lg bg-slate-100 p-2"><X className="h-4 w-4" /></button>
            </div>
            <div className="space-y-3 p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-xs font-black text-slate-700">
                  <span>Customer Name</span>
                  <input value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} placeholder="e.g. Ramesh Kumar" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />
                </label>
                <label className="block text-xs font-black text-slate-700">
                  <span>10-Digit Mobile</span>
                  <input value={createForm.phone} onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })} placeholder="e.g. 9876543210" maxLength={15} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />
                </label>
              </div>
              <label className="block text-xs font-black text-slate-700">
                <span>House / Street / Flat</span>
                <input value={createForm.line1} onChange={(e) => setCreateForm({ ...createForm, line1: e.target.value })} placeholder="Flat 201, Balaji Heights" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />
              </label>
              <label className="block text-xs font-black text-slate-700">
                <span>Area / Locality</span>
                <input value={createForm.line2} onChange={(e) => setCreateForm({ ...createForm, line2: e.target.value })} placeholder="Kukatpally, Main Road" className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block text-xs font-black text-slate-700">
                  <span>City</span>
                  <input value={createForm.city} onChange={(e) => setCreateForm({ ...createForm, city: e.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />
                </label>
                <label className="block text-xs font-black text-slate-700">
                  <span>State</span>
                  <input value={createForm.state} onChange={(e) => setCreateForm({ ...createForm, state: e.target.value })} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />
                </label>
                <label className="block text-xs font-black text-slate-700">
                  <span>Pincode</span>
                  <input value={createForm.pincode} onChange={(e) => setCreateForm({ ...createForm, pincode: e.target.value })} placeholder="500072" maxLength={6} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2.5 text-sm" />
                </label>
              </div>
              <div className="rounded-xl border border-dashed border-emerald-300 bg-white p-2">
                <div className="mb-1 text-[10px] font-black uppercase tracking-wider text-emerald-600">Delivery Location (Map)</div>
                <div className="h-40 overflow-hidden rounded-lg">
                  <iframe
                    width="100%"
                    height="100%"
                    style={{ border: 0 }}
                    loading="lazy"
                    referrerPolicy="no-referrer-when-downgrade"
                    src={`https://www.google.com/maps/embed/v1/place?key=${process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || ''}&q=${createForm.line1 ? `${encodeURIComponent(createForm.line1)}, ${encodeURIComponent(createForm.city)}, ${encodeURIComponent(createForm.state)} ${encodeURIComponent(createForm.pincode)}` : encodeURIComponent(createForm.city || 'Anakapalle, India')}&zoom=15`}
                  />
                </div>
                {createForm.latitude !== 0 && (
                  <p className="mt-1 text-[10px] font-bold text-slate-400">Coordinates: {createForm.latitude.toFixed(6)}, {createForm.longitude.toFixed(6)}</p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-200 p-4">
              <button onClick={() => setCreateModalOpen(false)} className="min-h-10 rounded-xl border border-slate-200 px-4 text-xs font-black">Cancel</button>
              <button disabled={creating} onClick={() => void handleCreateCustomer()} className="inline-flex min-h-10 items-center gap-1.5 rounded-xl bg-amber-500 px-4 text-xs font-black text-slate-950 disabled:opacity-50">
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create Customer
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
