"use client";
import React, { useCallback, useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { apiClient } from "@aagam/utils";
import { Clock3, MapPin, Store, XCircle } from "lucide-react";
import {
  EmptyPanel,
  ErrorBanner,
  PortalLoading,
  RefreshButton,
  RiderPageHeader,
} from "@/components/rider/RiderPortalUi";

function address(snapshot: any) {
  return (
    [
      snapshot?.line1,
      snapshot?.line2,
      snapshot?.landmark,
      snapshot?.city,
      snapshot?.pincode,
    ]
      .filter(Boolean)
      .join(", ") || "Delivery area unavailable"
  );
}
export default function RiderOffersPage() {
  const [offers, setOffers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [now, setNow] = useState(Date.now());
  const [reason, setReason] = useState<Record<string, string>>({});
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setOffers((await apiClient.get("/riders/portal/offers")).data || []);
    } catch (e: any) {
      setError(e?.response?.data?.message || "Could not load offers.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [load]);
  const answer = async (id: string, accept: boolean) => {
    setError("");
    try {
      if (!accept && !reason[id]?.trim())
        throw new Error("Select or enter a rejection reason.");
      await apiClient.patch(
        `/orders/dispatch/assignments/${id}/${accept ? "accept" : "reject"}`,
        accept ? {} : { reason: reason[id].trim() }
      );
      await load();
    } catch (e: any) {
      setError(
        e?.response?.data?.message || e.message || "Offer response failed."
      );
    }
  };
  return (
    <DashboardLayout allowedRole="RIDER">
      <div className="space-y-5">
        <RiderPageHeader
          title="Job Offers"
          subtitle="Only offers addressed directly to your Rider profile. Expired offers cannot be accepted."
          backHref="/rider"
          action={<RefreshButton onClick={load} loading={loading} />}
        />
        <ErrorBanner message={error} />
        {loading ? (
          <PortalLoading />
        ) : offers.length === 0 ? (
          <EmptyPanel
            title="No pending offers"
            body="New addressed offers will appear here while you are online and available."
          />
        ) : (
          <div className="space-y-4">
            {offers.map((offer: any) => {
              const ms = offer.expiresAt
                ? new Date(offer.expiresAt).getTime() - now
                : Infinity;
              const expired = ms <= 0;
              const order = offer.deliveryJob.order;
              return (
                <section
                  key={offer.id}
                  className="overflow-hidden rounded-2xl border border-indigo-200 bg-white shadow-sm"
                >
                  <div className="flex items-center justify-between bg-indigo-700 px-5 py-4 text-white">
                    <div>
                      <p className="text-xs font-black uppercase tracking-wider text-indigo-200">
                        Addressed offer
                      </p>
                      <p className="font-mono text-lg font-black">
                        #{order.id.slice(-8).toUpperCase()}
                      </p>
                    </div>
                    <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-sm font-black">
                      <Clock3 className="h-4 w-4" />
                      {expired
                        ? "Expired"
                        : offer.expiresAt
                        ? `${Math.ceil(ms / 1000)}s`
                        : "No expiry"}
                    </span>
                  </div>
                  <div className="grid gap-5 p-5 lg:grid-cols-2">
                    <div className="space-y-4">
                      <div>
                        <p className="flex items-center gap-2 font-black text-slate-950">
                          <Store className="h-4 w-4 text-indigo-600" />
                          {order.store?.name}
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-500">
                          {order.store?.address}
                        </p>
                      </div>
                      <div>
                        <p className="flex items-center gap-2 font-black text-slate-950">
                          <MapPin className="h-4 w-4 text-indigo-600" />
                          Delivery area
                        </p>
                        <p className="mt-1 text-sm font-semibold text-slate-500">
                          {address(order.addressSnapshot)}
                        </p>
                      </div>
                    </div>
                    <div className="space-y-3">
                      <select
                        value={reason[offer.id] || ""}
                        onChange={(e) =>
                          setReason({ ...reason, [offer.id]: e.target.value })
                        }
                        className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold"
                      >
                        <option value="">Reason if rejecting…</option>
                        <option value="Too far from current location">
                          Too far from current location
                        </option>
                        <option value="Vehicle issue">Vehicle issue</option>
                        <option value="Shift ending">Shift ending</option>
                        <option value="Safety concern">Safety concern</option>
                        <option value="Other operational reason">
                          Other operational reason
                        </option>
                      </select>
                      <div className="flex gap-2">
                        <button
                          disabled={expired}
                          onClick={() => answer(offer.id, true)}
                          className="flex-1 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white disabled:opacity-40"
                        >
                          Accept
                        </button>
                        <button
                          onClick={() => answer(offer.id, false)}
                          className="flex-1 rounded-xl bg-red-50 px-4 py-3 text-sm font-black text-red-700"
                        >
                          <XCircle className="mr-2 inline h-4 w-4" />
                          Reject
                        </button>
                      </div>
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
