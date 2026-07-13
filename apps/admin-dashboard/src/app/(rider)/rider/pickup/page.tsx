"use client";
import React, { useCallback, useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { apiClient } from "@aagam/utils";
import { AlertTriangle, CheckCircle2, PackageCheck } from "lucide-react";
import {
  EmptyPanel,
  ErrorBanner,
  PortalLoading,
  RefreshButton,
  RiderPageHeader,
} from "@/components/rider/RiderPortalUi";
export default function PickupPage() {
  const [data, setData] = useState<any>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [qty, setQty] = useState<Record<string, number>>({}),
    [parcel, setParcel] = useState(""),
    [problem, setProblem] = useState("MISSING_ITEM"),
    [note, setNote] = useState(""),
    [handoffMethod, setHandoffMethod] = useState("STORE_PICKUP_PIN"),
    [handoffCode, setHandoffCode] = useState(""),
    [parcelCount, setParcelCount] = useState(1),
    [coordinates, setCoordinates] = useState<any>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const d = (await apiClient.get("/riders/portal/pickup")).data;
      setData(d);
      if (d?.job?.order?.items)
        setQty(
          Object.fromEntries(
            d.job.order.items.map((i: any) => [i.id, i.quantity])
          )
        );
    } catch (e: any) {
      setError(e?.response?.data?.message || "Could not load pickup task.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const verify = async () => {
    try {
      await apiClient.post(`/riders/portal/pickup/${data.job.id}/verify`, {
        parcelCode: parcel || undefined,
        lines: data.job.order.items.map((i: any) => ({
          orderItemId: i.id,
          checkedQuantity: Number(qty[i.id] || 0),
        })),
      });
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || "Pickup verification failed.");
    }
  };
  const report = async () => {
    try {
      await apiClient.post(`/riders/portal/pickup/${data.job.id}/problem`, {
        problemType: problem,
        note,
      });
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || "Problem report failed.");
    }
  };
  const captureCoordinates = () => {
    if (!navigator.geolocation) return setError("Location is unavailable.");
    navigator.geolocation.getCurrentPosition(
      (position) =>
        setCoordinates({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMetres: position.coords.accuracy,
        }),
      () => setError("Location permission was not granted."),
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  };
  const verifyHandoff = async () => {
    try {
      await apiClient.post(
        `/orders/delivery-operations/jobs/${data.job.id}/pickup/verify`,
        {
          method: handoffMethod,
          code: handoffCode.trim(),
          parcelCount,
          ...(coordinates || {}),
        }
      );
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || "Store handoff proof failed.");
    }
  };
  return (
    <DashboardLayout allowedRole="RIDER">
      <div className="space-y-5">
        <RiderPageHeader
          title="Pickup Tasks"
          subtitle="Verify every item and quantity, record parcel handoff state, or report a store-side problem."
          backHref="/rider"
          action={<RefreshButton onClick={load} loading={loading} />}
        />
        <ErrorBanner message={error} />
        {loading ? (
          <PortalLoading />
        ) : !data ? (
          <EmptyPanel
            title="No pickup task"
            body="Pickup controls appear only after you arrive at the store."
          />
        ) : (
          <>
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-black uppercase text-slate-400">
                    Parcel
                  </p>
                  <p className="font-mono text-xl font-black">
                    #{data.job.order.id.slice(-8).toUpperCase()}
                  </p>
                </div>
                <span className="rounded-full bg-amber-50 px-3 py-1.5 text-xs font-black text-amber-700">
                  {data.task.status.replace(/_/g, " ")}
                </span>
              </div>
              <p className="mt-3 text-sm font-semibold text-slate-600">
                Store handoff:{" "}
                {data.job.status === "PICKUP_VERIFIED"
                  ? "Confirmed by store"
                  : "Waiting for store confirmation"}
              </p>
            </section>
            <section className="rounded-2xl border border-slate-200 bg-white p-5">
              <p className="font-black">Item checklist</p>
              <div className="mt-4 space-y-3">
                {data.job.order.items.map((item: any) => (
                  <div
                    key={item.id}
                    className="grid grid-cols-[1fr_auto] items-center gap-4 rounded-xl bg-slate-50 p-4"
                  >
                    <div>
                      <p className="font-black text-slate-900">
                        {item.product?.name}
                      </p>
                      <p className="text-xs font-semibold text-slate-500">
                        Expected quantity: {item.quantity}
                      </p>
                    </div>
                    <input
                      type="number"
                      min="0"
                      max={item.quantity}
                      value={qty[item.id] ?? 0}
                      onChange={(e) =>
                        setQty({ ...qty, [item.id]: Number(e.target.value) })
                      }
                      className="w-20 rounded-xl border px-3 py-2 text-center font-black"
                    />
                  </div>
                ))}
              </div>
              <input
                value={parcel}
                onChange={(e) => setParcel(e.target.value)}
                placeholder="Parcel/seal code (optional)"
                className="mt-4 w-full rounded-xl border px-3 py-2.5"
              />
              <button
                onClick={verify}
                className="mt-3 w-full rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white"
              >
                <PackageCheck className="mr-2 inline h-4 w-4" />
                Verify checklist
              </button>
            </section>
            <section className="rounded-2xl border border-red-100 bg-red-50 p-5">
              <p className="font-black text-red-900">
                <AlertTriangle className="mr-2 inline h-4 w-4" />
                Missing item or parcel problem
              </p>
              <div className="mt-3 grid gap-2 md:grid-cols-[220px_1fr_auto]">
                <select
                  value={problem}
                  onChange={(e) => setProblem(e.target.value)}
                  className="rounded-xl border px-3 py-2"
                >
                  <option value="MISSING_ITEM">Missing item</option>
                  <option value="WRONG_QUANTITY">Wrong quantity</option>
                  <option value="DAMAGED_PARCEL">Damaged parcel</option>
                  <option value="UNSEALED_PARCEL">Unsealed parcel</option>
                  <option value="OTHER">Other</option>
                </select>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Describe the factual problem"
                  className="rounded-xl border px-3 py-2"
                />
                <button
                  disabled={note.trim().length < 5}
                  onClick={report}
                  className="rounded-xl bg-red-700 px-4 py-2 text-sm font-black text-white disabled:opacity-40"
                >
                  Report
                </button>
              </div>
              {data.task.status === "VERIFIED" && (
                <p className="mt-4 text-sm font-black text-emerald-700">
                  <CheckCircle2 className="mr-2 inline h-4 w-4" />
                  Checklist verified. The owning store must still confirm
                  canonical parcel handoff.
                </p>
              )}
            </section>
            {data.task.status === "VERIFIED" &&
              data.job.status === "RIDER_AT_STORE" && (
                <section className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
                  <p className="font-black text-indigo-950">
                    Professional store handoff proof
                  </p>
                  <p className="mt-1 text-sm font-semibold text-indigo-800">
                    Ask the owning store for its current pickup PIN or scan the
                    issued QR value. Store-confirmed handoff is completed by the
                    store portal.
                  </p>
                  <div className="mt-4 grid gap-2 md:grid-cols-[220px_1fr_120px]">
                    <select
                      value={handoffMethod}
                      onChange={(event) => setHandoffMethod(event.target.value)}
                      className="rounded-xl border px-3 py-2.5"
                    >
                      <option value="STORE_PICKUP_PIN">Store pickup PIN</option>
                      <option value="QR_CODE">QR code</option>
                    </select>
                    <input
                      value={handoffCode}
                      onChange={(event) => setHandoffCode(event.target.value)}
                      placeholder="Enter PIN or scanned QR value"
                      className="rounded-xl border px-3 py-2.5"
                    />
                    <input
                      type="number"
                      min="1"
                      max="100"
                      value={parcelCount}
                      onChange={(event) =>
                        setParcelCount(Number(event.target.value))
                      }
                      aria-label="Parcel count"
                      className="rounded-xl border px-3 py-2.5"
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={captureCoordinates}
                      className="rounded-xl border border-indigo-200 bg-white px-4 py-2.5 text-sm font-black text-indigo-800"
                    >
                      {coordinates
                        ? "Coordinates captured"
                        : "Capture optional coordinates"}
                    </button>
                    <button
                      disabled={handoffCode.trim().length < 6}
                      onClick={verifyHandoff}
                      className="rounded-xl bg-indigo-700 px-4 py-2.5 text-sm font-black text-white disabled:opacity-40"
                    >
                      Verify store handoff
                    </button>
                  </div>
                </section>
              )}
            {data.job.pickupProof && (
              <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm font-bold text-emerald-900">
                <CheckCircle2 className="mr-2 inline h-5 w-5" /> Pickup proof
                recorded using{" "}
                {data.job.pickupProof.verificationMethod.replace(/_/g, " ")} for{" "}
                {data.job.pickupProof.parcelCount} parcel(s).
              </section>
            )}
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
