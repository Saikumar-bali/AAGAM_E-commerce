'use client';

import React, { useEffect, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { StoreLocationPicker } from '@/components/StoreLocationPicker';
import { apiClient } from '@aagam/utils';
import EmptyState from '@/components/customer/EmptyState';
import { Plus, MapPin, Phone, Edit2, Trash2, X, Loader2, MoreVertical, Home, Building, Navigation } from 'lucide-react';

type Address = { id: string; label?: string | null; recipientName: string; phoneE164: string; alternatePhoneE164?: string | null; line1: string; line2?: string | null; landmark?: string | null; city: string; state: string; pincode: string; country: string; latitude: number; longitude: number; instructions?: string | null; isDefault: boolean };
type AddressField = 'recipientName' | 'phoneE164' | 'alternatePhoneE164' | 'line1' | 'city' | 'state' | 'pincode' | 'location';
type AddressFieldErrors = Partial<Record<AddressField, string>>;
const ADDRESS_ICONS: Record<string, React.ElementType> = { home: Home, work: Building };

function normalizeIndianPhone(value: string) {
  const raw = value.trim().replace(/[\s()-]/g, '');
  if (/^\+91\d{10}$/.test(raw)) return raw;
  if (/^91\d{10}$/.test(raw)) return `+${raw}`;
  if (/^\d{10}$/.test(raw)) return `+91${raw}`;
  return raw;
}
function cleanPincode(value: string) { return value.replace(/\D/g, '').slice(0, 6); }

export default function AddressesPage() {
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<AddressFieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({ label: 'Home', recipientName: '', phoneE164: '', alternatePhoneE164: '', line1: '', line2: '', landmark: '', city: '', state: '', pincode: '', country: 'IN', latitude: null as number | null, longitude: null as number | null, instructions: '', isDefault: false });

  const fetchAddresses = async () => { try { const res = await apiClient.get('/customer/addresses'); setAddresses(Array.isArray(res.data) ? res.data : []); } catch (e: any) { setError(e?.response?.data?.message || 'Failed to load addresses'); } finally { setLoading(false); } };
  useEffect(() => { fetchAddresses(); }, []);
  useEffect(() => { const handleClick = () => setMenuOpenId(null); if (menuOpenId) { document.addEventListener('click', handleClick); return () => document.removeEventListener('click', handleClick); } }, [menuOpenId]);
  const resetDraft = () => { setDraft({ label: 'Home', recipientName: '', phoneE164: '', alternatePhoneE164: '', line1: '', line2: '', landmark: '', city: '', state: '', pincode: '', country: 'IN', latitude: null, longitude: null, instructions: '', isDefault: false }); setFieldErrors({}); };
  const clearFieldError = (field: AddressField) => setFieldErrors((current) => ({ ...current, [field]: undefined }));
  const handleEdit = (addr: Address) => { setEditingId(addr.id); setFieldErrors({}); setDraft({ label: addr.label || 'Home', recipientName: addr.recipientName, phoneE164: addr.phoneE164, alternatePhoneE164: addr.alternatePhoneE164 || '', line1: addr.line1, line2: addr.line2 || '', landmark: addr.landmark || '', city: addr.city, state: addr.state, pincode: addr.pincode, country: addr.country, latitude: addr.latitude, longitude: addr.longitude, instructions: addr.instructions || '', isDefault: addr.isDefault }); setShowForm(true); };

  const validateDraft = () => {
    const next: AddressFieldErrors = {};
    const phoneE164 = normalizeIndianPhone(draft.phoneE164);
    const alternatePhoneE164 = draft.alternatePhoneE164 ? normalizeIndianPhone(draft.alternatePhoneE164) : '';
    const pincode = cleanPincode(draft.pincode);
    if (draft.recipientName.trim().length < 2) next.recipientName = 'Recipient name is required (at least 2 characters).';
    if (!/^\+[1-9]\d{7,14}$/.test(phoneE164)) next.phoneE164 = 'Enter a valid required phone number.';
    if (alternatePhoneE164 && !/^\+[1-9]\d{7,14}$/.test(alternatePhoneE164)) next.alternatePhoneE164 = 'Enter a valid alternate phone number or leave it blank.';
    if (draft.line1.trim().length < 3) next.line1 = 'Address Line 1 is required (at least 3 characters).';
    if (draft.city.trim().length < 2) next.city = 'City is required.';
    if (draft.state.trim().length < 2) next.state = 'State is required.';
    if (!/^\d{6}$/.test(pincode)) next.pincode = 'A valid 6 digit pincode is required.';
    if (draft.latitude === null || draft.longitude === null || !Number.isFinite(draft.latitude) || !Number.isFinite(draft.longitude)) next.location = 'Pin your delivery location using live location, search, or the map.';
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  };

  const buildPayload = () => {
    const phoneE164 = normalizeIndianPhone(draft.phoneE164);
    const alternatePhoneE164 = draft.alternatePhoneE164 ? normalizeIndianPhone(draft.alternatePhoneE164) : undefined;
    const pincode = cleanPincode(draft.pincode);
    return { label: draft.label.trim() || 'Home', recipientName: draft.recipientName.trim(), phoneE164, alternatePhoneE164, line1: draft.line1.trim(), line2: draft.line2.trim() || undefined, landmark: draft.landmark.trim() || undefined, city: draft.city.trim(), state: draft.state.trim(), pincode, country: 'IN', latitude: draft.latitude, longitude: draft.longitude, instructions: draft.instructions.trim() || undefined, isDefault: draft.isDefault || addresses.length === 0 };
  };

  const saveAddress = async () => {
    setError(null);
    if (!validateDraft()) return;
    setSaving(true);
    try {
      const payload = buildPayload();
      if (editingId) { await apiClient.patch(`/customer/addresses/${editingId}`, payload); setEditingId(null); }
      else await apiClient.post('/customer/addresses', payload);
      setShowForm(false); resetDraft(); await fetchAddresses();
    } catch (e: any) { setError(e?.response?.data?.message || e?.message || 'Failed to save address'); }
    setSaving(false);
  };
  const deleteAddress = async () => { if (!deletingId) return; try { await apiClient.delete(`/customer/addresses/${deletingId}`); setAddresses((prev) => prev.filter((a) => a.id !== deletingId)); setDeletingId(null); } catch (e: any) { setError(e?.response?.data?.message || 'Failed to delete address'); } };

  if (loading) return <DashboardLayout allowedRole="CUSTOMER"><div className="flex h-64 items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-teal-600" /></div></DashboardLayout>;

  return <DashboardLayout allowedRole="CUSTOMER"><div className="mx-auto max-w-3xl pb-24"><div className="mb-6 flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-teal-100 text-teal-700"><MapPin className="h-5 w-5" /></div><div><h1 className="text-xl font-black tracking-tight text-slate-950">Manage Addresses</h1><p className="text-xs font-semibold text-slate-500">Add, edit or delete your delivery addresses</p></div></div>{error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{error}</div>}<div className="mb-6 space-y-3">{addresses.map((addr) => { const Icon = ADDRESS_ICONS[(addr.label || '').toLowerCase()] || Navigation; return <div key={addr.id} className={`relative rounded-2xl border p-4 transition-all ${addr.isDefault ? 'border-teal-300 bg-teal-50 shadow-sm shadow-teal-100' : 'border-slate-100 bg-white hover:border-teal-200'}`}><div className="flex items-start justify-between"><div className="flex flex-1 items-start gap-3"><div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${addr.isDefault ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-500'}`}><Icon className="h-5 w-5" /></div><div className="min-w-0 flex-1"><div className="flex items-center gap-2"><span className="text-xs font-black uppercase tracking-wider text-slate-950">{addr.label || 'Address'}</span>{addr.isDefault && <span className="rounded-lg bg-teal-600 px-1.5 py-0.5 text-[10px] font-black text-white">Default</span>}</div><div className="mt-1 font-bold text-slate-900">{addr.recipientName}</div><div className="mt-1 text-sm text-slate-600">{addr.line1}{addr.line2 && `, ${addr.line2}`}{addr.landmark && `, nr ${addr.landmark}`}<br />{addr.city}, {addr.state} - {addr.pincode}</div><div className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-slate-500"><Phone className="h-3 w-3" />{addr.phoneE164}</div></div></div><div className="relative"><button onClick={(e) => { e.stopPropagation(); setMenuOpenId(menuOpenId === addr.id ? null : addr.id); }} className="rounded-xl p-2 transition-colors hover:bg-slate-100"><MoreVertical className="h-4 w-4 text-slate-400" /></button>{menuOpenId === addr.id && <div className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-xl"><button onClick={(e) => { e.stopPropagation(); handleEdit(addr); setMenuOpenId(null); }} className="flex w-full items-center gap-2 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"><Edit2 className="h-4 w-4" /> Edit</button><button onClick={(e) => { e.stopPropagation(); setDeletingId(addr.id); setMenuOpenId(null); }} className="flex w-full items-center gap-2 px-3 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /> Delete</button></div>}</div></div></div>; })}{addresses.length === 0 && !showForm && <EmptyState icon={MapPin} title="No addresses saved yet" description="Add a delivery address to start ordering." action={{ label: 'Add Address', onClick: () => { resetDraft(); setShowForm(true); } }} />}</div>{showForm && <div className="rounded-2xl border border-slate-100 bg-white p-5"><div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-black text-slate-950">{editingId ? 'Edit Address' : 'Add New Address'}</h2><button onClick={() => { setShowForm(false); setEditingId(null); resetDraft(); }} className="grid h-8 w-8 place-items-center rounded-xl transition-colors hover:bg-slate-100"><X className="h-5 w-5 text-slate-400" /></button></div><div className={`mb-4 rounded-2xl border p-3 ${fieldErrors.location ? 'border-red-300 bg-red-50/50' : 'border-teal-100 bg-teal-50/30'}`}><StoreLocationPicker apiClient={apiClient} coords={{ lat: draft.latitude, lng: draft.longitude }} onCoordsChange={(lat, lng) => { clearFieldError('location'); setDraft((d) => ({ ...d, latitude: lat, longitude: lng })); }} onAddressChange={(address) => setDraft((d) => ({ ...d, line1: d.line1 || address.address, city: d.city || address.city, state: d.state || address.state, pincode: d.pincode || cleanPincode(address.pincode || '') }))} searchPlaceholder="Search apartment, street, landmark..." />{fieldErrors.location && <p role="alert" className="mt-2 text-xs font-bold text-red-600">{fieldErrors.location}</p>}</div><div className="grid grid-cols-1 gap-4 md:grid-cols-2"><Input label="Label" value={draft.label} onChange={(v) => setDraft((d) => ({ ...d, label: v }))} placeholder="Home, Work, etc" /><Input required label="Recipient Name" value={draft.recipientName} error={fieldErrors.recipientName} onChange={(v) => { clearFieldError('recipientName'); setDraft((d) => ({ ...d, recipientName: v })); }} /><Input required label="Phone" value={draft.phoneE164} error={fieldErrors.phoneE164} onChange={(v) => { clearFieldError('phoneE164'); setDraft((d) => ({ ...d, phoneE164: v })); }} placeholder="9876543210 or +919876543210" /><Input required label="Pincode" value={draft.pincode} error={fieldErrors.pincode} onChange={(v) => { clearFieldError('pincode'); setDraft((d) => ({ ...d, pincode: cleanPincode(v) })); }} /><Input required label="City" value={draft.city} error={fieldErrors.city} onChange={(v) => { clearFieldError('city'); setDraft((d) => ({ ...d, city: v })); }} /><Input required label="State" value={draft.state} error={fieldErrors.state} onChange={(v) => { clearFieldError('state'); setDraft((d) => ({ ...d, state: v })); }} /><Input required label="Address Line 1" value={draft.line1} error={fieldErrors.line1} onChange={(v) => { clearFieldError('line1'); setDraft((d) => ({ ...d, line1: v })); }} className="md:col-span-2" /><Input label="Address Line 2" value={draft.line2} onChange={(v) => setDraft((d) => ({ ...d, line2: v }))} className="md:col-span-2" /><Input label="Landmark" value={draft.landmark} onChange={(v) => setDraft((d) => ({ ...d, landmark: v }))} /><Input label="Instructions" value={draft.instructions} onChange={(v) => setDraft((d) => ({ ...d, instructions: v }))} placeholder="Gate code, floor, etc" /></div><div className="mt-4 flex items-center gap-2"><input type="checkbox" id="isDefault" checked={draft.isDefault} onChange={(e) => setDraft((d) => ({ ...d, isDefault: e.target.checked }))} className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500" /><label htmlFor="isDefault" className="text-sm font-bold text-slate-700">Set as default address</label></div><div className="mt-5 flex gap-3"><button onClick={() => { setShowForm(false); setEditingId(null); resetDraft(); }} className="flex-1 rounded-xl bg-slate-100 px-4 py-2.5 font-black text-slate-700 transition-colors hover:bg-slate-200">Cancel</button><button onClick={saveAddress} disabled={saving} className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 font-black text-white transition-colors hover:bg-teal-800 disabled:opacity-50">{saving && <Loader2 className="h-4 w-4 animate-spin" />}{editingId ? 'Update' : 'Save'} Address</button></div></div>}{!showForm && addresses.length > 0 && <button onClick={() => { resetDraft(); setShowForm(true); }} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 py-3.5 font-black text-slate-500 transition-colors hover:border-teal-400 hover:text-teal-600"><Plus className="h-5 w-5" /> Add New Address</button>}{deletingId && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"><div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl"><div className="text-center"><div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-red-100 text-red-600"><Trash2 className="h-6 w-6" /></div><h3 className="mt-3 text-lg font-black text-slate-950">Delete Address?</h3><p className="mt-1 text-sm text-slate-500">This action cannot be undone.</p></div><div className="mt-5 flex gap-3"><button onClick={() => setDeletingId(null)} className="flex-1 rounded-xl bg-slate-100 px-4 py-2.5 font-black text-slate-700 hover:bg-slate-200">Cancel</button><button onClick={deleteAddress} className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 font-black text-white hover:bg-red-700">Delete</button></div></div></div>}</div></DashboardLayout>;
}

function Input({ label, value, onChange, placeholder, className, error, required = false }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; className?: string; error?: string; required?: boolean }) { return <div className={className}><label className={`mb-1.5 block text-xs font-black uppercase tracking-wider ${error ? 'text-red-700' : 'text-slate-700'}`}>{label}{required && <span className="ml-1 text-red-600">*</span>}</label><input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-invalid={Boolean(error)} className={`w-full rounded-xl border bg-white px-4 py-2.5 text-sm text-slate-900 transition-colors placeholder:text-slate-400 focus:outline-none focus:ring-2 ${error ? 'border-red-400 bg-red-50/40 focus:border-red-500 focus:ring-red-200' : 'border-slate-200 focus:border-teal-500 focus:ring-teal-500'}`} />{error && <p role="alert" className="mt-1.5 text-xs font-bold text-red-600">{error}</p>}</div>; }
