'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import DashboardLayout from '@/components/DashboardLayout';
import { InternalPartnerCreateButton } from '@/components/InternalPartnerOnboardingSimple';
import { useToast, getToastErrorMessage } from '@/components/ToastProvider';
import { apiClient } from '@aagam/utils';
import {
  AlertTriangle,
  CheckCircle,
  Edit,
  Loader2,
  MapPin,
  Package,
  RotateCcw,
  Search,
  Store as StoreIcon,
  Trash2,
  User,
  X,
  XCircle,
} from 'lucide-react';

const StoreLocationPicker = dynamic(
  () => import('@/components/StoreLocationPicker').then((module) => module.StoreLocationPicker),
  {
    ssr: false,
    loading: () => <div className="flex h-56 items-center justify-center rounded-xl border border-gray-200 bg-gray-50"><Loader2 className="h-6 w-6 animate-spin text-emerald-600" /></div>,
  },
);

interface StoreRecord {
  id: string;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  isActive: boolean;
  ownerId: string;
  createdAt: string;
  deletedAt?: string | null;
  owner?: { name: string | null; email: string | null; phone: string | null };
  inventory?: { id: string; quantity: number; product?: { name: string; price: number } }[];
}

type EditForm = {
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  isActive: boolean;
};

export default function AdminStoresPage() {
  const toast = useToast();
  const [stores, setStores] = useState<StoreRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);
  const [selectedStore, setSelectedStore] = useState<StoreRecord | null>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<EditForm>({ name: '', address: '', latitude: null, longitude: null, isActive: true });
  const [permanentDeleteStore, setPermanentDeleteStore] = useState<StoreRecord | null>(null);
  const [permanentConfirmText, setPermanentConfirmText] = useState('');
  const [permanentDeleting, setPermanentDeleting] = useState(false);

  const fetchStores = async () => {
    try {
      const response = await apiClient.get('/stores/admin/all');
      setStores(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      toast.error(getToastErrorMessage(error, 'Stores could not be loaded.'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void fetchStores(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredStores = stores.filter((store) => {
    if (!showDeleted && store.deletedAt) return false;
    const query = searchTerm.toLowerCase();
    return store.name.toLowerCase().includes(query)
      || store.address.toLowerCase().includes(query)
      || (store.owner?.name || '').toLowerCase().includes(query)
      || (store.owner?.email || '').toLowerCase().includes(query)
      || (store.owner?.phone || '').toLowerCase().includes(query);
  });

  const stats = [
    { label: 'Total Stores', value: stores.filter((store) => !store.deletedAt).length, icon: StoreIcon, color: 'bg-blue-500' },
    { label: 'Active Stores', value: stores.filter((store) => store.isActive && !store.deletedAt).length, icon: CheckCircle, color: 'bg-emerald-500' },
    { label: 'Deleted Stores', value: stores.filter((store) => store.deletedAt).length, icon: XCircle, color: 'bg-red-500' },
    { label: 'Total Inventory', value: stores.reduce((count, store) => count + (store.inventory?.reduce((sum, item) => sum + item.quantity, 0) || 0), 0), icon: Package, color: 'bg-purple-500' },
  ];

  const continueInternalOnboarding = (detail: any) => {
    const id = detail?.application?.id;
    window.location.assign(`/admin/partner-applications${id ? `?application=${encodeURIComponent(id)}` : ''}`);
  };

  const openEdit = (store: StoreRecord) => {
    setSelectedStore(store);
    setForm({
      name: store.name,
      address: store.address,
      latitude: Number(store.latitude),
      longitude: Number(store.longitude),
      isActive: store.isActive,
    });
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!selectedStore) return;
    if (!form.name.trim() || !form.address.trim() || form.latitude == null || form.longitude == null) {
      toast.warning('Store name, address and map location are required.');
      return;
    }
    setSaving(true);
    try {
      await apiClient.patch(`/stores/${selectedStore.id}`, {
        name: form.name.trim(),
        address: form.address.trim(),
        latitude: form.latitude,
        longitude: form.longitude,
        isActive: form.isActive,
      });
      toast.success('Store updated.');
      setEditOpen(false);
      setSelectedStore(null);
      await fetchStores();
    } catch (error) {
      toast.error(getToastErrorMessage(error, 'Store could not be updated.'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (store: StoreRecord) => {
    if (!window.confirm(`Delete store "${store.name}"? The store and owner access will be deactivated.`)) return;
    try {
      await apiClient.delete(`/stores/${store.id}`);
      toast.success('Store deleted.');
      await fetchStores();
    } catch (error) {
      toast.error(getToastErrorMessage(error, 'Store could not be deleted.'));
    }
  };

  const restore = async (store: StoreRecord) => {
    try {
      await apiClient.post(`/stores/${store.id}/restore`);
      toast.success('Store restored.');
      await fetchStores();
    } catch (error) {
      toast.error(getToastErrorMessage(error, 'Store could not be restored.'));
    }
  };

  const permanentDelete = async () => {
    if (!permanentDeleteStore) return;
    setPermanentDeleting(true);
    try {
      await apiClient.delete(`/stores/${permanentDeleteStore.id}/permanent`);
      toast.success('Store permanently deleted.');
      setPermanentDeleteStore(null);
      setPermanentConfirmText('');
      await fetchStores();
    } catch (error) {
      toast.error(getToastErrorMessage(error, 'Store could not be permanently deleted.'));
    } finally {
      setPermanentDeleting(false);
    }
  };

  return (
    <DashboardLayout allowedRole="ADMIN">
      <div className="mb-8">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="inline-flex rounded-full bg-teal-50 px-3 py-1 text-xs font-black uppercase tracking-[0.2em] text-teal-700">Aagaam Commerce Operations</p>
            <h1 className="mt-3 text-2xl font-bold text-gray-900">Store Management</h1>
            <p className="text-gray-500">Manage approved stores and create new Store Owner access through the Admin onboarding workflow.</p>
          </div>
          <InternalPartnerCreateButton fixedType="STORE" buttonLabel="Add New Store" onCreated={continueInternalOnboarding} />
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => <div key={stat.label} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-sm font-bold text-gray-500">{stat.label}</p><p className="mt-1 text-2xl font-bold text-gray-900">{stat.value}</p></div><div className={`rounded-xl p-3 ${stat.color}`}><stat.icon className="h-6 w-6 text-white" /></div></div></div>)}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-100 bg-gray-50/50 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full max-w-md">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder="Search stores, owner, phone or email..." className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
            </div>
            <label className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-600"><input type="checkbox" checked={showDeleted} onChange={(event) => setShowDeleted(event.target.checked)} /> Show deleted</label>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead><tr className="border-b border-gray-100 bg-gray-50/40"><th className="px-6 py-4 text-xs font-black uppercase tracking-wide text-gray-500">Store</th><th className="px-6 py-4 text-xs font-black uppercase tracking-wide text-gray-500">Owner</th><th className="px-6 py-4 text-xs font-black uppercase tracking-wide text-gray-500">Location</th><th className="px-6 py-4 text-xs font-black uppercase tracking-wide text-gray-500">Status</th><th className="px-6 py-4 text-xs font-black uppercase tracking-wide text-gray-500">Inventory</th><th className="px-6 py-4 text-right text-xs font-black uppercase tracking-wide text-gray-500">Actions</th></tr></thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? [1, 2, 3].map((index) => <tr key={index}><td colSpan={6} className="px-6 py-5"><div className="h-10 animate-pulse rounded bg-gray-100" /></td></tr>) : filteredStores.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-16 text-center"><StoreIcon className="mx-auto mb-3 h-12 w-12 text-gray-300" /><p className="font-bold text-gray-500">No stores found</p></td></tr>
              ) : filteredStores.map((store) => <tr key={store.id} className={`group hover:bg-gray-50 ${store.deletedAt ? 'opacity-60' : ''}`}>
                <td className="px-6 py-4"><div className="flex items-center gap-3"><div className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-100 text-emerald-700"><StoreIcon className="h-5 w-5" /></div><div><p className="font-black text-gray-900">{store.name}</p><p className="text-xs font-semibold text-gray-400">{store.id.slice(0, 8)}</p></div></div></td>
                <td className="px-6 py-4"><div className="flex items-start gap-2"><User className="mt-0.5 h-4 w-4 text-gray-400" /><div><p className="text-sm font-bold text-gray-700">{store.owner?.name || 'Owner'}</p><p className="text-xs text-gray-500">{store.owner?.email || 'No email'}</p><p className="text-xs text-gray-500">{store.owner?.phone || 'No phone'}</p></div></div></td>
                <td className="px-6 py-4"><div className="max-w-xs"><p className="truncate text-sm font-semibold text-gray-700">{store.address}</p><p className="mt-1 flex items-center gap-1 text-xs text-gray-400"><MapPin className="h-3 w-3" />{Number(store.latitude).toFixed(4)}, {Number(store.longitude).toFixed(4)}</p></div></td>
                <td className="px-6 py-4">{store.deletedAt ? <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-black text-red-700">Deleted</span> : store.isActive ? <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">Active</span> : <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-700">Inactive</span>}</td>
                <td className="px-6 py-4"><span className="inline-flex items-center gap-1 text-sm font-bold text-gray-700"><Package className="h-4 w-4 text-purple-500" />{store.inventory?.length || 0} products</span></td>
                <td className="px-6 py-4 text-right">{store.deletedAt ? <div className="flex justify-end gap-1"><button onClick={() => void restore(store)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700"><RotateCcw className="h-4 w-4" /> Restore</button><button onClick={() => { setPermanentConfirmText(''); setPermanentDeleteStore(store); }} className="inline-flex items-center gap-1 rounded-lg bg-red-50 px-3 py-2 text-xs font-black text-red-700"><Trash2 className="h-4 w-4" /> Delete permanently</button></div> : <div className="flex justify-end gap-1"><button onClick={() => openEdit(store)} className="rounded-lg p-2 text-gray-400 hover:bg-blue-50 hover:text-blue-600" title="Edit store"><Edit className="h-4 w-4" /></button><button onClick={() => void remove(store)} className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600" title="Delete store"><Trash2 className="h-4 w-4" /></button></div>}</td>
              </tr>)}
            </tbody>
          </table>
        </div>
      </div>

      {editOpen && selectedStore ? (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-100 bg-white p-5"><div><p className="text-xs font-black uppercase tracking-widest text-emerald-700">Approved Store</p><h2 className="mt-1 text-xl font-black text-gray-900">Edit {selectedStore.name}</h2></div><button onClick={() => setEditOpen(false)} className="rounded-xl p-2 hover:bg-gray-100"><X className="h-5 w-5" /></button></div>
            <div className="space-y-4 p-5">
              <label className="block text-sm font-black text-gray-700">Store name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className="mt-2 min-h-12 w-full rounded-xl border border-gray-200 px-4" /></label>
              <label className="block text-sm font-black text-gray-700">Address<input value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} className="mt-2 min-h-12 w-full rounded-xl border border-gray-200 px-4" /></label>
              <StoreLocationPicker apiClient={apiClient} compact coords={{ lat: form.latitude, lng: form.longitude }} onCoordsChange={(latitude, longitude) => setForm((current) => ({ ...current, latitude, longitude }))} onAddressChange={(address) => setForm((current) => ({ ...current, address: address.address || current.address }))} searchPlaceholder="Search store location..." />
              <label className="flex items-center gap-3 rounded-xl bg-gray-50 p-4 text-sm font-black text-gray-700"><input type="checkbox" checked={form.isActive} onChange={(event) => setForm({ ...form, isActive: event.target.checked })} /> Store is active</label>
              <button onClick={() => void saveEdit()} disabled={saving} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 font-black text-white disabled:opacity-50">{saving ? <Loader2 className="h-5 w-5 animate-spin" /> : <CheckCircle className="h-5 w-5" />} Save store</button>
            </div>
          </div>
        </div>
      ) : null}

      {permanentDeleteStore ? (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-start gap-4 border-b border-red-100 bg-red-50/60 p-5">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-red-100 text-red-600"><AlertTriangle className="h-6 w-6" /></div>
              <div><p className="text-xs font-black uppercase tracking-widest text-red-600">Irreversible action</p><h2 className="mt-1 text-xl font-black text-gray-900">Permanently delete {permanentDeleteStore.name}?</h2></div>
            </div>
            <div className="space-y-4 p-5">
              <p className="text-sm font-semibold leading-relaxed text-gray-600">This removes the store from the platform forever, including its inventory and assortment. It cannot be restored. If the store has orders, delivery runs, cash deposits or ledger history, the delete will be blocked to protect financial records.</p>
              <label className="block text-sm font-black text-gray-700">Type <span className="rounded bg-red-100 px-1.5 py-0.5 font-mono text-red-700">DELETE</span> to confirm<input value={permanentConfirmText} onChange={(event) => setPermanentConfirmText(event.target.value)} placeholder="DELETE" className="mt-2 min-h-12 w-full rounded-xl border border-red-200 px-4 font-mono text-sm font-black uppercase tracking-widest focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-300" /></label>
              <div className="flex gap-3">
                <button onClick={() => { setPermanentDeleteStore(null); setPermanentConfirmText(''); }} disabled={permanentDeleting} className="min-h-12 flex-1 rounded-xl border border-gray-200 bg-white px-4 font-black text-gray-700 disabled:opacity-50">Cancel</button>
                <button onClick={() => void permanentDelete()} disabled={permanentDeleting || permanentConfirmText.trim().toUpperCase() !== 'DELETE'} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-red-600 px-4 font-black text-white disabled:opacity-40">{permanentDeleting ? <Loader2 className="h-5 w-5 animate-spin" /> : <Trash2 className="h-5 w-5" />} Delete permanently</button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </DashboardLayout>
  );
}
