"use client";
import React, { useCallback, useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { apiClient } from "@aagam/utils";
import {
  ErrorBanner,
  MetricCard,
  PortalLoading,
  RefreshButton,
  RiderPageHeader,
} from "@/components/rider/RiderPortalUi";
export default function PerformancePage() {
  const [data, setData] = useState<any>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData((await apiClient.get("/riders/portal/performance")).data);
    } catch (e: any) {
      setError(e?.response?.data?.message || "Could not load performance.");
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
          title="Performance"
          subtitle="Calculated only from real dispatch assignments and canonical delivery timestamps. No hardcoded rating."
          backHref="/rider"
          action={<RefreshButton onClick={load} loading={loading} />}
        />
        <ErrorBanner message={error} />
        {loading ? (
          <PortalLoading />
        ) : (
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Offers received"
              value={data?.offersReceived || 0}
            />
            <MetricCard
              label="Accepted"
              value={data?.accepted || 0}
              tone="emerald"
            />
            <MetricCard label="Rejected" value={data?.rejected || 0} />
            <MetricCard
              label="Expired"
              value={data?.expired || 0}
              tone="amber"
            />
            <MetricCard
              label="Completed"
              value={data?.completed || 0}
              tone="emerald"
            />
            <MetricCard label="Failed" value={data?.failed || 0} />
            <MetricCard
              label="Acceptance rate"
              value={`${data?.acceptanceRate || 0}%`}
              tone="indigo"
            />
            <MetricCard
              label="Average delivery"
              value={
                data?.averageDeliveryMinutes == null
                  ? "No data"
                  : `${data.averageDeliveryMinutes} min`
              }
            />
            <MetricCard
              label="Return rate"
              value={`${data?.returnRate || 0}%`}
              tone="amber"
            />
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
