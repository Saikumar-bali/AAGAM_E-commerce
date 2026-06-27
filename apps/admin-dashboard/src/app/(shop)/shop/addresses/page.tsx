'use client';

import React, { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { StoreLocationPicker } from '@/components/StoreLocationPicker';
import { apiClient } from '@aagam/utils';
import EmptyState from '@/components/customer/EmptyState';
import {
  Plus, MapPin, Phone, Edit2, Trash2, X, Loader2, MoreVertical,
  CheckCircle2, Home, Building, Navigation, ArrowLeft,
} from 'lucide-react';

type Address = {
  id: string;
  label?: string | null;
  recipientName: string;
  phoneE164: string;
  alternatePhoneE164?: string | null;
  line1: string;
  line2?: string | null;
  landmark?: string | null;
  city: string;
  state: string;
  pincode: string;
  country: string;
  latitude: number;
  longitude: number;
  instructions?: string | null;
  isDefault: boolean;
};

const ADDRESS_ICONS: Record<string, React.ElementType> = {
  home: Home,
  work: Building,
};

export default function AddressesPage() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [draft, setDraft] = useState({
    label: 'Home', recipientName: '', phoneE164: '', alternatePhoneE164: '',
    line1: '', line2: '', landmark: '', city: '', state: '', pincode: '',
    country: 'IN', latitude: null as number | null, longitude: null as number | null,
    instructions: '', isDefault: false,
  });

  const fetchAddresses = async () => {
    try { const res = await apiClient.get('/customer/addresses'); setAddresses(Array.isArray(res.data) ? res.data : []); }
    catch (e: any) { setError(e?.response?.data?.message || 'Failed to load addresses'); }
    finally { setLoading(false); }
  };

  useEffect(() => { fetchAddresses(); }, []);

  useEffect(() => {
    const handleClick = () => setMenuOpenId(null);
    if (menuOpenId) { document.addEventListener('click', handleClick); return () => document.removeEventListener('click', handleClick); }
  }, [menuOpenId]);

  const resetDraft = () => {
    setDraft({ label: 'Home', recipientName: '', phoneE164: '', alternatePhoneE164: '', line1: '', line2: '', landmark: '', city: '', state: '', pincode: '', country: 'IN', latitude: null, longitude: null, instructions: '', isDefault: false });
  };

  const handleEdit = (addr: Address) => {
    setEditingId(addr.id);
    setDraft({ label: addr.label || 'Home', recipientName: addr.recipientName, phoneE164: addr.phoneE164, alternatePhoneE164: addr.alternatePhoneE164 || '', line1: addr.line1, line2: addr.line2 || '', landmark: addr.landmark || '', city: addr.city, state: addr.state, pincode: addr.pincode, country: addr.country, latitude: addr.latitude, longitude: addr.longitude, instructions: addr.instructions || '', isDefault: addr.isDefault });
    setShowForm(true);
  };

  const saveAddress = async () => {
    if (!draft.latitude || !draft.longitude) { setError('Please pin your address using live location, search, or the map.'); return; }
    setSaving(true); setError(null);
    try {
      if (editingId) {
        await apiClient.patch(`/customer/addresses/${editingId}`, { label: draft.label, recipientName: draft.recipientName, phoneE164: draft.phoneE164, alternatePhoneE164: draft.alternatePhoneE164 || undefined, line1: draft.line1, line2: draft.line2 || undefined, landmark: draft.landmark || undefined, city: draft.city, state: draft.state, pincode: draft.pincode, country: draft.country, latitude: draft.latitude, longitude: draft.longitude, instructions: draft.instructions || undefined, isDefault: draft.isDefault });
      setEditingId(null);
      setShowForm(false);
      resetDraft();
      await fetchAddresses();
    } else {
      await apiClient.post('/customer/addresses', { label: draft.label, recipientName: draft.recipientName, phoneE164: draft.phoneE164, alternatePhoneE164: draft.alternatePhoneE164 || undefined, line1: draft.line1, line2: draft.line2 || undefined, landmark: draft.landmark || undefined, city: draft.city, state: draft.state, pincode: draft.pincode, country: draft.country, latitude: draft.latitude, longitude: draft.longitude, instructions: draft.instructions || undefined, isDefault: draft.isDefault || addresses.length === 0 });
      setShowForm(false);
      resetDraft();
      await fetchAddresses();
    }
  } catch (e: any) { setError(e?.response?.data?.message || 'Failed to save address'); }
    setSaving(false);
  };

  const deleteAddress = async () => {
    if (!deletingId) return;
    try { await apiClient.delete(`/customer/addresses/${deletingId}`); setAddresses((prev) => prev.filter((a) => a.id !== deletingId)); setDeletingId(null); }
    catch (e: any) { setError(e?.response?.data?.message || 'Failed to delete address'); }
  };

  if (loading) {
    return (
      <DashboardLayout allowedRole="CUSTOMER">
        <div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin text-teal-600" /></div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout allowedRole="CUSTOMER">
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-teal-100 text-teal-700"><MapPin className="h-5 w-5" /></div>
          <div>
            <h1 className="text-xl font-black text-slate-950 tracking-tight">Manage Addresses</h1>
            <p className="text-xs font-semibold text-slate-500">Add, edit or delete your delivery addresses</p>
          </div>
        </div>

        {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{error}</div>}

        <div className="space-y-3 mb-6">
          {addresses.map((addr) => {
            const Icon = ADDRESS_ICONS[(addr.label || '').toLowerCase()] || Navigation;
            return (
              <div key={addr.id} className={`relative rounded-2xl border p-4 transition-all ${
                addr.isDefault ? 'border-teal-300 bg-teal-50 shadow-sm shadow-teal-100' : 'border-slate-100 bg-white hover:border-teal-200'
              }`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${addr.isDefault ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-500'}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-slate-950 uppercase tracking-wider">{addr.label || 'Address'}</span>
                        {addr.isDefault && <span className="rounded-lg bg-teal-600 px-1.5 py-0.5 text-[10px] font-black text-white">Default</span>}
                      </div>
                      <div className="mt-1 font-bold text-slate-900">{addr.recipientName}</div>
                      <div className="mt-1 text-sm text-slate-600">
                        {addr.line1}{addr.line2 && `, ${addr.line2}`}{addr.landmark && `, nr ${addr.landmark}`}
                        <br />{addr.city}, {addr.state} - {addr.pincode}
                      </div>
                      <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-slate-500">
                        <Phone className="h-3 w-3" />{addr.phoneE164}
                      </div>
                    </div>
                  </div>

                  <div className="relative">
                    <button onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === addr.id ? null : addr.id); }} className="p-2 rounded-xl hover:bg-slate-100 transition-colors">
                      <MoreVertical className="h-4 w-4 text-slate-400" />
                    </button>
                    {menuOpenId === addr.id && (
                      <div className="absolute right-0 top-full mt-1 w-36 bg-white rounded-xl shadow-xl border border-slate-100 z-20 overflow-hidden">
                        <button onClick={(e) => { e.stopPropagation(); handleEdit(addr); setMenuOpenId(null); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Edit2 className="h-4 w-4" /> Edit</button>
                        <button onClick={(e) => { e.stopPropagation(); setDeletingId(addr.id); setMenuOpenId(null); }} className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /> Delete</button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {addresses.length === 0 && !showForm && (
            <EmptyState icon={MapPin} title="No addresses saved yet" description="Add a delivery address to start ordering." action={{ label: 'Add Address', onClick: () => { resetDraft(); setShowForm(true); } }} />
          )}
        </div>

        {showForm && (
          <div className="rounded-2xl border border-slate-100 bg-white p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-black text-slate-950">{editingId ? 'Edit Address' : 'Add New Address'}</h2>
              <button onClick={() => { setShowForm(false); setEditingId(null); resetDraft(); }} className="grid h-8 w-8 place-items-center rounded-xl hover:bg-slate-100 transition-colors"><X className="h-5 w-5 text-slate-400" /></button>
            </div>
            <div className="mb-4 rounded-2xl border border-teal-100 bg-teal-50/30 p-3">
              <StoreLocationPicker apiClient={apiClient} coords={{ lat: draft.latitude, lng: draft.longitude }} onCoordsChange={(lat, lng) => setDraft((d) => ({ ...d, latitude: lat, longitude: lng }))} onAddressChange={(address) => setDraft((d) => ({ ...d, line1: d.line1 || address.address, city: d.city || address.city, state: d.state || address.state, pincode: d.pincode || address.pincode }))} searchPlaceholder="Search apartment, street, landmark..." />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input label="Label" value={draft.label} onChange={(v) => setDraft((d) => ({ ...d, label: v }))} placeholder="Home, Work, etc" />
              <Input label="Recipient Name" value={draft.recipientName} onChange={(v) => setDraft((d) => ({ ...d, recipientName: v }))} />
              <Input label="Phone" value={draft.phoneE164} onChange={(v) => setDraft((d) => ({ ...d, phoneE164: v }))} placeholder="+91XXXXXXXXXX" />
              <Input label="Pincode" value={draft.pincode} onChange={(v) => setDraft((d) => ({ ...d, pincode: v }))} />
              <Input label="City" value={draft.city} onChange={(v) => setDraft((d) => ({ ...d, city: v }))} />
              <Input label="State" value={draft.state} onChange={(v) => setDraft((d) => ({ ...d, state: v }))} />
              <Input label="Address Line 1" value={draft.line1} onChange={(v) => setDraft((d) => ({ ...d, line1: v }))} className="md:col-span-2" />
              <Input label="Address Line 2" value={draft.line2} onChange={(v) => setDraft((d) => ({ ...d, line2: v }))} className="md:col-span-2" />
              <Input label="Landmark" value={draft.landmark} onChange={(v) => setDraft((d) => ({ ...d, landmark: v }))} />
              <Input label="Instructions" value={draft.instructions} onChange={(v) => setDraft((d) => ({ ...d, instructions: v }))} placeholder="Gate code, floor, etc" />
            </div>
            <div className="mt-4 flex items-center gap-2">
              <input type="checkbox" id="isDefault" checked={draft.isDefault} onChange={(e) => setDraft((d) => ({ ...d, isDefault: e.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
              <label htmlFor="isDefault" className="text-sm font-bold text-slate-700">Set as default address</label>
            </div>
            <div className="mt-5 flex gap-3">
              <button onClick={() => { setShowForm(false); setEditingId(null); resetDraft(); }} className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 font-black rounded-xl hover:bg-slate-200 transition-colors">Cancel</button>
              <button onClick={saveAddress} disabled={saving || !draft.latitude} className="flex-1 px-4 py-2.5 bg-teal-700 text-white font-black rounded-xl hover:bg-teal-800 disabled:opacity-50 flex items-center justify-center gap-2 transition-colors">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                {editingId ? 'Update' : 'Save'} Address
              </button>
            </div>
          </div>
        )}

        {!showForm && addresses.length > 0 && (
          <button onClick={() => { resetDraft(); setShowForm(true); }} className="flex items-center justify-center gap-2 w-full py-3.5 border-2 border-dashed border-slate-300 rounded-2xl text-slate-500 font-black hover:border-teal-400 hover:text-teal-600 transition-colors">
            <Plus className="h-5 w-5" /> Add New Address
          </button>
        )}

        {deletingId && (
          <div className="fixed inset-0 bg-slate-950/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl p-6">
              <div className="text-center">
                <div className="grid h-12 w-12 place-items-center rounded-full bg-red-100 text-red-600 mx-auto"><Trash2 className="h-6 w-6" /></div>
                <h3 className="mt-3 text-lg font-black text-slate-950">Delete Address?</h3>
                <p className="mt-1 text-sm text-slate-500">This action cannot be undone.</p>
              </div>
              <div className="mt-5 flex gap-3">
                <button onClick={() => setDeletingId(null)} className="flex-1 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-black hover:bg-slate-200">Cancel</button>
                <button onClick={deleteAddress} className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-xl font-black hover:bg-red-700">Delete</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function Input({ label, value, onChange, placeholder, className }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-xs font-black text-slate-700 uppercase tracking-wider mb-1.5">{label}</label>
      <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="w-full px-4 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 placeholder:text-slate-400 transition-colors" />
    </div>
  );
}
