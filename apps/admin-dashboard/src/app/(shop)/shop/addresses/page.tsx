'use client';

import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { apiClient } from '@aagam/utils';
import { useToast } from '@/components/ToastProvider';
import {
  Plus,
  MapPin,
  Phone,
  Pencil,
  Trash2,
  X,
  Loader2,
  MoreVertical,
  Home,
  Building,
  Navigation,
  MapPinHouse,
} from 'lucide-react';

const CustomerLocationPicker = dynamic(
  () => import('@/components/customer/CustomerLocationPicker'),
  { ssr: false },
);

/* ---------------------------------- types --------------------------------- */

type LocationSource = 'LIVE_GPS' | 'MAP_PIN' | 'GEOCODED' | 'LEGACY_UNKNOWN';

type Address = {
  id: string;
  label?: string | null;
  recipientName: string;
  phoneE164: string;
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
  locationSource?: LocationSource;
  locationAccuracyMetres?: number | null;
  locationCapturedAt?: string | null;
  localityId?: string | null;
};

type AddressDraft = {
  label: string;
  recipientName: string;
  phoneE164: string;
  line1: string;
  line2: string;
  landmark: string;
  city: string;
  state: string;
  pincode: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  locationSource: LocationSource;
  locationAccuracyMetres: number | null;
  locationCapturedAt: string | null;
  instructions: string;
  isDefault: boolean;
};

type AddressFieldErrors = Partial<
  Record<
    | 'label'
    | 'recipientName'
    | 'phoneE164'
    | 'line1'
    | 'line2'
    | 'landmark'
    | 'city'
    | 'state'
    | 'pincode'
    | 'instructions',
    string
  >
>;

/* --------------------------------- constants -------------------------------- */

const DELIVERY_TIME_ZONE = 'Asia/Kolkata';
const DEFAULT_MAP_CENTER = { latitude: 17.6916, longitude: 83.0037 };
const ADDRESS_ICONS: Record<string, React.ElementType> = { home: Home, work: Building };

const emptyDraft = (): AddressDraft => ({
  label: 'Home',
  recipientName: '',
  phoneE164: '',
  line1: '',
  line2: '',
  landmark: '',
  city: '',
  state: '',
  pincode: '',
  country: 'IN',
  latitude: null,
  longitude: null,
  locationSource: 'GEOCODED',
  locationAccuracyMetres: null,
  locationCapturedAt: null,
  instructions: '',
  isDefault: false,
});

/* --------------------------------- helpers --------------------------------- */

function locationLabel(source?: LocationSource) {
  if (source === 'LIVE_GPS') return 'GPS verified';
  if (source === 'MAP_PIN') return 'Map pinned';
  if (source === 'GEOCODED') return 'Manual address';
  return 'Legacy location';
}

function cleanPincode(value: string) {
  return value.replace(/\D/g, '').slice(0, 6);
}

/* ---------------------------------- page ----------------------------------- */

export default function AddressesPage() {
  const router = useRouter();
  const toast = useToast();

  const [addresses, setAddresses] = useState<Address[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<AddressDraft>(emptyDraft());
  const [fieldErrors, setFieldErrors] = useState<AddressFieldErrors>({});
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);
  const [defaultMapCenter, setDefaultMapCenter] = useState<{ latitude: number; longitude: number } | null>(null);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);

  /* ------------------------------- data loading ------------------------------ */

  const fetchAddresses = useCallback(async () => {
    try {
      const res = await apiClient.get('/customer/addresses');
      setAddresses(Array.isArray(res.data) ? res.data : []);
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to load addresses');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchAddresses();
  }, [fetchAddresses]);

  useEffect(() => {
    let active = true;
    apiClient
      .get('/stores/delivery-zones')
      .then((response) => {
        if (!active) return;
        const zones = Array.isArray(response.data) ? response.data : [];
        const zone = zones.find(
          (entry: any) =>
            entry.isActive !== false &&
            typeof entry.centerLatitude === 'number' &&
            typeof entry.centerLongitude === 'number',
        );
        if (zone) setDefaultMapCenter({ latitude: zone.centerLatitude, longitude: zone.centerLongitude });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handleClick = () => setMenuOpenId(null);
    if (menuOpenId) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [menuOpenId]);

  /* ------------------------------- address form ------------------------------ */

  const patchDraft = useCallback((patch: Partial<AddressDraft>) => {
    setDraft((current) => ({ ...current, ...patch }));
    setFieldErrors((current) => {
      const next = { ...current };
      let changed = false;
      for (const key of Object.keys(patch)) {
        if (key in next) {
          delete next[key as keyof AddressFieldErrors];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, []);

  const openNewAddress = () => {
    setEditingId(null);
    const initial = emptyDraft();
    const center = defaultMapCenter || DEFAULT_MAP_CENTER;
    initial.latitude = center.latitude;
    initial.longitude = center.longitude;
    initial.locationSource = 'MAP_PIN';
    setDraft(initial);
    setFieldErrors({});
    setShowForm(true);
  };

  const openEditAddress = (address: Address) => {
    setEditingId(address.id);
    setDraft({
      label: address.label || 'Home',
      recipientName: address.recipientName,
      phoneE164: address.phoneE164,
      line1: address.line1,
      line2: address.line2 || '',
      landmark: address.landmark || '',
      city: address.city,
      state: address.state,
      pincode: address.pincode,
      country: address.country,
      latitude: address.latitude,
      longitude: address.longitude,
      locationSource: ['LIVE_GPS', 'MAP_PIN', 'GEOCODED', 'LEGACY_UNKNOWN'].includes(
        String(address.locationSource),
      )
        ? address.locationSource!
        : 'GEOCODED',
      locationAccuracyMetres: address.locationAccuracyMetres ?? null,
      locationCapturedAt: address.locationCapturedAt ?? null,
      instructions: address.instructions || '',
      isDefault: address.isDefault,
    });
    setFieldErrors({});
    setShowForm(true);
  };

  const closeForm = useCallback(() => {
    setShowForm(false);
    setEditingId(null);
    setDraft(emptyDraft());
    setFieldErrors({});
  }, []);

  const updateCoordinates = useCallback(
    async (latitude: number, longitude: number, locationSource: 'LIVE_GPS' | 'MAP_PIN', accuracyMetres?: number) => {
      setDraft((current) => ({
        ...current,
        latitude,
        longitude,
        locationSource,
        locationAccuracyMetres: locationSource === 'LIVE_GPS' ? accuracyMetres ?? null : null,
        locationCapturedAt: locationSource === 'LIVE_GPS' ? new Date().toISOString() : null,
      }));
      try {
        const response = await apiClient.get('/geo/reverse', { params: { lat: latitude, lng: longitude } });
        const addr = response.data?.address;
        if (response.data?.ok && addr) {
          const geoPatch: Partial<AddressDraft> = {};
          if (addr.line1) geoPatch.line1 = addr.line1;
          if (addr.landmark) geoPatch.landmark = addr.landmark;
          if (addr.city) geoPatch.city = addr.city;
          if (addr.state) geoPatch.state = addr.state;
          if (addr.pincode) geoPatch.pincode = addr.pincode;
          if (addr.country) geoPatch.country = addr.country;
          patchDraft(geoPatch);
        }
      } catch {
        // Coordinates remain usable even when reverse geocoding is unavailable.
      }
    },
    [patchDraft],
  );

  const useCurrentLocation = () => {
    setError(null);
    if (!navigator.geolocation) {
      setError('Geolocation is not available in this browser.');
      return;
    }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        void updateCoordinates(
          position.coords.latitude,
          position.coords.longitude,
          'LIVE_GPS',
          position.coords.accuracy,
        ).finally(() => setLocating(false));
      },
      (cause) => {
        setError(cause.message || 'Failed to get your current location.');
        setLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 },
    );
  };

  /* --------------------------------- save --------------------------------- */

  const validateDraft = (value: AddressDraft): AddressFieldErrors => {
    const errors: AddressFieldErrors = {};
    if (value.recipientName.trim().length < 2)
      errors.recipientName = 'Recipient name is required (at least 2 characters).';
    else if (value.recipientName.trim().length > 80)
      errors.recipientName = 'Recipient name must be at most 80 characters.';
    if (
      !/^(\+?[1-9]\d{7,14}|\d{10})$/.test(value.phoneE164.trim().replace(/[\s-]/g, ''))
    )
      errors.phoneE164 = 'Enter a valid 10-digit mobile number.';
    if (value.line1.trim().length < 3)
      errors.line1 = 'Address line is required (at least 3 characters).';
    else if (value.line1.trim().length > 120)
      errors.line1 = 'Address line must be at most 120 characters.';
    if (value.line2.trim().length > 120)
      errors.line2 = 'Area / locality must be at most 120 characters.';
    if (value.landmark.trim().length > 80)
      errors.landmark = 'Nearby landmark must be at most 80 characters.';
    if (value.city.trim().length < 2) errors.city = 'City is required.';
    else if (value.city.trim().length > 60) errors.city = 'City must be at most 60 characters.';
    if (value.state.trim().length < 2) errors.state = 'State is required.';
    else if (value.state.trim().length > 60) errors.state = 'State must be at most 60 characters.';
    if (!/^\d{6}$/.test(value.pincode.trim())) errors.pincode = 'A valid 6-digit pincode is required.';
    if (value.instructions.trim().length > 200)
      errors.instructions = 'Note for rider must be at most 200 characters.';
    if (value.label.trim().length > 32) errors.label = 'Label must be at most 32 characters.';
    return errors;
  };

  const saveAddress = async () => {
    const errors = validateDraft(draft);
    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }
    setFieldErrors({});
    const phoneClean = draft.phoneE164.trim().replace(/[\s-]/g, '');
    const pincodeClean = draft.pincode.trim().replace(/\D/g, '');
    setSaving(true);
    setError(null);
    const payload = {
      ...draft,
      label: draft.label.trim() || 'Home',
      recipientName: draft.recipientName.trim(),
      phoneE164: phoneClean,
      line1: draft.line1.trim(),
      line2: draft.line2.trim() || undefined,
      landmark: draft.landmark.trim() || undefined,
      instructions: draft.instructions.trim() || undefined,
      pincode: pincodeClean,
      latitude: draft.latitude ?? undefined,
      longitude: draft.longitude ?? undefined,
      isDefault: addresses.length === 0 ? true : draft.isDefault,
      localityId: undefined,
      locationSource:
        draft.locationSource === 'LEGACY_UNKNOWN' ? undefined : draft.locationSource,
      locationAccuracyMetres:
        draft.locationSource === 'LIVE_GPS' ? draft.locationAccuracyMetres ?? undefined : undefined,
      locationCapturedAt:
        draft.locationSource === 'LIVE_GPS' ? draft.locationCapturedAt ?? undefined : undefined,
    };
    try {
      if (editingId) {
        await apiClient.patch(`/customer/addresses/${editingId}`, payload);
        toast.success('Delivery address updated.');
      } else {
        await apiClient.post('/customer/addresses', payload);
        toast.success('Delivery address saved.');
      }
      closeForm();
      await fetchAddresses();
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'Failed to save address');
    } finally {
      setSaving(false);
    }
  };

  const deleteAddress = async () => {
    if (!deletingId) return;
    try {
      await apiClient.delete(`/customer/addresses/${deletingId}`);
      setAddresses((prev) => prev.filter((a) => a.id !== deletingId));
      setDeletingId(null);
      toast.success('Address deleted.');
    } catch (e: any) {
      setError(e?.response?.data?.message || 'Failed to delete address');
    }
  };

  /* -------------------------------- render -------------------------------- */

  if (loading) {
    return (
      <DashboardLayout allowedRole="CUSTOMER">
        <div className="flex h-64 items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout allowedRole="CUSTOMER">
      <div className="mx-auto max-w-3xl pb-24">
        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-xl bg-teal-100 text-teal-700">
            <MapPin className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold tracking-[-0.02em] text-teal-950">Manage Addresses</h1>
            <p className="text-xs font-semibold text-slate-500">Add, edit or delete your delivery addresses</p>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">
            {error}
          </div>
        )}

        {/* Address list */}
        <div className="mb-6 space-y-3">
          {addresses.map((addr) => {
            const Icon = ADDRESS_ICONS[(addr.label || '').toLowerCase()] || Navigation;
            return (
              <div
                key={addr.id}
                className={`relative rounded-2xl border p-4 transition-all ${
                  addr.isDefault
                    ? 'border-teal-300 bg-teal-50 shadow-sm shadow-teal-100'
                    : 'border-slate-100 bg-white hover:border-teal-200'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex flex-1 items-start gap-3">
                    <div
                      className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                        addr.isDefault ? 'bg-teal-600 text-white' : 'bg-slate-100 text-slate-500'
                      }`}
                    >
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-extrabold uppercase tracking-[0.08em] text-slate-950">
                          {addr.label || 'Address'}
                        </span>
                        {addr.isDefault && (
                          <span className="rounded-lg bg-teal-600 px-1.5 py-0.5 text-[10px] font-extrabold text-white">
                            Default
                          </span>
                        )}
                        <span className="rounded-lg bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                          {locationLabel(addr.locationSource)}
                        </span>
                      </div>
                      <div className="mt-1 font-bold text-slate-900">{addr.recipientName}</div>
                      <div className="mt-1 text-sm text-slate-600">
                        {addr.line1}
                        {addr.line2 && `, ${addr.line2}`}
                        {addr.landmark && `, nr ${addr.landmark}`}
                        <br />
                        {addr.city}, {addr.state} - {addr.pincode}
                      </div>
                      <div className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-slate-500">
                        <Phone className="h-3 w-3" />
                        {addr.phoneE164}
                      </div>
                    </div>
                  </div>
                  <div className="relative">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenId(menuOpenId === addr.id ? null : addr.id);
                      }}
                      className="rounded-xl p-2 transition-colors hover:bg-slate-100"
                    >
                      <MoreVertical className="h-4 w-4 text-slate-400" />
                    </button>
                    {menuOpenId === addr.id && (
                      <div className="absolute right-0 top-full z-20 mt-1 w-36 overflow-hidden rounded-xl border border-slate-100 bg-white shadow-xl">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditAddress(addr);
                            setMenuOpenId(null);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setDeletingId(addr.id);
                            setMenuOpenId(null);
                          }}
                          className="flex w-full items-center gap-2 px-3 py-2.5 text-xs font-bold text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-3.5 w-3.5" /> Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Add new address button */}
        {!showForm && addresses.length > 0 && (
          <button
            onClick={openNewAddress}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 py-3.5 font-extrabold text-slate-500 transition-colors hover:border-teal-400 hover:text-teal-600"
          >
            <Plus className="h-5 w-5" /> Add New Address
          </button>
        )}

        {/* Empty state */}
        {!showForm && addresses.length === 0 && (
          <div className="rounded-2xl border-2 border-dashed border-slate-200 p-8 text-center">
            <MapPinHouse className="mx-auto h-10 w-10 text-slate-400" />
            <p className="mt-3 text-sm font-bold text-slate-600">No saved addresses</p>
            <p className="mt-1 text-xs text-slate-500">Add a delivery address to get started.</p>
            <button
              onClick={openNewAddress}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-teal-800 px-5 py-2.5 text-sm font-extrabold text-white"
            >
              <Plus className="h-4 w-4" /> Add new address
            </button>
          </div>
        )}

        {/* Address form modal — same as checkout */}
        {showForm && (
          <AddressFormModal
            draft={draft}
            fieldErrors={fieldErrors}
            saving={saving}
            locating={locating}
            editingId={editingId}
            defaultMapCenter={defaultMapCenter}
            onDraftChange={patchDraft}
            onMapPinChange={(lat, lng) => void updateCoordinates(lat, lng, 'MAP_PIN')}
            onUseLiveLocation={useCurrentLocation}
            onSave={() => void saveAddress()}
            onClose={closeForm}
          />
        )}

        {/* Delete confirmation */}
        {deletingId && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-2xl">
              <div className="text-center">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-red-100 text-red-600">
                  <Trash2 className="h-6 w-6" />
                </div>
                <h3 className="mt-3 text-lg font-extrabold text-slate-950">Delete Address?</h3>
                <p className="mt-1 text-sm text-slate-500">This action cannot be undone.</p>
              </div>
              <div className="mt-5 flex gap-3">
                <button
                  onClick={() => setDeletingId(null)}
                  className="flex-1 rounded-xl bg-slate-100 px-4 py-2.5 font-extrabold text-slate-700 hover:bg-slate-200"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void deleteAddress()}
                  className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 font-extrabold text-white hover:bg-red-700"
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

/* ------------------------------ address modal ------------------------------ */

function AddressFormModal({
  draft,
  fieldErrors,
  saving,
  locating,
  editingId,
  defaultMapCenter,
  onDraftChange,
  onMapPinChange,
  onUseLiveLocation,
  onSave,
  onClose,
}: {
  draft: AddressDraft;
  fieldErrors: AddressFieldErrors;
  saving: boolean;
  locating: boolean;
  editingId: string | null;
  defaultMapCenter: { latitude: number; longitude: number } | null;
  onDraftChange: (patch: Partial<AddressDraft>) => void;
  onMapPinChange: (latitude: number, longitude: number) => void;
  onUseLiveLocation: () => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const titleId = useId();
  const [step, setStep] = useState<'map' | 'details'>(editingId ? 'details' : 'map');

  useEffect(() => {
    setStep(editingId ? 'details' : 'map');
  }, [editingId]);

  const hasLocation = draft.latitude != null && draft.longitude != null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-2 sm:p-4 backdrop-blur-sm">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={
          step === 'map'
            ? 'flex h-[95dvh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-100 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.35)]'
            : 'max-h-[96dvh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-slate-100 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.35)]'
        }
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-100 bg-white/95 px-5 py-4 backdrop-blur">
          <div>
            <h2
              id={titleId}
              className="text-lg font-extrabold tracking-[-0.01em] text-teal-950"
            >
              {editingId
                ? 'Edit address'
                : step === 'map'
                  ? 'Pin your location'
                  : 'Address details'}
            </h2>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">
              {step === 'map'
                ? 'Search or drag the pin to your door.'
                : 'Fill in the details below.'}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close address form"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:border-slate-300 hover:text-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {step === 'map' ? (
          <div className="flex flex-1 flex-col overflow-hidden">
            <div className="flex justify-end px-5 pt-4">
              <button
                onClick={onUseLiveLocation}
                disabled={locating}
                className="inline-flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3.5 py-3 text-xs font-extrabold text-teal-800 transition hover:border-teal-300 hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {locating ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MapPin className="h-4 w-4" />
                )}
                {locating ? 'Locating…' : 'Use my live location'}
              </button>
            </div>

            <div className="flex-1 px-5 pb-4">
              {hasLocation ? (
                <CustomerLocationPicker
                  latitude={draft.latitude!}
                  longitude={draft.longitude!}
                  onChange={onMapPinChange}
                  fullHeight
                />
              ) : (
                <div className="flex h-full items-center justify-center rounded-2xl border-2 border-dashed border-teal-200 bg-teal-50/40 p-6 text-center">
                  <div>
                    <p className="text-sm font-bold text-slate-600">
                      Pin your location on the map or use your live location above.
                    </p>
                    {defaultMapCenter && (
                      <button
                        onClick={() =>
                          onMapPinChange(defaultMapCenter.latitude, defaultMapCenter.longitude)
                        }
                        className="mt-4 inline-flex items-center gap-2 rounded-xl border border-teal-300 bg-white px-3.5 py-2 text-xs font-extrabold text-teal-800 transition hover:border-teal-400"
                      >
                        <MapPin className="h-4 w-4" /> Open the map
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 border-t border-slate-100 px-5 py-4">
              <button
                onClick={onClose}
                className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-extrabold text-slate-700 transition hover:border-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={() => setStep('details')}
                disabled={!hasLocation}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-teal-800 px-5 py-3 text-sm font-extrabold text-white shadow-[0_8px_24px_rgba(15,23,42,0.14)] transition hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
              >
                Next
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 px-5 py-5">
            {hasLocation && (
              <div className="flex items-center gap-3 rounded-xl border border-teal-100 bg-teal-50/50 px-4 py-2.5">
                <MapPin className="h-4 w-4 shrink-0 text-teal-600" />
                <span className="truncate text-xs font-semibold text-teal-800">
                  {draft.line1 || `${draft.latitude?.toFixed(5)}, ${draft.longitude?.toFixed(5)}`}
                </span>
                <button
                  onClick={() => setStep('map')}
                  className="ml-auto shrink-0 rounded-lg px-3 py-2 text-xs font-extrabold text-teal-700 hover:bg-teal-100 hover:underline"
                >
                  Change
                </button>
              </div>
            )}

            <div className="grid gap-3.5 md:grid-cols-2">
              <Field
                label="Label"
                error={fieldErrors.label}
                value={draft.label}
                onChange={(value) => onDraftChange({ label: value })}
                placeholder="Home, Work, etc."
                autoComplete="off"
              />
              <Field
                label="Recipient name"
                required
                error={fieldErrors.recipientName}
                value={draft.recipientName}
                onChange={(value) => onDraftChange({ recipientName: value })}
                placeholder="Who is this for?"
                autoComplete="name"
              />
              <Field
                label="Phone"
                required
                error={fieldErrors.phoneE164}
                value={draft.phoneE164}
                onChange={(value) => onDraftChange({ phoneE164: value })}
                placeholder="10-digit mobile number"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
              />
              <Field
                label="Pincode"
                required
                error={fieldErrors.pincode}
                value={draft.pincode}
                onChange={(value) => onDraftChange({ pincode: cleanPincode(value) })}
                placeholder="6-digit pincode"
                inputMode="numeric"
                autoComplete="postal-code"
              />
              <Field
                label="House / street"
                required
                error={fieldErrors.line1}
                value={draft.line1}
                onChange={(value) => onDraftChange({ line1: value })}
                placeholder="Flat no, building, street"
                className="md:col-span-2"
                autoComplete="address-line1"
              />
              <Field
                label="Area / locality"
                error={fieldErrors.line2}
                value={draft.line2}
                onChange={(value) => onDraftChange({ line2: value })}
                placeholder="Neighbourhood, colony"
                className="md:col-span-2"
                autoComplete="address-line2"
              />
              <Field
                label="Nearby landmark"
                error={fieldErrors.landmark}
                value={draft.landmark}
                onChange={(value) => onDraftChange({ landmark: value })}
                placeholder="Near temple, park, etc."
              />
              <Field
                label="Note for rider"
                error={fieldErrors.instructions}
                value={draft.instructions}
                onChange={(value) => onDraftChange({ instructions: value })}
                placeholder="Gate code, floor, etc."
              />
              <Field
                label="City"
                required
                error={fieldErrors.city}
                value={draft.city}
                onChange={(value) => onDraftChange({ city: value })}
                autoComplete="address-level2"
              />
              <Field
                label="State"
                required
                error={fieldErrors.state}
                value={draft.state}
                onChange={(value) => onDraftChange({ state: value })}
                autoComplete="address-level1"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isDefault"
                checked={draft.isDefault}
                onChange={(e) => onDraftChange({ isDefault: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
              />
              <label htmlFor="isDefault" className="text-sm font-bold text-slate-700">
                Set as default
              </label>
            </div>

            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setStep('map')}
                className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-extrabold text-slate-700 transition hover:border-slate-300"
              >
                Back
              </button>
              <button
                onClick={onSave}
                disabled={saving}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-teal-800 px-5 py-3 text-sm font-extrabold text-white shadow-[0_8px_24px_rgba(15,23,42,0.14)] transition hover:bg-teal-900 disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {editingId ? 'Update address' : 'Save address'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------- field ----------------------------------- */

function Field({
  label,
  value,
  onChange,
  placeholder,
  className = '',
  type = 'text',
  inputMode,
  autoComplete,
  required = false,
  error,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  type?: string;
  inputMode?: 'text' | 'tel' | 'numeric' | 'email' | 'decimal';
  autoComplete?: string;
  required?: boolean;
  error?: string;
}) {
  const id = useId();
  return (
    <div className={className}>
      <label
        htmlFor={id}
        className={`mb-1.5 block text-[11px] font-extrabold uppercase tracking-[0.08em] ${
          error ? 'text-red-700' : 'text-slate-500'
        }`}
      >
        {label}
        {required && <span className="ml-1 text-red-600">*</span>}
      </label>
      <input
        id={id}
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className={`w-full rounded-xl border bg-white px-3.5 py-3 text-sm font-semibold text-slate-900 caret-teal-700 outline-none transition placeholder:font-normal placeholder:text-slate-500 focus:ring-4 ${
          error
            ? 'border-red-400 bg-red-50/40 text-red-900 placeholder:text-red-400 focus:border-red-500 focus:ring-red-500/10'
            : 'border-slate-200 focus:border-teal-600 focus:ring-teal-600/10'
        }`}
      />
      {error && (
        <p id={`${id}-error`} role="alert" className="mt-1 text-xs font-bold text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
