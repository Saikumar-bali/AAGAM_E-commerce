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
      <div className="space-y-4">
        <header className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="enterprise-kicker">Pickup proof</p>
              <h1 className="mt-1 text-lg font-semibold text-slate-950">Pickup proof</h1>
              <p className="mt-0.5 text-xs text-slate-500">
                Issue a one-time store PIN/QR or confirm physical handoff.
              </p>
            </div>
            <button
              onClick={() => void load()}
              className="enterprise-button"
            >
              <RefreshCw
                className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
              Refresh
            </button>
          </div>
        </header>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
            {error}
          </div>
        )}

        {!loading && jobs.length === 0 && (
          <div className="rounded-xl border border-dashed border-slate-200 bg-white p-10 text-center">
            <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500" />
            <p className="mt-3 text-base font-semibold text-slate-600">No riders awaiting pickup proof</p>
          </div>
        )}

        {jobs.map((job) => (
          <article
            key={job.id}
            className="enterprise-card p-4 sm:p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-mono text-base font-semibold text-slate-950">
                  Order #{job.orderId.slice(-8).toUpperCase()}
                </p>
                <p className="mt-1 text-[11px] text-slate-500">
                  Rider: {job.currentRider?.user?.name || "Assigned Rider"}
                </p>
              </div>
              <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
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
                  className="ml-2 w-20 rounded-md border border-slate-200 px-2 py-1.5 text-center text-sm text-slate-900"
                />
              </label>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                disabled={Boolean(busy)}
                onClick={() => void issue(job.id, "STORE_PICKUP_PIN")}
                className="enterprise-button py-2"
              >
                <ShieldCheck className="mr-1.5 h-4 w-4" /> Issue PIN
              </button>
              <button
                disabled={Boolean(busy)}
                onClick={() => void issue(job.id, "QR_CODE")}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                <QrCode className="h-4 w-4" /> Issue QR
              </button>
              <button
                disabled={Boolean(busy)}
                onClick={() => void confirm(job.id)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-800"
              >
                <CheckCircle2 className="h-4 w-4" /> Confirm handoff
              </button>
            </div>

            {challenges[job.id] && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                  One-time {challenges[job.id].method.replace(/_/g, " ")}
                </p>
                <p className="mt-2 break-all font-mono text-lg font-semibold text-amber-950">
                  {challenges[job.id].code}
                </p>
                <p className="mt-1.5 text-[11px] text-amber-700">
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
