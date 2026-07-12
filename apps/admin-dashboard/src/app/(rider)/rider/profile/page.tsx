"use client";

import React, { useCallback, useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { apiClient } from "@aagam/utils";
import { FileCheck2, ShieldCheck, Truck, UserRound } from "lucide-react";
import {
  ErrorBanner,
  PrivateEvidenceLink,
  PortalLoading,
  RefreshButton,
  RiderPageHeader,
} from "@/components/rider/RiderPortalUi";

export default function RiderProfilePage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState<any>({});
  const [doc, setDoc] = useState<any>({
    type: "DRIVING_LICENSE",
    storageKey: "",
    documentNumberLast4: "",
    expiresAt: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const profile = (await apiClient.get("/riders/portal/profile")).data;
      setData(profile);
      setForm({
        vehicleType: profile.vehicleType || "",
        vehicleNumber: profile.vehicleNumber || "",
        emergencyContactName: profile.emergencyContactName || "",
        emergencyContactPhone: profile.emergencyContactPhone || "",
        bankAccountNumber: "",
        bankIfsc: "",
      });
    } catch (e: any) {
      setError(e?.response?.data?.message || "Could not load profile.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const save = async () => {
    setError("");
    try {
      const payload = Object.fromEntries(
        Object.entries(form).filter(
          ([, value]) => typeof value === "string" && value.trim() !== ""
        )
      );
      if (Boolean(payload.bankAccountNumber) !== Boolean(payload.bankIfsc))
        throw new Error(
          "Bank account number and IFSC must be entered together."
        );
      await apiClient.patch("/riders/portal/profile", payload);
      await load();
    } catch (e: any) {
      setError(
        e?.response?.data?.message || e.message || "Profile update failed."
      );
    }
  };

  const uploadEvidence = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const body = new FormData();
      body.append("file", file);
      const result = await apiClient.post("/upload/evidence", body);
      setDoc((current: any) => ({
        ...current,
        storageKey: result.data.storageKey,
      }));
    } catch (e: any) {
      setError(e?.response?.data?.message || "Private document upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const addDocument = async () => {
    try {
      await apiClient.post("/riders/portal/documents", {
        ...doc,
        expiresAt: doc.expiresAt
          ? new Date(`${doc.expiresAt}T00:00:00`).toISOString()
          : undefined,
        documentNumberLast4: doc.documentNumberLast4 || undefined,
      });
      setDoc({
        ...doc,
        storageKey: "",
        documentNumberLast4: "",
        expiresAt: "",
      });
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || "Document submission failed.");
    }
  };

  return (
    <DashboardLayout allowedRole="RIDER">
      <div className="space-y-5">
        <RiderPageHeader
          title="Profile & Documents"
          subtitle="Personal, vehicle, emergency, identity, licence, expiry, approval, and protected bank information."
          backHref="/rider"
          action={<RefreshButton onClick={load} loading={loading} />}
        />
        <ErrorBanner message={error} />
        {loading ? (
          <PortalLoading />
        ) : (
          <>
            <section className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-2xl border bg-white p-5">
                <UserRound className="h-6 w-6 text-emerald-600" />
                <p className="mt-3 font-black">{data?.user?.name || "Rider"}</p>
                <p className="text-sm text-slate-500">{data?.user?.email}</p>
                <p className="mt-3 text-xs font-black uppercase text-slate-400">
                  Account approval
                </p>
                <p className="font-black">{data?.approvalStatus}</p>
              </div>
              <div className="rounded-2xl border bg-white p-5">
                <Truck className="h-6 w-6 text-indigo-600" />
                <p className="mt-3 text-xs font-black uppercase text-slate-400">
                  Vehicle
                </p>
                <p className="font-black">
                  {data?.vehicleType || "Not supplied"} ·{" "}
                  {data?.vehicleNumber || "No number"}
                </p>
              </div>
              <div className="rounded-2xl border bg-white p-5">
                <ShieldCheck className="h-6 w-6 text-amber-600" />
                <p className="mt-3 text-xs font-black uppercase text-slate-400">
                  Bank details
                </p>
                <p className="font-black">
                  {data?.bank?.accountMasked || "Not supplied"}
                </p>
                <p className="text-sm text-slate-500">
                  {data?.bank?.status || "No verification record"}
                </p>
              </div>
            </section>
            <section className="rounded-2xl border bg-white p-5">
              <p className="font-black">
                Vehicle, emergency contact and protected bank update
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {[
                  ["vehicleType", "Vehicle type"],
                  ["vehicleNumber", "Vehicle number"],
                  ["emergencyContactName", "Emergency contact name"],
                  ["emergencyContactPhone", "Emergency contact phone"],
                  ["bankAccountNumber", "New bank account number"],
                  ["bankIfsc", "Bank IFSC"],
                ].map(([key, label]) => (
                  <label
                    key={key}
                    className="text-xs font-black uppercase text-slate-500"
                  >
                    {label}
                    <input
                      type={key === "bankAccountNumber" ? "password" : "text"}
                      value={form[key] || ""}
                      onChange={(e) =>
                        setForm({ ...form, [key]: e.target.value })
                      }
                      className="mt-1 w-full rounded-xl border px-3 py-2.5 text-sm normal-case text-slate-900"
                    />
                  </label>
                ))}
              </div>
              <p className="mt-3 text-xs font-semibold text-slate-500">
                Full bank account and IFSC values are AES-GCM encrypted at rest.
                The API returns only the last four account digits.
              </p>
              <button
                onClick={save}
                className="mt-4 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white"
              >
                Save protected profile
              </button>
            </section>
            <section className="rounded-2xl border bg-white p-5">
              <p className="font-black">
                <FileCheck2 className="mr-2 inline h-5 w-5" />
                Documents
              </p>
              <div className="mt-4 space-y-3">
                {data?.documents?.map((row: any) => {
                  const expired =
                    row.expiresAt && new Date(row.expiresAt) < new Date();
                  return (
                    <div
                      key={row.id}
                      className="grid gap-2 rounded-xl bg-slate-50 p-4 sm:grid-cols-[1fr_auto]"
                    >
                      <div>
                        <p className="font-black">
                          {row.type.replace(/_/g, " ")}
                        </p>
                        <p className="text-xs text-slate-500">
                          Number ending{" "}
                          {row.documentNumberLast4 || "not supplied"} · Expiry{" "}
                          {row.expiresAt
                            ? new Date(row.expiresAt).toLocaleDateString(
                                "en-IN"
                              )
                            : "not supplied"}
                        </p>
                        <PrivateEvidenceLink
                          storageKey={row.storageKey}
                          label="Open private document"
                        />
                      </div>
                      <span
                        className={`text-xs font-black ${
                          expired ? "text-red-700" : "text-slate-600"
                        }`}
                      >
                        {expired ? "EXPIRED" : row.status}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-5 grid gap-2 md:grid-cols-4">
                <select
                  value={doc.type}
                  onChange={(e) => setDoc({ ...doc, type: e.target.value })}
                  className="rounded-xl border px-3 py-2"
                >
                  <option value="DRIVING_LICENSE">Driving licence</option>
                  <option value="IDENTITY">Identity</option>
                  <option value="VEHICLE_REGISTRATION">
                    Vehicle registration
                  </option>
                  <option value="VEHICLE_INSURANCE">Vehicle insurance</option>
                  <option value="OTHER">Other</option>
                </select>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(e) => uploadEvidence(e.target.files?.[0])}
                  className="rounded-xl border px-3 py-2 text-sm"
                />
                <input
                  value={doc.documentNumberLast4}
                  onChange={(e) =>
                    setDoc({
                      ...doc,
                      documentNumberLast4: e.target.value.slice(-4),
                    })
                  }
                  placeholder="Last 4 characters"
                  className="rounded-xl border px-3 py-2"
                />
                <input
                  type="date"
                  value={doc.expiresAt}
                  onChange={(e) =>
                    setDoc({ ...doc, expiresAt: e.target.value })
                  }
                  className="rounded-xl border px-3 py-2"
                />
              </div>
              <p className="mt-2 text-xs font-semibold text-slate-500">
                {uploading
                  ? "Encrypting transport and uploading to private evidence storage…"
                  : doc.storageKey
                  ? "Private evidence upload ready."
                  : "Upload a private image or PDF."}
              </p>
              <button
                disabled={!doc.storageKey || uploading}
                onClick={addDocument}
                className="mt-3 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-40"
              >
                Submit for review
              </button>
            </section>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
