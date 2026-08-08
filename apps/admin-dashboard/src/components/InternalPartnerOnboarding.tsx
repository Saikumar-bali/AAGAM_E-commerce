'use client';

import React, { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import { apiClient } from '@aagam/utils';
import { useToast } from '@/components/ToastProvider';
import {
  AlertCircle,
  Bike,
  CheckCircle2,
  FileUp,
  Loader2,
  Plus,
  Save,
  Send,
  ShieldCheck,
  Store,
  Trash2,
  X,
} from 'lucide-react';

const StoreLocationPicker = dynamic(
  () => import('@/components/StoreLocationPicker').then((module) => module.StoreLocationPicker),
  {
    ssr: false,
    loading: () => <div className="h-56 animate-pulse rounded-xl border border-slate-200 bg-slate-50" />,
  },
);

type ApplicationType = 'RIDER' | 'STORE';
type ApplicationStatus = 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'ACTION_REQUIRED' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN' | 'EXPIRED';
type Zone = { id: string; name: string; isActive: boolean };

type InternalDetail = {
  application: {
    id: string;
    type: ApplicationType;
    status: ApplicationStatus;
    applicantName: string;
    phoneE164?: string | null;
    email?: string | null;
    phoneVerifiedAt?: string | null;
    emailVerifiedAt?: string | null;
    applicantPayload: Record<string, any>;
    updatedAt?: string;
  };
  documents: Array<{
    id: string;
    type: string;
    originalFilename: string;
    status: string;
  }>;
  requirements: {
    requiredDocuments: string[];
    allowedDocuments?: string[];
    completedRequired: string[];
    completionPercent: number;
  };
};

type CreateProps = {
  onCreated: (detail: InternalDetail) => void;
  fixedType?: ApplicationType;
  buttonLabel?: string;
};

type DraftProps = {
  detail: InternalDetail;
  onUpdated: (detail: InternalDetail) => void;
};

type DraftForm = Record<string, any> & {
  applicantName: string;
  phoneE164: string;
  email: string;
  preferredZones: string[];
  bankAccountNumber: string;
  bankIfsc: string;
};

const fieldClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100';
const label = (value: string) => value.replaceAll('_', ' ');

const RIDER_REQUIRED = [
  'dateOfBirth',
  'addressLine1',
  'city',
  'state',
  'pincode',
  'vehicleType',
  'preferredZones',
  'availability',
  'emergencyContactName',
  'emergencyContactPhone',
] as const;

const STORE_REQUIRED = [
  'legalName',
  'displayName',
  'businessType',
  'storeAddress',
  'city',
  'state',
  'pincode',
  'latitude',
  'longitude',
  'operatingHours',
  'serviceRadiusKm',
  'orderCapacity',
] as const;

const FIELD_LABELS: Record<string, string> = {
  applicantName: 'Name',
  phoneE164: 'Primary mobile',
  email: 'Operational email',
  dateOfBirth: 'Date of birth',
  addressLine1: 'Address',
  city: 'City',
  state: 'State',
  pincode: 'Pincode',
  vehicleType: 'Vehicle type',
  vehicleNumber: 'Vehicle number',
  preferredZones: 'Preferred delivery zone',
  availability: 'Availability',
  emergencyContactName: 'Emergency contact name',
  emergencyContactPhone: 'Emergency contact phone',
  legalName: 'Legal business name',
  displayName: 'Store display name',
  businessType: 'Business type',
  storeAddress: 'Store address',
  latitude: 'Store location',
  longitude: 'Store location',
  operatingHours: 'Operating hours',
  serviceRadiusKm: 'Service radius',
  orderCapacity: 'Daily order capacity',
  bankAccountNumber: 'Bank account number',
  bankIfsc: 'IFSC',
};

function toForm(detail: InternalDetail): DraftForm {
  const application = detail.application;
  const payload = application.applicantPayload || {};
  const values: DraftForm = {
    applicantName: application.applicantName || '',
    phoneE164: application.phoneE164 || '',
    email: application.email || '',
    preferredZones: [],
    bankAccountNumber: '',
    bankIfsc: '',
  };
  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      values[key] = value.map((item) => String(item));
      return;
    }
    if (typeof value !== 'object') values[key] = String(value);
  });
  if (!Array.isArray(values.preferredZones)) values.preferredZones = [];
  return values;
}

function valuePresent(value: unknown) {
  if (Array.isArray(value)) return value.some((item) => String(item || '').trim().length > 0);
  return String(value ?? '').trim().length > 0;
}

function profileMissing(detail: InternalDetail, form: DraftForm) {
  const missing: string[] = [];
  if (!valuePresent(form.applicantName)) missing.push('applicantName');
  if (!valuePresent(form.phoneE164)) missing.push('phoneE164');
  if (!valuePresent(form.email)) missing.push('email');

  const required = detail.application.type === 'RIDER' ? RIDER_REQUIRED : STORE_REQUIRED;
  required.forEach((key) => {
    if (!valuePresent(form[key])) missing.push(key);
  });

  if (
    detail.application.type === 'RIDER' &&
    !['WALKER', 'BICYCLE'].includes(String(form.vehicleType || '').toUpperCase()) &&
    !valuePresent(form.vehicleNumber)
  ) {
    missing.push('vehicleNumber');
  }

  const payload = detail.application.applicantPayload || {};
  if (!valuePresent(form.bankAccountNumber) && !payload.bankAccountLast4) missing.push('bankAccountNumber');
  if (!valuePresent(form.bankIfsc) && !payload.bankIfscLast4) missing.push('bankIfsc');
  return [...new Set(missing)];
}

function InputField({
  label: fieldLabel,
  value,
  onChange,
  type = 'text',
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-500">{fieldLabel}</span>
      <input type={type} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} className={fieldClass} />
    </label>
  );
}

export function InternalPartnerCreateButton({ onCreated, fixedType, buttonLabel }: CreateProps) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    type: fixedType || 'RIDER' as ApplicationType,
    applicantName: '',
    phoneE164: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  useEffect(() => {
    if (fixedType) setForm((current) => ({ ...current, type: fixedType }));
  }, [fixedType]);

  const create = async () => {
    if (form.applicantName.trim().length < 2 || form.phoneE164.trim().length < 10) {
      toast.warning('Name and a valid mobile number are required.', 'Complete partner identity');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) {
      toast.warning('Enter the operational email used for Rider/Store access.', 'Operational email required');
      return;
    }
    if (form.password && form.password.length < 8) {
      toast.warning('Initial password must be at least 8 characters.', 'Password too short');
      return;
    }
    if (form.password !== form.confirmPassword) {
      toast.warning('Password and confirmation do not match.', 'Check initial password');
      return;
    }
    setSubmitting(true);
    try {
      const response = await apiClient.post('/admin/partner-onboarding/internal-applications', {
        type: form.type,
        applicantName: form.applicantName.trim(),
        phoneE164: form.phoneE164.trim(),
        email: form.email.trim(),
        password: form.password || undefined,
        payload: form.type === 'RIDER'
          ? { vehicleType: 'MOTORCYCLE', availability: 'Full day' }
          : undefined,
      });
      toast.success(
        form.password
          ? 'Initial password saved securely. Complete the profile and documents before approval.'
          : 'No OTP is required. Complete the profile and upload the mandatory documents.',
        'Admin partner created',
      );
      onCreated(response.data);
      setOpen(false);
      setForm({
        type: fixedType || 'RIDER',
        applicantName: '',
        phoneE164: '',
        email: '',
        password: '',
        confirmPassword: '',
      });
    } catch {
      // Global interceptor renders the exact API error as a toast.
    } finally {
      setSubmitting(false);
    }
  };

  const currentType = fixedType || form.type;
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-black text-white shadow-sm hover:bg-teal-800">
        <Plus className="h-4 w-4" /> {buttonLabel || (fixedType === 'RIDER' ? 'Add Rider' : fixedType === 'STORE' ? 'Add Store' : 'Create internal partner')}
      </button>
      {open ? (
        <div className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/65 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Create internal partner">
          <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-teal-700">Admin-created account</p>
                <h2 className="mt-2 text-2xl font-black text-slate-950">Create {currentType === 'RIDER' ? 'Rider' : 'Store'} internally</h2>
                <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">Admin is the identity authority for this flow. The mobile number is accepted without OTP and the action is recorded in the audit trail.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close create partner dialog" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            {!fixedType ? (
              <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1.5">
                {(['RIDER', 'STORE'] as const).map((type) => (
                  <button key={type} type="button" onClick={() => setForm((current) => ({ ...current, type }))} className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-black ${form.type === type ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-500'}`}>
                    {type === 'RIDER' ? <Bike className="h-4 w-4" /> : <Store className="h-4 w-4" />}{type === 'RIDER' ? 'Rider' : 'Store'}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="mt-5 space-y-4">
              <InputField label={currentType === 'RIDER' ? 'Rider name' : 'Owner / applicant name'} value={form.applicantName} onChange={(value) => setForm((current) => ({ ...current, applicantName: value }))} />
              <InputField label="Primary mobile" value={form.phoneE164} onChange={(value) => setForm((current) => ({ ...current, phoneE164: value.replace(/[^+0-9]/g, '') }))} placeholder="10-digit mobile or +91…" />
              <InputField label="Operational email" value={form.email} onChange={(value) => setForm((current) => ({ ...current, email: value }))} type="email" placeholder="Used for the operational account" />
              <div className="grid gap-3 sm:grid-cols-2">
                <InputField label="Initial password (optional)" value={form.password} onChange={(value) => setForm((current) => ({ ...current, password: value }))} type="password" placeholder="Minimum 8 characters" />
                <InputField label="Confirm password" value={form.confirmPassword} onChange={(value) => setForm((current) => ({ ...current, confirmPassword: value }))} type="password" placeholder="Re-enter password" />
              </div>
              <p className="text-[11px] font-semibold leading-5 text-slate-500">If you set a password, the newly approved {currentType === 'RIDER' ? 'Rider' : 'Store Owner'} can sign in with it in addition to phone OTP. Leave both password fields blank to keep OTP-only access. Existing accounts keep their current password.</p>
            </div>
            <div className="mt-4 flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-bold leading-5 text-emerald-800">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" /> No OTP step. Admin-created identity is automatically attested and audited.
            </div>
            <button type="button" onClick={() => void create()} disabled={submitting} className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3.5 text-sm font-black text-white disabled:opacity-50">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create {currentType === 'RIDER' ? 'Rider' : 'Store'} draft
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

export function InternalPartnerDraftControls({ detail, onUpdated }: DraftProps) {
  const toast = useToast();
  const application = detail.application;
  const editable = ['DRAFT', 'ACTION_REQUIRED'].includes(application.status);
  const [form, setForm] = useState<DraftForm>(() => toForm(detail));
  const [busy, setBusy] = useState('');
  const [files, setFiles] = useState<Record<string, File | null>>({});
  const [documentNumbers, setDocumentNumbers] = useState<Record<string, string>>({});
  const [expiries, setExpiries] = useState<Record<string, string>>({});
  const [zones, setZones] = useState<Zone[]>([]);
  const [zonesLoading, setZonesLoading] = useState(false);

  useEffect(() => {
    setForm(toForm(detail));
    setFiles({});
  }, [application.id, application.updatedAt]);

  useEffect(() => {
    if (application.type !== 'RIDER') return;
    let alive = true;
    setZonesLoading(true);
    apiClient.get('/stores/delivery-zones/admin')
      .then((response) => {
        if (!alive) return;
        const rows = Array.isArray(response.data) ? response.data : [];
        setZones(rows.filter((zone: Zone) => zone?.isActive && zone?.name));
      })
      .catch(() => {
        if (alive) setZones([]);
      })
      .finally(() => {
        if (alive) setZonesLoading(false);
      });
    return () => { alive = false; };
  }, [application.id, application.type]);

  const allowedDocuments = detail.requirements.allowedDocuments || detail.requirements.requiredDocuments;
  const requiredDocuments = detail.requirements.requiredDocuments;
  const missingFields = profileMissing(detail, form);
  const profileComplete = missingFields.length === 0;
  const requiredFilesPresent = requiredDocuments.every((type) =>
    detail.documents.some((document) => document.type === type),
  );
  const canSubmit = profileComplete && requiredFilesPresent;

  const set = (key: string, value: any) => setForm((current) => ({ ...current, [key]: value }));

  const payload = useMemo(() => {
    const keys = application.type === 'RIDER'
      ? [...RIDER_REQUIRED, 'vehicleNumber', 'latitude', 'longitude', 'experience', 'bankAccountHolderName']
      : [...STORE_REQUIRED, 'categories', 'pickupInstructions', 'bankAccountHolderName'];
    const next: Record<string, any> = {};
    keys.forEach((key) => {
      const value = form[key];
      if (Array.isArray(value)) {
        if (value.length) next[key] = value.map((item) => String(item).trim()).filter(Boolean);
        return;
      }
      const raw = String(value || '').trim();
      if (!raw) return;
      if (['latitude', 'longitude', 'serviceRadiusKm', 'orderCapacity'].includes(key)) {
        const numeric = Number(raw);
        if (Number.isFinite(numeric)) next[key] = numeric;
      } else if (key === 'categories') {
        next[key] = raw.split(',').map((item) => item.trim()).filter(Boolean);
      } else {
        next[key] = raw;
      }
    });
    if (form.bankAccountNumber.trim()) next.bankAccountNumber = form.bankAccountNumber.trim();
    if (form.bankIfsc.trim()) next.bankIfsc = form.bankIfsc.trim().toUpperCase();
    return next;
  }, [application.type, form]);

  if (!editable) return null;

  const saveProfile = async () => {
    setBusy('profile');
    try {
      const response = await apiClient.patch(`/admin/partner-onboarding/internal-applications/${application.id}`, {
        applicantName: form.applicantName.trim(),
        phoneE164: form.phoneE164.trim(),
        email: form.email.trim() || undefined,
        payload,
      });
      toast.success('Profile saved. Admin identity authority remains valid without OTP.', 'Partner draft updated');
      onUpdated(response.data);
    } catch {
      // Global interceptor handles exact API errors.
    } finally {
      setBusy('');
    }
  };

  const upload = async (type: string) => {
    const file = files[type];
    if (!file) {
      toast.warning('Choose a document first.', label(type));
      return;
    }
    setBusy(`upload-${type}`);
    try {
      const body = new FormData();
      body.append('type', type);
      body.append('file', file);
      const documentNumber = documentNumbers[type]?.trim();
      const expiresAt = expiries[type]?.trim();
      if (documentNumber) body.append('documentNumber', documentNumber);
      if (expiresAt) body.append('expiresAt', expiresAt);
      const response = await apiClient.post(`/admin/partner-onboarding/internal-applications/${application.id}/documents`, body);
      toast.success(`${label(type)} uploaded.`, 'Private evidence saved');
      setFiles((current) => ({ ...current, [type]: null }));
      onUpdated(response.data);
    } catch {
      // Global interceptor handles exact API errors.
    } finally {
      setBusy('');
    }
  };

  const remove = async (documentId: string, type: string) => {
    if (!window.confirm(`Remove ${label(type)} from this internal application?`)) return;
    setBusy(`remove-${type}`);
    try {
      const response = await apiClient.delete(`/admin/partner-onboarding/internal-applications/${application.id}/documents/${documentId}`);
      toast.success(`${label(type)} removed.`, 'Document removed');
      onUpdated(response.data);
    } catch {
      // Global interceptor handles exact API errors.
    } finally {
      setBusy('');
    }
  };

  const submit = async () => {
    setBusy('submit');
    try {
      const response = await apiClient.post(`/admin/partner-onboarding/internal-applications/${application.id}/submit-for-review`, {
        note: 'Internal onboarding completed by Admin. Documents ready for final approval.',
      });
      toast.success('The internal account is ready for document review and final approval.', 'Draft completed');
      onUpdated(response.data);
    } catch {
      // Global interceptor handles exact API errors.
    } finally {
      setBusy('');
    }
  };

  const selectedZones = Array.isArray(form.preferredZones) ? form.preferredZones : [];
  const setLocation = (lat: number, lng: number) => {
    setForm((current) => ({ ...current, latitude: String(lat), longitude: String(lng) }));
  };
  const setAddress = (address: { address: string; city: string; state: string; pincode: string }) => {
    setForm((current) => ({
      ...current,
      [application.type === 'RIDER' ? 'addressLine1' : 'storeAddress']: address.address || current[application.type === 'RIDER' ? 'addressLine1' : 'storeAddress'],
      city: address.city || current.city,
      state: address.state || current.state,
      pincode: address.pincode || current.pincode,
    }));
  };

  return (
    <section className="rounded-2xl border-2 border-teal-200 bg-teal-50/40 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-teal-700">Admin internal onboarding</p>
          <h3 className="mt-1 text-lg font-black text-slate-950">Complete the partner before approval</h3>
          <p className="mt-1 max-w-2xl text-xs font-semibold leading-5 text-slate-600">Admin-created Rider/Store accounts do not require OTP. Complete the operational profile and upload every mandatory private document; the backend records Admin identity attestation automatically.</p>
        </div>
        <span className="h-fit rounded-full border border-teal-200 bg-white px-3 py-1 text-[10px] font-black text-teal-800">{application.status}</span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <Checklist ok={profileComplete} text="Profile complete" />
        <Checklist ok text="Admin identity authority" />
        <Checklist ok={requiredFilesPresent} text="Required documents uploaded" />
      </div>

      {!profileComplete ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-xs font-black text-amber-900">Still required before review</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {missingFields.map((field) => <span key={field} className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-amber-800 ring-1 ring-amber-200">{FIELD_LABELS[field] || label(field)}</span>)}
          </div>
        </div>
      ) : null}

      <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3">
          <div><h4 className="text-sm font-black text-slate-950">1. Partner profile</h4><p className="mt-1 text-xs font-semibold text-slate-500">Save after changing vehicle type or location; required Rider documents are recalculated automatically.</p></div>
          <Save className="h-5 w-5 text-teal-700" />
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <InputField label={application.type === 'RIDER' ? 'Rider name' : 'Owner / applicant name'} value={form.applicantName} onChange={(value) => set('applicantName', value)} />
          <InputField label="Primary mobile" value={form.phoneE164} onChange={(value) => set('phoneE164', value.replace(/[^+0-9]/g, ''))} />
          <InputField label="Operational email" value={form.email} onChange={(value) => set('email', value)} type="email" />
          {application.type === 'RIDER' ? (
            <>
              <InputField label="Date of birth" value={form.dateOfBirth || ''} onChange={(value) => set('dateOfBirth', value)} type="date" />
              <InputField label="Address" value={form.addressLine1 || ''} onChange={(value) => set('addressLine1', value)} />
              <InputField label="City" value={form.city || ''} onChange={(value) => set('city', value)} />
              <InputField label="State" value={form.state || ''} onChange={(value) => set('state', value)} />
              <InputField label="Pincode" value={form.pincode || ''} onChange={(value) => set('pincode', value.replace(/\D/g, '').slice(0, 6))} />
              <label className="block"><span className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-500">Vehicle type</span><select value={form.vehicleType || ''} onChange={(event) => set('vehicleType', event.target.value)} className={fieldClass}><option value="">Select vehicle</option><option value="WALKER">Walker</option><option value="BICYCLE">Bicycle</option><option value="MOTORCYCLE">Motorcycle</option><option value="SCOOTER">Scooter</option><option value="CAR">Car</option><option value="VAN">Van</option></select></label>
              <InputField label="Vehicle number (if registered)" value={form.vehicleNumber || ''} onChange={(value) => set('vehicleNumber', value.toUpperCase().replace(/\s/g, ''))} />
              <InputField label="Emergency contact name" value={form.emergencyContactName || ''} onChange={(value) => set('emergencyContactName', value)} />
              <InputField label="Emergency contact phone" value={form.emergencyContactPhone || ''} onChange={(value) => set('emergencyContactPhone', value.replace(/[^+0-9]/g, ''))} />
              <label className="block md:col-span-2">
                <span className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-500">Preferred delivery zones</span>
                <div className="min-h-12 rounded-xl border border-slate-200 bg-white p-2">
                  {zonesLoading ? <div className="flex items-center gap-2 px-2 py-1 text-xs font-bold text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading active zones…</div> : zones.length ? (
                    <div className="flex flex-wrap gap-2">
                      {zones.map((zone) => {
                        const selected = selectedZones.includes(zone.name);
                        return <button key={zone.id} type="button" onClick={() => set('preferredZones', selected ? selectedZones.filter((name) => name !== zone.name) : [...selectedZones, zone.name])} className={`rounded-full px-3 py-1.5 text-xs font-black transition ${selected ? 'bg-teal-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-teal-50'}`}>{selected ? '✓ ' : ''}{zone.name}</button>;
                      })}
                    </div>
                  ) : <p className="px-2 py-1 text-xs font-bold text-amber-700">No active delivery zones are available. Create/activate a zone in operations first.</p>}
                </div>
              </label>
              <label className="block"><span className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-500">Availability</span><select value={form.availability || ''} onChange={(event) => set('availability', event.target.value)} className={fieldClass}><option value="">Select availability</option><option value="Full day">Full day</option><option value="Morning">Morning</option><option value="Evening">Evening</option><option value="Weekends">Weekends</option></select></label>
              <label className="block"><span className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-500">Experience</span><select value={form.experience || ''} onChange={(event) => set('experience', event.target.value)} className={fieldClass}><option value="">Select experience</option><option value="First-time Rider">First-time Rider</option><option value="Less than 1 year">Less than 1 year</option><option value="1–3 years">1–3 years</option><option value="3+ years">3+ years</option></select></label>
            </>
          ) : (
            <>
              <InputField label="Legal business name" value={form.legalName || ''} onChange={(value) => set('legalName', value)} />
              <InputField label="Store display name" value={form.displayName || ''} onChange={(value) => set('displayName', value)} />
              <InputField label="Business type" value={form.businessType || ''} onChange={(value) => set('businessType', value)} />
              <InputField label="Store address" value={form.storeAddress || ''} onChange={(value) => set('storeAddress', value)} />
              <InputField label="City" value={form.city || ''} onChange={(value) => set('city', value)} />
              <InputField label="State" value={form.state || ''} onChange={(value) => set('state', value)} />
              <InputField label="Pincode" value={form.pincode || ''} onChange={(value) => set('pincode', value.replace(/\D/g, '').slice(0, 6))} />
              <InputField label="Operating hours" value={form.operatingHours || ''} onChange={(value) => set('operatingHours', value)} placeholder="7 AM–11 PM" />
              <InputField label="Service radius (km)" value={form.serviceRadiusKm || ''} onChange={(value) => set('serviceRadiusKm', value)} type="number" />
              <InputField label="Daily order capacity" value={form.orderCapacity || ''} onChange={(value) => set('orderCapacity', value)} type="number" />
              <InputField label="Categories (comma separated)" value={Array.isArray(form.categories) ? form.categories.join(', ') : form.categories || ''} onChange={(value) => set('categories', value)} />
              <InputField label="Pickup instructions" value={form.pickupInstructions || ''} onChange={(value) => set('pickupInstructions', value)} />
            </>
          )}
          <InputField label="Bank account holder" value={form.bankAccountHolderName || ''} onChange={(value) => set('bankAccountHolderName', value)} />
          <InputField label={`Bank account number${application.applicantPayload?.bankAccountLast4 ? ` (saved ••••${application.applicantPayload.bankAccountLast4})` : ''}`} value={form.bankAccountNumber} onChange={(value) => set('bankAccountNumber', value.replace(/\D/g, ''))} placeholder={application.applicantPayload?.bankAccountLast4 ? 'Leave blank to keep saved account' : ''} />
          <InputField label={`IFSC${application.applicantPayload?.bankIfscLast4 ? ` (saved ••••${application.applicantPayload.bankIfscLast4})` : ''}`} value={form.bankIfsc} onChange={(value) => set('bankIfsc', value.toUpperCase().replace(/\s/g, '').slice(0, 11))} placeholder={application.applicantPayload?.bankIfscLast4 ? 'Leave blank to keep saved IFSC' : ''} />
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <p className="mb-2 text-xs font-black text-slate-700">{application.type === 'RIDER' ? 'Rider home / operating location (recommended)' : 'Store location (required)'}</p>
          <StoreLocationPicker
            compact
            apiClient={apiClient}
            coords={{
              lat: valuePresent(form.latitude) ? Number(form.latitude) : null,
              lng: valuePresent(form.longitude) ? Number(form.longitude) : null,
            }}
            onCoordsChange={setLocation}
            onAddressChange={setAddress}
            searchPlaceholder={application.type === 'RIDER' ? 'Search Rider address or area…' : 'Search Store address…'}
          />
        </div>

        <button type="button" onClick={() => void saveProfile()} disabled={Boolean(busy)} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:opacity-50">
          {busy === 'profile' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save internal profile
        </button>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3"><div><h4 className="text-sm font-black text-slate-950">2. Required private documents</h4><p className="mt-1 text-xs font-semibold text-slate-500">JPEG, PNG, WebP or PDF, maximum 10 MB each. Mandatory documents change automatically with the Rider vehicle type.</p></div><FileUp className="h-5 w-5 text-teal-700" /></div>
        <div className="mt-4 space-y-3">
          {allowedDocuments.map((type) => {
            const document = detail.documents.find((item) => item.type === type);
            const required = requiredDocuments.includes(type);
            return (
              <div key={type} className={`rounded-2xl border p-3 ${required ? 'border-teal-200 bg-teal-50/30' : 'border-slate-200'}`}>
                <div className="flex flex-wrap items-center justify-between gap-2"><div><p className="text-xs font-black text-slate-900">{label(type)}</p><p className="mt-0.5 text-[10px] font-bold text-slate-400">{required ? 'MANDATORY' : 'OPTIONAL'}{document ? ` · ${document.originalFilename}` : ''}</p></div>{document ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-[9px] font-black text-emerald-700">{document.status}</span> : <span className="rounded-full bg-slate-100 px-2 py-1 text-[9px] font-black text-slate-500">NOT UPLOADED</span>}</div>
                <div className="mt-3 grid gap-2 lg:grid-cols-[1.5fr_1fr_1fr_auto]">
                  <input key={`${type}-${document?.id || 'new'}`} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setFiles((current) => ({ ...current, [type]: event.target.files?.[0] || null }))} className="block w-full rounded-xl border border-slate-200 bg-white px-2 py-2 text-xs font-semibold file:mr-2 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-1.5 file:text-xs file:font-black" />
                  <input value={documentNumbers[type] || ''} onChange={(event) => setDocumentNumbers((current) => ({ ...current, [type]: event.target.value }))} placeholder="Document number" className={fieldClass} />
                  <input type="date" value={expiries[type] || ''} onChange={(event) => setExpiries((current) => ({ ...current, [type]: event.target.value }))} className={fieldClass} />
                  <button type="button" onClick={() => void upload(type)} disabled={!files[type] || Boolean(busy)} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-teal-700 px-3 text-xs font-black text-white disabled:opacity-40">{busy === `upload-${type}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileUp className="h-3.5 w-3.5" />}{document ? 'Replace' : 'Upload'}</button>
                </div>
                {document ? <button type="button" onClick={() => void remove(document.id, type)} disabled={Boolean(busy)} className="mt-2 inline-flex items-center gap-1 text-[10px] font-black text-red-600"><Trash2 className="h-3 w-3" /> Remove uploaded document</button> : null}
              </div>
            );
          })}
        </div>
      </div>

      <div className={`mt-4 rounded-2xl border p-4 ${canSubmit ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
        <div className="flex gap-3">{canSubmit ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /> : <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />}<div><p className="text-sm font-black text-slate-950">3. Finish draft and move to approval</p><p className="mt-1 text-xs font-semibold leading-5 text-slate-600">{canSubmit ? 'Everything required is present. No OTP is needed; move this Admin-created account into review, then approve and provision it.' : 'Complete the fields listed above and upload every mandatory document. Contact OTP is intentionally not part of this Admin flow.'}</p></div></div>
        <button type="button" onClick={() => void submit()} disabled={!canSubmit || Boolean(busy)} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40">{busy === 'submit' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Finish draft & start review</button>
      </div>
    </section>
  );
}

function Checklist({ ok, text }: { ok: boolean; text: string }) {
  return <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-black ${ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>{ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}{text}</div>;
}
