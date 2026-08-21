"use client";

import React, { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import {
  Loader2,
  Plus,
  Power,
  Trash2,
  Trees,
  X,
} from "lucide-react";
import { apiClient } from "@aagam/utils";
import DashboardLayout from "@/components/DashboardLayout";

const LocalityMapPicker = dynamic(
  () => import("@/components/LocalityMapPicker"),
  { ssr: false, loading: () => <div className="grid h-[300px] place-items-center rounded-2xl bg-slate-50 text-xs text-slate-400">Loading map…</div> },
);

type Locality = {
  id: string;
  name: string;
  aliases: string[];
  city: string;
  state: string;
  pincode: string;
  latitude: number | null;
  longitude: number | null;
  radius: number | null;
  zoneId: string | null;
  isActive: boolean;
  sortOrder: number;
};

type ZoneOption = { id: string; name: string };

type LocalityForm = {
  name: string;
  aliases: string;
  city: string;
  state: string;
  pincode: string;
  latitude: string;
  longitude: string;
  radius: string;
  zoneId: string;
  sortOrder: string;
  isActive: boolean;
};

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
      <div className="max-h-[94vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white shadow-2xl">
        <header className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-100 bg-white p-5">
          <div>
            <h2 className="text-xl font-black text-slate-950">{title}</h2>
            <p className="text-xs font-semibold text-slate-500">{subtitle}</p>
          </div>
          <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl bg-slate-100">
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
    <label className={`block text-xs font-black uppercase tracking-wide text-slate-500 ${wide ? "md:col-span-2" : ""}`}>
      {label}
      {React.cloneElement(children, {
        className: `${children.props.className || ""} mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-bold normal-case tracking-normal text-slate-950 focus:border-teal-500 focus:outline-none`,
      })}
    </label>
  );
}

const emptyForm = (): LocalityForm => ({
  name: "",
  aliases: "",
  city: "",
  state: "ANDHRA PRADESH",
  pincode: "",
  latitude: "",
  longitude: "",
  radius: "",
  zoneId: "",
  sortOrder: "0",
  isActive: true,
});

export default function LocalitiesPage() {
  const [localities, setLocalities] = useState<Locality[]>([]);
  const [zones, setZones] = useState<ZoneOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<LocalityForm>(emptyForm());

  const load = async () => {
    setLoading(true);
    try {
      const [localitiesResult, zonesResult] = await Promise.allSettled([
        apiClient.get("/admin/localities"),
        apiClient.get("/stores/delivery-zones/admin"),
      ]);
      if (localitiesResult.status === "fulfilled") {
        setLocalities(Array.isArray(localitiesResult.value.data) ? localitiesResult.value.data : []);
      } else {
        setError(errorMessage(localitiesResult.reason) || "Could not load localities.");
      }
      if (zonesResult.status === "fulfilled" && Array.isArray(zonesResult.value.data)) {
        setZones(
          zonesResult.value.data
            .filter((zone: any) => zone && zone.id && zone.isActive !== false)
            .map((zone: any) => ({ id: zone.id, name: zone.name || zone.id })),
        );
      }
    } catch (requestError: any) {
      setError(errorMessage(requestError) || "Could not load localities.");
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
    setFormError("");
    setFormOpen(true);
  };

  const openEdit = (locality: Locality) => {
    setEditingId(locality.id);
    setForm({
      name: locality.name,
      aliases: (locality.aliases || []).join(", "),
      city: locality.city,
      state: locality.state,
      pincode: locality.pincode,
      latitude: locality.latitude != null ? String(locality.latitude) : "",
      longitude: locality.longitude != null ? String(locality.longitude) : "",
      radius: locality.radius != null ? String(locality.radius) : "",
      zoneId: locality.zoneId || "",
      sortOrder: String(locality.sortOrder),
      isActive: locality.isActive,
    });
    setFormOpen(true);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setFormError("");
    setError("");
    setMessage("");

    const hasLat = form.latitude.trim() !== "";
    const hasLng = form.longitude.trim() !== "";
    if (hasLat !== hasLng) {
      setFormError("Both latitude and longitude must be provided together, or both left empty.");
      setSaving(false);
      return;
    }

    try {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        aliases: form.aliases.split(",").map((alias) => alias.trim()).filter(Boolean),
        city: form.city.trim(),
        state: form.state.trim(),
        pincode: form.pincode.trim(),
        zoneId: form.zoneId || null,
        sortOrder: form.sortOrder === "" ? 0 : Number(form.sortOrder),
        isActive: form.isActive,
      };

      if (hasLat && hasLng) {
        payload.latitude = Number(form.latitude);
        payload.longitude = Number(form.longitude);
      }

      if (form.radius.trim() !== "") {
        payload.radius = Number(form.radius);
      } else {
        payload.radius = null;
      }

      if (editingId) {
        await apiClient.patch(`/admin/localities/${editingId}`, payload);
        setMessage("Locality updated.");
      } else {
        await apiClient.post("/admin/localities", payload);
        setMessage("Locality created.");
      }
      setFormOpen(false);
      await load();
    } catch (requestError: any) {
      setFormError(errorMessage(requestError) || "Could not save the locality.");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (locality: Locality) => {
    setError("");
    setMessage("");
    try {
      await apiClient.patch(`/admin/localities/${locality.id}`, { isActive: !locality.isActive });
      await load();
    } catch (requestError: any) {
      setError(errorMessage(requestError) || "Could not update the locality.");
    }
  };

  const remove = async (locality: Locality) => {
    if (!window.confirm(`Delete the locality "${locality.name}"?`)) return;
    setError("");
    setMessage("");
    try {
      await apiClient.delete(`/admin/localities/${locality.id}`);
      setMessage("Locality deleted.");
      await load();
    } catch (requestError: any) {
      setError(errorMessage(requestError) || "Could not delete the locality.");
    }
  };

  const formLat = form.latitude ? Number(form.latitude) : 0;
  const formLng = form.longitude ? Number(form.longitude) : 0;
  const formRadius = form.radius ? Number(form.radius) : 5;

  return (
    <DashboardLayout allowedRole="ADMIN">
      <div className="mx-auto max-w-6xl space-y-8 pb-12">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-teal-600">Admin · Delivery</p>
            <h1 className="text-2xl font-black text-slate-950">Localities</h1>
            <p className="mt-1 max-w-2xl text-sm font-semibold text-slate-500">
              The list of serviceable villages and localities. Customers pick from this list when
              entering a manual delivery address, so the locality, pincode and city are always
              correct — no spelling errors. Link a locality to a delivery zone for exact boundaries.
            </p>
          </div>
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex items-center gap-2 rounded-xl bg-teal-700 px-4 py-2.5 text-sm font-black text-white hover:bg-teal-800"
          >
            <Plus className="h-4 w-4" /> New locality
          </button>
        </header>

        {message ? <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">{message}</div> : null}
        {error ? <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}

        <section>
          <h2 className="mb-3 text-lg font-black text-slate-950">Serviceable localities</h2>
          {loading ? (
            <div className="grid place-items-center rounded-3xl bg-white p-12 text-slate-400">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : localities.length === 0 ? (
            <div className="rounded-3xl bg-white p-10 text-center text-sm font-semibold text-slate-500">
              No localities yet. Add the villages you want to serve — customers will pick from this list.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-3xl bg-white shadow-sm">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-5 py-4 font-black">Locality</th>
                    <th className="px-5 py-4 font-black">City</th>
                    <th className="px-5 py-4 font-black">Pincode</th>
                    <th className="px-5 py-4 font-black">Zone</th>
                    <th className="px-5 py-4 font-black">Centre</th>
                    <th className="px-5 py-4 font-black">Radius</th>
                    <th className="px-5 py-4 font-black">Status</th>
                    <th className="px-5 py-4 text-right font-black">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {localities.map((locality) => (
                    <tr key={locality.id} className="hover:bg-teal-50/30">
                      <td className="px-5 py-4">
                        <p className="font-black text-slate-950">{locality.name}</p>
                        <p className="text-xs font-semibold text-slate-400">
                          {locality.aliases.length ? `aka ${locality.aliases.join(", ")}` : "no aliases"}
                        </p>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 font-semibold text-slate-700">
                        {locality.city}, {locality.state}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 font-mono font-semibold text-slate-700">
                        {locality.pincode}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 font-semibold text-slate-700">
                        {locality.zoneId
                          ? zones.find((zone) => zone.id === locality.zoneId)?.name || "Zone"
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 font-mono text-xs text-slate-500">
                        {locality.latitude != null && locality.longitude != null
                          ? `${locality.latitude.toFixed(5)}, ${locality.longitude.toFixed(5)}`
                          : "auto (pincode)"}
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 font-semibold text-slate-700">
                        {locality.radius != null ? `${locality.radius} km` : "—"}
                      </td>
                      <td className="px-5 py-4">
                        <button
                          type="button"
                          onClick={() => toggleActive(locality)}
                          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-black ${
                            locality.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          <Power className="h-3 w-3" />
                          {locality.isActive ? "Active" : "Inactive"}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-5 py-4 text-right">
                        <button
                          type="button"
                          onClick={() => openEdit(locality)}
                          className="rounded-xl px-3 py-1.5 text-xs font-black text-teal-700 hover:bg-teal-50"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(locality)}
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
      </div>

      {formOpen ? (
        <Modal
          title={editingId ? "Edit locality" : "New locality"}
          subtitle="Pin the centre on the map and set the delivery radius. Customers pick this locality when entering a manual address."
          onClose={() => setFormOpen(false)}
        >
          <form onSubmit={save} className="grid gap-4 md:grid-cols-2">
            {formError ? <div className="md:col-span-2 rounded-2xl bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{formError}</div> : null}
            <Field label="Locality name" wide>
              <input
                required
                minLength={2}
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="e.g. Bowluvada"
              />
            </Field>

            <Field label="Aliases (comma separated)" wide>
              <input
                value={form.aliases}
                onChange={(event) => setForm({ ...form, aliases: event.target.value })}
                placeholder="Boluvada, Bolluvada"
              />
            </Field>

            <Field label="City">
              <input
                required
                minLength={2}
                value={form.city}
                onChange={(event) => setForm({ ...form, city: event.target.value })}
                placeholder="Anakapalli"
              />
            </Field>

            <Field label="Pincode">
              <input
                required
                pattern="\d{6}"
                maxLength={6}
                inputMode="numeric"
                value={form.pincode}
                onChange={(event) => setForm({ ...form, pincode: event.target.value })}
                placeholder="531001"
              />
            </Field>

            <Field label="State" wide>
              <input
                required
                minLength={2}
                value={form.state}
                onChange={(event) => setForm({ ...form, state: event.target.value })}
                placeholder="ANDHRA PRADESH"
              />
            </Field>

            <Field label="Delivery zone (optional)" wide>
              <select value={form.zoneId} onChange={(event) => setForm({ ...form, zoneId: event.target.value })}>
                <option value="">No zone link</option>
                {zones.map((zone) => (
                  <option key={zone.id} value={zone.id}>
                    {zone.name}
                  </option>
                ))}
              </select>
            </Field>

            <Field label="Sort order">
              <input
                type="number"
                min="0"
                value={form.sortOrder}
                onChange={(event) => setForm({ ...form, sortOrder: event.target.value })}
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

            <div className="md:col-span-2">
              <p className="mb-2 text-xs font-black uppercase tracking-wide text-slate-500">Map &amp; Radius</p>
              <p className="mb-3 text-xs text-slate-400">
                Click the map to move the centre pin, or drag the marker. Use the slider below to set the delivery radius.
              </p>
              <LocalityMapPicker
                latitude={formLat}
                longitude={formLng}
                radius={formRadius}
                onCenterChange={(lat, lng) =>
                  setForm((prev) => ({ ...prev, latitude: String(lat), longitude: String(lng) }))
                }
                onRadiusChange={(km) => setForm((prev) => ({ ...prev, radius: String(km) }))}
              />
              <div className="mt-3 grid grid-cols-[1fr_4rem] items-center gap-3">
                <div>
                  <input
                    type="range"
                    min="1"
                    max="50"
                    step="0.5"
                    value={formRadius}
                    onChange={(event) => setForm({ ...form, radius: event.target.value })}
                    className="w-full accent-teal-600"
                  />
                  <div className="mt-0.5 flex justify-between text-[10px] font-semibold text-slate-400">
                    <span>1 km</span>
                    <span>25 km</span>
                    <span>50 km</span>
                  </div>
                </div>
                <div className="grid place-items-center rounded-xl border border-slate-200 bg-slate-50 py-2 text-sm font-black text-slate-950">
                  {formRadius} km
                </div>
              </div>
            </div>

            <Field label="Latitude">
              <input
                type="number"
                step="any"
                value={form.latitude}
                onChange={(event) => setForm({ ...form, latitude: event.target.value })}
                placeholder="17.6868"
              />
            </Field>

            <Field label="Longitude">
              <input
                type="number"
                step="any"
                value={form.longitude}
                onChange={(event) => setForm({ ...form, longitude: event.target.value })}
                placeholder="83.2185"
              />
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
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trees className="h-4 w-4" />}
                {editingId ? "Save changes" : "Create locality"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </DashboardLayout>
  );
}
