"use client";

import DashboardLayout from "@/components/DashboardLayout";
import { apiClient } from "@aagam/utils";
import { CheckCircle2, QrCode, RefreshCw, ShieldCheck } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";

function message(error: any) {
  return error?.response?.data?.message || "Pickup proof action failed.";
}

export default function StorePickupProofPage() {
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [parcelCounts, setParcelCounts] = useState<Record<string, number>>({});
  const [challenges, setChallenges] = useState<Record<string, any>>({});
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiClient.get("/orders/delivery-operations/queue");
      setJobs(
        (Array.isArray(response.data) ? response.data : []).filter(
          (job: any) => job.status === "RIDER_AT_STORE"
        )
      );
    } catch (cause: any) {
      setError(message(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const parcels = (jobId: string) => Number(parcelCounts[jobId] || 1);

  const issue = async (jobId: string, method: string) => {
    setBusy(`${jobId}:${method}`);
    setError("");
    try {
      const response = await apiClient.post(
        `/orders/delivery-operations/jobs/${jobId}/pickup/challenge`,
        { method, parcelCount: parcels(jobId) }
      );
      setChallenges((current) => ({ ...current, [jobId]: response.data }));
    } catch (cause: any) {
      setError(message(cause));
    } finally {
      setBusy("");
    }
  };

  const confirm = async (jobId: string) => {
    if (!window.confirm("Confirm the physical parcel handoff to this Rider?"))
      return;
    setBusy(`${jobId}:confirm`);
    setError("");
    try {
      await apiClient.post(
        `/orders/delivery-operations/jobs/${jobId}/pickup/confirm`,
        { parcelCount: parcels(jobId) }
      );
      setChallenges((current) => {
        const next = { ...current };
        delete next[jobId];
        return next;
      });
      await load();
    } catch (cause: any) {
      setError(message(cause));
    } finally {
      setBusy("");
    }
  };

  return (
    <DashboardLayout allowedRole="STORE_OWNER">
      <div className="space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-4 rounded-[2rem] bg-slate-950 p-6 text-white">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-emerald-300">
              Phase 5 handoff control
            </p>
            <h1 className="mt-2 text-3xl font-black">Pickup Proof</h1>
            <p className="mt-2 text-sm text-slate-300">
              Issue a one-time store PIN/QR or confirm physical handoff. Codes
              are shown only here and stored only as hashes.
            </p>
          </div>
          <button
            onClick={() => void load()}
            className="rounded-xl bg-white px-4 py-2.5 text-sm font-black text-slate-950"
          >
            <RefreshCw
              className={`mr-2 inline h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
            Refresh
          </button>
        </header>

        {error && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-800">
            {error}
          </div>
        )}

        {!loading && jobs.length === 0 && (
          <div className="rounded-2xl border border-dashed bg-white p-12 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
            <p className="mt-3 font-black">No Riders awaiting pickup proof</p>
          </div>
        )}

        {jobs.map((job) => (
          <article
            key={job.id}
            className="rounded-2xl border bg-white p-5 shadow-sm"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-lg font-black">
                  Order #{job.orderId.slice(-8).toUpperCase()}
                </p>
                <p className="mt-1 text-sm font-semibold text-slate-600">
                  Rider: {job.currentRider?.user?.name || "Assigned Rider"}
                </p>
              </div>
              <label className="text-xs font-black uppercase text-slate-500">
                Parcel count
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={parcels(job.id)}
                  onChange={(event) =>
                    setParcelCounts((current) => ({
                      ...current,
                      [job.id]: Number(event.target.value),
                    }))
                  }
                  className="ml-2 w-20 rounded-lg border px-2 py-2 text-center text-slate-950"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                disabled={Boolean(busy)}
                onClick={() => void issue(job.id, "STORE_PICKUP_PIN")}
                className="rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-black text-white"
              >
                <ShieldCheck className="mr-2 inline h-4 w-4" /> Issue PIN
              </button>
              <button
                disabled={Boolean(busy)}
                onClick={() => void issue(job.id, "QR_CODE")}
                className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white"
              >
                <QrCode className="mr-2 inline h-4 w-4" /> Issue QR value
              </button>
              <button
                disabled={Boolean(busy)}
                onClick={() => void confirm(job.id)}
                className="rounded-xl bg-emerald-700 px-4 py-2.5 text-sm font-black text-white"
              >
                Confirm store handoff
              </button>
            </div>

            {challenges[job.id] && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-xs font-black uppercase text-amber-700">
                  One-time {challenges[job.id].method.replace(/_/g, " ")}
                </p>
                <p className="mt-2 break-all font-mono text-xl font-black text-amber-950">
                  {challenges[job.id].code}
                </p>
                <p className="mt-2 text-xs font-semibold text-amber-800">
                  Expires{" "}
                  {new Date(challenges[job.id].expiresAt).toLocaleString(
                    "en-IN"
                  )}
                  . Do not screenshot production codes.
                </p>
              </div>
            )}
          </article>
        ))}
      </div>
    </DashboardLayout>
  );
}
