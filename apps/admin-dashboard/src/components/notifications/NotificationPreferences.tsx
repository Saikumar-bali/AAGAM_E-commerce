'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { apiClient } from '@aagam/utils';
import {
  ArrowLeft,
  BellRing,
  CheckCircle2,
  Inbox,
  Loader2,
  RefreshCw,
  Settings2,
  ShieldCheck,
} from 'lucide-react';

type Role = 'ADMIN' | 'CUSTOMER' | 'STORE_OWNER' | 'RIDER';

type Preference = {
  eventType: string;
  pushEnabled: boolean;
  inAppEnabled: boolean;
};

type PreferenceState = Preference & {
  inherited: boolean;
};

type EventDefinition = {
  eventType: string;
  title: string;
  description: string;
  roles: Role[];
  critical?: boolean;
};

type Props = {
  role: Role;
  backHref: string;
  title?: string;
};

const EVENTS: EventDefinition[] = [
  {
    eventType: 'ORDER_PLACED',
    title: 'New order placed',
    description: 'A paid or COD order has been committed and is ready for store operations.',
    roles: ['ADMIN', 'STORE_OWNER'],
    critical: true,
  },
  {
    eventType: 'STORE_ACCEPTED_ORDER',
    title: 'Store accepted order',
    description: 'The store accepted the order and committed to fulfilment.',
    roles: ['ADMIN', 'CUSTOMER'],
  },
  {
    eventType: 'STORE_STARTED_PICKING',
    title: 'Picking started',
    description: 'The store started collecting the customer’s items.',
    roles: ['ADMIN', 'CUSTOMER'],
  },
  {
    eventType: 'ORDER_PACKED',
    title: 'Order packed',
    description: 'The order is packed and ready for dispatch operations.',
    roles: ['ADMIN', 'CUSTOMER', 'STORE_OWNER'],
  },
  {
    eventType: 'DISPATCH_JOB_CREATED',
    title: 'Dispatch job created',
    description: 'A packed order entered the dispatch queue.',
    roles: ['ADMIN', 'STORE_OWNER'],
    critical: true,
  },
  {
    eventType: 'ASSIGNMENT_OFFERED',
    title: 'Delivery offer',
    description: 'A specific rider received a timed delivery assignment offer.',
    roles: ['ADMIN', 'RIDER'],
    critical: true,
  },
  {
    eventType: 'ASSIGNMENT_ACCEPTED',
    title: 'Rider accepted',
    description: 'The addressed rider accepted the delivery assignment.',
    roles: ['ADMIN', 'CUSTOMER', 'STORE_OWNER', 'RIDER'],
  },
  {
    eventType: 'ASSIGNMENT_REJECTED',
    title: 'Rider rejected',
    description: 'A rider declined an assignment and dispatch needs another decision.',
    roles: ['ADMIN', 'STORE_OWNER', 'RIDER'],
  },
  {
    eventType: 'ASSIGNMENT_EXPIRED',
    title: 'Delivery offer expired',
    description: 'A timed rider offer expired without acceptance.',
    roles: ['ADMIN', 'STORE_OWNER', 'RIDER'],
  },
  {
    eventType: 'RIDER_EN_ROUTE_TO_STORE',
    title: 'Rider travelling to store',
    description: 'The assigned rider started travelling to the pickup store.',
    roles: ['ADMIN', 'STORE_OWNER', 'CUSTOMER'],
  },
  {
    eventType: 'RIDER_AT_STORE',
    title: 'Rider arrived at store',
    description: 'The rider reached the store and is waiting for pickup handoff.',
    roles: ['ADMIN', 'STORE_OWNER', 'CUSTOMER'],
  },
  {
    eventType: 'PICKUP_VERIFIED',
    title: 'Pickup verified',
    description: 'The store verified that the packed order was handed to the rider.',
    roles: ['ADMIN', 'CUSTOMER', 'STORE_OWNER', 'RIDER'],
    critical: true,
  },
  {
    eventType: 'OUT_FOR_DELIVERY',
    title: 'Out for delivery',
    description: 'The rider started the customer delivery leg.',
    roles: ['ADMIN', 'CUSTOMER', 'STORE_OWNER', 'RIDER'],
    critical: true,
  },
  {
    eventType: 'RIDER_AT_CUSTOMER',
    title: 'Rider at customer',
    description: 'The rider reached the delivery destination.',
    roles: ['ADMIN', 'CUSTOMER', 'RIDER'],
    critical: true,
  },
  {
    eventType: 'DELIVERY_COMPLETED',
    title: 'Delivery completed',
    description: 'The delivery was confirmed successfully.',
    roles: ['ADMIN', 'CUSTOMER', 'STORE_OWNER', 'RIDER'],
  },
  {
    eventType: 'DELIVERY_FAILED',
    title: 'Delivery failed',
    description: 'The delivery could not be completed and requires operational attention.',
    roles: ['ADMIN', 'CUSTOMER', 'STORE_OWNER', 'RIDER'],
    critical: true,
  },
  {
    eventType: 'DELIVERY_CANCELLED',
    title: 'Delivery cancelled',
    description: 'The delivery workflow was cancelled.',
    roles: ['ADMIN', 'CUSTOMER', 'STORE_OWNER', 'RIDER'],
    critical: true,
  },
  {
    eventType: 'ADMIN_BROADCAST',
    title: 'Service announcements',
    description: 'Platform-wide or role-targeted operational announcements.',
    roles: ['ADMIN', 'CUSTOMER', 'STORE_OWNER', 'RIDER'],
  },
];

function Toggle({
  checked,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 rounded-full transition ${
        checked ? 'bg-emerald-500' : 'bg-slate-300'
      } disabled:cursor-wait disabled:opacity-60`}
    >
      <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition ${
        checked ? 'left-6' : 'left-1'
      }`} />
    </button>
  );
}

export default function NotificationPreferences({ role, backHref, title = 'Notification preferences' }: Props) {
  const [globalPreference, setGlobalPreference] = useState<Preference>({
    eventType: '*',
    pushEnabled: true,
    inAppEnabled: true,
  });
  const [eventPreferences, setEventPreferences] = useState<Record<string, PreferenceState>>({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const visibleEvents = useMemo(
    () => EVENTS.filter((event) => event.roles.includes(role)),
    [role],
  );

  const loadPreferences = useCallback(async () => {
    setLoading(true);
    setMessage('');
    try {
      const response = await apiClient.get('/notifications/preferences');
      const stored: Preference[] = Array.isArray(response.data) ? response.data : [];
      const global = stored.find((preference) => preference.eventType === '*') || {
        eventType: '*',
        pushEnabled: true,
        inAppEnabled: true,
      };
      setGlobalPreference(global);

      const next: Record<string, PreferenceState> = {};
      visibleEvents.forEach((event) => {
        const specific = stored.find((preference) => preference.eventType === event.eventType);
        next[event.eventType] = {
          eventType: event.eventType,
          pushEnabled: specific?.pushEnabled ?? global.pushEnabled,
          inAppEnabled: specific?.inAppEnabled ?? global.inAppEnabled,
          inherited: !specific,
        };
      });
      setEventPreferences(next);
    } catch (error: any) {
      setMessage(error?.response?.data?.message || 'Could not load notification preferences.');
    } finally {
      setLoading(false);
    }
  }, [visibleEvents]);

  useEffect(() => {
    void loadPreferences();
  }, [loadPreferences]);

  const updateGlobal = async (field: 'pushEnabled' | 'inAppEnabled', value: boolean) => {
    const previous = globalPreference;
    const next = { ...globalPreference, [field]: value };
    setGlobalPreference(next);
    setSavingKey(`global:${field}`);
    setMessage('');
    try {
      await apiClient.patch('/notifications/preferences', next);
      setEventPreferences((current) => Object.fromEntries(
        Object.entries(current).map(([eventType, preference]) => [
          eventType,
          preference.inherited ? { ...preference, [field]: value } : preference,
        ]),
      ));
      setMessage('Global notification preference saved.');
    } catch (error: any) {
      setGlobalPreference(previous);
      setMessage(error?.response?.data?.message || 'Could not save the global preference.');
    } finally {
      setSavingKey(null);
    }
  };

  const updateEvent = async (
    eventType: string,
    field: 'pushEnabled' | 'inAppEnabled',
    value: boolean,
  ) => {
    const previous = eventPreferences[eventType];
    const next: PreferenceState = { ...previous, [field]: value, inherited: false };
    setEventPreferences((current) => ({ ...current, [eventType]: next }));
    setSavingKey(`${eventType}:${field}`);
    setMessage('');
    try {
      await apiClient.patch('/notifications/preferences', {
        eventType,
        pushEnabled: next.pushEnabled,
        inAppEnabled: next.inAppEnabled,
      });
      setMessage('Event preference saved.');
    } catch (error: any) {
      setEventPreferences((current) => ({ ...current, [eventType]: previous }));
      setMessage(error?.response?.data?.message || 'Could not save the event preference.');
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <div className="space-y-5">
      <section className="rounded-[2rem] border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 p-6 text-white shadow-xl">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.22em] text-indigo-300">Communication controls</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight">{title}</h1>
            <p className="mt-2 max-w-3xl text-sm font-semibold text-slate-300">
              Choose which events appear in your in-app inbox and which are also delivered to registered devices.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={backHref}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-slate-950"
            >
              <ArrowLeft className="h-4 w-4" /> Back to inbox
            </Link>
            <button
              type="button"
              onClick={() => void loadPreferences()}
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-500 px-4 py-2.5 text-sm font-black text-white disabled:opacity-60"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </div>
      </section>

      {message && (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm font-bold text-indigo-900">
          {message}
        </div>
      )}

      <section className="rounded-[2rem] border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-indigo-600" />
              <h2 className="text-xl font-black text-slate-950">Global defaults</h2>
            </div>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Events without a custom setting inherit these defaults.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex min-w-56 items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <span className="inline-flex items-center gap-2 text-sm font-black text-slate-700">
                <BellRing className="h-4 w-4 text-indigo-600" /> Device push
              </span>
              <Toggle
                checked={globalPreference.pushEnabled}
                disabled={savingKey !== null}
                label="Global device push"
                onChange={(value) => void updateGlobal('pushEnabled', value)}
              />
            </div>
            <div className="flex min-w-56 items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
              <span className="inline-flex items-center gap-2 text-sm font-black text-slate-700">
                <Inbox className="h-4 w-4 text-teal-600" /> In-app inbox
              </span>
              <Toggle
                checked={globalPreference.inAppEnabled}
                disabled={savingKey !== null}
                label="Global in-app inbox"
                onChange={(value) => void updateGlobal('inAppEnabled', value)}
              />
            </div>
          </div>
        </div>
      </section>

      <section className="rounded-[2rem] border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="mb-5 flex items-center gap-2">
          <Settings2 className="h-5 w-5 text-indigo-600" />
          <div>
            <h2 className="text-xl font-black text-slate-950">Event-specific controls</h2>
            <p className="text-sm font-semibold text-slate-500">Changing a switch creates a custom setting for that event.</p>
          </div>
        </div>

        {loading ? (
          <div className="flex min-h-48 items-center justify-center text-sm font-bold text-slate-500">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading preferences
          </div>
        ) : (
          <div className="grid gap-3 xl:grid-cols-2">
            {visibleEvents.map((event) => {
              const preference = eventPreferences[event.eventType];
              if (!preference) return null;
              const eventSaving = savingKey?.startsWith(`${event.eventType}:`) || false;
              return (
                <article key={event.eventType} className="rounded-3xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-base font-black text-slate-950">{event.title}</h3>
                        {event.critical && (
                          <span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-amber-800">
                            Operational
                          </span>
                        )}
                        <span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wide ${
                          preference.inherited
                            ? 'bg-slate-200 text-slate-600'
                            : 'bg-indigo-100 text-indigo-700'
                        }`}>
                          {preference.inherited ? 'Uses global' : 'Custom'}
                        </span>
                      </div>
                      <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{event.description}</p>
                    </div>
                    {eventSaving && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-indigo-600" />}
                  </div>

                  <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
                      <span className="inline-flex items-center gap-2 text-xs font-black text-slate-700">
                        <BellRing className="h-4 w-4 text-indigo-600" /> Push
                      </span>
                      <Toggle
                        checked={preference.pushEnabled}
                        disabled={savingKey !== null}
                        label={`${event.title} push`}
                        onChange={(value) => void updateEvent(event.eventType, 'pushEnabled', value)}
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-3 py-2.5">
                      <span className="inline-flex items-center gap-2 text-xs font-black text-slate-700">
                        <Inbox className="h-4 w-4 text-teal-600" /> In-app
                      </span>
                      <Toggle
                        checked={preference.inAppEnabled}
                        disabled={savingKey !== null}
                        label={`${event.title} in-app`}
                        onChange={(value) => void updateEvent(event.eventType, 'inAppEnabled', value)}
                      />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-900">
        <CheckCircle2 className="h-5 w-5" /> In-app and device preferences are stored independently for your account.
      </div>
    </div>
  );
}
