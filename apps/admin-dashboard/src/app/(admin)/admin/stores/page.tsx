'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import DashboardLayout from '@/components/DashboardLayout';
import { apiClient } from '@aagam/utils';
import {
  AlertTriangle,
  CheckCircle,
  Edit,
  Eye,
  Loader2,
  MapPin,
  Package,
  Plus,
  Search,
  Store as StoreIcon,
  Trash2,
  TrendingUp,
  User,
  X,
  XCircle,
} from 'lucide-react';

const StoreLocationPicker = dynamic(
  () => import('@/components/StoreLocationPicker').then((m) => m.StoreLocationPicker),
  {
    ssr: false,
    loading: () => (
      <div className="h-56 bg-gray-50 rounded-xl border border-gray-200 animate-pulse flex items-center justify-center">
        <span className="text-xs text-gray-400">Loading map...</span>
      </div>
    ),
  }
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
  owner?: { name: string | null; email: string | null; phone: string | null };
  inventory?: { id: string; quantity: number; product: { name: string; price: number } }[];
}

type StoreFormData = {
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  ownerEmail: string;
  isActive: boolean;
};

const emptyForm = (): StoreFormData => ({ name: '', address: '', latitude: null, longitude: null, ownerEmail: '', isActive: true });

export default function AdminStoresPage() {
  const [stores, setStores] = useState<StoreRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedStore, setSelectedStore] = useState<StoreRecord | null>(null);
  const [formData, setFormData] = useState<StoreFormData>(emptyForm());
  const [error, setError] = useState('');

  const fetchStores = async () => {
    try {
      const response = await apiClient.get('/stores');
      setStores(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      console.error('Failed to fetch stores', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchStores(); }, []);

  const filteredStores = stores.filter((store) =>
    store.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    store.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
    store.owner?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    store.owner?.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const activeStores = stores.filter((s) => s.isActive).length;
  const totalInventory = stores.reduce((acc, s) => acc + (s.inventory?.reduce((a, i) => a + i.quantity, 0) || 0), 0);
  const stats = [
    { label: 'Total Stores', value: stores.length, icon: StoreIcon, color: 'bg-blue-500' },
    { label: 'Active Stores', value: activeStores, icon: CheckCircle, color: 'bg-emerald-500' },
    { label: 'Total Inventory', value: totalInventory, icon: Package, color: 'bg-purple-500' },
    { label: 'New This Month', value: stores.filter((s) => new Date(s.createdAt) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).length, icon: TrendingUp, color: 'bg-amber-500' },
  ];

  const resetForm = () => {
    setFormData(emptyForm());
    setError('');
  };

  const handleEdit = (store: StoreRecord) => {
    setSelectedStore(store);
    setFormData({
      name: store.name,
      address: store.address,
      latitude: Number(store.latitude),
      longitude: Number(store.longitude),
      ownerEmail: store.owner?.email || '',
      isActive: store.isActive,
    });
    setError('');
    setShowEditModal(true);
  };

  const handleView = async (store: StoreRecord) => {
    try {
      setLoading(true);
      const res = await apiClient.get(`/stores/${store.id}`);
      setSelectedStore(res.data);
      setShowViewModal(true);
    } catch (err) {
      console.error('Failed to fetch store details', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = (store: StoreRecord) => {
    setSelectedStore(store);
    setShowDeleteModal(true);
  };

  const validateLocation = () => {
    if (formData.latitude == null || formData.longitude == null) {
      setError('Please pick a store location on the map first.');
      return false;
    }
    return true;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!validateLocation()) return;
    setSubmitting(true);
    setError('');
    try {
      await apiClient.post('/stores', {
        name: formData.name.trim(),
        address: formData.address.trim(),
        latitude: formData.latitude,
        longitude: formData.longitude,
        ownerEmail: formData.ownerEmail.trim(),
      });
      setShowModal(false);
      resetForm();
      await fetchStores();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create store');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedStore || !validateLocation()) return;
    setSubmitting(true);
    setError('');
    try {
      await apiClient.patch(`/stores/${selectedStore.id}`, {
        name: formData.name.trim(),
        address: formData.address.trim(),
        latitude: formData.latitude,
        longitude: formData.longitude,
        isActive: formData.isActive,
      });
      setShowEditModal(false);
      setSelectedStore(null);
      resetForm();
      await fetchStores();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update store');
    } finally {
      setSubmitting(false);
    }
  };

  const confirmDelete = async () => {
    if (!selectedStore) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/stores/${selectedStore.id}`);
      setShowDeleteModal(false);
      setSelectedStore(null);
      await fetchStores();
    } catch (err) {
      console.error('Failed to delete store', err);
    } finally {
      setDeleting(false);
    }
  };

  const toggleStatus = async (store: StoreRecord) => {
    try {
      await apiClient.patch(`/stores/${store.id}`, { isActive: !store.isActive });
      await fetchStores();
    } catch (err) {
      console.error('Failed to toggle status', err);
    }
  };

  return (
    <DashboardLayout allowedRole="ADMIN">
      <div className="mb-8">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="inline-flex rounded-full bg-teal-50 px-3 py-1 text-xs font-black uppercase tracking-[0.2em] text-teal-700">Aagam Commerce Operations</p>
            <h1 className="mt-3 text-2xl font-bold text-gray-900">Store Management</h1>
            <p className="text-gray-500">View and manage all stores in your network.</p>
          </div>
          <button
            onClick={() => { resetForm(); setShowModal(true); }}
            className="flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 font-bold text-white shadow-lg shadow-emerald-900/10 transition-all hover:bg-emerald-700"
          >
            <Plus className="mr-2 h-5 w-5" />
            Add New Store
          </button>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-500">{stat.label}</p>
                  <p className="mt-1 text-2xl font-bold text-gray-900">{stat.value}</p>
                </div>
                <div className={`rounded-xl p-3 ${stat.color}`}>
                  <stat.icon className="h-6 w-6 text-white" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-50 bg-gray-50/50 p-4">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search stores..."
              className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm transition-all focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-500"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50/50">
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Store</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Location</th>
                <th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Owner</th>
                <th className="px-6 py-4 text-center text-xs font-bold uppercase tracking-wider text-gray-500">Status</th>
                <th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wider text-gray-500">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading && stores.length === 0 ? (
                [1, 2, 3].map((i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-4"><div className="h-12 w-48 rounded bg-gray-100" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-56 rounded bg-gray-100" /></td>
                    <td className="px-6 py-4"><div className="h-4 w-32 rounded bg-gray-100" /></td>
                    <td className="px-6 py-4"><div className="mx-auto h-6 w-20 rounded bg-gray-100" /></td>
                    <td className="px-6 py-4"><div className="ml-auto h-4 w-24 rounded bg-gray-100" /></td>
                  </tr>
                ))
              ) : filteredStores.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-16 text-center">
                    <StoreIcon className="mx-auto mb-3 h-12 w-12 text-gray-300" />
                    <p className="font-medium text-gray-500">No stores found</p>
                  </td>
                </tr>
              ) : (
                filteredStores.map((store) => (
                  <tr key={store.id} className="group transition-colors hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className={`mr-4 flex h-12 w-12 items-center justify-center rounded-xl text-white shadow-lg ${store.isActive ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-emerald-200' : 'bg-gray-400 shadow-gray-200'}`}>
                          <StoreIcon className="h-6 w-6" />
                        </div>
                        <div>
                          <p className="text-sm font-bold text-gray-900">{store.name}</p>
                          <p className="text-xs text-gray-500">ID: {store.id.substring(0, 8)}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex max-w-xs items-center text-sm text-gray-600">
                        <MapPin className="mr-2 h-4 w-4 flex-shrink-0 text-gray-400" />
                        <span className="truncate">{store.address}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="mr-3 flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-gray-600">
                          <User className="h-4 w-4" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-gray-900">{store.owner?.name || 'Unknown'}</p>
                          <p className="text-xs text-gray-500">{store.owner?.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <button
                        onClick={() => toggleStatus(store)}
                        className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-bold transition-all ${store.isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100' : 'border-gray-200 bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                      >
                        {store.isActive ? <><CheckCircle className="mr-1.5 h-3 w-3" /> Active</> : <><XCircle className="mr-1.5 h-3 w-3" /> Inactive</>}
                      </button>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex justify-end space-x-1.5">
                        <button onClick={() => handleView(store)} className="rounded-lg p-2 text-gray-400 opacity-0 transition-all hover:bg-blue-50 hover:text-blue-600 group-hover:opacity-100"><Eye className="h-4 w-4" /></button>
                        <button onClick={() => handleEdit(store)} className="rounded-lg p-2 text-gray-400 opacity-0 transition-all hover:bg-emerald-50 hover:text-emerald-600 group-hover:opacity-100"><Edit className="h-4 w-4" /></button>
                        <button onClick={() => handleDelete(store)} className="rounded-lg p-2 text-gray-400 opacity-0 transition-all hover:bg-red-50 hover:text-red-600 group-hover:opacity-100"><Trash2 className="h-4 w-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <StoreFormModal
          title="Add New Store"
          formData={formData}
          setFormData={setFormData}
          error={error}
          submitting={submitting}
          submitLabel="Create Store"
          onClose={() => setShowModal(false)}
          onSubmit={handleSubmit}
          showOwnerEmail={true}
        />
      )}

      {showEditModal && (
        <StoreFormModal
          title="Edit Store"
          formData={formData}
          setFormData={setFormData}
          error={error}
          submitting={submitting}
          submitLabel="Save Changes"
          onClose={() => setShowEditModal(false)}
          onSubmit={handleUpdate}
          showOwnerEmail={false}
          showActiveToggle={true}
        />
      )}

      {showViewModal && selectedStore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="relative h-32 bg-gradient-to-r from-emerald-500 to-teal-600">
              <button onClick={() => setShowViewModal(false)} className="absolute right-4 top-4 rounded-lg bg-black/20 p-2 text-white transition-all hover:bg-black/30"><X className="h-5 w-5" /></button>
              <div className="absolute -bottom-10 left-8">
                <div className="h-20 w-20 rounded-2xl bg-white p-1 shadow-xl">
                  <div className="flex h-full w-full items-center justify-center rounded-xl bg-emerald-50 text-emerald-600"><StoreIcon className="h-10 w-10" /></div>
                </div>
              </div>
            </div>
            <div className="px-8 pb-8 pt-14">
              <div className="mb-6 flex items-start justify-between">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900">{selectedStore.name}</h3>
                  <div className="mt-1 flex items-center text-sm text-gray-500"><MapPin className="mr-1.5 h-4 w-4" /> {selectedStore.address}</div>
                </div>
                <span className={`rounded-full border px-3 py-1 text-xs font-bold ${selectedStore.isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-gray-200 bg-gray-100 text-gray-600'}`}>{selectedStore.isActive ? 'ACTIVE' : 'INACTIVE'}</span>
              </div>
              <div className="mb-8 grid grid-cols-2 gap-4">
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4"><p className="mb-1 text-xs font-medium uppercase tracking-wider text-gray-500">Store Owner</p><p className="text-sm font-bold text-gray-900">{selectedStore.owner?.name}</p><p className="mt-0.5 text-xs text-gray-500">{selectedStore.owner?.email}</p></div>
                <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4"><p className="mb-1 text-xs font-medium uppercase tracking-wider text-gray-500">Location</p><p className="text-sm font-bold text-gray-900">{selectedStore.latitude}, {selectedStore.longitude}</p><p className="mt-0.5 text-xs text-gray-500">GPS Coordinates</p></div>
              </div>
              <h4 className="mb-4 flex items-center text-sm font-bold text-gray-900"><Package className="mr-2 h-4 w-4 text-purple-500" /> Current Inventory</h4>
              <div className="max-h-48 space-y-2 overflow-y-auto pr-2">
                {selectedStore.inventory?.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 py-8 text-center"><p className="text-sm text-gray-500">No products in inventory</p></div>
                ) : (
                  selectedStore.inventory?.map((item) => (
                    <div key={item.id} className="flex items-center justify-between rounded-xl border border-gray-100 bg-white p-3"><div><p className="text-sm font-bold text-gray-900">{item.product.name}</p><p className="text-xs text-gray-500">₹{item.product.price.toFixed(2)}</p></div><span className="rounded-lg bg-purple-50 px-2.5 py-1 text-xs font-bold text-purple-700">{item.quantity} units</span></div>
                  ))
                )}
              </div>
            </div>
            <div className="flex gap-3 border-t border-gray-100 bg-gray-50 px-8 py-4">
              <button onClick={() => setShowViewModal(false)} className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-2.5 font-bold text-gray-700 hover:bg-gray-50">Close</button>
              <button onClick={() => { setShowViewModal(false); handleEdit(selectedStore); }} className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 font-bold text-white hover:bg-emerald-700">Edit Store</button>
            </div>
          </div>
        </div>
      )}

      {showDeleteModal && selectedStore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100"><AlertTriangle className="h-8 w-8 text-red-600" /></div>
            <h2 className="mb-2 text-center text-xl font-bold text-gray-900">Delete Store?</h2>
            <p className="mb-6 text-center text-gray-500">Are you sure you want to delete <span className="font-bold text-gray-900">{selectedStore.name}</span>? This will also remove all its inventory records.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowDeleteModal(false)} className="flex-1 rounded-xl bg-gray-100 px-4 py-2.5 font-bold text-gray-700 hover:bg-gray-200">No, Keep</button>
              <button onClick={confirmDelete} disabled={deleting} className="flex flex-1 items-center justify-center rounded-xl bg-red-600 px-4 py-2.5 font-bold text-white hover:bg-red-700 disabled:opacity-50">{deleting ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Yes, Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}

function StoreFormModal({
  title,
  formData,
  setFormData,
  error,
  submitting,
  submitLabel,
  onClose,
  onSubmit,
  showOwnerEmail,
  showActiveToggle = false,
}: {
  title: string;
  formData: StoreFormData;
  setFormData: React.Dispatch<React.SetStateAction<StoreFormData>>;
  error: string;
  submitting: boolean;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
  showOwnerEmail: boolean;
  showActiveToggle?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="max-h-[92vh] w-full max-w-5xl overflow-y-auto rounded-2xl bg-white shadow-2xl animate-in fade-in zoom-in duration-200">
        <div className="flex items-center justify-between border-b border-gray-100 p-5">
          <h2 className="text-xl font-bold text-gray-900">{title}</h2>
          <button onClick={onClose} className="rounded-lg p-2 hover:bg-gray-100"><X className="h-5 w-5 text-gray-500" /></button>
        </div>
        <form onSubmit={onSubmit} className="p-5">
          {error && <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          <div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]">
            <div className="space-y-4">
              <TextInput label="Store Name" required placeholder="Enter store name" value={formData.name} onChange={(value) => setFormData((prev) => ({ ...prev, name: value }))} />
              <TextInput label="Address" required placeholder="Enter full address" value={formData.address} onChange={(value) => setFormData((prev) => ({ ...prev, address: value }))} />
              {showOwnerEmail && <TextInput label="Owner Email" required type="email" placeholder="owner@email.com" value={formData.ownerEmail} onChange={(value) => setFormData((prev) => ({ ...prev, ownerEmail: value }))} />}
              {showActiveToggle && (
                <label className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-700">
                  <input type="checkbox" className="h-5 w-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500" checked={formData.isActive} onChange={(e) => setFormData((prev) => ({ ...prev, isActive: e.target.checked }))} />
                  Store is Active
                </label>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">Store Location</label>
              <StoreLocationPicker
                compact
                coords={{ lat: formData.latitude, lng: formData.longitude }}
                onCoordsChange={(lat, lng) => setFormData((prev) => ({ ...prev, latitude: lat, longitude: lng }))}
                onAddressChange={(addr) => setFormData((prev) => ({ ...prev, address: prev.address || addr.address }))}
                apiClient={apiClient}
              />
            </div>
          </div>
          <div className="mt-6 flex gap-3 border-t border-gray-100 pt-5">
            <button type="button" onClick={onClose} className="flex-1 rounded-xl bg-gray-100 px-4 py-2.5 font-bold text-gray-700 transition-all hover:bg-gray-200">Cancel</button>
            <button type="submit" disabled={submitting} className="flex flex-1 items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 font-bold text-white transition-all hover:bg-emerald-700 disabled:opacity-50">{submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : submitLabel}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TextInput({ label, value, onChange, required = false, type = 'text', placeholder = '' }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string; placeholder?: string }) {
  return (
    <label className="block text-sm font-medium text-gray-700">
      {label}
      <input
        type={type}
        required={required}
        className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-4 py-2.5 text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}
