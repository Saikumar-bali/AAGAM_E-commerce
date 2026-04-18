'use client';

import DashboardLayout from '@/components/DashboardLayout';
import { Truck, MapPin, Clock, CheckCircle } from 'lucide-react';

export default function RiderDashboard() {
  const activeOrder = {
    id: 'ORD-7721',
    customer: 'Alice Smith',
    address: '123 Tech Lane, Silicon Valley',
    status: 'Picking',
    items: 4,
  };

  return (
    <DashboardLayout allowedRole="RIDER">
      <div className="mb-8 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Delivery Queue</h1>
          <p className="text-gray-500">Ready for your next delivery?</p>
        </div>
        <div className="flex items-center space-x-2 bg-white px-4 py-2 rounded-lg border border-gray-200 shadow-sm">
          <div className="h-3 w-3 rounded-full bg-emerald-500 animate-pulse"></div>
          <span className="text-sm font-medium text-gray-700">Online</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2">
          <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-6 mb-8">
            <div className="flex justify-between items-start mb-6">
              <div>
                <span className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Current Task</span>
                <h2 className="text-xl font-bold text-gray-900 mt-1">{activeOrder.id}</h2>
              </div>
              <span className="px-3 py-1 bg-emerald-200 text-emerald-700 rounded-full text-xs font-bold">
                {activeOrder.status}
              </span>
            </div>

            <div className="space-y-4">
              <div className="flex items-start">
                <MapPin className="h-5 w-5 text-gray-400 mr-3 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-gray-900">{activeOrder.customer}</p>
                  <p className="text-sm text-gray-500">{activeOrder.address}</p>
                </div>
              </div>
              <div className="flex items-center">
                <Clock className="h-5 w-5 text-gray-400 mr-3" />
                <p className="text-sm text-gray-500">Est. delivery: 15 mins</p>
              </div>
            </div>

            <button className="w-full mt-8 bg-gray-900 text-white py-4 rounded-xl font-bold hover:bg-gray-800 transition-colors shadow-lg shadow-gray-200">
              Confirm Pickup
            </button>
          </div>

          <h3 className="text-lg font-bold text-gray-900 mb-4">Completed Today</h3>
          <div className="space-y-4">
            {[1, 2].map((i) => (
              <div key={i} className="bg-white border border-gray-100 rounded-xl p-4 flex items-center justify-between">
                <div className="flex items-center">
                  <div className="h-10 w-10 rounded-full bg-gray-100 flex items-center justify-center mr-4">
                    <CheckCircle className="h-6 w-6 text-emerald-500" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-gray-900">ORD-771{i}</p>
                    <p className="text-xs text-gray-500">Delivered at 10:45 AM</p>
                  </div>
                </div>
                <p className="font-bold text-gray-900">$5.50</p>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <h3 className="text-gray-500 text-sm font-medium mb-1">Today's Earnings</h3>
            <p className="text-3xl font-bold text-gray-900">$42.00</p>
            <div className="mt-4 pt-4 border-t border-gray-50 flex justify-between text-sm">
              <span className="text-gray-500">Deliveries</span>
              <span className="font-bold text-gray-900">8</span>
            </div>
          </div>
          
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm">
            <h3 className="text-gray-900 font-bold mb-4">Performance</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-500">Rating</span>
                  <span className="font-bold">4.9 / 5.0</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-yellow-400 w-[98%]"></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-500">Acceptance Rate</span>
                  <span className="font-bold">95%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 w-[95%]"></div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
