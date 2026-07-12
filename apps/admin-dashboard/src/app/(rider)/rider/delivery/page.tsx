"use client";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import DashboardLayout from "@/components/DashboardLayout";
import { apiClient } from "@aagam/utils";
import {
  CheckCircle2,
  ClipboardCheck,
  MapPin,
  Navigation,
  Phone,
  ShieldCheck,
  Store,
  UserRound,
} from "lucide-react";
import {
  EmptyPanel,
  ErrorBanner,
  PortalLoading,
  RefreshButton,
  RiderPageHeader,
  moneyPaise,
} from "@/components/rider/RiderPortalUi";

const actionByStatus: any = {
  RIDER_ASSIGNED: ["Start trip to store", "en-route-to-store"],
  RIDER_EN_ROUTE_TO_STORE: ["Arrived at store", "arrived-at-store"],
  PICKUP_VERIFIED: ["Start delivery", "out-for-delivery"],
  OUT_FOR_DELIVERY: ["Arrived at customer", "arrived-at-customer"],
};
const makeKey = (name: string, id: string) =>
  `rider-web:${name}:${id}:${Date.now()}`;
export default function CurrentDeliveryPage() {
  const [job, setJob] = useState<any>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [otp, setOtp] = useState(""),
    [failure, setFailure] = useState("CUSTOMER_UNAVAILABLE"),
    [note, setNote] = useState(""),
    [working, setWorking] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setJob((await apiClient.get("/riders/portal/delivery")).data);
    } catch (e: any) {
      setError(
        e?.response?.data?.message || "Could not load current delivery."
      );
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const mutate = async (path: string, body: any = {}, key?: string) => {
    setWorking(true);
    setError("");
    setMessage("");
    try {
      await apiClient.patch(path, body, {
        headers: key ? { "Idempotency-Key": key } : {},
      });
      setMessage("Delivery state updated.");
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || "Action failed.");
    } finally {
      setWorking(false);
    }
  };
  const operate = async (path: string, body: any = {}, key?: string) => {
    setWorking(true);
    setError("");
    setMessage("");
    try {
      await apiClient.post(path, body, {
        headers: key ? { "Idempotency-Key": key } : {},
      });
      setMessage("Operation recorded.");
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || "Operation failed.");
    } finally {
      setWorking(false);
    }
  };
  const timeline = useMemo(
    () =>
      job
        ? [
            ...(job.events || []).map((e: any) => ({
              id: `e-${e.id}`,
              label: e.toStatus || e.eventType,
              time: e.createdAt,
              detail: e.eventType,
            })),
            ...(job.operations || []).map((o: any) => ({
              id: `o-${o.id}`,
              label: o.type,
              time: o.completedAt || o.createdAt,
              detail: o.status,
            })),
          ].sort(
            (a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()
          )
        : [],
    [job]
  );
  if (loading && !job)
    return (
      <DashboardLayout allowedRole="RIDER">
        <PortalLoading />
      </DashboardLayout>
    );
  const order = job?.order,
    payment = order?.payment,
    isCod = payment?.method === "COD",
    amount = payment?.amountPaise || 0;
  const customerAddress = [
    order?.addressSnapshot?.line1,
    order?.addressSnapshot?.line2,
    order?.addressSnapshot?.landmark,
    order?.addressSnapshot?.city,
    order?.addressSnapshot?.pincode,
  ]
    .filter(Boolean)
    .join(", ");
  return (
    <DashboardLayout allowedRole="RIDER">
      <div className="space-y-5">
        <RiderPageHeader
          title="Current Delivery"
          subtitle="Canonical job timeline, navigation, pickup, customer contact, OTP, COD, failure, return, and audit controls."
          backHref="/rider"
          action={<RefreshButton onClick={load} loading={loading} />}
        />
        <ErrorBanner message={error} />
        {message && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
            {message}
          </div>
        )}
        {!job ? (
          <EmptyPanel
            title="No active delivery"
            body="Accept an addressed offer before starting delivery operations."
          />
        ) : (
          <>
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-slate-400">
                    Canonical delivery job
                  </p>
                  <p className="mt-1 font-mono text-xl font-black text-slate-950">
                    #{order.id.slice(-8).toUpperCase()}
                  </p>
                </div>
                <span className="rounded-full bg-indigo-50 px-3 py-1.5 text-xs font-black text-indigo-700">
                  {job.status.replace(/_/g, " ")}
                </span>
              </div>
            </section>
            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <p className="flex items-center gap-2 font-black">
                  <Store className="h-5 w-5 text-emerald-600" />
                  Store pickup
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-600">
                  {order.store?.name} · {order.store?.address}
                </p>
                <a
                  target="_blank"
                  rel="noreferrer"
                  href={`https://www.google.com/maps/dir/?api=1&destination=${order.store?.latitude},${order.store?.longitude}`}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-950 px-4 py-2.5 text-sm font-black text-white"
                >
                  <Navigation className="h-4 w-4" />
                  Navigate to store
                </a>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <p className="flex items-center gap-2 font-black">
                  <UserRound className="h-5 w-5 text-emerald-600" />
                  Customer delivery
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-600">
                  {order.customer?.name} ·{" "}
                  {customerAddress || "Address unavailable"}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {order.deliveryLat && order.deliveryLng && (
                    <a
                      target="_blank"
                      rel="noreferrer"
                      href={`https://www.google.com/maps/dir/?api=1&destination=${order.deliveryLat},${order.deliveryLng}`}
                      className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-black text-white"
                    >
                      <MapPin className="mr-2 inline h-4 w-4" />
                      Navigate
                    </a>
                  )}
                  {order.customer?.phone && (
                    <a
                      href={`tel:${order.customer.phone}`}
                      className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-black text-emerald-700"
                    >
                      <Phone className="mr-2 inline h-4 w-4" />
                      Call customer
                    </a>
                  )}
                </div>
              </div>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="font-black text-slate-950">Operational actions</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {actionByStatus[job.status] && (
                  <button
                    disabled={working}
                    onClick={() =>
                      mutate(
                        `/orders/dispatch/jobs/${job.id}/${
                          actionByStatus[job.status][1]
                        }`
                      )
                    }
                    className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-black text-white"
                  >
                    {actionByStatus[job.status][0]}
                  </button>
                )}
                {job.status === "RIDER_AT_STORE" && (
                  <Link
                    href="/rider/pickup"
                    className="rounded-xl bg-amber-500 px-4 py-2.5 text-sm font-black text-white"
                  >
                    <ClipboardCheck className="mr-2 inline h-4 w-4" />
                    Open pickup checklist
                  </Link>
                )}
              </div>
              {job.status === "RIDER_AT_CUSTOMER" && (
                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-xl bg-slate-50 p-4">
                    <p className="font-black">
                      <ShieldCheck className="mr-2 inline h-4 w-4" />
                      Customer OTP
                    </p>
                    <div className="mt-3 flex gap-2">
                      <button
                        disabled={working}
                        onClick={() =>
                          operate(
                            `/orders/delivery-operations/jobs/${job.id}/otp/issue`,
                            {},
                            makeKey("otp", job.id)
                          )
                        }
                        className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-black text-white"
                      >
                        Issue OTP
                      </button>
                      <input
                        value={otp}
                        onChange={(e) =>
                          setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))
                        }
                        placeholder="6-digit code"
                        className="min-w-0 flex-1 rounded-xl border px-3 py-2"
                      />
                    </div>
                  </div>
                  {isCod && (
                    <div className="rounded-xl bg-amber-50 p-4">
                      <p className="font-black text-amber-900">
                        COD collection · {moneyPaise(amount)}
                      </p>
                      <button
                        disabled={working}
                        onClick={() =>
                          operate(
                            `/orders/delivery-operations/jobs/${job.id}/cod/collect`,
                            {
                              amountPaise: amount,
                              collectionReference: `RIDER-WEB-${Date.now()}`,
                            },
                            makeKey("cod", job.id)
                          )
                        }
                        className="mt-3 rounded-xl bg-amber-600 px-3 py-2 text-sm font-black text-white"
                      >
                        Confirm exact cash collected
                      </button>
                    </div>
                  )}
                  <button
                    disabled={working || otp.length !== 6}
                    onClick={() =>
                      operate(
                        `/orders/delivery-operations/jobs/${job.id}/complete`,
                        { otpCode: otp, proofType: "CUSTOMER_OTP" },
                        makeKey("complete", job.id)
                      )
                    }
                    className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white disabled:opacity-40"
                  >
                    <CheckCircle2 className="mr-2 inline h-4 w-4" />
                    Complete verified delivery
                  </button>
                </div>
              )}
              {["OUT_FOR_DELIVERY", "RIDER_AT_CUSTOMER"].includes(
                job.status
              ) && (
                <div className="mt-5 rounded-xl border border-red-100 bg-red-50 p-4">
                  <p className="font-black text-red-900">Delivery failure</p>
                  <div className="mt-3 grid gap-2 sm:grid-cols-3">
                    <select
                      value={failure}
                      onChange={(e) => setFailure(e.target.value)}
                      className="rounded-xl border px-3 py-2 text-sm"
                    >
                      <option value="CUSTOMER_UNAVAILABLE">
                        Customer unavailable
                      </option>
                      <option value="CUSTOMER_REFUSED">Customer refused</option>
                      <option value="ADDRESS_NOT_FOUND">
                        Address not found
                      </option>
                      <option value="SAFETY_CONCERN">Safety concern</option>
                      <option value="VEHICLE_BREAKDOWN">
                        Vehicle breakdown
                      </option>
                      <option value="OTHER">Other</option>
                    </select>
                    <input
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      placeholder="Factual note"
                      className="rounded-xl border px-3 py-2 text-sm"
                    />
                    <button
                      disabled={working || note.trim().length < 3}
                      onClick={() =>
                        operate(
                          `/orders/delivery-operations/jobs/${job.id}/failure`,
                          { reason: failure, note },
                          makeKey("failure", job.id)
                        )
                      }
                      className="rounded-xl bg-red-700 px-3 py-2 text-sm font-black text-white disabled:opacity-40"
                    >
                      Record failure
                    </button>
                  </div>
                </div>
              )}
              {job.status === "DELIVERY_FAILED" && (
                <button
                  disabled={working}
                  onClick={() =>
                    operate(
                      `/orders/delivery-operations/jobs/${job.id}/return/start`,
                      {},
                      makeKey("return", job.id)
                    )
                  }
                  className="mt-4 rounded-xl bg-red-700 px-4 py-3 text-sm font-black text-white"
                >
                  Start return to store
                </button>
              )}
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="font-black text-slate-950">
                Parcel and item checklist
              </p>
              <div className="mt-3 divide-y">
                {order.items.map((item: any) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between py-3 text-sm"
                  >
                    <span className="font-semibold">{item.product?.name}</span>
                    <span className="font-black">× {item.quantity}</span>
                  </div>
                ))}
              </div>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="font-black text-slate-950">Audit timeline</p>
              <div className="mt-4 space-y-3">
                {timeline.map((entry: any) => (
                  <div key={entry.id} className="flex gap-3">
                    <span className="mt-1.5 h-2.5 w-2.5 rounded-full bg-emerald-500" />
                    <div>
                      <p className="text-sm font-black text-slate-900">
                        {String(entry.label).replace(/_/g, " ")}
                      </p>
                      <p className="text-xs font-semibold text-slate-500">
                        {new Date(entry.time).toLocaleString("en-IN")} ·{" "}
                        {entry.detail}
                      </p>
                    </div>
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
