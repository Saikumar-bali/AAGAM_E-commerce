'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { apiClient } from '@aagam/utils';
import DashboardLayout from '@/components/DashboardLayout';
import { getToastErrorMessage, useToast } from '@/components/ToastProvider';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  Pause,
  Phone,
  Play,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Trash2,
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

export default function OfflineCustomersPage({
  embed = false,
  basePath = '/admin/subscriptions',
  canManage = true,
  allowedRole = 'ADMIN',
}: {
  embed?: boolean;
  basePath?: string;
  canManage?: boolean;
  allowedRole?: 'ADMIN' | 'STORE_OWNER';
}) {
  const toast = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [viewMode, setViewMode] = useState<'active' | 'recycleBin'>('active');
  const [recycleBinCount, setRecycleBinCount] = useState(0);
  const [customerToDelete, setCustomerToDelete] = useState<Customer | null>(null);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [customerToPurge, setCustomerToPurge] = useState<Customer | null>(null);
  const [purgeModalOpen, setPurgeModalOpen] = useState(false);
  const [actionInProgress, setActionInProgress] = useState(false);
  const loadRequestId = useRef(0);

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

  const loadCustomers = async (p = page, q = search, mode = viewMode) => {
    const requestId = ++loadRequestId.current;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(p), pageSize: '20' });
      if (q.trim()) params.set('search', q.trim());
      if (mode === 'recycleBin') params.set('recycleBin', 'true');
      const res = await apiClient.get(`${basePath}/offline-customers?${params}`);
      // Tab switches can leave an older request in flight; applying its
      // response would render one mode's customers under the other mode's
      // destructive controls.
      if (requestId !== loadRequestId.current) return;
      setCustomers(res.data.customers || []);
      setTotal(res.data.total || 0);
      setTotalPages(res.data.totalPages || 1);
      if (typeof res.data.recycleBinCount === 'number') {
        setRecycleBinCount(res.data.recycleBinCount);
      }
    } catch (err: any) {
      if (requestId !== loadRequestId.current) return;
      toast.error(getToastErrorMessage(err, 'Failed to load offline customers'));
    } finally {
      if (requestId === loadRequestId.current) setLoading(false);
    }
  };

  useEffect(() => { loadCustomers(1, '', 'active'); }, []);

  const handleSearch = () => { setPage(1); loadCustomers(1, search, viewMode); };

  const handleMoveToRecycleBin = async (customer: Customer) => {
    setActionInProgress(true);
    try {
      await apiClient.delete(`${basePath}/offline-customers/${customer.id}`);
      toast.success(`${customer.name || 'Customer'} moved to Recycle Bin.`);
      setDeleteModalOpen(false);
      setCustomerToDelete(null);
      if (selectedCustomer?.id === customer.id) {
        setSelectedCustomer(null);
      }
      await loadCustomers(page, search, viewMode);
    } catch (err: any) {
      toast.error(getToastErrorMessage(err, 'Failed to delete customer'));
    } finally {
      setActionInProgress(false);
    }
  };

  const handleRestoreCustomer = async (customer: Customer) => {
    setActionInProgress(true);
    try {
      await apiClient.post(`${basePath}/offline-customers/${customer.id}/restore`);
      toast.success(`${customer.name || 'Customer'} restored to active list.`);
      if (selectedCustomer?.id === customer.id) {
        setSelectedCustomer(null);
      }
      await loadCustomers(page, search, viewMode);
    } catch (err: any) {
      toast.error(getToastErrorMessage(err, 'Failed to restore customer'));
    } finally {
      setActionInProgress(false);
    }
  };

  const handlePermanentDelete = async (customer: Customer) => {
    setActionInProgress(true);
    try {
      await apiClient.delete(`${basePath}/offline-customers/${customer.id}/permanent`);
      toast.success(`${customer.name || 'Customer'} permanently deleted.`);
      setPurgeModalOpen(false);
      setCustomerToPurge(null);
      if (selectedCustomer?.id === customer.id) {
        setSelectedCustomer(null);
      }
      await loadCustomers(page, search, viewMode);
    } catch (err: any) {
      toast.error(getToastErrorMessage(err, 'Failed to permanently purge customer'));
    } finally {
      setActionInProgress(false);
    }
  };

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
      await apiClient.post(`${basePath}/manual-customer`, {
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
      const res = await apiClient.get(`${basePath}/offline-customers/${customer.id}`);
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
    embed ? <>{node}</> : <DashboardLayout allowedRole={allowedRole}>{node}</DashboardLayout>;

  if (trackerSubscriptionId) {
    return withLayout(
      <>
        <div className="mb-3">
          <button onClick={() => setTrackerSubscriptionId(null)} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-200">
            <X className="h-3.5 w-3.5" /> Back to Customers
          </button>
        </div>
        <OfflineCustomerTracker subscriptionId={trackerSubscriptionId} basePath={basePath} />
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
            <div className="flex items-center gap-3">
              {viewMode === 'recycleBin' && canManage ? (
                <div className="flex items-center gap-2">
                  <button
                    disabled={actionInProgress}
                    onClick={() => void handleRestoreCustomer(selectedCustomer)}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-black text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <RotateCcw className="h-3.5 w-3.5" /> Restore
                  </button>
                  <button
                    disabled={actionInProgress}
                    onClick={() => { setCustomerToPurge(selectedCustomer); setPurgeModalOpen(true); }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3 py-1.5 text-xs font-black text-white hover:bg-rose-700 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete Forever
                  </button>
                </div>
              ) : canManage ? (
                <button
                  disabled={actionInProgress}
                  onClick={() => { setCustomerToDelete(selectedCustomer); setDeleteModalOpen(true); }}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-black text-rose-700 hover:bg-rose-100 disabled:opacity-50"
                  title="Move customer to Recycle Bin"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Move to Recycle Bin
                </button>
              ) : null}
              <div className="text-right">
                <div className="text-[10px] text-slate-500">Customer since</div>
                <div className="text-xs font-bold text-slate-900">{new Date(selectedCustomer.createdAt).toLocaleDateString('en-IN')}</div>
              </div>
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
      </>
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

      {/* Segmented Mode Switcher: Active vs Recycle Bin. The bin is only
          reachable where its restore/purge actions are available. */}
      <div className="mb-4 flex items-center gap-2 border-b border-slate-200 pb-3">
        <button
          onClick={() => {
            setViewMode('active');
            setPage(1);
            loadCustomers(1, search, 'active');
          }}
          className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition-all ${
            viewMode === 'active'
              ? 'bg-emerald-700 text-white shadow-sm'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          <Users className="h-3.5 w-3.5" />
          <span>Active Customers</span>
          {viewMode === 'active' && (
            <span className="ml-1 rounded-full bg-emerald-800 px-2 py-0.5 text-[10px] text-emerald-100">
              {total}
            </span>
          )}
        </button>

        {canManage && (
          <button
            onClick={() => {
              setViewMode('recycleBin');
              setPage(1);
              loadCustomers(1, search, 'recycleBin');
            }}
            className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-black transition-all ${
              viewMode === 'recycleBin'
                ? 'bg-rose-700 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Recycle Bin</span>
            {recycleBinCount > 0 && (
              <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-black ${
                viewMode === 'recycleBin' ? 'bg-rose-900 text-rose-100' : 'bg-rose-100 text-rose-700'
              }`}>
                {recycleBinCount}
              </span>
            )}
          </button>
        )}
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
          {viewMode === 'active' && canManage && (
            <button onClick={() => setCreateModalOpen(true)} className="inline-flex items-center gap-1.5 rounded-xl bg-amber-400 px-4 py-2.5 text-sm font-black text-slate-900 hover:bg-amber-300">
              <Plus className="h-4 w-4" /> Create Customer
            </button>
          )}
        </div>
        <div className="text-sm font-bold text-slate-500">
          {total} {viewMode === 'recycleBin' ? 'deleted customers in bin' : 'active customers found'}
        </div>
      </div>

      {loading ? (
        <div className="flex min-h-48 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-emerald-700" /></div>
      ) : customers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-8 text-center">
          {viewMode === 'recycleBin' ? (
            <>
              <Trash2 className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm font-black text-slate-400">Recycle Bin is empty</p>
              <p className="mt-1 text-xs text-slate-400">Deleted offline customers will appear here so you can review or restore them anytime.</p>
            </>
          ) : (
            <>
              <Users className="mx-auto h-10 w-10 text-slate-300" />
              <p className="mt-3 text-sm font-black text-slate-400">No offline customers found</p>
              <p className="mt-1 text-xs text-slate-400">Create manual subscriptions from the Subscriptions page or click Create Customer above.</p>
            </>
          )}
        </div>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {customers.map((c) => (
              <div
                key={c.id}
                onClick={() => openDetail(c)}
                className="group relative cursor-pointer rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:border-emerald-300 hover:shadow-md"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-black text-slate-900 group-hover:text-emerald-700">{c.name || 'Unnamed'}</h3>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-500"><Phone className="h-3 w-3" /> {c.phone || 'No phone'}</p>
                  </div>

                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                    {viewMode === 'recycleBin' ? (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-rose-100 px-2 py-1 text-xs font-black text-rose-700">
                        <Trash2 className="h-3 w-3" /> In Bin
                      </span>
                    ) : c.summary.activeSubscriptions > 0 ? (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-2 py-1 text-xs font-black text-emerald-700">
                        <Play className="h-3 w-3" /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-xs font-black text-slate-500">
                        <Pause className="h-3 w-3" /> Inactive
                      </span>
                    )}

                    {viewMode === 'active' && canManage && (
                      <button
                        onClick={() => {
                          setCustomerToDelete(c);
                          setDeleteModalOpen(true);
                        }}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition-colors"
                        title="Move to Recycle Bin"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
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

                {viewMode === 'recycleBin' && canManage && (
                  <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-2.5" onClick={(e) => e.stopPropagation()}>
                    <button
                      disabled={actionInProgress}
                      onClick={() => void handleRestoreCustomer(c)}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1.5 text-xs font-black text-emerald-700 hover:bg-emerald-100 transition-colors disabled:opacity-50"
                    >
                      <RotateCcw className="h-3.5 w-3.5" /> Restore
                    </button>
                    <button
                      disabled={actionInProgress}
                      onClick={() => {
                        setCustomerToPurge(c);
                        setPurgeModalOpen(true);
                      }}
                      className="inline-flex items-center justify-center gap-1 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-black text-rose-700 hover:bg-rose-100 transition-colors disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" /> Delete Forever
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="mt-4 flex items-center justify-center gap-2">
              <button disabled={page <= 1} onClick={() => { setPage(page - 1); loadCustomers(page - 1, search, viewMode); }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold disabled:opacity-40">Previous</button>
              <span className="text-xs font-bold text-slate-500">Page {page} of {totalPages}</span>
              <button disabled={page >= totalPages} onClick={() => { setPage(page + 1); loadCustomers(page + 1, search, viewMode); }} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-bold disabled:opacity-40">Next</button>
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

      {/* Delete / Move to Recycle Bin Confirmation Modal */}
      {deleteModalOpen && customerToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-rose-50 p-3 text-rose-600">
                <Trash2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">Move to Recycle Bin?</h3>
                <p className="text-xs font-semibold text-slate-500">{customerToDelete.name || 'This customer'} ({customerToDelete.phone || 'No phone'})</p>
              </div>
            </div>
            <p className="mt-4 text-xs leading-relaxed text-slate-600">
              The customer will be removed from your active offline list and delivery dispatch. Any active subscriptions will be safely paused. You can restore this customer at any time from the Recycle Bin.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                disabled={actionInProgress}
                onClick={() => { setDeleteModalOpen(false); setCustomerToDelete(null); }}
                className="flex-1 rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-200 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                disabled={actionInProgress}
                onClick={() => void handleMoveToRecycleBin(customerToDelete)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-600 px-4 py-2.5 text-xs font-black text-white hover:bg-rose-700 disabled:opacity-50 shadow-sm"
              >
                {actionInProgress ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Move to Bin
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permanent Purge Confirmation Modal */}
      {purgeModalOpen && customerToPurge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-xs" role="dialog" aria-modal="true">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl border border-rose-200">
            <div className="flex items-center gap-3">
              <div className="rounded-2xl bg-rose-100 p-3 text-rose-700">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-lg font-black text-rose-950">Delete Permanently?</h3>
                <p className="text-xs font-semibold text-rose-700">{customerToPurge.name || 'This customer'} ({customerToPurge.phone || 'No phone'})</p>
              </div>
            </div>
            <div className="mt-4 rounded-xl bg-rose-50 p-3 text-xs text-rose-800">
              <strong>Warning:</strong> This action cannot be undone. The customer will be permanently expunged from the system. If historical orders exist, they will be archived with PII removed to maintain financial audit integrity.
            </div>
            <div className="mt-6 flex gap-3">
              <button
                disabled={actionInProgress}
                onClick={() => { setPurgeModalOpen(false); setCustomerToPurge(null); }}
                className="flex-1 rounded-xl bg-slate-100 px-4 py-2.5 text-xs font-black text-slate-700 hover:bg-slate-200 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                disabled={actionInProgress}
                onClick={() => void handlePermanentDelete(customerToPurge)}
                className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl bg-rose-700 px-4 py-2.5 text-xs font-black text-white hover:bg-rose-800 disabled:opacity-50 shadow-sm"
              >
                {actionInProgress ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete Forever
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
