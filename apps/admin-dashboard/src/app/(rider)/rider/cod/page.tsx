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
export default function CodPage() {
  const [data, setData] = useState<any>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData((await apiClient.get("/riders/portal/cod")).data);
    } catch (e: any) {
      setError(e?.response?.data?.message || "Could not load COD audit.");
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
          title="COD & Settlements"
          subtitle="Independent COD ledger: expected and collected cash, Rider holding balance, deposits, settlement references, variance, and immutable entries. Rider earnings never enter this ledger."
          backHref="/rider"
          action={<RefreshButton onClick={load} loading={loading} />}
        />
        <ErrorBanner message={error} />
        {loading ? (
          <PortalLoading />
        ) : (
          <>
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <MetricCard
                label="Cash currently held"
                value={moneyPaise(data?.cashHeldPaise)}
                tone="amber"
              />
              <MetricCard
                label="Collected"
                value={moneyPaise(data?.collectedPaise)}
                tone="emerald"
              />
              <MetricCard
                label="Deposited"
                value={moneyPaise(data?.depositedPaise)}
                tone="indigo"
              />
              <MetricCard
                label="Variance"
                value={moneyPaise(data?.variancePaise)}
                tone="red"
              />
            </section>
            {data?.pendingHandovers?.length ? (
              <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                <p className="font-black text-amber-900">
                  Pending store handovers
                </p>
                {data.pendingHandovers.map((row: any) => (
                  <div key={row.id} className="mt-3 rounded-xl bg-white p-4">
                    <p className="font-mono font-black">
                      Order #{row.orderId.slice(-8).toUpperCase()}
                    </p>
                    <p className="text-sm font-bold text-amber-800">
                      Holding {moneyPaise(row.riderHoldingBalancePaise)} ·
                      collected {moneyPaise(row.collectedAmountPaise)}
                    </p>
                    <p className="text-xs text-slate-500">
                      Status: {row.status.replace(/_/g, " ")} · reference:{" "}
                      {row.settlementReference || "Not supplied"}
                    </p>
                  </div>
                ))}
              </section>
            ) : (
              <EmptyPanel
                title="No pending cash handovers"
                body="Every recorded COD collection is already settled, or no COD has been collected."
              />
            )}
            <section className="rounded-2xl border bg-white p-5">
              <p className="font-black">Complete COD audit</p>
              <div className="mt-3 space-y-2">
                {data?.audit?.map((row: any) => (
                  <div
                    key={row.id}
                    className="grid gap-1 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-[1fr_auto]"
                  >
                    <div>
                      <p className="font-black">
                        {row.type.replace(/_/g, " ")} ·{" "}
                        {moneyPaise(row.amountPaise)}
                      </p>
                      <p className="text-xs text-slate-500">
                        Order #{row.orderId.slice(-8)} ·{" "}
                        {new Date(row.createdAt).toLocaleString("en-IN")}
                      </p>
                    </div>
                    <span className="text-xs font-black text-slate-600">
                      {row.reference || row.settlementStatus}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
