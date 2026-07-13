'use client';

import { apiClient } from '@aagam/utils';
import { Clock3, KeyRound, RefreshCw, ShieldCheck } from 'lucide-react';
import React, { useEffect, useState } from 'react';

type Props = {
  deliveryJobId?: string | null;
  active: boolean;
};

function errorMessage(error: any) {
  const value = error?.response?.data?.message;
  if (Array.isArray(value)) return value.join(', ');
  return value || error?.message || 'The delivery code is not available yet.';
}

export default function CustomerDeliveryOtpCard({ deliveryJobId, active }: Props) {
  const [code, setCode] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!deliveryJobId || !active) return;
    setLoading(true);
    setError(null);
    try {
      const response = await apiClient.get(
        `/orders/delivery-operations/jobs/${encodeURIComponent(deliveryJobId)}/otp/customer`,
      );
      setCode(String(response.data?.code || ''));
      setExpiresAt(response.data?.expiresAt || null);
    } catch (err: any) {
      setCode(null);
      setExpiresAt(null);
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setCode(null);
    setExpiresAt(null);
    setError(null);
    if (active && deliveryJobId) void load();
    // A new code may be issued after the customer opens this order. Poll only
    // while handoff is active and stop immediately when the component unmounts.
    const timer = active && deliveryJobId ? window.setInterval(load, 15_000) : null;
    return () => {
      if (timer) window.clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, deliveryJobId]);

  if (!active || !deliveryJobId) return null;

  return (
    <section className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-5 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-violet-700 text-white">
            <KeyRound className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-violet-950">
              <ShieldCheck className="h-4 w-4" />
              <h2 className="text-sm font-black">Customer-only delivery code</h2>
            </div>
            <p className="mt-1 max-w-xl text-sm font-semibold text-violet-800">
              Read this code to the rider only after checking the parcel. The rider cannot retrieve it from their account.
            </p>
          </div>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-violet-200 bg-white px-3 py-2 text-xs font-black text-violet-800 disabled:opacity-60"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh code
        </button>
      </div>

      {code ? (
        <div className="mt-4 rounded-2xl border border-violet-200 bg-white p-5 text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-violet-500">Delivery OTP</p>
          <p className="mt-2 font-mono text-4xl font-black tracking-[0.3em] text-slate-950">{code}</p>
          {expiresAt && (
            <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-slate-500">
              <Clock3 className="h-3.5 w-3.5" /> Expires {new Date(expiresAt).toLocaleTimeString('en-IN')}
            </p>
          )}
        </div>
      ) : (
        <div className="mt-4 rounded-xl border border-dashed border-violet-200 bg-white/70 p-4 text-sm font-bold text-violet-800">
          {loading ? 'Checking for an active code…' : error || 'Ask the rider to issue the delivery code after arriving.'}
        </div>
      )}
    </section>
  );
}
