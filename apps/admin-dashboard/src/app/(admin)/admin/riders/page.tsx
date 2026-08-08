'use client';

import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import DashboardLayout from '@/components/DashboardLayout';
import { InternalPartnerCreateButton } from '@/components/InternalPartnerOnboarding';
import { apiClient } from '@aagam/utils';
import { createRealtimeSocket } from '@/lib/realtimeSocket';
import {
  Bike,
  Search,
  Trash2,
  Clock,
  CheckCircle,
  XCircle,
  Package,
  User,
  Mail,
  Phone,
  X,
  Loader2,
  MapPin,
  ShieldCheck,
} from 'lucide-react';

interface Rider {
  id: string;
  status: 'ONLINE' | 'OFFLINE' | 'BUSY';
  latitude: number | null;
  longitude: number | null;
  bearing?: number;
  updatedAt: string;
  user?: { name: string | null; email: string | null; phone: string | null };
  vehicleType?: string | null;
  vehicleNumber?: string | null;
  orders?: Array<{ id: string }>;
}

const LiveTrackingMap = dynamic(() => import('@/components/LiveTrackingMap'), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-gray-50">
      <div className="text-center">
        <Loader2 className="mx-auto mb-4 h-10 w-10 animate-spin text-emerald-500" />
        <p className="font-bold text-gray-500">Initializing live map...</p>
      </div>
    </div>
  ),
});

const statusOptions = ['All', 'Online', 'Offline', 'Busy'];

export default function AdminRidersPage() {
  const [riders, setRiders] = useState<Rider[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [showMapModal, setShowMapModal] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [selectedRider, setSelectedRider] = useState<Rider | null>(null);

  const fetchRiders = async () => {
    try {
      const response = await apiClient.get('/riders');
      setRiders(Array.isArray(response.data) ? response.data : []);
    } catch (error) {
      console.error('Failed to fetch riders', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchRiders();
    const socket = createRealtimeSocket();
    socket.on('connect', () => socket.emit('joinAdminMonitor'));
    socket.on('connect_error', (error) => console.error('Admin tracking socket connection failed', error.message));
    socket.on('adminRiderUpdate', (data: any) => {
      setRiders((current) => current.map((rider) => rider.id === data.riderId
        ? { ...rider, latitude: data.latitude, longitude: data.longitude, bearing: data.bearing, status: data.status as Rider['status'], updatedAt: data.timestamp }
        : rider));
    });
    return () => socket.disconnect();
  }, []);

  const filteredRiders = riders.filter((rider) => {
    const query = searchTerm.toLowerCase();
    const matchesSearch = (rider.user?.name || '').toLowerCase().includes(query)
      || (rider.user?.email || '').toLowerCase().includes(query)
      || (rider.user?.phone || '').toLowerCase().includes(query);
    const matchesStatus = statusFilter === 'All' || rider.status === statusFilter.toUpperCase();
    return matchesSearch && matchesStatus;
  });

  const stats = [
    { label: 'Total Riders', value: riders.length, icon: Bike, color: 'bg-blue-500' },
    { label: 'Online', value: riders.filter((rider) => rider.status === 'ONLINE').length, icon: CheckCircle, color: 'bg-emerald-500' },
    { label: 'Busy', value: riders.filter((rider) => rider.status === 'BUSY').length, icon: Clock, color: 'bg-amber-500' },
    { label: 'Total Deliveries', value: riders.reduce((count, rider) => count + (rider.orders?.length || 0), 0), icon: Package, color: 'bg-purple-500' },
  ];

  const statusConfig = (status: Rider['status']) => {
    if (status === 'ONLINE') return { label: 'Online', classes: 'border-emerald-200 bg-emerald-50 text-emerald-700', Icon: CheckCircle };
    if (status === 'BUSY') return { label: 'Busy', classes: 'border-amber-200 bg-amber-50 text-amber-700', Icon: Clock };
    return { label: 'Offline', classes: 'border-gray-200 bg-gray-50 text-gray-700', Icon: XCircle };
  };

  const handleDelete = async (rider: Rider) => {
    if (!window.confirm(`Remove Rider access for "${rider.user?.name || 'this Rider'}"?`)) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/riders/${rider.id}`);
      await fetchRiders();
    } catch (error) {
      console.error('Failed to delete rider', error);
    } finally {
      setDeleting(false);
    }
  };

  const continueInternalOnboarding = (detail: any) => {
    const id = detail?.application?.id;
    window.location.assign(`/admin/partner-applications${id ? `?application=${encodeURIComponent(id)}` : ''}`);
  };

  return (
    <DashboardLayout allowedRole="ADMIN">
      <div className="mb-8">
        <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Rider Management</h1>
            <p className="font-medium text-gray-500">Track active Riders and create new Rider access through the verified Admin onboarding workflow.</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button onClick={() => { setSelectedRider(null); setShowMapModal(true); }} className="flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2.5 font-bold text-white shadow-lg shadow-blue-900/10 transition-all hover:bg-blue-700">
              <MapPin className="mr-2 h-5 w-5" /> Live Global Map
            </button>
            <InternalPartnerCreateButton fixedType="RIDER" buttonLabel="Add Rider" onCreated={continueInternalOnboarding} />
          </div>
        </div>

        <div className="mb-5 flex items-start gap-3 rounded-2xl border border-teal-200 bg-teal-50 p-4 text-sm font-semibold text-teal-900">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
          <div><p className="font-black">One Rider creation path</p><p className="mt-1 text-xs leading-5 text-teal-800">Add Rider now uses the same Admin-controlled profile, zone, document and approval flow as Partner Applications. OTP is not required for Admin-created accounts.</p></div>
        </div>

        <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div><p className="text-sm font-bold text-gray-500">{stat.label}</p><p className="mt-1 text-2xl font-bold text-gray-900">{stat.value}</p></div>
                <div className={`rounded-xl p-3 ${stat.color}`}><stat.icon className="h-6 w-6 text-white" /></div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-sm">
        <div className="border-b border-gray-50 bg-gray-50/50 p-4">
          <div className="flex flex-col items-center justify-between gap-4 lg:flex-row">
            <div className="relative w-full max-w-md flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <input type="text" placeholder="Search riders..." className="w-full rounded-xl border border-gray-200 bg-white py-2.5 pl-10 pr-4 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} />
            </div>
            <div className="flex w-full gap-2 overflow-x-auto pb-1 lg:w-auto">
              {statusOptions.map((status) => <button key={status} onClick={() => setStatusFilter(status)} className={`flex-shrink-0 rounded-lg px-4 py-2 text-sm font-bold transition-all ${statusFilter === status ? 'bg-emerald-600 text-white shadow-md' : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}>{status}</button>)}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead><tr className="border-b border-gray-100 bg-gray-50/50"><th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Rider</th><th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Contact</th><th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Status</th><th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Vehicle</th><th className="px-6 py-4 text-xs font-bold uppercase tracking-wider text-gray-500">Deliveries</th><th className="px-6 py-4 text-right text-xs font-bold uppercase tracking-wider text-gray-500">Actions</th></tr></thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? [1, 2, 3].map((index) => <tr key={index} className="animate-pulse"><td className="px-6 py-5" colSpan={6}><div className="h-10 rounded bg-gray-100" /></td></tr>) : filteredRiders.length === 0 ? (
                <tr><td colSpan={6} className="px-6 py-16 text-center"><Bike className="mx-auto mb-3 h-12 w-12 text-gray-300" /><p className="font-bold text-gray-500">No riders found</p></td></tr>
              ) : filteredRiders.map((rider) => {
                const status = statusConfig(rider.status);
                return <tr key={rider.id} className="group transition-colors hover:bg-gray-50">
                  <td className="px-6 py-4"><div className="flex items-center"><div className="mr-4 flex h-11 w-11 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-blue-600 text-white"><User className="h-5 w-5" /></div><div><p className="text-sm font-bold text-gray-900">{rider.user?.name || 'Unknown'}</p><p className="text-xs text-gray-500">ID: {rider.id.substring(0, 8)}</p></div></div></td>
                  <td className="px-6 py-4"><div className="space-y-1 text-sm font-bold text-gray-600"><div className="flex items-center"><Mail className="mr-2 h-4 w-4 text-gray-400" />{rider.user?.email || 'No email'}</div><div className="flex items-center"><Phone className="mr-2 h-4 w-4 text-gray-400" />{rider.user?.phone || 'No phone'}</div></div></td>
                  <td className="px-6 py-4"><span className={`inline-flex items-center rounded-full border px-3 py-1.5 text-xs font-bold ${status.classes}`}><status.Icon className="mr-1.5 h-3 w-3" />{status.label}</span></td>
                  <td className="px-6 py-4 text-sm font-bold text-gray-700">{rider.vehicleType || '—'}{rider.vehicleNumber ? ` · ${rider.vehicleNumber}` : ''}</td>
                  <td className="px-6 py-4"><div className="flex items-center text-sm font-bold text-gray-900"><Package className="mr-2 h-4 w-4 text-purple-500" />{rider.orders?.length || 0}</div></td>
                  <td className="px-6 py-4 text-right"><div className="flex justify-end gap-1.5"><button onClick={() => { setSelectedRider(rider); setShowMapModal(true); }} className="rounded-lg p-2 text-gray-400 transition hover:bg-blue-50 hover:text-blue-600" title="Track Live"><MapPin className="h-4 w-4" /></button><button onClick={() => void handleDelete(rider)} disabled={deleting} className="rounded-lg p-2 text-gray-400 transition hover:bg-red-50 hover:text-red-600"><Trash2 className="h-4 w-4" /></button></div></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      </div>

      {showMapModal ? (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-0 backdrop-blur-sm md:p-8">
          <div className="flex h-full w-full max-w-6xl flex-col overflow-hidden bg-white shadow-2xl md:rounded-3xl">
            <div className="flex items-center justify-between border-b border-gray-100 bg-white p-6">
              <div><h2 className="flex items-center text-xl font-bold text-gray-900"><MapPin className="mr-2 h-5 w-5 text-blue-600" />{selectedRider ? `Tracking: ${selectedRider.user?.name}` : 'Global Rider Monitor'}</h2><p className="text-sm font-bold text-gray-500">Real-time GPS updates from active riders</p></div>
              <button onClick={() => { setShowMapModal(false); setSelectedRider(null); }} className="rounded-xl p-2.5 transition hover:bg-gray-100"><X className="h-6 w-6 text-gray-500" /></button>
            </div>
            <div className="relative flex-1 bg-gray-100"><LiveTrackingMap riders={riders} selectedRiderId={selectedRider?.id} /></div>
          </div>
        </div>
      ) : null}
    </DashboardLayout>
  );
}
