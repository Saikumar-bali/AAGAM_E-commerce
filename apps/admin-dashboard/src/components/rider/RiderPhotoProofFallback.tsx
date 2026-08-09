'use client';

import React, { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { Camera, CheckCircle2, MapPin, ShieldCheck, X } from 'lucide-react';
import { apiClient } from '@aagam/utils';
import { useToast } from '@/components/ToastProvider';

function currentLocation() {
  return new Promise<{ latitude: number; longitude: number; accuracyMetres?: number }>((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Location is unavailable in this browser.'));
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracyMetres: position.coords.accuracy,
      }),
      () => reject(new Error('Location permission is required for photo proof.')),
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 5_000 },
    );
  });
}

function errorMessage(error: any) {
  const value = error?.response?.data?.message;
  if (Array.isArray(value)) return value.join(', ');
  return value || error?.message || 'Photo proof could not be submitted.';
}

export default function RiderPhotoProofFallback() {
  const pathname = usePathname();
  const activePage = pathname === '/rider/delivery';
  const toast = useToast();
  const [job, setJob] = useState<any>(null);
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!activePage) return;
    let alive = true;
    const load = async () => {
      try {
        const response = await apiClient.get('/riders/portal/delivery');
        if (alive) setJob(response.data || null);
      } catch {
        if (alive) setJob(null);
      }
    };
    void load();
    const timer = window.setInterval(() => void load(), 8_000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [activePage]);

  if (!activePage || job?.status !== 'RIDER_AT_CUSTOMER') return null;

  const submit = async () => {
    if (!file || !confirmed || submitting) return;
    setSubmitting(true);
    try {
      const location = await currentLocation();
      const body = new FormData();
      body.append('file', file);
      body.append('riderConfirmed', 'true');
      body.append('latitude', String(location.latitude));
      body.append('longitude', String(location.longitude));
      if (location.accuracyMetres != null) body.append('accuracyMetres', String(location.accuracyMetres));
      body.append('note', 'Customer OTP unavailable. Rider submitted browser camera delivery proof.');
      await apiClient.post(
        `/orders/delivery-photo-proof/jobs/${encodeURIComponent(job.id)}/complete`,
        body,
        { headers: { 'Idempotency-Key': `rider-web-photo:${job.id}:${Date.now()}` } },
      );
      toast.success('Photo and GPS proof saved. Delivery is complete.');
      setOpen(false);
      setFile(null);
      setConfirmed(false);
      setJob(null);
      window.setTimeout(() => window.location.reload(), 500);
    } catch (error: any) {
      toast.error(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-[70] inline-flex min-h-12 items-center gap-2 rounded-full bg-teal-700 px-4 text-sm font-black text-white shadow-xl hover:bg-teal-800"
      >
        <Camera className="h-4 w-4" /> OTP unavailable? Photo proof
      </button>

      {open ? (
        <div className="fixed inset-0 z-[100] grid place-items-center bg-slate-950/70 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Delivery photo proof">
          <div className="relative w-full max-w-md rounded-3xl bg-white p-5 shadow-2xl sm:p-6">
            <button type="button" onClick={() => !submitting && setOpen(false)} className="absolute right-4 top-4 rounded-full bg-slate-100 p-2 text-slate-500"><X className="h-5 w-5" /></button>
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-teal-50"><ShieldCheck className="h-6 w-6 text-teal-700" /></div>
            <p className="mt-4 text-xs font-black uppercase tracking-widest text-teal-700">Delivery fallback · #{String(job.order?.id || '').slice(-8).toUpperCase()}</p>
            <h2 className="mt-1 text-2xl font-black text-slate-950">Use a delivery photo</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-500">Use this only when the customer cannot provide the OTP. A fresh photo and your GPS location are stored with the delivery audit.</p>

            <label className="mt-5 block cursor-pointer rounded-2xl border-2 border-dashed border-teal-200 bg-teal-50/50 p-4 text-center">
              <Camera className="mx-auto h-9 w-9 text-teal-700" />
              <span className="mt-2 block text-sm font-black text-teal-800">{file ? 'Photo selected — tap to retake or choose another' : 'Take delivery photo'}</span>
              <span className="mt-1 block text-xs font-semibold text-slate-500">JPG, PNG or WebP · up to 10 MB</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp"
                capture="environment"
                className="sr-only"
                onChange={(event) => {
                  const next = event.target.files?.[0] || null;
                  if (next && next.size > 10 * 1024 * 1024) {
                    toast.warning('Photo must be smaller than 10 MB.');
                    event.currentTarget.value = '';
                    return;
                  }
                  setFile(next);
                }}
              />
            </label>

            <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl bg-slate-50 p-4 text-sm font-bold text-slate-700">
              <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1 h-4 w-4" />
              <span>I confirm the parcel was handed over and this photo is genuine delivery proof.</span>
            </label>
            <div className="mt-3 flex items-center gap-2 rounded-xl bg-teal-50 p-3 text-xs font-bold text-teal-800"><MapPin className="h-4 w-4" /> GPS permission is required for photo fallback.</div>

            <button
              type="button"
              disabled={!file || !confirmed || submitting}
              onClick={() => void submit()}
              className="mt-5 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-teal-700 px-4 text-sm font-black text-white disabled:opacity-40"
            >
              <CheckCircle2 className="h-5 w-5" /> {submitting ? 'Saving proof…' : 'Submit photo proof & complete delivery'}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
