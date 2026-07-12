"use client";
import React, { useCallback, useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { apiClient } from "@aagam/utils";
import { Coffee, Power } from "lucide-react";
import {
  EmptyPanel,
  ErrorBanner,
  PortalLoading,
  RefreshButton,
  RiderPageHeader,
} from "@/components/rider/RiderPortalUi";
const days = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
const toMinute = (v: string) => {
  const [h, m] = v.split(":").map(Number);
  return h * 60 + m;
};
const toTime = (v: number) =>
  `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(
    2,
    "0"
  )}`;
export default function AvailabilityPage() {
  const [data, setData] = useState<any>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [schedule, setSchedule] = useState<any[]>(
      days.map((_, dayOfWeek) => ({
        dayOfWeek,
        startMinute: 540,
        endMinute: 1080,
        isAvailable: false,
      }))
    );
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = (await apiClient.get("/riders/portal/availability")).data;
      setData(d);
      if (d.schedule?.length) {
        const map = new Map(d.schedule.map((r: any) => [r.dayOfWeek, r]));
        setSchedule(
          days.map(
            (_, i) =>
              map.get(i) || {
                dayOfWeek: i,
                startMinute: 540,
                endMinute: 1080,
                isAvailable: false,
              }
          )
        );
      }
    } catch (e: any) {
      setError(e?.response?.data?.message || "Could not load availability.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const call = async (path: string, body: any = {}) => {
    setError("");
    try {
      await apiClient.post(path, body);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || "Operation failed.");
    }
  };
  const status = async (value: string) => {
    try {
      await apiClient.patch("/riders/portal/availability/status", {
        status: value,
      });
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || "Status change failed.");
    }
  };
  const save = async () => {
    try {
      await apiClient.patch("/riders/portal/availability/schedule", {
        entries: schedule,
      });
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message || "Schedule save failed.");
    }
  };
  return (
    <DashboardLayout allowedRole="RIDER">
      <div className="space-y-5">
        <RiderPageHeader
          title="Availability & Shift"
          subtitle="Online/offline status, current and upcoming shifts, recurring availability schedule, and break state."
          backHref="/rider"
          action={<RefreshButton onClick={load} loading={loading} />}
        />
        <ErrorBanner message={error} />
        {loading ? (
          <PortalLoading />
        ) : (
          <>
            <section className="rounded-2xl border bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-black uppercase text-slate-400">
                    Current status
                  </p>
                  <p className="text-2xl font-black">
                    {data?.status}
                    {data?.currentBreak ? " · BREAK" : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => status("ONLINE")}
                    className="rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white"
                  >
                    <Power className="mr-2 inline h-4 w-4" />
                    Online
                  </button>
                  <button
                    onClick={() => status("OFFLINE")}
                    className="rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-black text-white"
                  >
                    Offline
                  </button>
                  {data?.currentBreak ? (
                    <button
                      onClick={() =>
                        call("/riders/portal/availability/break/end")
                      }
                      className="rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-black text-white"
                    >
                      End break
                    </button>
                  ) : (
                    <button
                      onClick={() =>
                        call("/riders/portal/availability/break/start", {
                          reason: "Scheduled break",
                        })
                      }
                      className="rounded-xl bg-amber-50 px-4 py-2.5 text-sm font-black text-amber-800"
                    >
                      <Coffee className="mr-2 inline h-4 w-4" />
                      Start break
                    </button>
                  )}
                </div>
              </div>
            </section>
            <section className="rounded-2xl border bg-white p-5">
              <p className="font-black">Availability schedule</p>
              <div className="mt-4 space-y-2">
                {schedule.map((row: any, index) => (
                  <div
                    key={row.dayOfWeek}
                    className="grid grid-cols-[110px_70px_1fr_1fr] items-center gap-2 rounded-xl bg-slate-50 p-3"
                  >
                    <span className="text-sm font-black">
                      {days[row.dayOfWeek]}
                    </span>
                    <input
                      type="checkbox"
                      checked={row.isAvailable}
                      onChange={(e) =>
                        setSchedule(
                          schedule.map((r, i) =>
                            i === index
                              ? { ...r, isAvailable: e.target.checked }
                              : r
                          )
                        )
                      }
                    />
                    <input
                      type="time"
                      value={toTime(row.startMinute)}
                      onChange={(e) =>
                        setSchedule(
                          schedule.map((r, i) =>
                            i === index
                              ? { ...r, startMinute: toMinute(e.target.value) }
                              : r
                          )
                        )
                      }
                      className="rounded-lg border px-2 py-1.5"
                    />
                    <input
                      type="time"
                      value={toTime(row.endMinute)}
                      onChange={(e) =>
                        setSchedule(
                          schedule.map((r, i) =>
                            i === index
                              ? { ...r, endMinute: toMinute(e.target.value) }
                              : r
                          )
                        )
                      }
                      className="rounded-lg border px-2 py-1.5"
                    />
                  </div>
                ))}
              </div>
              <button
                onClick={save}
                className="mt-4 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-black text-white"
              >
                Save schedule
              </button>
            </section>
            <section className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border bg-white p-5">
                <p className="font-black">Current shift</p>
                {data?.currentShift ? (
                  <p className="mt-3 text-sm font-semibold">
                    {new Date(data.currentShift.startsAt).toLocaleString(
                      "en-IN"
                    )}{" "}
                    –{" "}
                    {new Date(data.currentShift.endsAt).toLocaleString("en-IN")}{" "}
                    · {data.currentShift.status}
                  </p>
                ) : (
                  <p className="mt-3 text-sm text-slate-500">
                    No current shift assigned.
                  </p>
                )}
              </div>
              <div className="rounded-2xl border bg-white p-5">
                <p className="font-black">Upcoming shifts</p>
                {data?.upcomingShifts?.length ? (
                  data.upcomingShifts.map((shift: any) => (
                    <p
                      key={shift.id}
                      className="mt-3 rounded-xl bg-slate-50 p-3 text-sm font-semibold"
                    >
                      {new Date(shift.startsAt).toLocaleString("en-IN")} –{" "}
                      {new Date(shift.endsAt).toLocaleTimeString("en-IN")}
                    </p>
                  ))
                ) : (
                  <EmptyPanel
                    title="No upcoming shifts"
                    body="An assigned future shift will appear here."
                  />
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </DashboardLayout>
  );
}
