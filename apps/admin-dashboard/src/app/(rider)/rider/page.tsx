"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";
import { apiClient } from "@aagam/utils";
import {
  Bell,
  Bike,
  CheckCircle2,
  Clock3,
  PackageCheck,
  Power,
  Truck,
} from "lucide-react";
import {
  ErrorBanner,
  MetricCard,
  PortalLoading,
  RefreshButton,
  RiderPageHeader,
} from "@/components/rider/RiderPortalUi";

export default function RiderHomePage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData((await apiClient.get("/riders/portal/home")).data);
    } catch (e: any) {
      setError(e?.response?.data?.message || "Could not load Rider home.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const setStatus = async (status: "ONLINE" | "OFFLINE") => {
    setWorking(true);
    setError("");
    try {
      await apiClient.patch("/riders/portal/availability/status", { status });
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || "Status change failed.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <DashboardLayout allowedRole="RIDER">
      <div className="space-y-5">
        <RiderPageHeader
          title="Rider Home"
          subtitle="Live operational status, addressed offers, active work, today’s completions, and real alerts."
          action={<RefreshButton onClick={load} loading={loading} />}
        />
        <ErrorBanner message={error} />
        {loading && !data ? (
          <PortalLoading />
        ) : (
          <>
            <section className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-xs font-black uppercase tracking-wider text-slate-400">
                  Availability
                </p>
                <p className="mt-1 text-xl font-black text-slate-950">
                  {data?.rider?.status || "OFFLINE"}
                  {data?.currentBreak ? " · ON BREAK" : ""}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setStatus("ONLINE")}
                  disabled={working || data?.rider?.status === "BUSY"}
                  className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-40"
                >
                  <Power className="mr-2 inline h-4 w-4" />
                  Go Online
                </button>
                <button
                  onClick={() => setStatus("OFFLINE")}
                  disabled={working || data?.rider?.status === "BUSY"}
                  className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white disabled:opacity-40"
                >
                  Go Offline
                </button>
              </div>
            </section>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Pending offers"
                value={data?.pendingOffers || 0}
                tone="indigo"
              />
              <MetricCard
                label="Active job"
                value={data?.activeJob ? 1 : 0}
                tone="amber"
              />
              <MetricCard
                label="Completed today"
                value={data?.completedToday || 0}
                tone="emerald"
              />
              <MetricCard
                label="Unread alerts"
                value={data?.unreadCount || 0}
              />
            </section>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[
                [
                  "Job Offers",
                  "/rider/offers",
                  Bike,
                  "Only directly addressed offers",
                ],
                [
                  "Current Delivery",
                  "/rider/delivery",
                  Truck,
                  "Canonical delivery timeline",
                ],
                [
                  "Pickup Tasks",
                  "/rider/pickup",
                  PackageCheck,
                  "Parcel and item checks",
                ],
                [
                  "Notifications",
                  "/rider/notifications",
                  Bell,
                  "Foreground and background alerts",
                ],
              ].map(([label, href, Icon, body]: any) => (
                <Link
                  key={href}
                  href={href}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-300"
                >
                  <Icon className="h-6 w-6 text-emerald-600" />
                  <p className="mt-4 font-black text-slate-950">{label}</p>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    {body}
                  </p>
                </Link>
              ))}
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-black text-slate-950">
                    Operational alerts
                  </p>
                  <p className="text-sm font-semibold text-slate-500">
                    Only notifications actually stored for your Rider account.
                  </p>
                </div>
                <Clock3 className="h-5 w-5 text-slate-400" />
              </div>
              <div className="mt-4 space-y-3">
                {data?.alerts?.length ? (
                  data.alerts.map((alert: any) => (
                    <Link
                      key={alert.id}
                      href={alert.deepLink || "/rider/notifications"}
                      className="flex gap-3 rounded-xl bg-slate-50 p-4"
                    >
                      <CheckCircle2 className="mt-0.5 h-4 w-4 text-emerald-600" />
                      <div>
                        <p className="text-sm font-black text-slate-900">
                          {alert.title}
                        </p>
                        <p className="mt-1 text-sm text-slate-600">
                          {alert.body}
                        </p>
                      </div>
                    </Link>
                  ))
                ) : (
                  <p className="rounded-xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">
                    No unread operational alerts.
                  </p>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
