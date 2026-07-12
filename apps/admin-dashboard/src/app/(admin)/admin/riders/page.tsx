'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import DashboardLayout from '@/components/DashboardLayout';
import { apiClient } from '@aagam/utils';
import { createRealtimeSocket } from '@/lib/realtimeSocket';
import {
  Bike,
  Plus,
  Search,
  Trash2,
  Eye,
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
} from 'lucide-react';

const LiveTrackingMap = dynamic(() => import('@/components/LiveTrackingMap'), {
  ssr: false,
  loading: () => (
    <div className="h-full w-full bg-gray-50 flex items-center justify-center rounded-2xl border-2 border-dashed border-gray-200">
      <div className="text-center">
        <Loader2 className="h-10 w-10 animate-spin text-emerald-500 mx-auto mb-4" />
        <p className="text-gray-500 font-bold">Initializing live map...</p>
      </div>
    </div>
  ),
});

interface Rider {
  id: string;
  status: 'ONLINE' | 'OFFLINE' | 'BUSY';
  latitude: number | null;
  longitude: number | null;
  bearing?: number;
  updatedAt: string;
  user?: { name: string | null; email: string | null; phone: string | null };
  orders?: Array<{ id: string }>;
}

const statusOptions = ['All', 'Online', 'Offline', 'Busy'];

export default function AdminRidersPage() {
  const [riders, setRiders] = useState<Rider[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [showModal, setShowModal] = useState(false);
  const [showMapModal, setShowMapModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '', phone: '' });
  const [error, setError] = useState('');
  const [selectedRider, setSelectedRider] = useState<Rider | null>(null);

  const fetchRiders = async () => {
    try {
      const response = await apiClient.get('/riders');
      setRiders(response.data);
    } catch (err) {
      console.error('Failed to fetch riders', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRiders();

    const newSocket = createRealtimeSocket();

    newSocket.on('connect', () => {
      console.log('✅ Admin dashboard connected to tracking socket');
      newSocket.emit('joinAdminMonitor');
    });

    newSocket.on('connect_error', (socketError) => {
      console.error('Admin tracking socket connection failed', socketError.message);
    });

    newSocket.on('adminRiderUpdate', (data: any) => {
      setRiders((prevRiders) =>
        prevRiders.map((rider) =>
          rider.id === data.riderId
            ? { ...rider, latitude: data.latitude, longitude: data.longitude, bearing: data.bearing, status: data.status as any, updatedAt: data.timestamp }
            : rider,
        ),
      );
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  const filteredRiders = riders.filter((rider) => {
    const name = rider.user?.name?.toLowerCase() || '';
    const email = rider.user?.email?.toLowerCase() || '';
    const matchesSearch = name.includes(searchTerm.toLowerCase()) || email.includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'All' ||
      (statusFilter === 'Online' && rider.status === 'ONLINE') ||
      (statusFilter === 'Offline' && rider.status === 'OFFLINE') ||
      (statusFilter === 'Busy' && rider.status === 'BUSY');
    return matchesSearch && matchesStatus;
  });

  const onlineRiders = riders.filter((r) => r.status === 'ONLINE').length;
  const busyRiders = riders.filter((r) => r.status === 'BUSY').length;
  const totalDeliveries = riders.reduce((acc, r) => acc + (r.orders?.length || 0), 0);

  const stats = [
    { label: 'Total Riders', value: riders.length, icon: Bike, color: 'bg-blue-500' },
    { label: 'Online', value: onlineRiders, icon: CheckCircle, color: 'bg-emerald-500' },
    { label: 'Busy', value: busyRiders, icon: Clock, color: 'bg-amber-500' },
    { label: 'Total Deliveries', value: totalDeliveries, icon: Package, color: 'bg-purple-500' },
  ];

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'ONLINE': return { label: 'Online', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: CheckCircle };
      case 'BUSY': return { label: 'Busy', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: Clock };
      case 'OFFLINE': return { label: 'Offline', bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200', icon: XCircle };
      default: return { label: 'Unknown', bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200', icon: XCircle };
    }
  };

  const handleTrackLive = (rider: Rider) => {
    setSelectedRider(rider);
    setShowMapModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      await apiClient.post('/riders', {
        name: formData.name,
        email: formData.email,
        phone: formData.phone,
      });
      setShowModal(false);
      setFormData({ name: '', email: '', phone: '' });
      fetchRiders();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to create rider');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (rider: Rider) => {
    if (!confirm(`Are you sure you want to remove rider "${rider.user?.name}"?`)) return;
    setDeleting(true);
    try {
      await apiClient.delete(`/riders/${rider.id}`);
      fetchRiders();
    } catch (err) {
      console.error('Failed to delete rider', err);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <DashboardLayout allowedRole="ADMIN">
      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Rider Management</h1>
            <p className="text-gray-500 font-medium">Track and manage your delivery riders in real-time.</p>
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => { setSelectedRider(null); setShowMapModal(true); }}
              className="flex items-center justify-center px-4 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all shadow-lg shadow-blue-900/10"
            >
              <MapPin className="h-5 w-5 mr-2" />
              Live Global Map
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center justify-center px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-900/10"
            >
              <Plus className="h-5 w-5 mr-2" />
              Add Rider
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {stats.map((stat, idx) => (
            <div key={idx} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 font-bold">{stat.label}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
                </div>
                <div className={`p-3 rounded-xl ${stat.color}`}>
                  <stat.icon className="h-6 w-6 text-white" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="p-4 border-b border-gray-50 bg-gray-50/50">
          <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
            <div className="relative flex-1 max-w-md w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search riders..."
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex gap-2 w-full lg:w-auto overflow-x-auto pb-1">
              {statusOptions.map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex-shrink-0 ${
                    statusFilter === status ? 'bg-emerald-600 text-white shadow-md' : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {status}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-50/50 border-b border-gray-100">
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Rider</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Contact</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Deliveries</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider">Last Active</th>
                <th className="px-6 py-4 text-xs font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading ? (
                [1, 2, 3].map((i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-4"><div className="h-12 bg-gray-100 rounded w-48"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-gray-100 rounded w-40"></div></td>
                    <td className="px-6 py-4"><div className="h-6 bg-gray-100 rounded w-20"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-gray-100 rounded w-12"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-gray-100 rounded w-24"></div></td>
                    <td className="px-6 py-4"><div className="h-4 bg-gray-100 rounded w-8 ml-auto"></div></td>
                  </tr>
                ))
              ) : filteredRiders.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-16 text-center">
                    <Bike className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-gray-500 font-bold">No riders found</p>
                  </td>
                </tr>
              ) : (
                filteredRiders.map((rider) => {
                  const statusConfig = getStatusConfig(rider.status);
                  return (
                    <tr key={rider.id} className="hover:bg-gray-50 transition-colors group">
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <div className="h-12 w-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-200 mr-4">
                            <User className="h-6 w-6" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-gray-900">{rider.user?.name || 'Unknown'}</p>
                            <p className="text-xs text-gray-500">ID: {rider.id.substring(0, 8)}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-600 space-y-1 font-bold">
                          <div className="flex items-center"><Mail className="h-4 w-4 mr-2 text-gray-400" />{rider.user?.email || 'No email'}</div>
                          <div className="flex items-center"><Phone className="h-4 w-4 mr-2 text-gray-400" />{rider.user?.phone || 'No phone'}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold ${statusConfig.bg} ${statusConfig.text} border ${statusConfig.border}`}>
                          <statusConfig.icon className="h-3 w-3 mr-1.5" />
                          {statusConfig.label}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-bold">
                        <div className="flex items-center text-sm font-bold text-gray-900">
                          <Package className="h-4 w-4 mr-2 text-purple-500" />
                          {rider.orders?.length || 0}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center text-sm text-gray-500 font-bold">
                          <Clock className="h-4 w-4 mr-2 text-gray-400" />
                          {new Date(rider.updatedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end space-x-1.5">
                          <button
                            onClick={() => handleTrackLive(rider)}
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                            title="Track Live"
                          >
                            <MapPin className="h-4 w-4" />
                          </button>
                          <button onClick={() => setSelectedRider(rider)} className="p-2 text-gray-400 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition-all opacity-0 group-hover:opacity-100">
                            <Eye className="h-4 w-4" />
                          </button>
                          <button onClick={() => handleDelete(rider)} disabled={deleting} className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100">
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {showMapModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-0 md:p-8">
          <div className="bg-white rounded-none md:rounded-3xl w-full h-full max-w-6xl shadow-2xl flex flex-col overflow-hidden">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between bg-white">
              <div>
                <h2 className="text-xl font-bold text-gray-900 flex items-center">
                  <MapPin className="h-5 w-5 mr-2 text-blue-600" />
                  {selectedRider ? `Tracking: ${selectedRider.user?.name}` : 'Global Rider Monitor'}
                </h2>
                <p className="text-sm text-gray-500 font-bold">Real-time GPS updates from active riders</p>
              </div>
              <button
                onClick={() => { setShowMapModal(false); setSelectedRider(null); }}
                className="p-2.5 hover:bg-gray-100 rounded-xl transition-all"
              >
                <X className="h-6 w-6 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 relative bg-gray-100">
              <LiveTrackingMap riders={riders} selectedRiderId={selectedRider?.id} />

              {selectedRider && (
                <div className="absolute top-4 left-4 z-[1000] bg-white/90 backdrop-blur shadow-xl rounded-2xl p-4 border border-white max-w-xs">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="h-10 w-10 rounded-full bg-blue-600 flex items-center justify-center text-white">
                      <User className="h-5 w-5" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-gray-900">{selectedRider.user?.name}</p>
                      <p className="text-xs text-gray-500 font-bold">Last update: Just now</p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500 font-bold">Status</span>
                      <span className="font-bold text-emerald-600">{selectedRider.status}</span>
                    </div>
                    <div className="flex justify-between text-xs">
                      <span className="text-gray-500 font-bold">Coordinates</span>
                      <span className="font-bold text-gray-700">{selectedRider.latitude?.toFixed(4)}, {selectedRider.longitude?.toFixed(4)}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Add New Rider</h2>
              <button onClick={() => setShowModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="p-6">
              {error && <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="Enter full name"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                  <input
                    type="email"
                    required
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="rider@email.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Phone Number</label>
                  <input
                    type="tel"
                    required
                    className="w-full px-4 py-2.5 border border-gray-200 rounded-xl text-gray-900 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="+1234567890"
                  />
                </div>
              </div>
              <div className="mt-6 flex gap-3">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-all">
                  Cancel
                </button>
                <button type="submit" disabled={submitting} className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all disabled:opacity-50 flex items-center justify-center">
                  {submitting ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Add Rider'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedRider && !showMapModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[100] p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl animate-in zoom-in duration-200">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Rider Details</h2>
              <button onClick={() => setSelectedRider(null)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6">
              <div className="flex items-center mb-6">
                <div className="h-20 w-20 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-200 mr-5">
                  <User className="h-10 w-10" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{selectedRider.user?.name || 'Unknown'}</h3>
                  <p className="text-sm text-gray-500 font-bold">{selectedRider.user?.email}</p>
                  {(() => {
                    const sc = getStatusConfig(selectedRider.status);
                    return (
                      <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold mt-2 ${sc.bg} ${sc.text} border ${sc.border}`}>
                        <sc.icon className="h-3 w-3 mr-1" />
                        {sc.label}
                      </span>
                    );
                  })()}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs text-gray-500 font-bold">Total Deliveries</p>
                  <p className="text-xl font-bold text-gray-900">{selectedRider.orders?.length || 0}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <p className="text-xs text-gray-500 font-bold">Last Active</p>
                  <p className="text-sm font-bold text-gray-900">{new Date(selectedRider.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex gap-3">
              <button onClick={() => setSelectedRider(null)} className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-all">Close</button>
              <button
                onClick={() => setShowMapModal(true)}
                className="flex-1 px-4 py-2.5 bg-blue-600 text-white rounded-xl font-bold hover:bg-blue-700 transition-all flex items-center justify-center"
              >
                <MapPin className="h-4 w-4 mr-2" />
                Track Live
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}
