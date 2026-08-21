"use client";

import React, { useEffect, useState } from "react";
import {
  IndianRupee,
  Loader2,
  Plus,
  Power,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { apiClient } from "@aagam/utils";
import DashboardLayout from "@/components/DashboardLayout";

type MatchType = "PINCODE" | "CITY" | "KEYWORD" | "DEFAULT";

type DeliveryFeeRule = {
  id: string;
  name: string;
  matchType: MatchType;
  pincode: string | null;
  city: string | null;
  keywords: string[];
  storeId: string | null;
  ratePaisePerKm: number;
  flatFeePaise: number | null;
  freeDeliveryMinimumPaise: number | null;
  maximumDistanceKm: number | null;
  priority: number;
  isActive: boolean;
};

type StoreOption = { id: string; name: string };

type RuleForm = {
  name: string;
  matchType: MatchType;
  pincode: string;
  city: string;
  keywords: string;
  storeId: string;
  rateRupeesPerKm: string;
  flatRupees: string;
  freeDeliveryRupees: string;
  maximumDistanceKm: string;
  priority: string;
  isActive: boolean;
};

type MatchTestResult = {
  matchedRule: {
    id: string;
    name: string;
    matchType: MatchType;
    ratePaisePerKm: number;
    flatFeePaise: number | null;
    freeDeliveryMinimumPaise: number | null;
    maximumDistanceKm: number | null;
    priority: number;
  } | null;
  deliveryPricing: {
    serviceable: boolean;
    ratePaisePerKm: number;
    freeDeliveryMinimumPaise: number;
    maximumDistanceKm: number;
    distanceFeePaise: number;
    payableFeePaise: number;
    waivedByThreshold: boolean;
    waivedByFirstOrder: boolean;
    appliedRule: { id: string; name: string; matchType: string } | null;
    flatFeePaise: number | null;
  };
  distanceKm: number;
};

const MATCH_TYPE_LABELS: Record<MatchType, string> = {
  PINCODE: "Pincode",
  CITY: "City",
  KEYWORD: "Locality keyword",
  DEFAULT: "Default fallback",
};

const emptyForm = (): RuleForm => ({
  name: "",
  matchType: "KEYWORD",
  pincode: "",
  city: "",
  keywords: "",
  storeId: "",
  rateRupeesPerKm: "2",
  flatRupees: "",
  freeDeliveryRupees: "",
  maximumDistanceKm: "",
  priority: "100",
  isActive: true,
});

const rupeesToPaise = (value: string): number | undefined =>
  value === "" ? undefined : Math.round(Number(value || 0) * 100);

const paiseToRupeesInput = (value: number | null | undefined): string =>
  value === null || value === undefined ? "" : String(value / 100);

function errorMessage(error: any) {
  const value = error?.response?.data?.message;
  if (Array.isArray(value)) return value.join(", ");
  return value || error?.message || "The operation could not be completed.";
}

function Modal({ title, subtitle, onClose, children }: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
      <div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white p-5">
          <div>
            <h2 className="text-xl font-black text-slate-950">{title}</h2>
            <p className="text-xs font-semibold text-slate-500">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, wide, children }: {
  label: string;
  wide?: boolean;
  children: React.ReactElement<{ className?: string }>;
}) {
  return (
    <label
      className={`block text-xs font-black uppercase tracking-wide text-slate-500 ${wide ? "md:col-span-2" : ""}`}
    >
      {label}
      {React.cloneElement(children, {
        className: `${children.props.className || ""} mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold normal-case tracking-normal text-slate-950 focus:border-teal-500 focus:outline-none`,
      })}
    </label>
  );
}

export default function DeliveryFeeRulesPage() {
  const [rules, setRules] = useState<DeliveryFeeRule[]>([]);
  const [stores, setStores] = useState<StoreOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<RuleForm>(emptyForm());

  const [test, setTest] = useState({
    line1: "",
    city: "",
    pincode: "",
    storeId: "",
    distanceKm: "5",
    subtotalRupees: "",
  });
  const [testLoading, setTestLoading] = useState(false);
  const [testResult, setTestResult] = useState<MatchTestResult | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [rulesResponse, storesResponse] = await Promise.all([
        apiClient.get("/admin/delivery-fee-rules"),
        apiClient.get("/stores/admin/all"),
      ]);
      setRules(Array.isArray(rulesResponse.data) ? rulesResponse.data : []);
      setStores(
        Array.isArray(storesResponse.data)
          ? storesResponse.data
              .filter((store: any) => store && store.id)
              .map((store: any) => ({ id: store.id, name: store.name || store.id }))
          : [],
      );
    } catch (requestError: any) {
      setError(errorMessage(requestError) || "Could not load delivery fee rules.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setFormOpen(true);
  };

  const openEdit = (rule: DeliveryFeeRule) => {
    setEditingId(rule.id);
    setForm({
      name: rule.name,
      matchType: rule.matchType,
      pincode: rule.pincode || "",
      city: rule.city || "",
      keywords: (rule.keywords || []).join(", "),
      storeId: rule.storeId || "",
      rateRupeesPerKm: paiseToRupeesInput(rule.ratePaisePerKm),
      flatRupees: paiseToRupeesInput(rule.flatFeePaise),
      freeDeliveryRupees: paiseToRupeesInput(rule.freeDeliveryMinimumPaise),
      maximumDistanceKm: rule.maximumDistanceKm === null ? "" : String(rule.maximumDistanceKm),
      priority: String(rule.priority),
      isActive: rule.isActive,
    });
    setFormOpen(true);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const payload = {
        name: form.name.trim(),
        matchType: form.matchType,
        pincode: form.matchType === "PINCODE" ? form.pincode.trim() : null,
        city: form.matchType === "CITY" ? form.city.trim() : null,
        keywords:
          form.matchType === "KEYWORD"
            ? form.keywords.split(",").map((keyword) => keyword.trim()).filter(Boolean)
            : [],
        storeId: form.storeId || null,
        ratePaisePerKm: rupeesToPaise(form.rateRupeesPerKm) ?? 200,
        flatFeePaise: rupeesToPaise(form.flatRupees) ?? null,
        freeDeliveryMinimumPaise: rupeesToPaise(form.freeDeliveryRupees) ?? null,
        maximumDistanceKm:
          form.maximumDistanceKm === "" ? null : Number(form.maximumDistanceKm),
        priority: form.priority === "" ? 100 : Number(form.priority),
        isActive: form.isActive,
      };
      if (editingId) {
        await apiClient.patch(`/admin/delivery-fee-rules/${editingId}`, payload);
        setMessage("Delivery fee rule updated.");
      } else {
        await apiClient.post("/admin/delivery-fee-rules", payload);
        setMessage("Delivery fee rule created.");
      }
      setFormOpen(false);
      await load();
    } catch (requestError: any) {
      setError(errorMessage(requestError) || "Could not save the delivery fee rule.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (rule: DeliveryFeeRule) => {
    setError("");
    setMessage("");
    try {
      await apiClient.patch(`/admin/delivery-fee-rules/${rule.id}`, {
        isActive: !rule.isActive,
      });
      await load();
    } catch (requestError: any) {
      setError(errorMessage(requestError) || "Could not update the rule.");
    }
  };

  const remove = async (rule: DeliveryFeeRule) => {
    if (!window.confirm(`Delete the delivery fee rule "${rule.name}"?`)) return;
    setError("");
    setMessage("");
    try {
      await apiClient.delete(`/admin/delivery-fee-rules/${rule.id}`);
      setMessage("Delivery fee rule deleted.");
      await load();
    } catch (requestError: any) {
      setError(errorMessage(requestError) || "Could not delete the rule.");
    }
  };

  const runMatchTest = async (event: React.FormEvent) => {
    event.preventDefault();
    setTestLoading(true);
    setError("");
    setMessage("");
    try {
      const response = await apiClient.post("/admin/delivery-fee-rules/match-test", {
        line1: test.line1.trim() || undefined,
        city: test.city.trim() || undefined,
        pincode: test.pincode.trim() || undefined,
        storeId: test.storeId || null,
        distanceKm: test.distanceKm === "" ? undefined : Number(test.distanceKm),
        subtotalPaise: rupeesToPaise(test.subtotalRupees),
      });
      setTestResult(response.data);
    } catch (requestError: any) {
      setError(errorMessage(requestError) || "Could not run the match test.");
    } finally {
      setTestLoading(false);
    }
  };

  const inputClass =
    "rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold text-slate-950 focus:border-teal-500 focus:outline-none";

  return (
    <DashboardLayout allowedRole="ADMIN">
      <div className="mx-auto max-w-6xl space-y-8 pb-12">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-teal-600">
              Admin · Delivery
            </p>
            <h1 className="text-2xl font-black text-slate-950">Delivery Fee Rules</h1>
            <p className="mt-1 max-w-2xl text-sm font-semibold text-slate-500">
              Control the delivery fee per locality. The system detects the address
              (pincode, city or a locality keyword such as “Thummapala”) and applies
              the matching ₹/km rate — or a flat fee — when a customer checks out.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-black text-white hover:bg-teal-800"
          >
            <Plus className="h-4 w-4" /> New rule
          </button>
        </header>

        {message ? (
          <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">
            {message}
          </div>
        ) : null}
        {error ? (
          <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
            {error}
          </div>
        ) : null}

        {!loading && rules.length > 0 && !rules.some((r) => r.matchType === "DEFAULT" && r.isActive) && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-800">
            No active <span className="font-black">DEFAULT</span> rule found. Addresses that don't match any specific rule
            (pincode, city or keyword) will <span className="font-black">not be serviceable</span>. Create a DEFAULT rule as a catch-all fallback.
          </div>
        )}

        <section>
          <h2 className="mb-3 text-lg font-black text-slate-950">Rules</h2>
          {loading ? (
            <div className="grid place-items-center rounded-3xl bg-white p-12 text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : rules.length === 0 ? (
            <div className="rounded-3xl bg-white p-10 text-center text-sm font-semibold text-slate-500">
              No rules yet. Create one to start controlling delivery fees.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-3xl bg-white shadow-sm">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-4 font-black">Rule</th>
                    <th className="px-5 py-4 font-black">Match</th>
                    <th className="px-5 py-4 font-black">Rate / fee</th>
                    <th className="px-5 py-4 font-black">Store</th>
                    <th className="px-5 py-4 font-black">Priority</th>
                    <th className="px-5 py-4 font-black">Status</th>
                    <th className="px-5 py-4 text-right font-black">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rules.map((rule) => (
                    <tr key={rule.id} className="hover:bg-emerald-50/30">
                      <td className="px-5 py-4">
                        <p className="font-black text-slate-950">{rule.name}</p>
                        <p className="text-xs font-semibold text-slate-400">
                          {MATCH_TYPE_LABELS[rule.matchType]}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 font-semibold text-slate-700">
                        {rule.matchType === "PINCODE" && (rule.pincode || "—")}
                        {rule.matchType === "CITY" && (rule.city || "—")}
                        {rule.matchType === "KEYWORD" && (rule.keywords || []).join(", ")}
                        {rule.matchType === "DEFAULT" && "Always"}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 font-semibold text-slate-700">
                        {rule.flatFeePaise !== null
                          ? `₹${(rule.flatFeePaise / 100).toFixed(2)} flat`
                          : `₹${(rule.ratePaisePerKm / 100).toFixed(2)}/km`}
                        {rule.freeDeliveryMinimumPaise !== null && (
                          <span className="block text-xs text-slate-400">
                            free ≥ ₹{(rule.freeDeliveryMinimumPaise / 100).toFixed(0)}
                          </span>
                        )}
                        {rule.maximumDistanceKm !== null && (
                          <span className="block text-xs text-slate-400">
                            max {rule.maximumDistanceKm} km
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-700">
                        {rule.storeId
                          ? stores.find((store) => store.id === rule.storeId)?.name || "Specific store"
                          : "All stores"}
                      </td>
                      <td className="px-5 py-4 font-semibold text-slate-700">{rule.priority}</td>
                      <td className="px-5 py-4">
                        <button
                          type="button"
                          onClick={() => toggleActive(rule)}
                          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black ${
                            rule.isActive
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          <Power className="h-3 w-3" />
                          {rule.isActive ? "Active" : "Inactive"}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => openEdit(rule)}
                          className="rounded-xl px-3 py-1.5 text-xs font-black text-teal-700 hover:bg-teal-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(rule)}
                          className="rounded-xl px-3 py-1.5 text-xs font-black text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="inline h-3.5 w-3.5" /> Delete
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-lg font-black text-slate-950">Test an address</h2>
          <form
            onSubmit={runMatchTest}
            className="rounded-3xl bg-white p-5 shadow-sm"
          >
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-xs font-black uppercase tracking-wide text-slate-500">
                Address line 1
                <input
                  className={`mt-1 ${inputClass}`}
                  value={test.line1}
                  onChange={(event) => setTest({ ...test, line1: event.target.value })}
                  placeholder="Anakapalle - Chodavaram Road, Tulsi Nagar, Thummapala"
                />
              </label>
              <label className="block text-xs font-black uppercase tracking-wide text-slate-500">
                City
                <input
                  className={`mt-1 ${inputClass}`}
                  value={test.city}
                  onChange={(event) => setTest({ ...test, city: event.target.value })}
                  placeholder="Anakapalle"
                />
              </label>
              <label className="block text-xs font-black uppercase tracking-wide text-slate-500">
                Pincode
                <input
                  className={`mt-1 ${inputClass}`}
                  value={test.pincode}
                  onChange={(event) => setTest({ ...test, pincode: event.target.value })}
                  placeholder="531035"
                />
              </label>
              <label className="block text-xs font-black uppercase tracking-wide text-slate-500">
                Store
                <select
                  className={`mt-1 ${inputClass}`}
                  value={test.storeId}
                  onChange={(event) => setTest({ ...test, storeId: event.target.value })}
                >
                  <option value="">All stores (global rules)</option>
                  {stores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs font-black uppercase tracking-wide text-slate-500">
                Distance (km)
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  className={`mt-1 ${inputClass}`}
                  value={test.distanceKm}
                  onChange={(event) => setTest({ ...test, distanceKm: event.target.value })}
                />
              </label>
              <label className="block text-xs font-black uppercase tracking-wide text-slate-500">
                Subtotal (₹)
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className={`mt-1 ${inputClass}`}
                  value={test.subtotalRupees}
                  onChange={(event) => setTest({ ...test, subtotalRupees: event.target.value })}
                  placeholder="e.g. 85"
                />
              </label>
            </div>
            <div className="mt-4">
              <button
                type="submit"
                disabled={testLoading}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white hover:bg-slate-800 disabled:opacity-60"
              >
                {testLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Search className="h-4 w-4" />
                )}
                Match rule
              </button>
            </div>
          </form>

          {testResult ? (
            <div className="mt-4 rounded-3xl bg-white p-5 shadow-sm">
              <p className="text-sm font-black text-slate-950">
                Matched rule:{" "}
                <span className="text-teal-700">
                  {testResult.matchedRule
                    ? `${testResult.matchedRule.name} (${MATCH_TYPE_LABELS[testResult.matchedRule.matchType]})`
                    : "None — global default applies"}
                </span>
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                <div className="rounded-2xl bg-slate-50 p-3">
                  <dt className="text-xs font-black uppercase text-slate-400">Serviceable</dt>
                  <dd className={`mt-1 text-lg font-black ${testResult.deliveryPricing.serviceable ? "text-emerald-600" : "text-red-600"}`}>
                    {testResult.deliveryPricing.serviceable ? "Yes" : "No"}
                  </dd>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <dt className="text-xs font-black uppercase text-slate-400">Rate</dt>
                  <dd className="mt-1 text-lg font-black text-slate-950">
                    {testResult.deliveryPricing.flatFeePaise !== null
                      ? `₹${(testResult.deliveryPricing.flatFeePaise / 100).toFixed(2)} flat`
                      : `₹${(testResult.deliveryPricing.ratePaisePerKm / 100).toFixed(2)}/km`}
                  </dd>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <dt className="text-xs font-black uppercase text-slate-400">Distance fee</dt>
                  <dd className="mt-1 text-lg font-black text-slate-950">
                    ₹{(testResult.deliveryPricing.distanceFeePaise / 100).toFixed(2)}
                  </dd>
                </div>
                <div className="rounded-2xl bg-slate-50 p-3">
                  <dt className="text-xs font-black uppercase text-slate-400">Payable fee</dt>
                  <dd className="mt-1 text-lg font-black text-teal-700">
                    ₹{(testResult.deliveryPricing.payableFeePaise / 100).toFixed(2)}
                  </dd>
                </div>
              </dl>
              {testResult.deliveryPricing.waivedByThreshold && (
                <p className="mt-3 text-xs font-bold text-emerald-600">
                  Delivery waived: subtotal is at or above the free-delivery threshold.
                </p>
              )}
              {testResult.deliveryPricing.waivedByFirstOrder && (
                <p className="mt-3 text-xs font-bold text-emerald-600">
                  Delivery waived: first-order offer.
                </p>
              )}
            </div>
          ) : null}
        </section>
      </div>

      {formOpen ? (
        <Modal
          title={editingId ? "Edit delivery fee rule" : "New delivery fee rule"}
          subtitle="Define how the delivery fee is detected and priced for this locality."
          onClose={() => setFormOpen(false)}
        >
          <form onSubmit={save} className="grid gap-4 md:grid-cols-2">
            <Field label="Rule name" wide>
              <input
                required
                minLength={2}
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="e.g. Thummapala"
              />
            </Field>

            <Field label="Match type" wide>
              <select
                value={form.matchType}
                onChange={(event) =>
                  setForm({ ...form, matchType: event.target.value as MatchType })
                }
              >
                {Object.entries(MATCH_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>

            {form.matchType === "PINCODE" ? (
              <Field label="Pincode">
                <input
                  required
                  value={form.pincode}
                  onChange={(event) => setForm({ ...form, pincode: event.target.value })}
                  placeholder="531035"
                />
              </Field>
            ) : null}

            {form.matchType === "CITY" ? (
              <Field label="City">
                <input
                  required
                  value={form.city}
                  onChange={(event) => setForm({ ...form, city: event.target.value })}
                  placeholder="Anakapalle"
                />
              </Field>
            ) : null}

            {form.matchType === "KEYWORD" ? (
              <Field label="Locality keywords (comma separated)" wide>
                <input
                  required
                  value={form.keywords}
                  onChange={(event) => setForm({ ...form, keywords: event.target.value })}
                  placeholder="Thummapala, Tulsi Nagar"
                />
              </Field>
            ) : null}

            <Field label="Store (blank = all stores)" wide>
              <select
                value={form.storeId}
                onChange={(event) => setForm({ ...form, storeId: event.target.value })}
              >
                <option value="">All stores (global rule)</option>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Rate (₹ per km)">
              <input
                type="number"
                min="0"
                step="0.01"
                required
                value={form.rateRupeesPerKm}
                onChange={(event) => setForm({ ...form, rateRupeesPerKm: event.target.value })}
                placeholder="2"
              />
            </Field>

            <Field label="Flat fee (₹) — overrides per-km">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.flatRupees}
                onChange={(event) => setForm({ ...form, flatRupees: event.target.value })}
                placeholder="e.g. 30"
              />
            </Field>

            <Field label="Free delivery threshold (₹)">
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.freeDeliveryRupees}
                onChange={(event) => setForm({ ...form, freeDeliveryRupees: event.target.value })}
                placeholder="blank = ₹99 default"
              />
            </Field>

            <Field label="Max delivery distance (km)">
              <input
                type="number"
                min="0.1"
                step="0.1"
                value={form.maximumDistanceKm}
                onChange={(event) => setForm({ ...form, maximumDistanceKm: event.target.value })}
                placeholder="blank = 15 km default"
              />
            </Field>

            <Field label="Priority (lower wins)">
              <input
                type="number"
                min="0"
                value={form.priority}
                onChange={(event) => setForm({ ...form, priority: event.target.value })}
              />
            </Field>

            <Field label="Active">
              <select
                value={form.isActive ? "true" : "false"}
                onChange={(event) => setForm({ ...form, isActive: event.target.value === "true" })}
              >
                <option value="true">Active</option>
                <option value="false">Inactive</option>
              </select>
            </Field>

            <div className="mt-2 flex justify-end gap-3 md:col-span-2">
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-black text-slate-600 hover:bg-slate-200"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-black text-white hover:bg-teal-800 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <IndianRupee className="h-4 w-4" />}
                {editingId ? "Save changes" : "Create rule"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </DashboardLayout>
  );
}