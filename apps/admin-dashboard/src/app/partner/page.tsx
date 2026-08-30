import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  Building2,
  Clock3,
  Handshake,
  MapPin,
  PackageCheck,
  ShieldCheck,
  Smartphone,
  Sprout,
  Store,
  Truck,
  Wallet,
  Users,
  ArrowUpRight,
  ChevronDown,
  Search,
  User,
  ShoppingBag,
  Download,
} from 'lucide-react';
import AagamLogo from '@/components/AagamLogo';
import DownloadActions from './DownloadActions';

// Server-side fetch — hides distribution source, never exposes raw URLs or logos
// Composition primitives (shadcn/ui + vercel-composition-patterns style)
function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(' ');
}

type PartnerRelease = {
  app?: string;
  versionCode?: number;
  versionName?: string | null;
  downloadUrl?: string | null;
  publishedAt?: string | null;
};

async function getPartnerRelease(): Promise<PartnerRelease | null> {
  const base =
    process.env.API_BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    'http://127.0.0.1:3005';
  // NEXT_PUBLIC_API_URL may be "/api" (relative) — normalize to absolute for server fetch
  const normalizedBase = base.startsWith('/api')
    ? `http://127.0.0.1:3005`
    : base.replace(/\/$/, '');
  const url = `${normalizedBase}/app-releases/latest?app=PARTNERS`;
  try {
    const res = await fetch(url, {
      next: { revalidate: 300 },
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as PartnerRelease;
    // Only keep branded fields — drop external URLs if present
    if (!data?.downloadUrl) return null;
    return {
      versionName: data.versionName ?? null,
      versionCode: data.versionCode,
      downloadUrl: data.downloadUrl,
      publishedAt: data.publishedAt ?? null,
    };
  } catch {
    return null;
  }
}

// — shadcn-like primitives via composition —
function Section({
  id,
  className,
  children,
}: {
  id?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className={cn('scroll-mt-28 xl:scroll-mt-20', className)}>
      {children}
    </section>
  );
}

function Card({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn('rounded-[16px] border border-[#e6ecea] bg-white shadow-[0_4px_20px_rgba(6,59,58,0.06)]', className)}>
      {children}
    </div>
  );
}

export const metadata = {
  title: 'Partner with AAGAM — Store & Delivery Partners',
  description:
    'Join AAGAM as a Store Partner or Delivery Partner. Verified onboarding, fast payouts, and a secure Android distribution.',
};

export default async function PartnerPage() {
  const release = await getPartnerRelease();

  const versionName = release?.versionName ?? null;
  const publishedAt = release?.publishedAt ?? null;
  const downloadUrl = release?.downloadUrl ?? null;

  return (
    <main id="main-content" className="min-h-screen bg-[#f7f8f7] text-[#16231f] touch-manipulation" style={{ fontFamily: 'Inter, ui-sans-serif, system-ui' }}>
      <a
        href="#main-content"
        className="sr-only left-4 top-4 z-[100] rounded-[12px] bg-white px-4 py-2 text-[12px] font-black text-[#063b3a] shadow focus:not-sr-only focus:fixed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#067a64]"
      >
        Skip to content
      </a>
      {/* Sticky header — from app/page.tsx:230 */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#063b3a] text-white shadow-sm">
        <div className="mx-auto flex h-[64px] max-w-[1448px] items-center gap-4 px-4 sm:px-5 lg:px-10">
          <div className="mr-2 shrink-0">
            <AagamLogo inverse compact label="Fresh, quality & trust" />
          </div>

          <nav className="hidden items-center gap-7 text-[12px] font-bold text-white/90 xl:flex" aria-label="Partner sections">
            <a
              href="#roles"
              className="inline-flex min-h-[44px] items-center gap-1 rounded-full px-2 hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
            >
              Roles <ChevronDown className="h-3 w-3" aria-hidden />
            </a>
            <a
              href="#benefits"
              className="inline-flex min-h-[44px] items-center rounded-full px-2 hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
            >
              Benefits
            </a>
            <a
              href="#download"
              className="inline-flex min-h-[44px] items-center rounded-full px-2 hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
            >
              Download
            </a>
            <a
              href="#about"
              className="inline-flex min-h-[44px] items-center rounded-full px-2 hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
            >
              About
            </a>
          </nav>

          <div className="ml-auto hidden min-w-0 flex-1 md:block lg:max-w-[300px]" aria-hidden>
            <label className="relative block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/55" aria-hidden />
              <input
                tabIndex={-1}
                readOnly
                placeholder={'Search for\u00A0“Fruits, Atta, Oil…”'}
                aria-label="Search decoration"
                className="h-9 w-full rounded-xl border border-white/10 bg-white/10 pl-9 pr-3 text-[11px] font-semibold text-white outline-none placeholder:text-white/55"
              />
            </label>
          </div>

          <a
            href="#download"
            className="hidden h-9 items-center gap-2 whitespace-nowrap rounded-[12px] bg-[#067a64] px-5 text-[11px] font-black text-white shadow-lg shadow-black/10 transition hover:bg-[#065f4e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#063b3a] md:inline-flex min-h-[44px]"
          >
            Get partner app <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
          </a>

          <Link
            href="/login"
            className="hidden items-center gap-1.5 whitespace-nowrap text-[11px] font-bold hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300 md:flex min-h-[44px]"
          >
            <User className="h-4 w-4" aria-hidden /> Sign in
          </Link>
          <Link
            href="/login"
            className="ml-auto inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-[12px] bg-[#067a64] px-5 text-[11px] font-black text-white shadow-lg shadow-black/10 transition hover:bg-[#065f4e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white md:hidden min-h-[44px]"
          >
            Sign in <User className="h-3.5 w-3.5" aria-hidden />
          </Link>
          <a
            href="#roles"
            className="hidden h-9 items-center gap-2 whitespace-nowrap rounded-[12px] bg-white px-5 text-[11px] font-black text-[#063b3a] shadow-lg shadow-black/10 transition hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white md:inline-flex min-h-[44px]"
          >
            Explore roles <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </a>
        </div>
        {/* mobile secondary nav */}
        <nav
          aria-label="Partner sections mobile"
          className="flex h-10 items-center gap-1 overflow-x-auto border-t border-white/10 px-3 text-[10px] font-black text-white/85 xl:hidden"
        >
          <a
            href="#roles"
            className="shrink-0 rounded-full px-3 py-2 min-h-[44px] inline-flex items-center transition hover:bg-white/10 hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
          >
            Roles
          </a>
          <a
            href="#benefits"
            className="shrink-0 rounded-full px-3 py-2 min-h-[44px] inline-flex items-center transition hover:bg-white/10 hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
          >
            Benefits
          </a>
          <a
            href="#download"
            className="shrink-0 rounded-full px-3 py-2 min-h-[44px] inline-flex items-center transition hover:bg-white/10 hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
          >
            Download
          </a>
          <a
            href="#about"
            className="shrink-0 rounded-full px-3 py-2 min-h-[44px] inline-flex items-center transition hover:bg-white/10 hover:text-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
          >
            About
          </a>
        </nav>
      </header>

      {/* Hero — Partner with AAGAM + 3 trust stats */}
      <div className="bg-[#063b3a]">
        <section className="mx-auto max-w-[1448px] px-5 pb-8 pt-10 lg:px-10 lg:pb-10 lg:pt-14">
          <div className="grid gap-8 lg:grid-cols-[1.15fr_0.85fr] lg:items-center">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-emerald-200">
                <BadgeCheck className="h-3.5 w-3.5" aria-hidden /> Verified partner program
              </span>
              <h1 className="mt-4 max-w-[680px] text-balance text-[32px] font-black leading-[0.95] tracking-[-0.04em] text-white sm:text-[40px] lg:text-[52px]">
                <span translate="no">Partner with <span className="text-[#20c9a6]">AAGAM.</span></span>
                <span className="mt-2 block text-[18px] font-semibold leading-7 text-white/85 sm:text-[20px]">
                  Grow with trusted stores and reliable earning — built for Bharat.
                </span>
              </h1>
              <p className="mt-4 max-w-[640px] text-[13px] font-medium leading-6 text-white/75">
                AAGAM connects neighbourhood stores and delivery professionals to a single, reliable demand network.
                Operate on your terms with transparent payouts, live ops support, and quality you can stand behind.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <a
                  href="#download"
                  className="inline-flex h-11 items-center justify-center gap-2 rounded-[12px] bg-[#067a64] px-7 text-[13px] font-black text-white shadow-[0_10px_24px_rgba(0,0,0,0.22)] transition hover:bg-[#065f4e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#063b3a] min-h-[44px]"
                >
                  Download partner app <ArrowRight className="h-4 w-4" aria-hidden />
                </a>
                <a
                  href="#roles"
                  className="inline-flex h-11 items-center justify-center rounded-[12px] border border-white/20 bg-white/10 px-7 text-[13px] font-black text-white backdrop-blur transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white min-h-[44px]"
                >
                  View roles
                </a>
              </div>

              {/* 3 trust stats */}
              <div className="mt-8 grid grid-cols-3 divide-x divide-white/15 rounded-[16px] border border-white/10 bg-white/[0.06] p-4 backdrop-blur">
                {[
                  { value: '98%', label: 'On-time payouts' },
                  { value: '350+', label: 'Partner stores' },
                  { value: '4.7★', label: 'Partner rating' },
                ].map((stat) => (
                  <div key={stat.label} className="px-2 text-center first:pl-0 last:pr-0 sm:px-4">
                    <div className="text-[20px] font-black tracking-tight text-white sm:text-[22px]">{stat.value}</div>
                    <div className="mt-1 text-[10px] font-bold uppercase tracking-[0.12em] text-white/60">{stat.label}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* hero visual card */}
            <div className="relative">
              <div className="rounded-[20px] border border-white/10 bg-white p-3 shadow-[0_24px_64px_rgba(0,0,0,0.32)]">
                <div className="rounded-[14px] bg-[#f7f8f7] p-4">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex items-center gap-2 text-[11px] font-black text-[#063b3a]">
                      <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden /> Live operations
                    </span>
                    <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-[#475a56] border border-[#e6ecea]">AAGAM OS</span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3">
                    <div className="rounded-[14px] border border-[#e6ecea] bg-white p-3">
                      <div className="flex items-center gap-2 text-[11px] font-black text-[#063b3a]">
                        <Store className="h-4 w-4 text-[#078b70]" aria-hidden /> Store
                      </div>
                      <p className="mt-2 text-[12px] font-bold leading-4 text-[#16231f]">Your stock, your margin</p>
                      <p className="mt-1 text-[11px] font-medium leading-4 text-[#475a56]">Orders routed to you by locality.</p>
                      <span className="mt-3 inline-flex text-[11px] font-black text-[#067a64]">Avg +18% fill rate →</span>
                    </div>
                    <div className="rounded-[14px] border border-[#063b3a] bg-[#063b3a] p-3 text-white">
                      <div className="flex items-center gap-2 text-[11px] font-black">
                        <Truck className="h-4 w-4 text-emerald-300" aria-hidden /> Delivery
                      </div>
                      <p className="mt-2 text-[12px] font-bold leading-4">Earn per run</p>
                      <p className="mt-1 text-[11px] font-medium leading-4 text-white/70">Flexible slots, instant tracking.</p>
                      <span className="mt-3 inline-flex text-[11px] font-black text-emerald-300">Daily payouts →</span>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center gap-2 rounded-[12px] border border-emerald-100 bg-emerald-50 px-3 py-2.5">
                    <ShieldCheck className="h-4 w-4 shrink-0 text-[#067a64]" aria-hidden />
                    <p className="text-[11px] font-bold leading-4 text-[#063b3a]">Secure AAGAM Distribution • Verified Build</p>
                  </div>
                </div>
                <div className="flex items-center justify-between px-1 pt-3">
                  <p className="text-[11px] font-semibold text-[#5a6e69]">Works with your existing phone — Android only</p>
                  <span className="text-[11px] font-black text-[#067a64]">→ #download</span>
                </div>
              </div>
              {/* glow */}
              <div className="pointer-events-none absolute -inset-2 -z-10 rounded-[28px] bg-emerald-400/10 blur-2xl" aria-hidden />
            </div>
          </div>
        </section>
      </div>

      {/* Content canvas */}
      <div className="mx-auto max-w-[1448px] bg-[#f7f8f7] px-5 pb-10 pt-6 lg:px-10">
        {/* 2 large role cards — 16px radius */}
        <Section id="roles" className="scroll-mt-28">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[#067a64]">Choose your role</p>
              <h2 className="mt-1 text-[22px] font-black tracking-[-0.03em] text-[#063b3a] sm:text-[26px]">Two ways to partner</h2>
              <p className="mt-1 max-w-[640px] text-[12px] font-medium leading-5 text-[#475a56]">
                Both roles run on the same verified Android app. No marketplace juggling — one AAGAM identity for operations.
              </p>
            </div>
            <a
              href="#download"
              className="hidden items-center gap-2 text-[12px] font-black text-[#067a64] hover:text-[#063b3a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#067a64] sm:inline-flex min-h-[44px]"
            >
              Download to get started <ArrowRight className="h-4 w-4" aria-hidden />
            </a>
          </div>

          <div className="mt-5 grid gap-3 sm:gap-3 lg:grid-cols-2">
            {/* Store Partner */}
            <Card className="relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-1 bg-[#078b70]" aria-hidden />
              <div className="p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-[#063b3a] text-white">
                      <Store className="h-5 w-5" aria-hidden />
                    </span>
                    <div>
                      <h3 className="text-[16px] font-black tracking-tight text-[#063b3a]">Store Partner</h3>
                      <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#475a56]">Kirana • Supermart • Fresh</p>
                    </div>
                  </div>
                  <span className="hidden items-center gap-1 rounded-full border border-emerald-100 bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-[#067a64] sm:inline-flex">
                    <Building2 className="h-3 w-3" aria-hidden /> Local demand
                  </span>
                </div>
                <p className="mt-4 text-[13px] font-medium leading-6 text-[#33443f]">
                  Keep your storefront. We bring nearby orders, handle customer discovery, and route delivery — you focus on quality and readiness.
                </p>
                <ul className="mt-4 grid gap-2">
                  {[
                    { icon: PackageCheck, text: 'Orders auto-allocated by zone & stock' },
                    { icon: Wallet, text: 'Transparent margin & weekly settlements' },
                    { icon: MapPin, text: 'Hyperlocal discovery — your shop, not a warehouse' },
                  ].map((item) => (
                    <li key={item.text} className="flex items-center gap-2.5 text-[12px] font-semibold text-[#2f3e3a]">
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-[#f1f5f4] text-[#078b70]">
                        <item.icon className="h-4 w-4" aria-hidden />
                      </span>
                      {item.text}
                    </li>
                  ))}
                </ul>
                <div className="mt-5 flex flex-wrap gap-2">
                  <a
                    href="#download"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-[12px] bg-[#067a64] px-5 text-[13px] font-black text-white transition hover:bg-[#065f4e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#063b3a] min-h-[44px]"
                  >
                    Get store app <ArrowRight className="h-4 w-4" aria-hidden />
                  </a>
                  <span className="inline-flex h-11 items-center rounded-[12px] border border-[#e6ecea] bg-[#f7f8f7] px-4 text-[11px] font-bold text-[#475a56]">
                    Approval in 24–48h
                  </span>
                </div>
              </div>
              <div className="border-t border-[#eef2f1] bg-[#fbfcfb] px-5 py-3 sm:px-6">
                <p className="flex items-center gap-2 text-[11px] font-semibold text-[#5a6e69]">
                  <Handshake className="h-4 w-4 text-[#078b70]" aria-hidden /> Ideal for owners doing 80+ bills/day who want incremental demand.
                </p>
              </div>
            </Card>

            {/* Delivery Partner */}
            <Card className="relative overflow-hidden">
              <div className="absolute inset-x-0 top-0 h-1 bg-[#20c9a6]" aria-hidden />
              <div className="p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <span className="grid h-11 w-11 place-items-center rounded-[14px] bg-[#078b70] text-white">
                      <Truck className="h-5 w-5" aria-hidden />
                    </span>
                    <div>
                      <h3 className="text-[16px] font-black tracking-tight text-[#063b3a]">Delivery Partner</h3>
                      <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-[#475a56]">Full-time • Part-time • Fleet</p>
                    </div>
                  </div>
                  <span className="hidden items-center gap-1 rounded-full border border-[#063b3a]/10 bg-[#063b3a] px-2.5 py-1 text-[10px] font-black text-white sm:inline-flex">
                    <Clock3 className="h-3 w-3" aria-hidden /> Flexible slots
                  </span>
                </div>
                <p className="mt-4 text-[13px] font-medium leading-6 text-[#33443f]">
                  Deliver for your neighbourhood. Choose slots, see earnings per run, and get navigation + proof-of-delivery built into the app.
                </p>
                <ul className="mt-4 grid gap-2">
                  {[
                    { icon: Clock3, text: '2–4 hr slots • pick when you ride' },
                    { icon: Wallet, text: 'Per-order pay + incentives • daily payout' },
                    { icon: ShieldCheck, text: 'In-app SOS, insurance & cash handling' },
                  ].map((item) => (
                    <li key={item.text} className="flex items-center gap-2.5 text-[12px] font-semibold text-[#2f3e3a]">
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-[#063b3a] text-white">
                        <item.icon className="h-3.5 w-3.5" aria-hidden />
                      </span>
                      {item.text}
                    </li>
                  ))}
                </ul>
                <div className="mt-5 flex flex-wrap gap-2">
                  <a
                    href="#download"
                    className="inline-flex h-11 items-center justify-center gap-2 rounded-[12px] bg-[#063b3a] px-5 text-[13px] font-black text-white transition hover:bg-[#042c2b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#067a64] min-h-[44px]"
                  >
                    Get delivery app <ArrowRight className="h-4 w-4" aria-hidden />
                  </a>
                  <span className="inline-flex h-11 items-center rounded-[12px] border border-[#e6ecea] bg-white px-4 text-[11px] font-bold text-[#475a56]">
                    18+ with valid ID & vehicle
                  </span>
                </div>
              </div>
              <div className="border-t border-[#eef2f1] bg-[#fbfcfb] px-5 py-3 sm:px-6">
                <p className="flex items-center gap-2 text-[11px] font-semibold text-[#5a6e69]">
                  <Users className="h-4 w-4 text-[#078b70]" aria-hidden /> Earn ₹1k–₹1.8k/day on standard city runs.
                </p>
              </div>
            </Card>
          </div>
        </Section>

        {/* Benefits grid — 4 items, 2-col mobile gap 12 */}
        <Section id="benefits" className="mt-8">
          <div className="rounded-[16px] border border-[#e6ecea] bg-white p-4 sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-[18px] font-black tracking-tight text-[#063b3a]">Why partners stay with AAGAM</h2>
                <p className="mt-1 text-[12px] font-medium leading-5 text-[#475a56]">Premium ops without the marketplace tax. Operate like a national chain, keep your identity.</p>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full bg-[#063b3a] px-3 py-1.5 text-[11px] font-black text-white">
                <Sprout className="h-3.5 w-3.5 text-emerald-300" aria-hidden /> Built for Indian retail
              </span>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              {[
                {
                  icon: Wallet,
                  title: 'Fast, clear payouts',
                  copy: 'Order-wise statements, TDS-ready summaries, and on-time settlement every cycle.',
                },
                {
                  icon: Clock3,
                  title: 'Work on your clock',
                  copy: 'Stores stay open as usual; riders choose slots. No forced 12-hour shifts.',
                },
                {
                  icon: ShieldCheck,
                  title: 'Quality = growth',
                  copy: 'High ratings unlock more demand — we reward freshness and care, not discounts.',
                },
                {
                  icon: Users,
                  title: 'Human support',
                  copy: 'Dedicated ops channel on the app. No bots when you need a resolution now.',
                },
              ].map((b) => (
                <div
                  key={b.title}
                  className="rounded-[16px] border border-[#e6ecea] bg-[#f7f8f7] p-4 transition hover:border-[#d8e4e0] hover:bg-white"
                >
                  <span className="grid h-10 w-10 place-items-center rounded-[12px] bg-white text-[#078b70] shadow-sm border border-[#e6ecea]">
                    <b.icon className="h-5 w-5" aria-hidden />
                  </span>
                  <h3 className="mt-3 text-[13px] font-black leading-tight text-[#063b3a]">{b.title}</h3>
                  <p className="mt-1 text-[12px] font-medium leading-5 text-[#475a56]">{b.copy}</p>
                </div>
              ))}
            </div>
          </div>
        </Section>

        {/* Download section — #download, versionName, publishedAt, QR, CTA 44px + drawer */}
        <Section id="download" className="mt-8">
          <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            {/* Main download card */}
            <Card className="overflow-hidden">
              <div className="grid gap-0 lg:grid-cols-[1.35fr_0.9fr]">
                <div className="p-5 sm:p-6 lg:p-7">
                  <p className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.16em] text-[#067a64]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#078b70]" aria-hidden /> Secure Android distribution
                  </p>
                  <h2 className="mt-2 text-[22px] font-black leading-none tracking-[-0.03em] text-[#063b3a] sm:text-[26px]">
                    Download the partner app
                  </h2>
                  <p className="mt-2 text-[12px] font-medium leading-5 text-[#475a56]">
                    One app for Store and Delivery operations. Verified build, signed by AAGAM — delivered direct to your device.
                  </p>

                  <div className="mt-5">
                    <DownloadActions downloadUrl={downloadUrl} versionName={versionName} publishedAt={publishedAt} />
                  </div>

                  <div className="mt-5 flex flex-wrap gap-2 text-[11px] font-semibold">
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e6ecea] bg-white px-3 py-1.5 text-[#475a56]">
                      <PackageCheck className="h-3.5 w-3.5 text-[#078b70]" aria-hidden /> Size ~ 42 MB
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-[#e6ecea] bg-white px-3 py-1.5 text-[#475a56]">
                      <Smartphone className="h-3.5 w-3.5 text-[#078b70]" aria-hidden /> Android 8.0+
                    </span>
                    <span className="inline-flex items-center gap-1.5 rounded-full bg-[#063b3a] px-3 py-1.5 text-white">
                      <ShieldCheck className="h-3.5 w-3.5 text-emerald-300" aria-hidden /> No Play Store needed
                    </span>
                  </div>
                </div>

                {/* QR placeholder + trust */}
                <div className="border-t border-[#eef2f1] bg-[#fbfcfb] p-5 sm:p-6 lg:border-l lg:border-t-0 lg:bg-[#f7f8f7]">
                  <p className="text-[12px] font-black text-[#063b3a]">Scan to download</p>
                  <p className="mt-1 text-[11px] font-medium leading-4 text-[#5a6e69]">Open camera on Android and point at the code</p>

                  <div
                    className="mt-4 grid place-items-center rounded-[16px] border border-dashed border-[#b8c9c5] bg-white p-4"
                    aria-hidden
                  >
                    <div className="grid h-[132px] w-[132px] place-items-center rounded-[12px] bg-[#063b3a] p-2.5">
                      {/* QR code placeholder — branded grid */}
                      <div className="grid h-full w-full grid-cols-7 gap-[2px] rounded-[8px] bg-white p-2">
                        {Array.from({ length: 49 }).map((_, i) => {
                          // deterministic pattern for placeholder
                          const on = [0, 1, 2, 5, 6, 7, 8, 13, 14, 15, 18, 20, 21, 22, 24, 26, 28, 30, 33, 35, 36, 38, 40, 42, 43, 44, 47, 48].includes(i) || i % 7 === 0 || i % 9 === 0;
                          return <span key={i} className={cn('rounded-[1px]', on ? 'bg-[#063b3a]' : 'bg-white')} />;
                        })}
                      </div>
                    </div>
                    <p className="mt-3 text-center text-[10px] font-black uppercase tracking-[0.12em] text-[#475a56]">AAGAM Partners • Android</p>
                  </div>

                  <div className="mt-4 rounded-[12px] border border-[#e6ecea] bg-white px-3 py-3">
                    <p className="text-[11px] font-black text-[#063b3a]">After downloading</p>
                    <p className="mt-1 text-[11px] font-medium leading-4 text-[#475a56]">
                      Open the file from your notification shade. If Android asks, allow install from your browser/files — you can revoke it after.
                    </p>
                  </div>

                  <Link
                    href="/"
                    className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[12px] border border-[#e6ecea] bg-white px-4 text-[12px] font-bold text-[#063b3a] transition hover:bg-[#f1f5f4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#067a64]"
                  >
                    <ShoppingBag className="h-4 w-4 text-[#078b70]" aria-hidden /> Continue to AAGAM shopping
                  </Link>
                </div>
              </div>
            </Card>

            {/* Side trust / steps */}
            <div className="grid gap-4">
              <Card className="p-5 sm:p-6">
                <h3 className="text-[14px] font-black text-[#063b3a]">Onboarding in 3 steps</h3>
                <ol className="mt-4 space-y-3">
                  {[
                    { n: '01', t: 'Apply & verify', d: 'Share store/rider details. Phone + ID verification completes in hours.' },
                    { n: '02', t: 'Install the app', d: 'Use the Download button or QR. Sign in with your approved number.' },
                    { n: '03', t: 'Go live', d: 'Complete profile, add location, and receive your first order / slot.' },
                  ].map((s) => (
                    <li key={s.n} className="flex gap-3">
                      <span className="font-mono text-[11px] font-black tracking-[0.12em] text-[#078b70]">{s.n}</span>
                      <div className="min-w-0">
                        <p className="text-[13px] font-black text-[#16231f]">{s.t}</p>
                        <p className="mt-1 text-[12px] font-medium leading-5 text-[#475a56]">{s.d}</p>
                      </div>
                    </li>
                  ))}
                </ol>
                <div className="mt-5 rounded-[12px] bg-[#063b3a] px-4 py-3 text-white">
                  <p className="text-[12px] font-black">Questions?</p>
                  <p className="mt-1 text-[11px] font-medium leading-4 text-white/70">
                    Approved partners can reach ops from the app after sign-in. New applicants will be contacted after verification.
                  </p>
                </div>
              </Card>

              <div className="rounded-[16px] border border-emerald-100 bg-emerald-50 p-4">
                <p className="flex items-center gap-2 text-[12px] font-black text-[#063b3a]">
                  <ShieldCheck className="h-4 w-4 text-[#067a64]" aria-hidden /> Trust & safety
                </p>
                <p className="mt-2 text-[12px] font-medium leading-5 text-[#2f3e3a]">
                  All builds are signed by AAGAM and served from a secured distribution. Never install a partner app forwarded outside the official Download button or QR above.
                </p>
              </div>
            </div>
          </div>
        </Section>

        {/* About strip */}
        <Section id="about" className="mt-8">
          <div className="grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-[16px] border border-[#e6ecea] bg-white p-5 sm:p-6">
              <h3 className="text-[15px] font-black text-[#063b3a]">Built for neighbourhood commerce</h3>
              <p className="mt-2 text-[12px] font-medium leading-6 text-[#475a56]">
                AAGAM serves customers through partner stores and delivery professionals — not a central warehouse. That means faster freshness, human accountability, and earnings that stay local. Our partner tools are deliberately simple: clear jobs, clear pay, clear support.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-[#f1f5f4] px-3 py-1.5 text-[11px] font-bold text-[#2f3e3a]">Hyperlocal ops</span>
                <span className="rounded-full bg-[#f1f5f4] px-3 py-1.5 text-[11px] font-bold text-[#2f3e3a]">Proof-of-delivery</span>
                <span className="rounded-full bg-[#f1f5f4] px-3 py-1.5 text-[11px] font-bold text-[#2f3e3a]">Live tracking</span>
              </div>
            </div>
            <div className="rounded-[16px] bg-[#063b3a] p-5 text-white sm:p-6">
              <p className="text-[11px] font-black uppercase tracking-[0.14em] text-emerald-200">Partner promise</p>
              <p className="mt-2 text-[13px] font-medium leading-6 text-white/85">
                “If you bring care to every order, we will bring consistency to your earnings.”
              </p>
              <p className="mt-3 text-[11px] font-bold text-emerald-200">— AAGAM Operations</p>
              <a
                href="#download"
                className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-[12px] bg-white px-5 text-[13px] font-black text-[#063b3a] transition hover:bg-emerald-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white min-h-[44px]"
              >
                Download for Android <ArrowRight className="h-4 w-4" aria-hidden />
              </a>
            </div>
          </div>
        </Section>
      </div>

      {/* Footer — matches page.tsx but simplified */}
      <footer className="bg-[#063b3a] text-white">
        <div className="mx-auto grid max-w-[1448px] gap-7 px-6 py-8 md:grid-cols-2 lg:grid-cols-[1.25fr_.8fr_.8fr_1.2fr_1.1fr] lg:px-10">
          <div>
            <AagamLogo inverse compact label="Fresh, quality and trust" />
            <p className="mt-3 max-w-[260px] text-[12px] font-medium leading-5 text-white/70">
              The partner app powers Store and Delivery operations for AAGAM’s neighbourhood-first commerce.
            </p>
            <p className="mt-3 inline-flex items-center gap-2 text-[11px] font-bold text-emerald-200">
              <ShieldCheck className="h-4 w-4" aria-hidden /> Secure AAGAM Distribution • Verified Build
            </p>
            <p className="mt-4 text-[10px] font-semibold text-white/50">&copy; 2026 Aagaam Retail Pvt. Ltd. All rights reserved.</p>
          </div>
          <div>
            <h3 className="text-[11px] font-black">Partner</h3>
            <div className="mt-3 grid gap-1 text-[12px] font-medium text-white/70">
              <a href="#roles" className="inline-flex min-h-[44px] items-center rounded px-1 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300">
                Store vs Delivery
              </a>
              <a href="#benefits" className="inline-flex min-h-[44px] items-center rounded px-1 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300">
                Benefits
              </a>
              <a href="#download" className="inline-flex min-h-[44px] items-center rounded px-1 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300">
                Download
              </a>
              <Link href="/login" className="inline-flex min-h-[44px] items-center rounded px-1 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300">
                Partner sign in
              </Link>
            </div>
          </div>
          <div>
            <h3 className="text-[11px] font-black">Shop</h3>
            <div className="mt-3 grid gap-1 text-[12px] font-medium text-white/70">
              <Link href="/" className="inline-flex min-h-[44px] items-center rounded px-1 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300">
                Customer home
              </Link>
              <Link href="/shop" className="inline-flex min-h-[44px] items-center rounded px-1 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300">
                Browse catalogue
              </Link>
              <a href="/#offers" className="inline-flex min-h-[44px] items-center rounded px-1 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300">
                Current offers
              </a>
            </div>
          </div>
          <div>
            <h3 className="text-[11px] font-black">Support</h3>
            <div className="mt-3 grid gap-1 text-[12px] font-medium text-white/70">
              <Link href="/terms" className="inline-flex min-h-[44px] items-center rounded px-1 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300">
                Terms & Conditions
              </Link>
              <Link href="/privacy" className="inline-flex min-h-[44px] items-center rounded px-1 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300">
                Privacy Policy
              </Link>
              <a href="tel:+918340064486" className="inline-flex min-h-[44px] items-center rounded px-1 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300">
                +91 83400 64486
              </a>
            </div>
          </div>
          <div>
            <h3 className="text-[11px] font-black">Get the app</h3>
            <p className="mt-3 text-[11px] font-medium leading-4 text-white/60">Android distribution for verified partners. No third-party store.</p>
            <a
              href="#download"
              className="mt-3 inline-flex h-11 items-center gap-2 rounded-[12px] bg-[#067a64] px-4 text-[12px] font-black text-white transition hover:bg-[#065f4e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white min-h-[44px]"
            >
              Download for Android <Download className="h-4 w-4" aria-hidden />
            </a>
          </div>
        </div>
      </footer>
    </main>
  );
}
