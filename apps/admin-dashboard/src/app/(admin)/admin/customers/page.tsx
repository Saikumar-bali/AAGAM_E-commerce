'use client';

import React, { useEffect, useMemo, useState } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { apiClient } from '@aagam/utils';
import {
  CalendarDays,
  CheckCircle2,
  Mail,
  MapPin,
  Package,
  Phone,
  Search,
  ShieldCheck,
  UserRound,
  Users,
  XCircle,
} from 'lucide-react';

type CustomerAddress = {
  id: string;
  label: string | null;
  recipientName: string;
  phoneE164: string;
  alternatePhoneE164: string | null;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
  country: string;
  latitude: number;
  longitude: number;
  instructions: string | null;
  isDefault: boolean;
  deliveryZoneId: string | null;
  zoneResolvedAt: string | null;
  zoneResolutionSource: string | null;
  zoneResolutionConfidence: number | null;
  createdAt: string;
  updatedAt: string;
};

type Customer = {
  id: string;
  email: string;
  phone: string | null;
  name: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
  role: 'CUSTOMER';
  isActive: boolean;
  deactivatedAt: string | null;
  deactivationReason: string | null;
  createdAt: string;
  updatedAt: string;
  addresses: CustomerAddress[];
  _count: {
    orders: number;
    customerSubscriptions: number;
  };
};

const formatDate = (value: string | null) => {
  if (!value) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
};

const addressSearchText = (address: CustomerAddress) =>
  [
    address.label,
    address.recipientName,
    address.phoneE164,
    address.alternatePhoneE164,
    address.line1,
    address.line2,
    address.landmark,
    address.city,
    address.state,
    address.pincode,
    address.country,
    address.instructions,
    address.deliveryZoneId,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

export default function AdminCustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'INACTIVE'>('ALL');

  useEffect(() => {
    let active = true;
    apiClient
      .get('/admin/customers')
      .then((response) => {
        if (!active) return;
        setCustomers(Array.isArray(response.data) ? response.data : []);
        setError('');
      })
      .catch((requestError) => {
        console.error('Failed to fetch customers', requestError);
        if (active) setError('Could not load customers. Please try again.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const filteredCustomers = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return customers.filter((customer) => {
      const matchesStatus =
        statusFilter === 'ALL' ||
        (statusFilter === 'ACTIVE' ? customer.isActive : !customer.isActive);
      if (!matchesStatus) return false;
      if (!query) return true;
      return (
        [customer.name, customer.email, customer.phone, customer.id]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(query)) ||
        customer.addresses.some((address) => addressSearchText(address).includes(query))
      );
    });
  }, [customers, searchTerm, statusFilter]);

  const stats = [
    { label: 'Total Customers', value: customers.length, icon: Users },
    { label: 'Active', value: customers.filter((customer) => customer.isActive).length, icon: CheckCircle2 },
    { label: 'With Address', value: customers.filter((customer) => customer.addresses.length > 0).length, icon: MapPin },
    { label: 'Orders', value: customers.reduce((sum, customer) => sum + customer._count.orders, 0), icon: Package },
  ];

  return (
    <DashboardLayout allowedRole="ADMIN">
      <div className="mb-7">
        <h1 className="text-2xl font-bold text-gray-900">Customers</h1>
        <p className="mt-1 font-medium text-gray-500">
          Customer identity, account status, saved addresses and existing activity from Aagaam records.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((stat) => (
          <div key={stat.label} className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm sm:p-5">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-gray-500">{stat.label}</p>
                <p className="mt-1 text-2xl font-black text-gray-900">{stat.value}</p>
              </div>
              <div className="rounded-xl bg-teal-50 p-2.5 text-teal-700"><stat.icon className="h-5 w-5" /></div>
            </div>
          </div>
        ))}
      </div>

      <div className="mb-5 rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative w-full max-w-xl">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search name, email, phone, ID or address..."
              className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm font-semibold text-gray-800 outline-none transition focus:border-teal-500 focus:ring-2 focus:ring-teal-100"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto">
            {(['ALL', 'ACTIVE', 'INACTIVE'] as const).map((status) => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`shrink-0 rounded-xl px-4 py-2.5 text-xs font-black transition ${
                  statusFilter === status
                    ? 'bg-teal-700 text-white shadow-sm'
                    : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                }`}
              >
                {status === 'ALL' ? 'All' : status === 'ACTIVE' ? 'Active' : 'Inactive'}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error ? (
        <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>
      ) : null}

      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map((item) => <div key={item} className="h-40 animate-pulse rounded-2xl bg-gray-100" />)}
        </div>
      ) : filteredCustomers.length === 0 ? (
        <div className="rounded-2xl border border-gray-100 bg-white px-6 py-16 text-center shadow-sm">
          <Users className="mx-auto mb-3 h-12 w-12 text-gray-300" />
          <p className="font-bold text-gray-600">No customers found</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredCustomers.map((customer) => (
            <article key={customer.id} className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
              <div className="grid gap-5 p-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_auto] xl:items-start">
                <div className="flex min-w-0 items-start gap-3">
                  {customer.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={customer.avatarUrl} alt="" className="h-12 w-12 shrink-0 rounded-full object-cover" />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-teal-50 text-teal-700"><UserRound className="h-6 w-6" /></div>
                  )}
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="truncate text-base font-black text-gray-900">{customer.name || 'Name not added'}</h2>
                      <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-black ${customer.isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-red-200 bg-red-50 text-red-700'}`}>
                        {customer.isActive ? <CheckCircle2 className="mr-1 h-3 w-3" /> : <XCircle className="mr-1 h-3 w-3" />}
                        {customer.isActive ? 'Active' : 'Inactive'}
                      </span>
                      {customer.emailVerified ? <span className="inline-flex items-center rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-black text-blue-700"><ShieldCheck className="mr-1 h-3 w-3" />Email verified</span> : null}
                    </div>
                    <p className="mt-1 break-all text-xs font-semibold text-gray-400">Customer ID: {customer.id}</p>
                    <div className="mt-3 space-y-1.5 text-sm font-semibold text-gray-600">
                      <div className="flex items-center gap-2"><Mail className="h-4 w-4 shrink-0 text-gray-400" /><span className="break-all">{customer.email}</span></div>
                      <div className="flex items-center gap-2"><Phone className="h-4 w-4 shrink-0 text-gray-400" /><span>{customer.phone || 'Phone not added'}</span></div>
                    </div>
                    {!customer.isActive ? (
                      <div className="mt-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                        Deactivated: {formatDate(customer.deactivatedAt)}{customer.deactivationReason ? ` · ${customer.deactivationReason}` : ''}
                      </div>
                    ) : null}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div className="rounded-xl bg-gray-50 p-3"><p className="text-xs font-bold text-gray-400">Orders</p><p className="mt-1 flex items-center gap-2 font-black text-gray-900"><Package className="h-4 w-4 text-purple-500" />{customer._count.orders}</p></div>
                  <div className="rounded-xl bg-gray-50 p-3"><p className="text-xs font-bold text-gray-400">Subscriptions</p><p className="mt-1 flex items-center gap-2 font-black text-gray-900"><CalendarDays className="h-4 w-4 text-amber-500" />{customer._count.customerSubscriptions}</p></div>
                  <div className="col-span-2 rounded-xl bg-gray-50 p-3"><p className="text-xs font-bold text-gray-400">Created</p><p className="mt-1 font-bold text-gray-700">{formatDate(customer.createdAt)}</p><p className="mt-1 text-[11px] font-semibold text-gray-400">Updated {formatDate(customer.updatedAt)}</p></div>
                </div>

                <div className="rounded-xl bg-teal-50 px-3 py-2 text-center text-xs font-black text-teal-800">
                  {customer.addresses.length} saved {customer.addresses.length === 1 ? 'address' : 'addresses'}
                </div>
              </div>

              <div className="border-t border-gray-100 bg-gray-50/60 p-4 sm:p-5">
                <div className="mb-3 flex items-center gap-2"><MapPin className="h-4 w-4 text-teal-700" /><h3 className="text-sm font-black text-gray-800">Saved addresses</h3></div>
                {customer.addresses.length === 0 ? (
                  <p className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-5 text-sm font-semibold text-gray-400">No address added by this customer.</p>
                ) : (
                  <div className="grid gap-3 xl:grid-cols-2">
                    {customer.addresses.map((address) => (
                      <div key={address.id} className="rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">
                        <div className="mb-2 flex flex-wrap items-center gap-2">
                          <span className="font-black text-gray-900">{address.label || 'Address'}</span>
                          {address.isDefault ? <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-black uppercase text-teal-700">Default</span> : null}
                        </div>
                        <p className="font-bold text-gray-900">{address.recipientName}</p>
                        <p className="mt-1 leading-6">
                          {address.line1}{address.line2 ? `, ${address.line2}` : ''}{address.landmark ? `, ${address.landmark}` : ''}, {address.city}, {address.state} - {address.pincode}, {address.country}
                        </p>
                        <div className="mt-2 space-y-1 text-xs font-semibold text-gray-500">
                          <p>Phone: {address.phoneE164}{address.alternatePhoneE164 ? ` · Alternate: ${address.alternatePhoneE164}` : ''}</p>
                          <p>Coordinates: {address.latitude}, {address.longitude}</p>
                          {address.instructions ? <p>Instructions: {address.instructions}</p> : null}
                          <p>Delivery zone: {address.deliveryZoneId || 'Not resolved'}</p>
                          {address.zoneResolvedAt ? <p>Zone resolved: {formatDate(address.zoneResolvedAt)}{address.zoneResolutionSource ? ` · ${address.zoneResolutionSource}` : ''}{address.zoneResolutionConfidence !== null ? ` · Confidence ${address.zoneResolutionConfidence}` : ''}</p> : null}
                          <p>Address created: {formatDate(address.createdAt)} · Updated: {formatDate(address.updatedAt)}</p>
                          <p className="break-all text-gray-400">Address ID: {address.id}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </DashboardLayout>
  );
}
