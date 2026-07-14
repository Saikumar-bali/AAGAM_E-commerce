'use client';

import React, { useState } from 'react';
import { MapPin, CheckCircle2, XCircle, Clock, Truck, ChevronDown } from 'lucide-react';

type Address = { id: string; label?: string | null; line1: string; city: string; pincode: string; latitude: number; longitude: number; isDefault: boolean };
type Serviceability = { serviceable: boolean; distanceKm: number | null; deliveryFee: number; estimatedMinutes: number | null; store: { id: string; name: string | null } | null };

type Props = {
  address: Address;
  serviceability: Serviceability | null;
  onAddressChange: (addr: Address) => void;
  addresses: Address[];
};

export default function ServiceabilityBanner({ address, serviceability, onAddressChange, addresses }: Props) {
  const [showPicker, setShowPicker] = useState(false);

  return (
    <div className="relative">
      <div className={`rounded-2xl border px-4 py-3 flex items-center gap-3 transition-colors ${
        serviceability === null
          ? 'border-slate-200 bg-slate-50'
          : serviceability.serviceable
            ? 'border-emerald-200 bg-emerald-50'
            : 'border-red-200 bg-red-50'
      }`}>
        <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
          serviceability?.serviceable ? 'bg-emerald-100 text-emerald-700' : serviceability === null ? 'bg-slate-100 text-slate-500' : 'bg-red-100 text-red-700'
        }`}>
          {serviceability === null ? <MapPin className="h-4 w-4" /> : serviceability.serviceable ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-black text-slate-950 truncate">
              {address.label || 'Address'}: {address.line1}, {address.city}
            </span>
          </div>
          {serviceability && (
            <div className="flex items-center gap-3 mt-0.5">
              {serviceability.serviceable ? (
                <>
                  <span className="flex items-center gap-1 text-xs font-bold text-emerald-700">
                    <Truck className="h-3 w-3" />
                    {serviceability.store?.name || 'Store'} ({serviceability.distanceKm?.toFixed(1)} km)
                  </span>
                  <span className="flex items-center gap-1 text-xs font-bold text-emerald-700">
                    <Clock className="h-3 w-3" />
                    ~{serviceability.estimatedMinutes} min
                  </span>
                  <span className="text-xs font-bold text-emerald-700">
                    Delivery {serviceability.deliveryFee === 0 ? 'FREE' : `₹${serviceability.deliveryFee}`}
                  </span>
                </>
              ) : (
                <span className="text-xs font-bold text-red-700">
                  Not serviceable ({serviceability.distanceKm?.toFixed(1)} km from nearest store)
                </span>
              )}
            </div>
          )}
        </div>

        <button
          onClick={() => setShowPicker(!showPicker)}
          className="shrink-0 flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
        >
          Change <ChevronDown className="h-3 w-3" />
        </button>
      </div>

      {showPicker && addresses.length > 1 && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setShowPicker(false)} />
          <div className="absolute left-0 right-0 top-full mt-1 z-40 rounded-2xl border border-slate-100 bg-white p-2 shadow-xl">
            {addresses.map((addr) => (
              <button
                key={addr.id}
                onClick={() => { onAddressChange(addr); setShowPicker(false); }}
                className={`w-full text-left rounded-xl px-3 py-2.5 text-sm transition-colors ${
                  addr.id === address.id ? 'bg-teal-50 text-teal-800 font-black' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="font-bold">{addr.label || 'Address'}</span>
                <span className="ml-2 text-xs text-slate-500">{addr.line1}, {addr.city}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
