"use client";
import React, { useCallback, useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { apiClient } from "@aagam/utils";
import {
  EmptyPanel,
  ErrorBanner,
  MetricCard,
  PortalLoading,
  RefreshButton,
  RiderPageHeader,
  moneyPaise,
} from "@/components/rider/RiderPortalUi";
export default function EarningsPage() {
  const [data, setData] = useState<any>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData((await apiClient.get("/riders/portal/earnings")).data);
    } catch (e: any) {
      setError(e?.response?.data?.message || "Could not load earnings.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return (
    <DashboardLayout allowedRole="RIDER">
      <div className="space-y-5">
        <RiderPageHeader
          title="Earnings"
          subtitle="Only persisted earning records: base delivery fee, distance incentive, bonus, or penalty. Customer order totals are excluded."
          backHref="/rider"
          action={<RefreshButton onClick={load} loading={loading} />}
        />
        <ErrorBanner message={error} />
        {loading ? (
          <PortalLoading />
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard
                label="Today"
                value={moneyPaise(data?.summary?.dailyPaise)}
                tone="emerald"
              />
              <MetricCard
                label="This week"
                value={moneyPaise(data?.summary?.weeklyPaise)}
                tone="indigo"
              />
              <MetricCard
                label="Pending"
                value={moneyPaise(data?.summary?.pendingPaise)}
                tone="amber"
              />
              <MetricCard
                label="Paid"
                value={moneyPaise(data?.summary?.paidPaise)}
              />
            </section>
            {data?.records?.length ? (
              <section className="overflow-hidden rounded-2xl border bg-white">
                <div className="divide-y">
                  {data.records.map((row: any) => (
                    <div
                      key={row.id}
                      className="grid gap-2 p-4 sm:grid-cols-[1fr_auto_auto]"
                    >
                      <div>
                        <p className="font-black">
                          {row.type.replace(/_/g, " ")}
                        </p>
                        <p className="text-xs font-semibold text-slate-500">
                          {new Date(row.earnedAt).toLocaleString("en-IN")}
                          {row.deliveryJobId
                            ? ` · Job ${row.deliveryJobId.slice(-8)}`
                            : ""}
                        </p>
                      </div>
                      <span className="text-sm font-black">
                        {row.type === "PENALTY" ? "-" : ""}
                        {moneyPaise(Math.abs(row.amountPaise))}
                      </span>
                      <span className="text-xs font-black text-slate-500">
                        {row.status}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            ) : (
              <EmptyPanel
                title="No earning records"
                body="No amount is displayed until an authorized operational process creates a real earning record."
              />
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
