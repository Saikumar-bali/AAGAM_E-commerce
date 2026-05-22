'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BarChart3,
  Bike,
  CheckCircle2,
  Clock3,
  MapPin,
  PackageCheck,
  Search,
  ShieldCheck,
  ShoppingBag,
  Sparkles,
  Star,
  Store,
  Truck,
  Zap,
} from 'lucide-react';
import { apiClient } from '@aagam/utils';
import AagamLogo from '@/components/AagamLogo';
import { formatINR } from '@/lib/currency';

const operatingStats = [
  { label: 'Avg delivery promise', value: '10 min', icon: Clock3 },
  { label: 'Inventory guarded', value: 'Atomic', icon: ShieldCheck },
  { label: 'Live rider telemetry', value: 'Realtime', icon: Bike },
];

const commercePillars = [
  { title: 'Customer storefront', body: 'Search, categories, cart, checkout, payments, order detail, and saved addresses.', icon: ShoppingBag },
  { title: 'Operations cockpit', body: 'Admin inventory, products, stores, riders, orders, and fulfillment signals in one view.', icon: BarChart3 },
  { title: 'Rider command app', body: 'Order queue, acceptance, status progression, and location-aware delivery tracking.', icon: Truck },
];

export default function LandingPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 16);
    window.addEventListener('scroll', handleScroll);
    apiClient.get('/products').then((res) => {
      const items = Array.isArray(res.data) ? res.data : res.data?.items || [];
      setProducts(items.slice(0, 4));
    }).catch(() => {});
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <main className="min-h-screen overflow-hidden text-slate-950">
      <div className="pointer-events-none fixed inset-0 enterprise-subtle-grid opacity-55" />

      <nav className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${isScrolled ? 'py-3' : 'py-5'}`}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="rounded-full border border-white/70 bg-white/80 py-2 pl-2 pr-5 shadow-xl shadow-slate-900/5 backdrop-blur-xl">
            <AagamLogo compact label="Commerce OS" />
          </div>
          <div className="hidden items-center gap-2 rounded-full border border-white/70 bg-white/75 px-4 py-3 text-sm font-extrabold text-slate-600 shadow-xl shadow-slate-900/5 backdrop-blur-xl md:flex">
            <MapPin className="h-4 w-4 text-teal-600" />
            Bangalore quick-commerce zone
          </div>
          <div className="flex items-center gap-3">
            <Link href="/login" className="rounded-full px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-white/70">Sign in</Link>
            <Link href="/signup" className="enterprise-button rounded-full px-5 py-2.5">Create account</Link>
          </div>
        </div>
      </nav>

      <section className="relative mx-auto max-w-7xl px-4 pb-16 pt-32 sm:px-6 lg:px-8 lg:pb-24 lg:pt-44">
        <div className="absolute -left-24 top-16 h-96 w-96 rounded-full bg-teal-300/25 blur-3xl" />
        <div className="absolute -right-16 top-32 h-[28rem] w-[28rem] rounded-full bg-amber-200/35 blur-3xl" />
        <div className="relative grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <p className="enterprise-kicker"><Sparkles className="mr-2 h-3.5 w-3.5" /> Hybrid commerce replica</p>
            <h1 className="mt-6 max-w-4xl text-5xl font-black tracking-[-0.07em] text-slate-950 sm:text-6xl lg:text-7xl">
              Enterprise-grade quick commerce from cart to doorstep.
            </h1>
            <p className="mt-6 max-w-2xl text-lg font-semibold leading-8 text-slate-600">
              Aagam combines a premium ecommerce storefront, live operations control, rider dispatch, payment flow, and production-ready delivery tracking in one commerce OS.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link href="/shop" className="enterprise-button gap-2">
                Start shopping <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/admin" className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white/80 px-5 py-3 text-sm font-extrabold text-slate-800 shadow-xl shadow-slate-900/5 transition hover:-translate-y-0.5 hover:border-teal-300">
                Open control tower
              </Link>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">
              {operatingStats.map((stat) => (
                <div key={stat.label} className="enterprise-card p-4">
                  <stat.icon className="h-5 w-5 text-teal-700" />
                  <p className="mt-3 text-xl font-black tracking-tight">{stat.value}</p>
                  <p className="text-xs font-bold text-slate-500">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="enterprise-panel relative p-4 sm:p-6">
            <div className="rounded-[1.5rem] bg-slate-950 p-5 text-white shadow-2xl shadow-slate-950/20">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.22em] text-teal-200">Live order stack</p>
                  <h2 className="mt-2 text-2xl font-black tracking-tight">Aagam Command</h2>
                </div>
                <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-black text-emerald-200">ONLINE</span>
              </div>
              <div className="mt-6 grid gap-3">
                {['Inventory reserved', 'Payment authorized', 'Rider location streaming'].map((item, index) => (
                  <div key={item} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/8 p-4">
                    <div className="flex items-center gap-3">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-slate-950 font-black">0{index + 1}</span>
                      <span className="font-bold">{item}</span>
                    </div>
                    <CheckCircle2 className="h-5 w-5 text-emerald-300" />
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="rounded-[1.5rem] bg-white p-5 shadow-xl shadow-slate-900/5">
                <PackageCheck className="h-6 w-6 text-amber-600" />
                <p className="mt-4 text-3xl font-black">342</p>
                <p className="text-xs font-bold text-slate-500">Items serviceable now</p>
              </div>
              <div className="rounded-[1.5rem] bg-white p-5 shadow-xl shadow-slate-900/5">
                <Store className="h-6 w-6 text-teal-700" />
                <p className="mt-4 text-3xl font-black">4</p>
                <p className="text-xs font-bold text-slate-500">Active dark stores</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <p className="enterprise-kicker">Featured catalogue</p>
            <h2 className="mt-4 text-4xl font-black tracking-[-0.05em]">Retail polish, ops depth.</h2>
          </div>
          <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm font-bold text-slate-500">
            <Search className="h-4 w-4" />
            Search-ready catalogue experience
          </div>
        </div>
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {(products.length ? products : Array.from({ length: 4 })).map((product, index) => (
            <div key={product?.id || index} className="enterprise-card group overflow-hidden p-4 transition hover:-translate-y-1">
              <div className="flex aspect-square items-center justify-center overflow-hidden rounded-[1.25rem] bg-gradient-to-br from-teal-50 to-amber-50">
                {product?.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={product.image} alt={product.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" />
                ) : (
                  <ShoppingBag className="h-12 w-12 text-teal-700" />
                )}
              </div>
              <div className="mt-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="line-clamp-1 text-base font-black text-slate-950">{product?.name || 'Premium grocery item'}</h3>
                  <p className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{product?.category?.name || 'Essentials'}</p>
                </div>
                <div className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-1 text-xs font-black text-amber-700">
                  <Star className="h-3 w-3 fill-amber-500" /> 4.8
                </div>
              </div>
              <div className="mt-4 flex items-center justify-between">
                <p className="text-lg font-black">{product?.price ? formatINR(product.price) : '₹99'}</p>
                <Link href={product?.id ? `/shop/products/${product.id}` : '/shop'} className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white transition hover:bg-teal-700">
                  View
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div className="grid gap-5 md:grid-cols-3">
          {commercePillars.map((pillar) => (
            <div key={pillar.title} className="enterprise-panel p-7">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white">
                <pillar.icon className="h-6 w-6" />
              </div>
              <h3 className="mt-6 text-xl font-black tracking-tight">{pillar.title}</h3>
              <p className="mt-3 text-sm font-semibold leading-6 text-slate-600">{pillar.body}</p>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
