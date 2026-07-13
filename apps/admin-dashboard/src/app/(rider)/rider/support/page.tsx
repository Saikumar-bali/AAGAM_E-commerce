"use client";
import React, { useCallback, useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { apiClient } from "@aagam/utils";
import { Headphones, MessageCircle } from "lucide-react";
import {
  EmptyPanel,
  ErrorBanner,
  PrivateEvidenceLink,
  PortalLoading,
  RefreshButton,
  RiderPageHeader,
} from "@/components/rider/RiderPortalUi";
export default function RiderSupportPage() {
  const [rows, setRows] = useState<any[]>([]),
    [loading, setLoading] = useState(true),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<any>(null),
    [form, setForm] = useState({
      deliveryJobId: "",
      category: "DELIVERY",
      subject: "",
      description: "",
      evidenceKey: "",
    }),
    [reply, setReply] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = (await apiClient.get("/riders/portal/support")).data || [];
      setRows(d);
      if (selected)
        setSelected(d.find((r: any) => r.id === selected.id) || null);
    } catch (e: any) {
      setError(e?.response?.data?.message || "Could not load support tickets.");
    } finally {
      setLoading(false);
    }
  }, [selected?.id]);
  useEffect(() => {
    void load();
  }, []);
  const upload = async (file?: File) => {
    if (!file) return;
    setUploading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const result = await apiClient.post("/upload/evidence", body);
      setForm((current) => ({
        ...current,
        evidenceKey: result.data.storageKey,
      }));
    } catch (e: any) {
      setError(e?.response?.data?.message || "Evidence upload failed.");
    } finally {
      setUploading(false);
    }
  };
  const create = async () => {
    try {
      await apiClient.post("/riders/portal/support", {
        deliveryJobId: form.deliveryJobId || undefined,
        category: form.category,
        subject: form.subject,
        description: form.description,
        evidenceKeys: form.evidenceKey ? [form.evidenceKey] : [],
      });
      setForm({
        ...form,
        deliveryJobId: "",
        subject: "",
        description: "",
        evidenceKey: "",
      });
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || "Ticket creation failed.");
    }
  };
  const send = async () => {
    try {
      await apiClient.post(`/riders/portal/support/${selected.id}/messages`, {
        body: reply,
      });
      setReply("");
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || "Reply failed.");
    }
  };
  return (
    <DashboardLayout allowedRole="RIDER">
      <div className="space-y-5">
        <RiderPageHeader
          title="Rider Support"
          subtitle="Delivery-linked tickets, issue categories, private evidence upload, status, and complete conversation history."
          backHref="/rider"
          action={<RefreshButton onClick={load} loading={loading} />}
        />
        <ErrorBanner message={error} />
        {loading ? (
          <PortalLoading />
        ) : (
          <section className="grid gap-5 xl:grid-cols-[380px_1fr]">
            <div className="space-y-4">
              <div className="rounded-2xl border bg-white p-5">
                <p className="font-black">
                  <Headphones className="mr-2 inline h-5 w-5" />
                  Create ticket
                </p>
                <div className="mt-4 space-y-2">
                  <input
                    value={form.deliveryJobId}
                    onChange={(e) =>
                      setForm({ ...form, deliveryJobId: e.target.value })
                    }
                    placeholder="Delivery job ID (optional)"
                    className="w-full rounded-xl border px-3 py-2"
                  />
                  <select
                    value={form.category}
                    onChange={(e) =>
                      setForm({ ...form, category: e.target.value })
                    }
                    className="w-full rounded-xl border px-3 py-2"
                  >
                    <option>DELIVERY</option>
                    <option>PICKUP</option>
                    <option>CUSTOMER</option>
                    <option>STORE</option>
                    <option>PAYMENT</option>
                    <option>SAFETY</option>
                    <option>APP</option>
                    <option>OTHER</option>
                  </select>
                  <input
                    value={form.subject}
                    onChange={(e) =>
                      setForm({ ...form, subject: e.target.value })
                    }
                    placeholder="Subject"
                    className="w-full rounded-xl border px-3 py-2"
                  />
                  <textarea
                    value={form.description}
                    onChange={(e) =>
                      setForm({ ...form, description: e.target.value })
                    }
                    placeholder="Describe the issue"
                    className="min-h-28 w-full rounded-xl border px-3 py-2"
                  />
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={(e) => upload(e.target.files?.[0])}
                    className="w-full rounded-xl border px-3 py-2 text-sm"
                  />
                  <p className="text-xs font-semibold text-slate-500">
                    {uploading
                      ? "Uploading to private evidence storage…"
                      : form.evidenceKey
                      ? "Private evidence attached."
                      : "Optional private evidence image/PDF."}
                  </p>
                  <button
                    disabled={
                      form.subject.length < 4 ||
                      form.description.length < 10 ||
                      uploading
                    }
                    onClick={create}
                    className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-40"
                  >
                    Open ticket
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                {rows.map((row: any) => (
                  <button
                    key={row.id}
                    onClick={() => setSelected(row)}
                    className="w-full rounded-xl border bg-white p-4 text-left"
                  >
                    <div className="flex justify-between gap-2">
                      <p className="font-black">{row.subject}</p>
                      <span className="text-xs font-black text-slate-500">
                        {row.status}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {row.category}
                      {row.deliveryJobId
                        ? ` · Job ${row.deliveryJobId.slice(-8)}`
                        : ""}
                    </p>
                  </button>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border bg-white p-5">
              {!selected ? (
                <EmptyPanel
                  title="Select a ticket"
                  body="Conversation history and reply controls will appear here."
                />
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xl font-black">{selected.subject}</p>
                      <p className="text-sm text-slate-500">
                        {selected.status} ·{" "}
                        {new Date(selected.createdAt).toLocaleString("en-IN")}
                      </p>
                    </div>
                    <MessageCircle className="h-6 w-6 text-indigo-600" />
                  </div>
                  <div className="mt-5 space-y-3">
                    {selected.messages.map((message: any) => (
                      <div
                        key={message.id}
                        className={`rounded-xl p-4 ${
                          message.senderRole === "RIDER"
                            ? "ml-8 bg-emerald-50"
                            : "mr-8 bg-slate-100"
                        }`}
                      >
                        <p className="text-xs font-black text-slate-500">
                          {message.senderRole} ·{" "}
                          {new Date(message.createdAt).toLocaleString("en-IN")}
                        </p>
                        <p className="mt-1 text-sm font-semibold">
                          {message.body}
                        </p>
                        {(Array.isArray(message.evidenceKeys)
                          ? message.evidenceKeys
                          : []
                        ).map((key: string) => (
                          <PrivateEvidenceLink key={key} storageKey={key} />
                        ))}
                      </div>
                    ))}
                  </div>
                  {!["RESOLVED", "CLOSED"].includes(selected.status) && (
                    <div className="mt-5 flex gap-2">
                      <input
                        value={reply}
                        onChange={(e) => setReply(e.target.value)}
                        placeholder="Add to conversation"
                        className="flex-1 rounded-xl border px-3 py-2.5"
                      />
                      <button
                        disabled={!reply.trim()}
                        onClick={send}
                        className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-40"
                      >
                        Send
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </section>
        )}
      </div>
    </DashboardLayout>
  );
}
