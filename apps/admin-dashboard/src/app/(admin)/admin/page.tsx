'use client';

import DashboardLayout from '@/components/DashboardLayout';
import { Store, Users, Package, TrendingUp } from 'lucide-react';

export default function AdminDashboard() {
  const stats = [
    { name: 'Active Stores', value: '12', icon: Store, color: 'text-blue-600', bg: 'bg-blue-100' },
    { name: 'Online Riders', value: '45', icon: Truck, iconColor: 'text-emerald-600', bgColor: 'bg-emerald-100' },
    { name: 'Pending Orders', value: '128', icon: Package, color: 'text-orange-600', bg: 'bg-orange-100' },
    { name: 'Daily Revenue', value: '$12,450', icon: TrendingUp, color: 'text-purple-600', bg: 'bg-purple-100' },
  ];

  return (
    <DashboardLayout allowedRole="ADMIN">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Admin Overview</h1>
        <p className="text-gray-500">Welcome back, here's what's happening today.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        {stats.map((stat) => (
          <div key={stat.name} className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
            <div className="flex items-center justify-between mb-4">
              <div className={`p-3 rounded-lg ${stat.bg || 'bg-gray-100'}`}>
                <stat.icon className={`h-6 w-6 ${stat.color || 'text-gray-600'}`} />
              </div>
              <span className="text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">+12%</span>
            </div>
            <h3 className="text-gray-500 text-sm font-medium">{stat.name}</h3>
            <p className="text-2xl font-bold text-gray-900 mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
        <h2 className="text-lg font-bold text-gray-900 mb-4">Recent Activity</h2>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center p-4 hover:bg-gray-50 rounded-lg transition-colors border border-transparent hover:border-gray-200">
              <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center mr-4">
                <Users className="h-5 w-5 text-gray-500" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-gray-900">New Rider Application</p>
                <p className="text-xs text-gray-500">John Doe submitted an application for the Central Zone</p>
              </div>
              <span className="text-xs text-gray-400">2 mins ago</span>
            </div>
          ))}
        </div>
      </div>
    </DashboardLayout>
  );
}

// Fixed missing icon import for Truck
import { Truck } from 'lucide-react';
