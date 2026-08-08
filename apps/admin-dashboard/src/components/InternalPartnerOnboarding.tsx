'use client';

import React, { useEffect, useMemo, useState } from 'react';
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
  Store,
  Trash2,
  X,
} from 'lucide-react';

type ApplicationType = 'RIDER' | 'STORE';
type ApplicationStatus = 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'ACTION_REQUIRED' | 'APPROVED' | 'REJECTED' | 'WITHDRAWN' | 'EXPIRED';

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
};

type DraftProps = {
  detail: InternalDetail;
  onUpdated: (detail: InternalDetail) => void;
};

type DraftForm = Record<string, string> & {
  applicantName: string;
  phoneE164: string;
  email: string;
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

function toForm(detail: InternalDetail): DraftForm {
  const application = detail.application;
  const payload = application.applicantPayload || {};
  const values: DraftForm = {
    applicantName: application.applicantName || '',
    phoneE164: application.phoneE164 || '',
    email: application.email || '',
    bankAccountNumber: '',
    bankIfsc: '',
  };
  Object.entries(payload).forEach(([key, value]) => {
    if (value === undefined || value === null || typeof value === 'object') return;
    values[key] = String(value);
  });
  return values;
}

function requiredProfileComplete(detail: InternalDetail, form: DraftForm) {
  const required = detail.application.type === 'RIDER' ? RIDER_REQUIRED : STORE_REQUIRED;
  const basic = required.every((key) => String(form[key] || '').trim().length > 0);
  const payload = detail.application.applicantPayload || {};
  const bankReady = Boolean(
    String(form.bankAccountNumber || '').trim() || payload.bankAccountLast4,
  );
  const ifscReady = Boolean(String(form.bankIfsc || '').trim() || payload.bankIfscLast4);
  return basic && bankReady && ifscReady;
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

export function InternalPartnerCreateButton({ onCreated }: CreateProps) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ type: 'RIDER' as ApplicationType, applicantName: '', phoneE164: '', email: '' });

  const create = async () => {
    if (form.applicantName.trim().length < 2 || form.phoneE164.trim().length < 10) {
      toast.warning('Name and a valid mobile number are required.', 'Complete partner identity');
      return;
    }
    setSubmitting(true);
    try {
      const response = await apiClient.post('/admin/partner-onboarding/internal-applications', {
        type: form.type,
        applicantName: form.applicantName.trim(),
        phoneE164: form.phoneE164.trim(),
        email: form.email.trim() || undefined,
      });
      toast.success('Upload the profile evidence and complete the review before approval.', 'Internal partner draft created');
      onCreated(response.data);
      setOpen(false);
      setForm({ type: 'RIDER', applicantName: '', phoneE164: '', email: '' });
    } catch {
      // Global interceptor renders the exact API error as a toast.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-black text-white shadow-sm hover:bg-teal-800">
        <Plus className="h-4 w-4" /> Create internal partner
      </button>
      {open ? (
        <div className="fixed inset-0 z-[70] grid place-items-center bg-slate-950/65 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Create internal partner">
          <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-xs font-black uppercase tracking-widest text-teal-700">Admin-created account</p><h2 className="mt-2 text-2xl font-black text-slate-950">Create partner internally</h2><p className="mt-2 text-sm font-semibold leading-6 text-slate-500">This creates a controlled draft. Full Rider/Store access is granted only after profile completion, document verification and approval.</p></div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close create partner dialog" className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1.5">
              {(['RIDER', 'STORE'] as const).map((type) => (
                <button key={type} type="button" onClick={() => setForm((current) => ({ ...current, type }))} className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-black ${form.type === type ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-500'}`}>
                  {type === 'RIDER' ? <Bike className="h-4 w-4" /> : <Store className="h-4 w-4" />}{type === 'RIDER' ? 'Rider' : 'Store'}
                </button>
              ))}
            </div>
            <div className="mt-5 space-y-4">
              <InputField label={form.type === 'RIDER' ? 'Rider name' : 'Owner / applicant name'} value={form.applicantName} onChange={(value) => setForm((current) => ({ ...current, applicantName: value }))} />
              <InputField label="Primary mobile" value={form.phoneE164} onChange={(value) => setForm((current) => ({ ...current, phoneE164: value }))} placeholder="10-digit mobile or +91…" />
              <InputField label="Optional email" value={form.email} onChange={(value) => setForm((current) => ({ ...current, email: value }))} type="email" />
            </div>
            <button type="button" onClick={() => void create()} disabled={submitting} className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3.5 text-sm font-black text-white disabled:opacity-50">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Create secure draft
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

  useEffect(() => {
    setForm(toForm(detail));
    setFiles({});
  }, [application.id, application.updatedAt]);

  const allowedDocuments = detail.requirements.allowedDocuments || detail.requirements.requiredDocuments;
  const requiredDocuments = detail.requirements.requiredDocuments;
  const primaryVerified = Boolean(application.phoneVerifiedAt || application.emailVerifiedAt);
  const profileComplete = requiredProfileComplete(detail, form);
  const requiredFilesPresent = requiredDocuments.every((type) =>
    detail.documents.some((document) => document.type === type),
  );
  const canSubmit = primaryVerified && profileComplete && requiredFilesPresent;

  const set = (key: string, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const payload = useMemo(() => {
    const keys = application.type === 'RIDER'
      ? [...RIDER_REQUIRED, 'vehicleNumber', 'preferredZones', 'availability', 'experience', 'bankAccountHolderName']
      : [...STORE_REQUIRED, 'categories', 'pickupInstructions', 'bankAccountHolderName'];
    const next: Record<string, any> = {};
    keys.forEach((key) => {
      const raw = String(form[key] || '').trim();
      if (!raw) return;
      if (['latitude', 'longitude', 'serviceRadiusKm', 'orderCapacity'].includes(key)) {
        const numeric = Number(raw);
        if (Number.isFinite(numeric)) next[key] = numeric;
      } else if (['preferredZones', 'categories'].includes(key)) {
        next[key] = raw.split(',').map((item) => item.trim()).filter(Boolean);
      } else {
        next[key] = raw;
      }
    });
    if (form.bankAccountNumber.trim()) next.bankAccountNumber = form.bankAccountNumber.trim();
    if (form.bankIfsc.trim()) next.bankIfsc = form.bankIfsc.trim();
    return next;
  }, [application.type, form]);

  if (!editable) {
    return null;
  }

  const saveProfile = async () => {
    setBusy('profile');
    try {
      const response = await apiClient.patch(`/admin/partner-onboarding/internal-applications/${application.id}`, {
        applicantName: form.applicantName.trim(),
        phoneE164: form.phoneE164.trim(),
        email: form.email.trim() || undefined,
        payload,
      });
      toast.success('Internal profile saved securely.', 'Partner draft updated');
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
        note: 'Internal onboarding completed by Admin. Documents ready for verification.',
      });
      toast.success('Verify the uploaded documents, then approve and provision the account.', 'Internal application ready for review');
      onUpdated(response.data);
    } catch {
      // Global interceptor handles exact API errors.
    } finally {
      setBusy('');
    }
  };

  return (
    <section className="rounded-2xl border-2 border-teal-200 bg-teal-50/40 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-teal-700">Admin internal onboarding</p><h3 className="mt-1 text-lg font-black text-slate-950">Complete the partner before approval</h3><p className="mt-1 max-w-2xl text-xs font-semibold leading-5 text-slate-600">Fill the operational profile, verify the primary contact, and upload every mandatory private document. Bank details are encrypted by the API and are never returned in raw form.</p></div>
        <span className="h-fit rounded-full border border-teal-200 bg-white px-3 py-1 text-[10px] font-black text-teal-800">{application.status}</span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        <Checklist ok={profileComplete} text="Profile complete" />
        <Checklist ok={primaryVerified} text="Contact verified" />
        <Checklist ok={requiredFilesPresent} text="Required documents uploaded" />
      </div>

      <div className="mt-5 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3"><div><h4 className="text-sm font-black text-slate-950">1. Partner profile</h4><p className="mt-1 text-xs font-semibold text-slate-500">Save this section before document submission if you change the vehicle type; required Rider documents are calculated from it.</p></div><Save className="h-5 w-5 text-teal-700" /></div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          <InputField label={application.type === 'RIDER' ? 'Rider name' : 'Owner / applicant name'} value={form.applicantName} onChange={(value) => set('applicantName', value)} />
          <InputField label="Primary mobile" value={form.phoneE164} onChange={(value) => set('phoneE164', value)} />
          <InputField label="Optional email" value={form.email} onChange={(value) => set('email', value)} type="email" />
          {application.type === 'RIDER' ? (
            <>
              <InputField label="Date of birth" value={form.dateOfBirth || ''} onChange={(value) => set('dateOfBirth', value)} type="date" />
              <InputField label="Address" value={form.addressLine1 || ''} onChange={(value) => set('addressLine1', value)} />
              <InputField label="City" value={form.city || ''} onChange={(value) => set('city', value)} />
              <InputField label="State" value={form.state || ''} onChange={(value) => set('state', value)} />
              <InputField label="Pincode" value={form.pincode || ''} onChange={(value) => set('pincode', value)} />
              <label className="block"><span className="mb-1.5 block text-[11px] font-black uppercase tracking-wide text-slate-500">Vehicle type</span><select value={form.vehicleType || ''} onChange={(event) => set('vehicleType', event.target.value)} className={fieldClass}><option value="">Select vehicle</option><option value="WALKER">Walker</option><option value="BICYCLE">Bicycle</option><option value="MOTORCYCLE">Motorcycle</option><option value="SCOOTER">Scooter</option><option value="CAR">Car</option><option value="VAN">Van</option></select></label>
              <InputField label="Vehicle number (if registered)" value={form.vehicleNumber || ''} onChange={(value) => set('vehicleNumber', value)} />
              <InputField label="Emergency contact name" value={form.emergencyContactName || ''} onChange={(value) => set('emergencyContactName', value)} />
              <InputField label="Emergency contact phone" value={form.emergencyContactPhone || ''} onChange={(value) => set('emergencyContactPhone', value)} />
              <InputField label="Preferred zones (comma separated)" value={form.preferredZones || ''} onChange={(value) => set('preferredZones', value)} />
              <InputField label="Availability" value={form.availability || ''} onChange={(value) => set('availability', value)} />
            </>
          ) : (
            <>
              <InputField label="Legal business name" value={form.legalName || ''} onChange={(value) => set('legalName', value)} />
              <InputField label="Store display name" value={form.displayName || ''} onChange={(value) => set('displayName', value)} />
              <InputField label="Business type" value={form.businessType || ''} onChange={(value) => set('businessType', value)} />
              <InputField label="Store address" value={form.storeAddress || ''} onChange={(value) => set('storeAddress', value)} />
              <InputField label="City" value={form.city || ''} onChange={(value) => set('city', value)} />
              <InputField label="State" value={form.state || ''} onChange={(value) => set('state', value)} />
              <InputField label="Pincode" value={form.pincode || ''} onChange={(value) => set('pincode', value)} />
              <InputField label="Latitude" value={form.latitude || ''} onChange={(value) => set('latitude', value)} type="number" />
              <InputField label="Longitude" value={form.longitude || ''} onChange={(value) => set('longitude', value)} type="number" />
              <InputField label="Operating hours" value={form.operatingHours || ''} onChange={(value) => set('operatingHours', value)} placeholder="7 AM–11 PM" />
              <InputField label="Service radius (km)" value={form.serviceRadiusKm || ''} onChange={(value) => set('serviceRadiusKm', value)} type="number" />
              <InputField label="Daily order capacity" value={form.orderCapacity || ''} onChange={(value) => set('orderCapacity', value)} type="number" />
              <InputField label="Categories (comma separated)" value={form.categories || ''} onChange={(value) => set('categories', value)} />
              <InputField label="Pickup instructions" value={form.pickupInstructions || ''} onChange={(value) => set('pickupInstructions', value)} />
            </>
          )}
          <InputField label="Bank account holder" value={form.bankAccountHolderName || ''} onChange={(value) => set('bankAccountHolderName', value)} />
          <InputField label={`Bank account number${application.applicantPayload?.bankAccountLast4 ? ` (saved ••••${application.applicantPayload.bankAccountLast4})` : ''}`} value={form.bankAccountNumber} onChange={(value) => set('bankAccountNumber', value)} placeholder={application.applicantPayload?.bankAccountLast4 ? 'Leave blank to keep saved account' : ''} />
          <InputField label={`IFSC${application.applicantPayload?.bankIfscLast4 ? ` (saved ••••${application.applicantPayload.bankIfscLast4})` : ''}`} value={form.bankIfsc} onChange={(value) => set('bankIfsc', value)} placeholder={application.applicantPayload?.bankIfscLast4 ? 'Leave blank to keep saved IFSC' : ''} />
        </div>
        <button type="button" onClick={() => void saveProfile()} disabled={Boolean(busy)} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3 text-sm font-black text-white disabled:opacity-50">
          {busy === 'profile' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save internal profile
        </button>
      </div>

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4">
        <div className="flex items-center justify-between gap-3"><div><h4 className="text-sm font-black text-slate-950">2. Required private documents</h4><p className="mt-1 text-xs font-semibold text-slate-500">JPEG, PNG, WebP or PDF, maximum 10 MB each. Required types are enforced again by the API.</p></div><FileUp className="h-5 w-5 text-teal-700" /></div>
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
        <div className="flex gap-3">{canSubmit ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /> : <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />}<div><p className="text-sm font-black text-slate-950">3. Send internal draft to review</p><p className="mt-1 text-xs font-semibold leading-5 text-slate-600">{canSubmit ? 'The profile, contact and mandatory uploads are complete. Start review, verify each document, then use the existing Approve and provision action.' : 'Complete the profile, verify the primary contact in the Contact section, and upload every mandatory document first.'}</p></div></div>
        <button type="button" onClick={() => void submit()} disabled={!canSubmit || Boolean(busy)} className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-3 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-40">{busy === 'submit' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Start internal review</button>
      </div>
    </section>
  );
}

function Checklist({ ok, text }: { ok: boolean; text: string }) {
  return <div className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-black ${ok ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'}`}>{ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}{text}</div>;
}
