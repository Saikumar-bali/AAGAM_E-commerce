'use client';

import React, { useEffect, useState } from 'react';
import { Bike, Loader2, Plus, Store, X } from 'lucide-react';
import { apiClient } from '@aagam/utils';
import { useToast } from '@/components/ToastProvider';

export { InternalPartnerDraftControls } from './InternalPartnerOnboarding';

type ApplicationType = 'RIDER' | 'STORE';

type CreateProps = {
  onCreated: (detail: any) => void;
  fixedType?: ApplicationType;
  buttonLabel?: string;
};

const fieldClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100';

function InputField({
  label,
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
      <span className="mb-1.5 block text-xs font-black text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className={fieldClass}
      />
    </label>
  );
}

export function InternalPartnerCreateButton({ onCreated, fixedType, buttonLabel }: CreateProps) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    type: fixedType || ('RIDER' as ApplicationType),
    applicantName: '',
    phoneE164: '',
    email: '',
    password: '',
    confirmPassword: '',
  });

  useEffect(() => {
    if (fixedType) setForm((current) => ({ ...current, type: fixedType }));
  }, [fixedType]);

  const currentType = fixedType || form.type;
  const roleName = currentType === 'RIDER' ? 'Rider' : 'Store';

  const reset = () => {
    setForm({
      type: fixedType || 'RIDER',
      applicantName: '',
      phoneE164: '',
      email: '',
      password: '',
      confirmPassword: '',
    });
  };

  const create = async () => {
    if (form.applicantName.trim().length < 2) {
      toast.warning('Enter a valid name.');
      return;
    }
    const phoneDigits = form.phoneE164.replace(/\D/g, '');
    if (phoneDigits.length < 10) {
      toast.warning('Enter a valid mobile number.');
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim())) {
      toast.warning('Enter a valid email address.');
      return;
    }
    if (form.password && form.password.length < 8) {
      toast.warning('Password must be at least 8 characters.');
      return;
    }
    if (form.password !== form.confirmPassword) {
      toast.warning('Passwords do not match.');
      return;
    }

    setSubmitting(true);
    try {
      const response = await apiClient.post('/admin/partner-onboarding/internal-applications', {
        type: currentType,
        applicantName: form.applicantName.trim(),
        phoneE164: form.phoneE164.trim(),
        email: form.email.trim(),
        password: form.password || undefined,
        payload: currentType === 'RIDER'
          ? { vehicleType: 'MOTORCYCLE', availability: 'Full day' }
          : undefined,
      });
      toast.success(`${roleName} account created.`);
      onCreated(response.data);
      setOpen(false);
      reset();
    } catch {
      // The shared API interceptor displays the exact backend message as a toast.
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-black text-white shadow-sm hover:bg-teal-800"
      >
        <Plus className="h-4 w-4" />
        {buttonLabel || (fixedType === 'RIDER' ? 'Add Rider' : fixedType === 'STORE' ? 'Add Store' : 'Create partner')}
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[90] grid place-items-center bg-slate-950/65 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={`Create ${roleName}`}
        >
          <div className="w-full max-w-lg rounded-3xl bg-white p-5 shadow-2xl sm:p-6">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-2xl font-black text-slate-950">Create {roleName}</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="rounded-xl p-2 text-slate-500 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {!fixedType ? (
              <div className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1.5">
                {(['RIDER', 'STORE'] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setForm((current) => ({ ...current, type }))}
                    className={`inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-black ${form.type === type ? 'bg-white text-teal-800 shadow-sm' : 'text-slate-500'}`}
                  >
                    {type === 'RIDER' ? <Bike className="h-4 w-4" /> : <Store className="h-4 w-4" />}
                    {type === 'RIDER' ? 'Rider' : 'Store'}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="mt-5 space-y-4">
              <InputField
                label={currentType === 'RIDER' ? 'Rider name' : 'Owner name'}
                value={form.applicantName}
                onChange={(value) => setForm((current) => ({ ...current, applicantName: value }))}
                placeholder="Enter name"
              />
              <InputField
                label="Phone number"
                value={form.phoneE164}
                onChange={(value) => setForm((current) => ({ ...current, phoneE164: value.replace(/[^+0-9]/g, '') }))}
                placeholder="10-digit mobile number"
              />
              <InputField
                label="Email address"
                value={form.email}
                onChange={(value) => setForm((current) => ({ ...current, email: value }))}
                type="email"
                placeholder="name@example.com"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <InputField
                  label="Password (optional)"
                  value={form.password}
                  onChange={(value) => setForm((current) => ({ ...current, password: value }))}
                  type="password"
                  placeholder="Minimum 8 characters"
                />
                <InputField
                  label="Confirm password"
                  value={form.confirmPassword}
                  onChange={(value) => setForm((current) => ({ ...current, confirmPassword: value }))}
                  type="password"
                  placeholder="Re-enter password"
                />
              </div>
            </div>

            <button
              type="button"
              onClick={() => void create()}
              disabled={submitting}
              className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-slate-950 px-4 py-3.5 text-sm font-black text-white disabled:opacity-50"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Create {roleName}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
