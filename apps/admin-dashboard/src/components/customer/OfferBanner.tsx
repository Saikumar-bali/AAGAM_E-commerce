'use client';

import React from 'react';
import { Sparkles, ArrowRight } from 'lucide-react';

const OFFERS = [
  {
    title: 'Fresh Fruits Festival',
    subtitle: 'Up to 30% off on seasonal fruits',
    gradient: 'from-emerald-600 to-teal-700',
    icon: '🍎',
    tag: 'Limited Time',
  },
  {
    title: 'Dairy Delights',
    subtitle: 'Flat ₹50 off on orders above ₹299',
    gradient: 'from-amber-500 to-orange-600',
    icon: '🧀',
    tag: 'New',
  },
  {
    title: 'Household Essentials',
    subtitle: 'Free delivery on cleaning supplies',
    gradient: 'from-blue-600 to-indigo-700',
    icon: '🧹',
    tag: 'Popular',
  },
];

export default function OfferBanner() {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-none">
      {OFFERS.map((offer, i) => (
        <div
          key={i}
          className={`shrink-0 relative w-[280px] sm:w-[320px] rounded-2xl bg-gradient-to-br ${offer.gradient} p-5 text-white overflow-hidden cursor-pointer group`}
        >
          <div className="absolute top-3 right-3">
            <span className="inline-flex items-center gap-1 rounded-full bg-white/20 backdrop-blur-sm px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider">
              <Sparkles className="h-2.5 w-2.5" />
              {offer.tag}
            </span>
          </div>
          <div className="text-4xl mb-3">{offer.icon}</div>
          <h3 className="text-lg font-black leading-tight">{offer.title}</h3>
          <p className="mt-1 text-sm font-semibold text-white/80">{offer.subtitle}</p>
          <div className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/20 backdrop-blur-sm px-3 py-1.5 text-xs font-black text-white group-hover:bg-white/30 transition-colors">
            Shop now
            <ArrowRight className="h-3 w-3" />
          </div>
        </div>
      ))}
    </div>
  );
}
