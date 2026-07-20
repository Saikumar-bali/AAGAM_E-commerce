'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, BarChart3, Bike, CheckCircle2, Clock3, MapPin, PackageCheck, Search, ShieldCheck, ShoppingBag, Sparkles, Store, Truck } from 'lucide-react';
import { apiClient } from '@aagam/utils';
import AagamLogo from '@/components/AagamLogo';
import { formatINR } from '@/lib/currency';
import { normalizePromotionPlacements, type PublicPromotionCampaign } from '@/lib/promotion-placements';

const operatingStats = [
  { label: 'Delivery promise ready', value: 'Fast', icon: Clock3 },
  { label: 'Inventory guarded', value: 'Ledgered', icon: ShieldCheck },
  { label: 'Rider telemetry', value: 'Live', icon: Bike },
];

const commercePillars = [
  { title: 'Customer storefront', body: 'Browse, cart, quote, checkout, order tracking, feedback, support, and notifications.', icon: ShoppingBag },
  { title: 'Operations cockpit', body: 'Admin dispatch, analytics, support queue, stores, riders, products, and order controls.', icon: BarChart3 },
  { title: 'Partner workspace', body: 'Store fulfillment, inventory adjustment, rider pickup, delivery proof, and live operations.', icon: Truck },
];

export default function LandingPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [hero, setHero] = useState<PublicPromotionCampaign | null>(null);
  const [banners, setBanners] = useState<PublicPromotionCampaign[]>([]);
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 16);
    window.addEventListener('scroll', handleScroll);

    apiClient.get('/products', { params: { pageSize: 8 } })
      .then((productResponse) => {
        const items = Array.isArray(productResponse.data) ? productResponse.data : productResponse.data?.items || [];
        setProducts(items.filter((item: any) => item?.availability?.isVisible !== false).slice(0, 8));
      })
      .catch((requestError) => {
        console.error('Failed to load landing-page products', requestError);
        setProducts([]);
      });

    apiClient.get('/public/promotions/active')
      .then((campaignResponse) => {
        const placements = normalizePromotionPlacements(campaignResponse.data);
        setHero(placements.LANDING_HERO[0] || null);
        setBanners(placements.LANDING_BANNER);
      })
      .catch((requestError) => {
        console.error('Failed to load landing-page promotions', requestError);
        setHero(null);
        setBanners([]);
      });

    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <main className="min-h-screen overflow-hidden text-slate-950">
      <div className="pointer-events-none fixed inset-0 enterprise-subtle-grid opacity-55" />
      <nav className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${isScrolled ? 'py-3' : 'py-5'}`}>
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <div className="rounded-full border border-white/70 bg-white/80 py-2 pl-2 pr-5 shadow-xl shadow-slate-900/5 backdrop-blur-xl"><AagamLogo compact label="Commerce OS" /></div>
          <div className="hidden items-center gap-2 rounded-full border border-white/70 bg-white/75 px-4 py-3 text-sm font-extrabold text-slate-600 shadow-xl shadow-slate-900/5 backdrop-blur-xl md:flex"><MapPin className="h-4 w-4 text-teal-600" /> Serviceable local commerce zones</div>
          <div className="flex items-center gap-3"><Link href="/login" className="rounded-full px-4 py-2 text-sm font-black text-slate-700 transition hover:bg-white/70">Sign in</Link><Link href="/signup" className="enterprise-button rounded-full px-5 py-2.5">Create account</Link></div>
        </div>
      </nav>

      <section className="relative mx-auto max-w-7xl px-4 pb-16 pt-32 sm:px-6 lg:px-8 lg:pb-24 lg:pt-44">
        <div className="absolute -left-24 top-16 h-96 w-96 rounded-full bg-teal-300/25 blur-3xl" />
        <div className="absolute -right-16 top-32 h-[28rem] w-[28rem] rounded-full bg-amber-200/35 blur-3xl" />
        <div className="relative grid gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div>
            <p className="enterprise-kicker"><Sparkles className="mr-2 h-3.5 w-3.5" /> {hero?.badgeText || 'Quick-commerce operating system'}</p>
            <h1 className="mt-6 max-w-4xl text-5xl font-black tracking-[-0.07em] text-slate-950 sm:text-6xl lg:text-7xl">{hero?.title || 'Run customer shopping, store fulfilment, and delivery ops from one platform.'}</h1>
            <p className="mt-6 max-w-2xl text-lg font-semibold leading-8 text-slate-600">{hero?.subtitle || hero?.description || 'Aagam combines customer storefront, store inventory, order fulfilment, rider dispatch, live tracking, support, analytics, and notifications for local commerce teams.'}</p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row"><Link href="/shop" className="enterprise-button gap-2">Start shopping <ArrowRight className="h-4 w-4" /></Link><Link href="/partner" className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white/80 px-5 py-3 text-sm font-extrabold text-slate-800 shadow-xl shadow-slate-900/5 transition hover:-translate-y-0.5 hover:border-teal-300">Partner with us</Link></div>
            <div className="mt-8 grid gap-3 sm:grid-cols-3">{operatingStats.map((stat) => <div key={stat.label} className="enterprise-card p-4"><stat.icon className="h-5 w-5 text-teal-700" /><p className="mt-3 text-xl font-black tracking-tight">{stat.value}</p><p className="text-xs font-bold text-slate-500">{stat.label}</p></div>)}</div>
          </div>
          <div className="enterprise-panel relative overflow-hidden p-4 sm:p-6">{hero?.imageUrl ? <img src={hero.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-15" /> : null}<div className="relative rounded-[1.5rem] bg-slate-950 p-5 text-white shadow-2xl shadow-slate-950/20"><div className="flex items-center justify-between"><div><p className="text-xs font-black uppercase tracking-[0.22em] text-teal-200">Live order stack</p><h2 className="mt-2 text-2xl font-black tracking-tight">Aagam Command</h2></div><span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-black text-emerald-200">ONLINE</span></div><div className="mt-6 grid gap-3">{['Inventory reserved', 'Store preparing', 'Rider tracking'].map((item, index) => <div key={item} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/8 p-4"><div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-xl bg-white font-black text-slate-950">0{index + 1}</span><span className="font-bold">{item}</span></div><CheckCircle2 className="h-5 w-5 text-emerald-300" /></div>)}</div></div><div className="mt-4 grid grid-cols-2 gap-4"><div className="rounded-[1.5rem] bg-white p-5 shadow-xl shadow-slate-900/5"><PackageCheck className="h-6 w-6 text-amber-600" /><p className="mt-4 text-3xl font-black">Live</p><p className="text-xs font-bold text-slate-500">Inventory controls</p></div><div className="rounded-[1.5rem] bg-white p-5 shadow-xl shadow-slate-900/5"><Store className="h-6 w-6 text-teal-700" /><p className="mt-4 text-3xl font-black">Multi</p><p className="text-xs font-bold text-slate-500">Store operations</p></div></div></div>
        </div>
      </section>

      <section className="relative mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8"><div className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end"><div><p className="enterprise-kicker">Featured catalogue</p><h2 className="mt-4 text-4xl font-black tracking-[-0.05em]">Retail polish, operations depth.</h2></div><div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm font-bold text-slate-500"><Search className="h-4 w-4" /> Search-ready catalogue experience</div></div><div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">{(products.length ? products : Array.from({ length: 4 })).map((product, index) => <div key={product?.id || index} className="enterprise-card group overflow-hidden p-4 transition hover:-translate-y-1"><div className="flex aspect-square items-center justify-center overflow-hidden rounded-[1.25rem] bg-gradient-to-br from-teal-50 to-amber-50">{product?.image ? <img src={product.image} alt={product.name} className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : <ShoppingBag className="h-12 w-12 text-teal-700" />}</div><div className="mt-4 flex items-start justify-between gap-3"><div><h3 className="line-clamp-1 text-base font-black text-slate-950">{product?.name || 'Premium grocery item'}</h3><p className="mt-1 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">{product?.category?.name || 'Essentials'}</p></div><span className="rounded-full bg-teal-50 px-2 py-1 text-xs font-black text-teal-700">{product?.availability?.inStock === false ? 'Out of stock' : 'Available'}</span></div><div className="mt-4 flex items-center justify-between"><p className="text-lg font-black">{product?.price ? formatINR(product.price) : '₹99'}</p><Link href={product?.id ? `/shop/products/${product.id}` : '/shop'} className="rounded-full bg-slate-950 px-4 py-2 text-xs font-black text-white transition hover:bg-teal-700">View</Link></div></div>)}</div></section>

      {banners.length ? <section className="relative mx-auto grid max-w-7xl gap-5 px-4 py-12 sm:px-6 md:grid-cols-2 lg:px-8">{banners.map((campaign) => <Link key={campaign.id} href={campaign.targetUrl || '/shop'} className="group relative min-h-64 overflow-hidden rounded-[2rem] border border-white/70 p-8 shadow-xl" style={{ backgroundColor: campaign.backgroundColor || '#0f172a', color: campaign.textColor || '#fff' }}>{campaign.imageUrl ? <img src={campaign.imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-45 transition duration-500 group-hover:scale-105" /> : null}<div className="absolute inset-0 bg-gradient-to-r from-slate-950/85 to-transparent" /><div className="relative max-w-sm"><p className="text-xs font-black uppercase tracking-[.2em] text-teal-200">{campaign.badgeText || 'Aagam offer'}</p><h2 className="mt-4 text-3xl font-black">{campaign.title}</h2><p className="mt-2 font-semibold text-white/80">{campaign.subtitle || campaign.description}</p><span className="mt-6 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black text-slate-950">{campaign.ctaLabel || 'Explore'} <ArrowRight className="h-4 w-4" /></span></div></Link>)}</section> : null}

      <section className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8"><div className="grid gap-5 md:grid-cols-3">{commercePillars.map((pillar) => <div key={pillar.title} className="enterprise-panel p-7"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-white"><pillar.icon className="h-6 w-6" /></div><h3 className="mt-6 text-xl font-black tracking-tight">{pillar.title}</h3><p className="mt-3 text-sm font-semibold leading-6 text-slate-600">{pillar.body}</p></div>)}</div></section>

      <footer className="relative border-t border-slate-200/70 bg-white px-4 py-14 sm:px-6 lg:px-8"><div className="mx-auto grid max-w-7xl gap-10 md:grid-cols-2 lg:grid-cols-4"><div><AagamLogo compact label="Commerce OS" /><p className="mt-4 max-w-sm text-sm font-semibold leading-6 text-slate-600">Accountable local commerce for customers, stores, riders, and operations teams.</p><p className="mt-5 text-xs font-bold text-slate-400">© 2026 Aagam Commerce OS</p></div><div><h4 className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">Shop</h4><div className="mt-4 grid gap-3 text-sm font-bold text-slate-700"><Link href="/shop">Browse products</Link><Link href="/shop/deals">Deals & offers</Link><Link href="/login">Track your orders</Link></div></div><div><h4 className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">Partners</h4><div className="mt-4 grid gap-3 text-sm font-bold text-slate-700"><Link href="/partner">Become a store partner</Link><Link href="/partner">Deliver with Aagam</Link><Link href="/login">Partner sign in</Link></div></div><div><h4 className="text-sm font-black uppercase tracking-[0.18em] text-slate-400">Trust & support</h4><div className="mt-4 grid gap-3 text-sm font-bold text-slate-700"><Link href="/login">Customer support</Link><span>Verified partner onboarding</span><span>Audited fulfilment and delivery</span></div></div></div></footer>
    </main>
  );
}
