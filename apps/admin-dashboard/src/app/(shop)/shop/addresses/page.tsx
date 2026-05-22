'use client';

import React, { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { StoreLocationPicker } from '@/components/StoreLocationPicker';
import { apiClient } from '@aagam/utils';
import { 
  Plus, 
  MapPin, 
  Phone, 
  Edit2, 
  Trash2, 
  X, 
  Loader2, 
  MoreVertical,
  CheckCircle2
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
    label: 'Home',
    recipientName: '',
    phoneE164: '',
    alternatePhoneE164: '',
    line1: '',
    line2: '',
    landmark: '',
    city: '',
    state: '',
    pincode: '',
    country: 'IN',
    latitude: null as number | null,
    longitude: null as number | null,
    instructions: '',
    isDefault: false,
  });

  const fetchAddresses = async () => {
    try {
      const res = await apiClient.get('/customer/addresses');
      setAddresses(Array.isArray(res.data) ? res.data : []);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load addresses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAddresses();
  }, []);

  useEffect(() => {
    const handleClick = () => setMenuOpenId(null);
    if (menuOpenId) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [menuOpenId]);

  const resetDraft = () => {
    setDraft({
      label: 'Home',
      recipientName: '',
      phoneE164: '',
      alternatePhoneE164: '',
      line1: '',
      line2: '',
      landmark: '',
      city: '',
      state: '',
      pincode: '',
      country: 'IN',
      latitude: null as number | null,
      longitude: null as number | null,
      instructions: '',
      isDefault: false,
    });
  };

  const handleEdit = (addr: Address) => {
    setEditingId(addr.id);
    setDraft({
      label: addr.label || 'Home',
      recipientName: addr.recipientName,
      phoneE164: addr.phoneE164,
      alternatePhoneE164: addr.alternatePhoneE164 || '',
      line1: addr.line1,
      line2: addr.line2 || '',
      landmark: addr.landmark || '',
      city: addr.city,
      state: addr.state,
      pincode: addr.pincode,
      country: addr.country,
      latitude: addr.latitude,
      longitude: addr.longitude,
      instructions: addr.instructions || '',
      isDefault: addr.isDefault,
    });
    setShowForm(true);
  };

  const saveAddress = async () => {
    if (!draft.latitude || !draft.longitude) {
      setError('Please pin your address using live location, search, or the map');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (editingId) {
        await apiClient.patch(`/customer/addresses/${editingId}`, {
          label: draft.label,
          recipientName: draft.recipientName,
          phoneE164: draft.phoneE164,
          alternatePhoneE164: draft.alternatePhoneE164 || undefined,
          line1: draft.line1,
          line2: draft.line2 || undefined,
          landmark: draft.landmark || undefined,
          city: draft.city,
          state: draft.state,
          pincode: draft.pincode,
          country: draft.country,
          latitude: draft.latitude,
          longitude: draft.longitude,
          instructions: draft.instructions || undefined,
          isDefault: draft.isDefault,
        });
      } else {
        await apiClient.post('/customer/addresses', {
          label: draft.label,
          recipientName: draft.recipientName,
          phoneE164: draft.phoneE164,
          alternatePhoneE164: draft.alternatePhoneE164 || undefined,
          line1: draft.line1,
          line2: draft.line2 || undefined,
          landmark: draft.landmark || undefined,
          city: draft.city,
          state: draft.state,
          pincode: draft.pincode,
          country: draft.country,
          latitude: draft.latitude,
          longitude: draft.longitude,
          instructions: draft.instructions || undefined,
          isDefault: draft.isDefault || addresses.length === 0,
        });
      }
      await fetchAddresses();
      setShowForm(false);
      setEditingId(null);
      resetDraft();
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to save address');
    } finally {
      setSaving(false);
    }
  };

  const deleteAddress = async () => {
    if (!deletingId) return;
    try {
      await apiClient.delete(`/customer/addresses/${deletingId}`);
      const remaining = addresses.filter((a) => a.id !== deletingId);
      setAddresses(remaining);
      setDeletingId(null);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to delete address');
    }
  };

  if (loading) {
    return (
      <DashboardLayout allowedRole="CUSTOMER">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout allowedRole="CUSTOMER">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Manage Addresses</h1>
          <p className="text-gray-600">Add, edit or delete your delivery addresses</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>
        )}

        {/* Address List */}
        <div className="space-y-3 mb-6">
          {addresses.map((addr) => (
            <div
              key={addr.id}
              className={`relative rounded-2xl border p-4 transition-colors ${
                addr.isDefault ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 bg-white'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-emerald-700 uppercase">
                      {addr.label || 'Address'} {addr.isDefault && <CheckCircle2 className="inline h-3 w-3" />}
                    </span>
                  </div>
                  <div className="mt-1 font-medium text-gray-900">{addr.recipientName}</div>
                  <div className="mt-1 text-sm text-gray-600">
                    {addr.line1}
                    {addr.line2 && `, ${addr.line2}`}
                    {addr.landmark && `, nr ${addr.landmark}`}
                    <br />
                    {addr.city}, {addr.state} - {addr.pincode}
                  </div>
                  <div className="mt-2 flex items-center gap-2 text-sm text-gray-500">
                    <Phone className="h-4 w-4" />
                    {addr.phoneE164}
                  </div>
                </div>

                <div className="relative">
                  <button
                    onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === addr.id ? null : addr.id); }}
                    className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <MoreVertical className="h-5 w-5 text-gray-500" />
                  </button>
                  {menuOpenId === addr.id && (
                    <div className="absolute right-0 top-full mt-1 w-36 bg-white rounded-xl shadow-xl border border-gray-200 z-20 overflow-hidden">
                      <button
                        onClick={(e) => { e.stopPropagation(); handleEdit(addr); setMenuOpenId(null); }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
                      >
                        <Edit2 className="h-4 w-4" /> Edit
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeletingId(addr.id); setMenuOpenId(null); }}
                        className="w-full flex items-center gap-2 px-3 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" /> Delete
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}

          {addresses.length === 0 && !showForm && (
            <div className="text-center py-8 text-gray-500">
              <MapPin className="h-8 w-8 mx-auto mb-2 text-gray-300" />
              <p>No addresses saved yet</p>
            </div>
          )}
        </div>

        {/* Add/Edit Form */}
        {showForm && (
          <div className="rounded-2xl border border-gray-200 bg-white p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-900">
                {editingId ? 'Edit Address' : 'Add New Address'}
              </h2>
              <button
                onClick={() => { setShowForm(false); setEditingId(null); resetDraft(); }}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>

            <div className="mb-4 rounded-2xl border border-emerald-100 bg-emerald-50/40 p-3">
              <StoreLocationPicker
                apiClient={apiClient}
                coords={{ lat: draft.latitude, lng: draft.longitude }}
                onCoordsChange={(lat, lng) => setDraft((d) => ({ ...d, latitude: lat, longitude: lng }))}
                onAddressChange={(address) => setDraft((d) => ({
                  ...d,
                  line1: d.line1 || address.address,
                  city: d.city || address.city,
                  state: d.state || address.state,
                  pincode: d.pincode || address.pincode,
                }))}
                searchPlaceholder="Search apartment, street, landmark, or area..."
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Label"
                value={draft.label}
                onChange={(v) => setDraft((d) => ({ ...d, label: v }))}
                placeholder="Home, Work, etc"
              />
              <Input
                label="Recipient Name"
                value={draft.recipientName}
                onChange={(v) => setDraft((d) => ({ ...d, recipientName: v }))}
              />
              <Input
                label="Phone"
                value={draft.phoneE164}
                onChange={(v) => setDraft((d) => ({ ...d, phoneE164: v }))}
                placeholder="+91XXXXXXXXXX"
              />
              <Input
                label="Alternate Phone"
                value={draft.alternatePhoneE164}
                onChange={(v) => setDraft((d) => ({ ...d, alternatePhoneE164: v }))}
                placeholder="Optional"
              />
              <Input
                label="Pincode"
                value={draft.pincode}
                onChange={(v) => setDraft((d) => ({ ...d, pincode: v }))}
              />
              <Input
                label="City"
                value={draft.city}
                onChange={(v) => setDraft((d) => ({ ...d, city: v }))}
              />
              <Input
                label="State"
                value={draft.state}
                onChange={(v) => setDraft((d) => ({ ...d, state: v }))}
              />
              <Input
                label="Address Line 1"
                value={draft.line1}
                onChange={(v) => setDraft((d) => ({ ...d, line1: v }))}
                className="md:col-span-2"
              />
              <Input
                label="Address Line 2"
                value={draft.line2}
                onChange={(v) => setDraft((d) => ({ ...d, line2: v }))}
                className="md:col-span-2"
              />
              <Input
                label="Landmark"
                value={draft.landmark}
                onChange={(v) => setDraft((d) => ({ ...d, landmark: v }))}
              />
              <Input
                label="Instructions"
                value={draft.instructions}
                onChange={(v) => setDraft((d) => ({ ...d, instructions: v }))}
                placeholder="Gate code, floor, etc"
              />
            </div>

            <div className="mt-4 flex items-center gap-2">
              <input
                type="checkbox"
                id="isDefault"
                checked={draft.isDefault}
                onChange={(e) => setDraft((d) => ({ ...d, isDefault: e.target.checked }))}
                className="h-5 w-5 rounded border-gray-300 text-emerald-600 focus:ring-emerald-500"
              />
              <label htmlFor="isDefault" className="text-sm font-medium text-gray-700">
                Set as default address
              </label>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={() => { setShowForm(false); setEditingId(null); resetDraft(); }}
                className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={saveAddress}
                disabled={saving || !draft.latitude}
                className="flex-1 px-4 py-2.5 bg-emerald-600 text-white font-medium rounded-xl hover:bg-emerald-700 disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {saving && <Loader2 className="h-5 w-5 animate-spin" />}
                {editingId ? 'Update' : 'Save'} Address
              </button>
            </div>
          </div>
        )}

        {!showForm && (
          <button
            onClick={() => { resetDraft(); setShowForm(true); }}
            className="flex items-center justify-center gap-2 w-full py-3 border-2 border-dashed border-gray-300 rounded-xl text-gray-600 font-medium hover:border-emerald-400 hover:text-emerald-600 transition-colors"
          >
            <Plus className="h-5 w-5" />
            Add New Address
          </button>
        )}

        {/* Delete Modal */}
        {deletingId && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl max-w-sm w-full shadow-2xl p-6">
              <div className="text-center">
                <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
                  <Trash2 className="h-6 w-6 text-red-600" />
                </div>
                <h3 className="text-lg font-bold text-gray-900">Delete Address?</h3>
                <p className="mt-2 text-sm text-gray-600">
                  This action cannot be undone.
                </p>
              </div>
              <div className="mt-6 flex gap-3">
                <button
                  onClick={() => setDeletingId(null)}
                  className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 font-medium rounded-xl hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  onClick={deleteAddress}
                  className="flex-1 px-4 py-2.5 bg-red-600 text-white font-medium rounded-xl hover:bg-red-700"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function Input({
  label,
  value,
  onChange,
  placeholder,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
      />
    </div>
  );
}
