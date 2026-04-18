'use client';

import React, { useState, useEffect } from 'react';
import DashboardLayout from '@/components/DashboardLayout';
import { apiClient } from '@aagam/utils';
import { 
  Bike, 
  Phone, 
  MapPin, 
  Plus, 
  Search, 
  Edit,
  Trash2,
  Eye,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  MoreVertical,
  Package,
  Calendar,
  TrendingUp,
  User,
  Mail
} from 'lucide-react';

interface Rider {
  id: string;
  userId: string;
  status: 'ONLINE' | 'OFFLINE' | 'BUSY';
  latitude: number | null;
  longitude: number | null;
  updatedAt: string;
  user?: {
    name: string | null;
    email: string | null;
  };
  orders?: Array<{
    id: string;
  }>;
}

const statusOptions = ['All', 'Online', 'Offline', 'Busy'];

export default function AdminRidersPage() {
  const [riders, setRiders] = useState<Rider[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [selectedRider, setSelectedRider] = useState<Rider | null>(null);

  useEffect(() => {
    const fetchRiders = async () => {
      try {
        const response = await apiClient.get('/riders');
        setRiders(response.data);
      } catch (error) {
        console.error('Failed to fetch riders', error);
      } finally {
        setLoading(false);
      }
    };
    fetchRiders();
  }, []);

  const filteredRiders = riders.filter(rider => {
    const name = rider.user?.name?.toLowerCase() || '';
    const email = rider.user?.email?.toLowerCase() || '';
    const matchesSearch = name.includes(searchTerm.toLowerCase()) || email.includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'All' || 
      (statusFilter === 'Online' && rider.status === 'ONLINE') ||
      (statusFilter === 'Offline' && rider.status === 'OFFLINE') ||
      (statusFilter === 'Busy' && rider.status === 'BUSY');
    return matchesSearch && matchesStatus;
  });

  const onlineRiders = riders.filter(r => r.status === 'ONLINE').length;
  const busyRiders = riders.filter(r => r.status === 'BUSY').length;
  const totalOrders = riders.reduce((acc, r) => acc + (r.orders?.length || 0), 0);

  const stats = [
    { label: 'Total Riders', value: riders.length, icon: Bike, color: 'bg-blue-500' },
    { label: 'Online', value: onlineRiders, icon: CheckCircle, color: 'bg-emerald-500' },
    { label: 'Busy', value: busyRiders, icon: Clock, color: 'bg-amber-500' },
    { label: 'Total Deliveries', value: totalOrders, icon: Package, color: 'bg-purple-500' },
  ];

  const getStatusConfig = (status: string) => {
    switch (status) {
      case 'ONLINE':
        return { label: 'Online', bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200', icon: CheckCircle };
      case 'BUSY':
        return { label: 'Busy', bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200', icon: Clock };
      case 'OFFLINE':
        return { label: 'Offline', bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200', icon: XCircle };
      default:
        return { label: 'Unknown', bg: 'bg-gray-50', text: 'text-gray-700', border: 'border-gray-200', icon: AlertCircle };
    }
  };

  return (
    <DashboardLayout allowedRole="ADMIN">
      <div className="mb-8">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Rider Management</h1>
            <p className="text-gray-500">Track and manage your delivery riders.</p>
          </div>
          <button className="flex items-center justify-center px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-900/10">
            <Plus className="h-5 w-5 mr-2" />
            Add Rider
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {stats.map((stat, idx) => (
            <div key={idx} className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500 font-medium">{stat.label}</p>
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
          <div className="flex flex-col sm:flex-row gap-4 items-center justify-between">
            <div className="relative flex-1 max-w-md w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input 
                type="text" 
                placeholder="Search riders by name or email..." 
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-all"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex gap-2">
              {statusOptions.map(status => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    statusFilter === status 
                      ? 'bg-emerald-600 text-white' 
                      : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
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
                [1, 2, 3, 4, 5].map(i => (
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
                    <div className="flex flex-col items-center">
                      <Bike className="h-12 w-12 text-gray-300 mb-3" />
                      <p className="text-gray-500 font-medium">No riders found</p>
                      <p className="text-gray-400 text-sm">Try adjusting your search criteria</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredRiders.map((rider) => {
                  const statusConfig = getStatusConfig(rider.status);
                  const deliveries = rider.orders?.length || 0;
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
                        <div className="space-y-1">
                          <div className="flex items-center text-sm text-gray-600">
                            <Mail className="h-4 w-4 mr-2 text-gray-400" />
                            {rider.user?.email || 'No email'}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold ${statusConfig.bg} ${statusConfig.text} border ${statusConfig.border}`}>
                          <statusConfig.icon className="h-3 w-3 mr-1.5" />
                          {statusConfig.label}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center text-sm font-bold text-gray-900">
                          <Package className="h-4 w-4 mr-2 text-purple-500" />
                          {deliveries}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center text-sm text-gray-500">
                          <Clock className="h-4 w-4 mr-2 text-gray-400" />
                          {new Date(rider.updatedAt).toLocaleDateString('en-US', { 
                            year: 'numeric', 
                            month: 'short', 
                            day: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          })}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end space-x-1.5">
                          <button 
                            onClick={() => setSelectedRider(rider)}
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button className="p-2 text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all opacity-0 group-hover:opacity-100">
                            <Edit className="h-4 w-4" />
                          </button>
                          <button className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100">
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

        <div className="px-6 py-4 border-t border-gray-100 bg-gray-50/30">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">
              Showing <span className="font-bold text-gray-900">{filteredRiders.length}</span> of <span className="font-bold text-gray-900">{riders.length}</span> riders
            </p>
            <div className="flex gap-2">
              <button className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-all disabled:opacity-50" disabled>
                Previous
              </button>
              <button className="px-4 py-2 bg-white border border-gray-200 rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50 transition-all disabled:opacity-50" disabled>
                Next
              </button>
            </div>
          </div>
        </div>
      </div>

      {selectedRider && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl">
            <div className="p-6 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Rider Details</h2>
              <button 
                onClick={() => setSelectedRider(null)}
                className="p-2 hover:bg-gray-100 rounded-lg transition-all"
              >
                <XCircle className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6">
              <div className="flex items-center mb-6">
                <div className="h-20 w-20 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-blue-200 mr-5">
                  <User className="h-10 w-10" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-gray-900">{selectedRider.user?.name || 'Unknown'}</h3>
                  <p className="text-sm text-gray-500">{selectedRider.user?.email}</p>
                  {(() => {
                    const statusConfig = getStatusConfig(selectedRider.status);
                    return (
                      <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-xs font-bold mt-2 ${statusConfig.bg} ${statusConfig.text} border ${statusConfig.border}`}>
                        <statusConfig.icon className="h-3 w-3 mr-1" />
                        {statusConfig.label}
                      </span>
                    );
                  })()}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 rounded-xl p-4">
                  <div className="flex items-center text-gray-500 mb-1">
                    <Package className="h-4 w-4 mr-2" />
                    <p className="text-xs font-medium">Total Deliveries</p>
                  </div>
                  <p className="text-xl font-bold text-gray-900">{selectedRider.orders?.length || 0}</p>
                </div>
                <div className="bg-gray-50 rounded-xl p-4">
                  <div className="flex items-center text-gray-500 mb-1">
                    <Clock className="h-4 w-4 mr-2" />
                    <p className="text-xs font-medium">Last Active</p>
                  </div>
                  <p className="text-sm font-bold text-gray-900">
                    {new Date(selectedRider.updatedAt).toLocaleDateString('en-US', { 
                      month: 'short', 
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </p>
                </div>
              </div>
              {selectedRider.latitude && selectedRider.longitude && (
                <div className="mt-4 bg-gray-50 rounded-xl p-4">
                  <div className="flex items-center text-gray-500 mb-1">
                    <MapPin className="h-4 w-4 mr-2" />
                    <p className="text-xs font-medium">Current Location</p>
                  </div>
                  <p className="text-sm font-bold text-gray-900">
                    {selectedRider.latitude.toFixed(4)}, {selectedRider.longitude.toFixed(4)}
                  </p>
                </div>
              )}
            </div>
            <div className="p-6 border-t border-gray-100 flex gap-3">
              <button 
                onClick={() => setSelectedRider(null)}
                className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-all"
              >
                Close
              </button>
              <button className="flex-1 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-bold hover:bg-emerald-700 transition-all">
                Edit Rider
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  );
}