'use client';

import { apiClient } from '@aagam/utils';
import { Clock3, KeyRound, RefreshCw, ShieldCheck, X } from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';

type Props = {
  deliveryJobId?: string | null;
  open: boolean;
  onClose: () => void;
};

function errorMessage(error: any) {
  const value = error?.response?.data?.message;
  if (Array.isArray(value)) return value.join(', ');
  return value || error?.message || 'The delivery code is not available yet.';
}

function secondsUntilExpiry(expiresAt?: string | null) {
  if (!expiresAt) return 0;
  const ms = new Date(expiresAt).getTime() - Date.now();
  return Math.max(0, Math.ceil(ms / 1000));
}

function formatCode(code: string) {
  return code.replace(/\D/g, '').slice(0, 6).split('').join(' ');
}

export default function DeliveryCodeModal({ deliveryJobId, open, onClose }: Props) {
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remaining, setRemaining] = useState(0);
  const requestSequence = useRef(0);

  const load = async (jobId = deliveryJobId) => {
    if (!jobId || !open) return;
    const requestId = ++requestSequence.current;
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get(
        `/orders/delivery-operations/jobs/${encodeURIComponent(jobId)}/otp/customer`,
      );
      if (requestId !== requestSequence.current) return;
      setCode(String(res.data?.code || ''));
      setExpiresAt(res.data?.expiresAt || null);
    } catch (err: any) {
      if (requestId !== requestSequence.current) return;
      setCode(null);
      setExpiresAt(null);
      setError(errorMessage(err));
    } finally {
      if (requestId === requestSequence.current) setLoading(false);
    }
  };

  useEffect(() => {
    if (!open || !deliveryJobId) {
      requestSequence.current += 1;
      setLoading(false);
      return;
    }
    const activeJobId = deliveryJobId;
    requestSequence.current += 1;
    setCode(null);
    setExpiresAt(null);
    setError(null);
    setLoading(false);
    void load(activeJobId);
    const timer = window.setInterval(() => void load(activeJobId), 15_000);
    return () => {
      requestSequence.current += 1;
      window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, deliveryJobId]);

  useEffect(() => {
    if (!open || !expiresAt) { setRemaining(0); return; }
    const tick = () => setRemaining(secondsUntilExpiry(expiresAt));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [open, expiresAt]);

  useEffect(() => {
    if (open) {
      const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
      window.addEventListener('keydown', onKey);
      return () => window.removeEventListener('keydown', onKey);
    }
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-slate-100 text-slate-500 transition hover:bg-slate-200 hover:text-slate-700"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950 p-6 pb-5 text-white">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15">
              <ShieldCheck className="h-5 w-5 text-violet-200" />
            </div>
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-violet-300">Secure handoff</p>
              <h2 className="mt-1 text-lg font-black tracking-tight">Delivery verification code</h2>
              <p className="mt-1 text-xs font-semibold leading-5 text-slate-300">
                Read this code to the rider only after checking the parcel. Never share before handoff.
              </p>
            </div>
          </div>
        </div>

        <div className="p-6">
          {code ? (
            <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-6 text-center shadow-sm">
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-violet-500">Delivery OTP</p>
              <p className="mt-3 font-mono text-5xl font-black tracking-[0.3em] text-slate-950">{formatCode(code)}</p>
              {remaining > 0 ? (
                <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-slate-500">
                  <Clock3 className="h-3.5 w-3.5" /> Expires in {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}
                </p>
              ) : (
                <p className="mt-3 text-xs font-bold text-red-500">Code expired — ask rider to issue a new one</p>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-violet-200 bg-violet-50/50 p-5 text-center text-sm font-bold text-violet-800">
              {loading ? (
                <span className="inline-flex items-center gap-2"><RefreshCw className="h-4 w-4 animate-spin" /> Checking for an active code...</span>
              ) : (
                error || 'Ask the rider to issue the delivery code from the Operations tab.'
              )}
            </div>
          )}

          <div className="mt-5 flex items-center justify-between">
            <button
              onClick={() => void load(deliveryJobId)}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
            <button
              onClick={onClose}
              className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-black text-white transition hover:bg-slate-800"
            >
              Done
            </button>
          </div>

          <p className="mt-4 rounded-xl bg-amber-50 border border-amber-200 p-3 text-[11px] font-semibold leading-5 text-amber-800">
            The code is short-lived and tied only to this delivery job. AAGAAM staff should never ask for it over a phone call or chat before handoff.
          </p>
        </div>
      </div>
    </div>
  );
}
