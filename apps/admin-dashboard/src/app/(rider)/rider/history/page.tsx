"use client";
import React, { useCallback, useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { apiClient } from "@aagam/utils";
import { Calendar, ChevronDown } from "lucide-react";
import {
  EmptyPanel,
  ErrorBanner,
  PortalLoading,
  RefreshButton,
  RiderPageHeader,
} from "@/components/rider/RiderPortalUi";
export default function RiderHistoryPage() {
  const [rows, setRows] = useState<any[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [status, setStatus] = useState("ALL"),
    [from, setFrom] = useState(""),
    [to, setTo] = useState(""),
    [open, setOpen] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const p = new URLSearchParams({ status });
      if (from) p.set("from", new Date(`${from}T00:00:00`).toISOString());
      if (to) p.set("to", new Date(`${to}T23:59:59`).toISOString());
      setRows((await apiClient.get(`/riders/portal/history?${p}`)).data || []);
    } catch (e: any) {
      setError(
        e?.response?.data?.message || "Could not load delivery history."
      );
    } finally {
      setLoading(false);
    }
  }, [status, from, to]);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <DashboardLayout allowedRole="RIDER">
      <div className="space-y-5">
        <RiderPageHeader
          title="Delivery History"
          subtitle="Completed, failed, cancelled, and returned deliveries with actual timestamps and canonical audit details. Order totals are never treated as Rider earnings."
          backHref="/rider"
          action={<RefreshButton onClick={load} loading={loading} />}
        />
        <ErrorBanner message={error} />
        <section className="grid gap-3 rounded-2xl border bg-white p-4 md:grid-cols-3">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-xl border px-3 py-2.5 font-semibold"
          >
            <option value="ALL">All terminal outcomes</option>
            <option value="DELIVERED">Completed</option>
            <option value="DELIVERY_FAILED">Failed</option>
            <option value="CANCELLED">Cancelled</option>
            <option value="RETURNED_TO_STORE">Returned</option>
          </select>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-xl border px-3 py-2.5"
          />
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-xl border px-3 py-2.5"
          />
        </section>
        {loading ? (
          <PortalLoading />
        ) : rows.length === 0 ? (
          <EmptyPanel
            title="No matching deliveries"
            body="Adjust the outcome or date filters."
          />
        ) : (
          <div className="space-y-3">
            {rows.map((job: any) => {
              const actual =
                job.order.deliveredAt ||
                job.events?.slice(-1)[0]?.createdAt ||
                job.updatedAt;
              return (
                <article
                  key={job.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5"
                >
                  <button
                    onClick={() => setOpen(open === job.id ? null : job.id)}
                    className="flex w-full items-start justify-between gap-4 text-left"
                  >
                    <div>
                      <p className="font-mono font-black text-slate-950">
                        #{job.order.id.slice(-8).toUpperCase()}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-500">
                        {job.order.store?.name} ·{" "}
                        {job.order.customer?.name || "Customer"}
                      </p>
                      <p className="mt-2 flex items-center gap-2 text-xs font-bold text-slate-500">
                        <Calendar className="h-3.5 w-3.5" />
                        Actual outcome:{" "}
                        {new Date(actual).toLocaleString("en-IN")}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black">
                        {job.status.replace(/_/g, " ")}
                      </span>
                      <ChevronDown
                        className={`h-4 w-4 transition ${
                          open === job.id ? "rotate-180" : ""
                        }`}
                      />
                    </div>
                  </button>
                  {open === job.id && (
                    <div className="mt-4 border-t pt-4">
                      <p className="text-sm font-black">Job audit</p>
                      <div className="mt-3 space-y-2">
                        {job.events.map((event: any) => (
                          <div
                            key={event.id}
                            className="rounded-xl bg-slate-50 p-3 text-sm"
                          >
                            <span className="font-black">
                              {event.eventType.replace(/_/g, " ")}
                            </span>
                            <span className="ml-2 text-slate-500">
                              {new Date(event.createdAt).toLocaleString(
                                "en-IN"
                              )}
                            </span>
                            {event.toStatus && (
                              <span className="ml-2 text-indigo-700">
                                → {event.toStatus.replace(/_/g, " ")}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
