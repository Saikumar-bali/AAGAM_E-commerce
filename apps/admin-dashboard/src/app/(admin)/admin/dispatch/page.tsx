'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { apiClient } from '@aagam/utils';
import {
  Bike,
  ClipboardList,
  Clock3,
  RefreshCw,
  Store,
  Truck,
  User,
} from 'lucide-react';

type Rider = {
  id: string;
  userId: string;
  status: string;
  available?: boolean;
  activeOrderCount?: number;
  user?: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
  };
};

type DeliveryJobRef = {
  id: string;
};

type Order = {
  id: string;
  status: string;
  grandTotal?: number;
  createdAt: string;
  customer?: { name?: string | null; phone?: string | null };
  store?: { name?: string | null; address?: string | null };
  rider?: { user?: { name?: string | null } };
  items?: Array<{
    id: string;
    quantity: number;
    product?: { name?: string | null };
  }>;
  deliveryJob?: DeliveryJobRef;
};

type OpenOffer = {
  id: string;
  deliveryJobId: string;
  status: string;
  expiresAt?: string | null;
  riderProfile?: {
    id: string;
    userId?: string;
    user?: {
      name?: string | null;
      phone?: string | null;
      email?: string | null;
    };
  };
};

type Board = {
  waitingForRider: Order[];
  activeDeliveries: Order[];
  riders: Rider[];
  openOffers: OpenOffer[];
};

function secondsRemaining(expiresAt?: string | null, now = Date.now()) {
  if (!expiresAt) return null;
  const expiry = new Date(expiresAt).getTime();
  if (!Number.isFinite(expiry)) return 0;
  return Math.max(0, Math.ceil((expiry - now) / 1000));
}

export default function AdminDispatchPage() {
  const [board, setBoard] = useState<Board>({
    waitingForRider: [],
    activeDeliveries: [],
    riders: [],
    openOffers: [],
  });
  const [loading, setLoading] = useState(true);
  const [assigning, setAssigning] = useState<string | null>(null);
  const [selectedRiders, setSelectedRiders] = useState<Record<string, string>>(
    {},
  );
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const fetchBoard = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const res = await apiClient.get('/orders/dispatch/board');
      setBoard({
        waitingForRider: res.data?.waitingForRider || [],
        activeDeliveries: res.data?.activeDeliveries || [],
        riders: res.data?.riders || [],
        openOffers: res.data?.openOffers || [],
      });
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to load dispatch board');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchBoard();
    const refresh = setInterval(() => void fetchBoard(true), 8_000);
    return () => clearInterval(refresh);
  }, [fetchBoard]);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1_000);
    return () => clearInterval(timer);
  }, []);

  const riderIdsWithOpenOffer = useMemo(
    () =>
      new Set(
        board.openOffers
          .map((offer) => offer.riderProfile?.id)
          .filter((id): id is string => Boolean(id)),
      ),
    [board.openOffers],
  );

  const availableRiders = useMemo(
    () =>
      board.riders.filter(
        (rider) => rider.available && !riderIdsWithOpenOffer.has(rider.id),
      ),
    [board.riders, riderIdsWithOpenOffer],
  );

  const openOfferByJob = useMemo(
    () =>
      new Map(
        board.openOffers.map((offer) => [offer.deliveryJobId, offer] as const),
      ),
    [board.openOffers],
  );

  const assignRider = async (order: Order) => {
    const riderUserId = selectedRiders[order.id];
    const deliveryJobId = order.deliveryJob?.id;
    const selectedRiderIsAvailable = availableRiders.some(
      (rider) => rider.userId === riderUserId,
    );
    if (
      !riderUserId ||
      !selectedRiderIsAvailable ||
      !deliveryJobId ||
      openOfferByJob.has(deliveryJobId)
    ) {
      return;
    }

    setAssigning(order.id);
    setError(null);
    try {
      await apiClient.post(`/orders/dispatch/${order.id}/assign`, {
        riderUserId,
      });
      setSelectedRiders((previous) => ({ ...previous, [order.id]: '' }));
      await fetchBoard(true);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Rider assignment failed');
    } finally {
      setAssigning(null);
    }
  };

  return (
    <DashboardLayout allowedRole="ADMIN">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <p className="enterprise-kicker">Delivery operations</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight">
            Rider Dispatch Board
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Nearest-rider offers run automatically. Use manual assignment only
            when a job has no active offer.
          </p>
        </div>
        <button
          onClick={() => void fetchBoard()}
          className="flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-bold text-white"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
          {error}
        </div>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase text-slate-400">
            Waiting for rider
          </p>
          <p className="mt-2 text-3xl font-black">
            {board.waitingForRider.length}
          </p>
        </div>
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase text-slate-400">
            Auto offers open
          </p>
          <p className="mt-2 text-3xl font-black text-amber-700">
            {board.openOffers.length}
          </p>
        </div>
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase text-slate-400">
            Available riders
          </p>
          <p className="mt-2 text-3xl font-black text-emerald-700">
            {availableRiders.length}
          </p>
        </div>
        <div className="rounded-2xl border bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase text-slate-400">
            Active deliveries
          </p>
          <p className="mt-2 text-3xl font-black text-indigo-700">
            {board.activeDeliveries.length}
          </p>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.4fr_1fr]">
        <section className="rounded-[2rem] border bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-slate-500" />
            <h2 className="text-lg font-black">Ready for pickup</h2>
          </div>

          <div className="space-y-3">
            {board.waitingForRider.length === 0 && (
              <p className="rounded-2xl bg-slate-50 p-6 text-center text-sm font-bold text-slate-500">
                No packed orders waiting for rider.
              </p>
            )}

            {board.waitingForRider.map((order) => {
              const jobId = order.deliveryJob?.id;
              const openOffer = jobId
                ? openOfferByJob.get(jobId)
                : undefined;
              const remaining = secondsRemaining(openOffer?.expiresAt, now);
              const offerRider =
                openOffer?.riderProfile?.user?.name ||
                openOffer?.riderProfile?.user?.email ||
                'selected rider';

              return (
                <div
                  key={order.id}
                  className="rounded-2xl border border-slate-100 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-mono text-sm font-black">
                        #{order.id.slice(0, 8).toUpperCase()}
                      </p>
                      <p className="mt-1 text-sm font-bold text-slate-700">
                        <User className="mr-1 inline h-4 w-4" />
                        {order.customer?.name || 'Customer'} ·{' '}
                        {order.customer?.phone || 'No phone'}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        <Store className="mr-1 inline h-3 w-3" />
                        {order.store?.name || 'Store'} ·{' '}
                        {order.store?.address || 'No address'}
                      </p>
                    </div>
                    <p className="text-lg font-black">
                      ₹
                      {Number(order.grandTotal || 0).toLocaleString('en-IN')}
                    </p>
                  </div>

                  <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                    {(order.items || []).map((item) => (
                      <span key={item.id} className="mr-3 font-bold">
                        {item.product?.name || 'Item'} x{item.quantity}
                      </span>
                    ))}
                  </div>

                  {openOffer ? (
                    <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3">
                      <div>
                        <p className="text-xs font-black text-amber-900">
                          Automatic offer sent to {offerRider}
                        </p>
                        <p className="mt-1 text-[11px] font-medium text-amber-700">
                          Manual assignment is locked until this offer is
                          answered or reconciled.
                        </p>
                      </div>
                      <span className="flex shrink-0 items-center gap-1 rounded-full bg-white px-2 py-1 text-xs font-black text-amber-800">
                        <Clock3 className="h-3.5 w-3.5" />
                        {remaining === null
                          ? 'Open'
                          : remaining > 0
                            ? `${remaining}s`
                            : 'Reconciling'}
                      </span>
                    </div>
                  ) : (
                    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                      <select
                        value={selectedRiders[order.id] || ''}
                        onChange={(event) =>
                          setSelectedRiders((previous) => ({
                            ...previous,
                            [order.id]: event.target.value,
                          }))
                        }
                        className="flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm font-bold"
                      >
                        <option value="">Select available rider</option>
                        {availableRiders.map((rider) => (
                          <option key={rider.userId} value={rider.userId}>
                            {rider.user?.name ||
                              rider.user?.email ||
                              rider.userId.slice(0, 8)}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => void assignRider(order)}
                        disabled={
                          !jobId ||
                          !selectedRiders[order.id] ||
                          assigning === order.id
                        }
                        className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-black text-white disabled:opacity-40"
                      >
                        {assigning === order.id
                          ? 'Assigning...'
                          : 'Assign Rider'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-[2rem] border bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <Bike className="h-5 w-5 text-slate-500" />
            <h2 className="text-lg font-black">Riders</h2>
          </div>
          <div className="space-y-2">
            {board.riders.map((rider) => (
              <div
                key={rider.id}
                className="flex items-center justify-between rounded-2xl border border-slate-100 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-black">
                    {rider.user?.name || rider.user?.email || 'Rider'}
                  </p>
                  <p className="text-xs text-slate-500">
                    {rider.user?.phone || 'No phone'} ·{' '}
                    {rider.activeOrderCount || 0} active
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-[10px] font-black ${
                    rider.available
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {rider.status}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-6 rounded-2xl bg-indigo-50 p-4">
            <div className="flex items-center gap-2 text-sm font-black text-indigo-800">
              <Truck className="h-4 w-4" /> Active deliveries
            </div>
            <div className="mt-3 space-y-2">
              {board.activeDeliveries.length === 0 && (
                <p className="text-xs font-bold text-indigo-700">
                  No active deliveries.
                </p>
              )}
              {board.activeDeliveries.map((order) => (
                <p
                  key={order.id}
                  className="text-xs font-bold text-indigo-900"
                >
                  #{order.id.slice(0, 8).toUpperCase()} · {order.status} ·{' '}
                  {order.rider?.user?.name || 'Rider'}
                </p>
              ))}
            </div>
          </div>
        </section>
      </div>
    </DashboardLayout>
  );
}
