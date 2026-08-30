import Link from 'next/link';
import { ArrowRight, CheckCircle2, Download, PackageCheck, ShieldCheck, Store, Truck, FileText, Clock3, Users, Smartphone, ExternalLink, RefreshCw } from 'lucide-react';
import AagamLogo from '@/components/AagamLogo';

type ReleaseAsset = {
  name: string;
  browser_download_url: string;
  size: number;
  download_count: number;
};

type GithubRelease = {
  tag_name: string;
  name: string | null;
  html_url: string;
  published_at: string | null;
  prerelease: boolean;
  assets: ReleaseAsset[];
};

const FALLBACK_RELEASE: GithubRelease = {
  tag_name: 'android-1215-30869f4',
  name: 'AAGAM Android 1215',
  html_url: 'https://github.com/Saikumar-bali/AAGAM_E-commerce/releases/tag/android-1215-30869f4',
  published_at: new Date().toISOString(),
  prerelease: false,
  assets: [
    {
      name: 'aagam-partners-1215-30869f4.apk',
      browser_download_url: 'https://github.com/Saikumar-bali/AAGAM_E-commerce/releases/download/android-1215-30869f4/aagam-partners-1215-30869f4.apk',
      size: 0,
      download_count: 0,
    },
  ],
};

async function getLatestPartnersRelease(): Promise<{ release: GithubRelease; asset: ReleaseAsset | null }> {
  try {
    // Prefer stable latest; fall back to recent list if needed
    const latestRes = await fetch('https://api.github.com/repos/Saikumar-bali/AAGAM_E-commerce/releases/latest', {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Aagaam-Partners-Page' },
      next: { revalidate: 3600 },
    });
    if (latestRes.ok) {
      const latest: GithubRelease = await latestRes.json();
      if (latest.tag_name?.startsWith('android-') && !latest.tag_name.startsWith('android-preview-')) {
        const asset = latest.assets.find((a) => a.name.includes('partners') && a.name.endsWith('.apk')) || null;
        if (asset) return { release: latest, asset };
      }
    }

    // Fallback: scan recent releases for latest stable android partners asset
    const listRes = await fetch('https://api.github.com/repos/Saikumar-bali/AAGAM_E-commerce/releases?per_page=20', {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'Aagaam-Partners-Page' },
      next: { revalidate: 3600 },
    });
    if (listRes.ok) {
      const list: GithubRelease[] = await listRes.json();
      const stable = list.find(
        (r) => r.tag_name?.startsWith('android-') && !r.prerelease && !r.tag_name.startsWith('android-preview-') && r.assets.some((a) => a.name.includes('partners') && a.name.endsWith('.apk')),
      );
      if (stable) {
        const asset = stable.assets.find((a) => a.name.includes('partners') && a.name.endsWith('.apk')) || null;
        return { release: stable, asset };
      }
      const anyPartners = list.find((r) => r.assets.some((a) => a.name.includes('partners') && a.name.endsWith('.apk')));
      if (anyPartners) {
        const asset = anyPartners.assets.find((a) => a.name.includes('partners') && a.name.endsWith('.apk')) || null;
        return { release: anyPartners, asset };
      }
    }
  } catch {
    // ignore and use fallback
  }
  return { release: FALLBACK_RELEASE, asset: FALLBACK_RELEASE.assets[0] };
}

function formatBytes(bytes: number) {
  if (!bytes || bytes <= 0) return 'APK';
  const units = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}

function formatDate(iso: string | null) {
  if (!iso) return 'Recently';
  try {
    return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return iso;
  }
}

export default async function PartnerPage() {
  const { release, asset } = await getLatestPartnersRelease();
  const downloadUrl = asset?.browser_download_url || FALLBACK_RELEASE.assets[0].browser_download_url;
  const tag = release.tag_name;
  const releaseUrl = release.html_url;
  const published = formatDate(release.published_at);
  const sizeLabel = asset ? formatBytes(asset.size) : 'APK';

  return (
    <main className="min-h-screen bg-[#f7faf8] text-slate-900">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#063b3a] text-white shadow-sm">
        <div className="mx-auto flex h-[64px] max-w-[1448px] items-center gap-4 px-4 sm:px-5 lg:px-10">
          <Link href="/" className="mr-2 shrink-0">
            <AagamLogo inverse compact label="Fresh, quality & trust" />
          </Link>
          <nav className="hidden items-center gap-6 text-[12px] font-bold text-white/90 lg:flex">
            <a href="#roles" className="hover:text-emerald-300">Roles</a>
            <a href="#download" className="hover:text-emerald-300">Download</a>
            <a href="#how" className="hover:text-emerald-300">How it works</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/" className="hidden rounded-lg border border-white/20 px-4 py-2 text-xs font-bold hover:bg-white/10 sm:inline-flex">Back to home</Link>
            <a href="#download" className="inline-flex items-center gap-2 rounded-lg bg-[#20bfa6] px-5 py-2.5 text-xs font-black text-white shadow hover:bg-[#24cdb1]">
              <Download className="h-4 w-4" /> Get Partners APK
            </a>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden bg-[#073f3d] text-white">
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,47,46,.96)_0%,rgba(3,47,46,.85)_45%,rgba(3,47,46,.92)_100%)]" />
        <div className="absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.06)_1px,transparent_1px)] [background-size:64px_64px]" />
        <div className="relative mx-auto max-w-[1448px] px-5 py-10 sm:py-14 lg:px-10">
          <div className="grid items-center gap-8 lg:grid-cols-[1.15fr_.85fr]">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-300/30 bg-emerald-400/10 px-3 py-1 text-[11px] font-black text-emerald-200">
                <RefreshCw className="h-3.5 w-3.5" /> Auto-updated from GitHub Releases
              </span>
              <h1 className="mt-4 font-serif text-3xl font-bold leading-[1.05] sm:text-4xl lg:text-[42px]">Grow with <span className="text-[#20c9a6]">Aagaam</span></h1>
              <p className="mt-3 max-w-[620px] text-sm font-semibold leading-6 text-white/85">
                Partner with us as a verified <span className="text-white">Store Owner</span> or <span className="text-white">Delivery Rider</span>. Listed stores and riders are approved by Aagaam Admin – download the latest Partners APK and apply in minutes.
              </p>
              <div className="mt-6 flex flex-wrap gap-3">
                <a href="#download" className="inline-flex items-center gap-2 rounded-xl bg-[#20bfa6] px-6 py-3 text-sm font-black text-[#063b3a] shadow hover:bg-[#24cdb1]">
                  <Download className="h-4 w-4" /> Download Partners APK <span className="rounded-full bg-white px-2 py-0.5 text-[11px] text-[#063b3a]">{sizeLabel}</span>
                </a>
                <a href="#roles" className="inline-flex items-center gap-2 rounded-xl border border-white/30 px-6 py-3 text-sm font-black text-white backdrop-blur hover:bg-white/10">
                  Explore roles <ArrowRight className="h-4 w-4" />
                </a>
              </div>
              <div className="mt-6 flex flex-wrap gap-2 text-xs font-bold text-white/70">
                <span className="inline-flex items-center gap-1.5"><ShieldCheck className="h-4 w-4 text-emerald-300" /> Admin-approved onboarding</span>
                <span className="inline-flex items-center gap-1.5"><PackageCheck className="h-4 w-4 text-emerald-300" /> No fees to apply</span>
                <span className="inline-flex items-center gap-1.5"><Clock3 className="h-4 w-4 text-emerald-300" /> Review in 24–48h</span>
              </div>
            </div>
            <div className="rounded-[20px] border border-white/15 bg-white/10 p-5 backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#20bfa6] text-white"><Smartphone className="h-5 w-5" /></span>
                <div>
                  <p className="text-xs font-black uppercase tracking-[0.12em] text-emerald-200">Latest APK</p>
                  <p className="text-sm font-black">{tag}</p>
                </div>
                <span className="ml-auto rounded-full bg-emerald-500/20 px-2.5 py-1 text-[11px] font-black text-emerald-200">{published}</span>
              </div>
              <div className="mt-4 grid gap-2 rounded-xl bg-white p-4 text-slate-900 shadow">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-black text-slate-500">FILE</p>
                  <a href={releaseUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-black text-[#087765]">
                    View release <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <p className="truncate font-mono text-sm font-bold">{asset?.name || 'aagam-partners.apk'}</p>
                <p className="text-xs font-semibold text-slate-500">
                  Auto-sync: <span className="font-mono text-[11px] text-slate-700">https://api.github.com/repos/Saikumar-bali/AAGAM_E-commerce/releases/latest</span> →{' '}
                  <span className="truncate font-mono text-[11px] text-slate-700">{downloadUrl}</span>
                </p>
                <div className="mt-1 flex items-center gap-2 text-xs font-bold text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" /> Verified build • Android 12–15 • {sizeLabel}
                </div>
              </div>
              <a
                href={downloadUrl}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-[#087765] px-5 py-3 text-sm font-black text-white shadow hover:bg-[#065f4f]"
              >
                <Download className="h-4 w-4" /> Download {sizeLabel !== 'APK' ? `(${sizeLabel})` : ''}
              </a>
              <p className="mt-2 text-center text-[11px] font-semibold text-white/70">Tapping download fetches directly from GitHub Releases. No manual update needed.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="roles" className="mx-auto max-w-[1448px] px-5 py-8 lg:px-10">
        <div className="text-center">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[#087765]">Choose your role</p>
          <h2 className="mt-2 text-2xl font-black tracking-tight">Stores & Riders — one APK, two journeys</h2>
          <p className="mx-auto mt-2 max-w-2xl text-sm font-semibold leading-6 text-slate-600">Download the same Partners APK. Inside the app you select Store or Rider and complete the guided application. Aagaam Admin reviews and approves.</p>
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-2">
          <article className="relative flex flex-col overflow-hidden rounded-[20px] border border-emerald-100 bg-white p-6 shadow-sm">
            <div className="absolute right-0 top-0 h-24 w-24 rounded-bl-[32px] bg-emerald-50" />
            <div className="relative flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#087765] text-white"><Store className="h-6 w-6" /></span>
              <div>
                <h3 className="text-lg font-black">Store Owner</h3>
                <p className="text-xs font-bold uppercase tracking-[0.1em] text-emerald-700">Local partner stores</p>
              </div>
              <span className="ml-auto rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-black text-amber-800">Earn per order</span>
            </div>
            <p className="relative mt-3 text-sm font-semibold leading-6 text-slate-600">List your shop, manage inventory, accept orders, and hand over to verified riders. Best for grocery, dairy, and kirana owners.</p>
            <ul className="relative mt-4 grid gap-2">
              {[
                'Zero listing fee — pay only when you sell',
                'Real-time order and inventory dashboard',
                'Pickup-verified payouts & daily settlements',
                'Dedicated support & training',
              ].map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> {item}
                </li>
              ))}
            </ul>
            <div className="relative mt-5 rounded-xl bg-[#f5f7f6] p-4">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Requirements</p>
              <ul className="mt-2 grid gap-1 text-xs font-semibold text-slate-600">
                <li>• Valid shop address + geo-location</li>
                <li>• Government ID + shop proof (upload in APK)</li>
                <li>• Android phone to run Partners APK</li>
              </ul>
            </div>
            <div className="relative mt-5 flex flex-wrap gap-2">
              <a href={downloadUrl} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#087765] px-5 py-3 text-sm font-black text-white hover:bg-[#065f4f]">
                <Download className="h-4 w-4" /> Download APK
              </a>
              <a href={downloadUrl} className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-200 bg-white px-5 py-3 text-sm font-black text-[#087765] hover:bg-emerald-50">
                <FileText className="h-4 w-4" /> Apply as Store
              </a>
            </div>
            <p className="relative mt-2 text-center text-[11px] font-semibold text-slate-500">Inside APK: Choose “I own a store” → complete store details → submit for admin review.</p>
          </article>

          <article className="relative flex flex-col overflow-hidden rounded-[20px] border border-sky-100 bg-white p-6 shadow-sm">
            <div className="absolute right-0 top-0 h-24 w-24 rounded-bl-[32px] bg-sky-50" />
            <div className="relative flex items-center gap-3">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[#0e7490] text-white"><Truck className="h-6 w-6" /></span>
              <div>
                <h3 className="text-lg font-black">Delivery Rider</h3>
                <p className="text-xs font-bold uppercase tracking-[0.1em] text-sky-700">On-demand fleet</p>
              </div>
              <span className="ml-auto rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-black text-emerald-800">Flexible payouts</span>
            </div>
            <p className="relative mt-3 text-sm font-semibold leading-6 text-slate-600">Pick up from partner stores and deliver to customers. Work when you want, earn per delivery with incentives.</p>
            <ul className="relative mt-4 grid gap-2">
              {[
                'Daily payouts + distance & performance bonuses',
                'In-app navigation, COD handling, proof of delivery',
                'Flexible shifts — full-time or part-time',
                'Rider safety & training support',
              ].map((item) => (
                <li key={item} className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-sky-600" /> {item}
                </li>
              ))}
            </ul>
            <div className="relative mt-5 rounded-xl bg-[#f5f7f6] p-4">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Requirements</p>
              <ul className="mt-2 grid gap-1 text-xs font-semibold text-slate-600">
                <li>• Two-wheeler + valid driving licence</li>
                <li>• Govt ID + address proof (upload in APK)</li>
                <li>• Android phone for Partners APK</li>
              </ul>
            </div>
            <div className="relative mt-5 flex flex-wrap gap-2">
              <a href={downloadUrl} className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#0e7490] px-5 py-3 text-sm font-black text-white hover:bg-[#0b5e74]">
                <Download className="h-4 w-4" /> Download APK
              </a>
              <a href={downloadUrl} className="inline-flex items-center justify-center gap-2 rounded-xl border border-sky-200 bg-white px-5 py-3 text-sm font-black text-[#0e7490] hover:bg-sky-50">
                <FileText className="h-4 w-4" /> Apply as Rider
              </a>
            </div>
            <p className="relative mt-2 text-center text-[11px] font-semibold text-slate-500">Inside APK: Choose “I want to deliver” → complete rider details → submit for admin review.</p>
          </article>
        </div>
      </section>

      <section id="download" className="mx-auto max-w-[1448px] px-5 pb-8 lg:px-10">
        <div className="grid gap-6 rounded-[20px] border border-amber-100 bg-[linear-gradient(135deg,#fffbeb,#ffffff)] p-6 lg:grid-cols-[1.1fr_.9fr]">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-amber-700">Auto-updating APK</p>
            <h2 className="mt-2 text-xl font-black">Always the latest Partners build from GitHub</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              The download button above is resolved at request time from <span className="font-mono text-xs text-slate-700">api.github.com/repos/Saikumar-bali/AAGAM_E-commerce/releases/latest</span>. When a new tag like{' '}
              <span className="font-mono text-xs text-[#087765]">{tag}</span> is published, the page serves{' '}
              <span className="font-mono text-xs text-[#087765]">{asset?.name}</span> without redeploying Aagaam web. All releases are also browsable at the tag page.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <a href={downloadUrl} className="inline-flex items-center gap-2 rounded-xl bg-[#063b3a] px-5 py-3 text-sm font-black text-white hover:bg-[#041f20]">
                <Download className="h-4 w-4" /> Direct download
              </a>
              <a href={releaseUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-800 hover:bg-slate-50">
                View release on GitHub <ExternalLink className="h-4 w-4" />
              </a>
              <a href="https://github.com/Saikumar-bali/AAGAM_E-commerce/releases" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-600 hover:bg-slate-50">
                All releases
              </a>
            </div>
            <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-black text-amber-900">How to install</p>
              <ol className="mt-1 grid gap-1 text-xs font-semibold text-amber-800">
                <li>1. Tap Download → allow “Install unknown apps” if prompted</li>
                <li>2. Open APK → Install → Open Aagaam Partners</li>
                <li>3. Choose Store or Rider → Complete application → Submit</li>
                <li>4. Track status in app; Admin approval unlocks workspace</li>
              </ol>
            </div>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Current build</p>
            <div className="mt-3 grid gap-3">
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <span className="text-xs font-bold text-slate-500">Tag</span>
                <span className="font-mono text-sm font-black text-[#063b3a]">{tag}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <span className="text-xs font-bold text-slate-500">Published</span>
                <span className="text-sm font-bold">{published}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <span className="text-xs font-bold text-slate-500">Asset</span>
                <span className="truncate font-mono text-xs font-bold">{asset?.name}</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <span className="text-xs font-bold text-slate-500">Size</span>
                <span className="text-sm font-bold">{sizeLabel}</span>
              </div>
              <a href={downloadUrl} className="mt-1 inline-flex items-center justify-center gap-2 rounded-xl bg-[#20bfa6] px-5 py-3 text-sm font-black text-[#063b3a] hover:bg-[#24cdb1]">
                <Smartphone className="h-4 w-4" /> Install Partners APK
              </a>
              <p className="text-center text-[11px] font-semibold text-slate-500">On next release, refresh this page — link updates automatically via GitHub API.</p>
            </div>
          </div>
        </div>
      </section>

      <section id="how" className="mx-auto max-w-[1448px] px-5 pb-8 lg:px-10">
        <div className="rounded-[20px] bg-[#063b3a] p-6 text-white lg:p-8">
          <div className="grid gap-8 lg:grid-cols-[.9fr_1.1fr]">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-300">How it works</p>
              <h2 className="mt-2 text-2xl font-black leading-tight">From download to approved partner</h2>
              <p className="mt-2 text-sm font-semibold leading-6 text-white/80">
                Admin approval is required — that message you saw means your application is reviewed by Aagaam. The APK is the workspace; approval unlocks orders or deliveries.
              </p>
              <div className="mt-6 grid gap-3">
                {[
                  { step: '01', title: 'Download & install', desc: 'Get latest APK above — auto-updated from GitHub Releases tag (e.g. android-1215-30869f4).', icon: Download },
                  { step: '02', title: 'Apply in app', desc: 'Open Partners → pick Store or Rider → fill details, upload docs → Submit.', icon: FileText },
                  { step: '03', title: 'Admin review', desc: 'Aagaam verifies documents, store location or rider KYC. Track status live in app.', icon: ShieldCheck },
                  { step: '04', title: 'Go live', desc: 'Once approved, access orders (Store) or delivery pool (Rider) and start earning.', icon: CheckCircle2 },
                ].map((s) => (
                  <div key={s.step} className="flex gap-3 rounded-xl border border-white/10 bg-white/5 p-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white/10 text-sm font-black">{s.step}</span>
                    <div>
                      <p className="text-sm font-black">{s.title}</p>
                      <p className="text-xs font-semibold leading-5 text-white/70">{s.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid gap-4">
              <div className="rounded-2xl bg-white p-5 text-slate-900">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-[#087765]" />
                  <p className="text-sm font-black">What you get after approval</p>
                </div>
                <ul className="mt-3 grid gap-2">
                  {[
                    'Store: Order manager, catalogue & payout dashboard',
                    'Rider: Delivery jobs, route, COD & earnings',
                    'In-app support + training resources',
                    'Secure login — no toast, direct to workspace',
                  ].map((t) => (
                    <li key={t} className="flex items-start gap-2 text-sm font-semibold text-slate-700">
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> {t}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur">
                <p className="text-sm font-black text-white">Need help?</p>
                <p className="mt-1 text-sm font-semibold leading-6 text-white/80">Questions about documents or status? Contact support — your application number is shown in the Partners APK after submission.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href="/" className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-black text-[#063b3a]">
                    Back to shop <ArrowRight className="h-4 w-4" />
                  </Link>
                  <a href="tel:+918340064486" className="inline-flex items-center gap-2 rounded-xl border border-white/20 px-4 py-2.5 text-sm font-bold text-white hover:bg-white/10">
                    Call +91 83400 64486
                  </a>
                </div>
              </div>
              <div className="rounded-2xl bg-emerald-50 p-4">
                <p className="text-xs font-black text-emerald-900">Automation note for maintainers</p>
                <p className="mt-1 font-mono text-xs font-semibold leading-5 text-emerald-800">
                  Page fetches <span className="text-emerald-900">/releases/latest</span> then falls back to <span className="text-emerald-900">/releases?per_page=20</span> filtered by <span className="text-emerald-900">tag ^ android- & !preview & asset *partners*.apk</span>. Revalidate 3600s. Fallback tag{' '}
                  {FALLBACK_RELEASE.tag_name} ensures page never 404s.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white py-6 text-center text-xs font-semibold text-slate-500">
        <div className="mx-auto max-w-[1448px] px-5">© {new Date().getFullYear()} Aagaam Retail Pvt. Ltd. • Partner onboarding requires admin approval — download the latest APK to start your application.</div>
      </footer>
    </main>
  );
}
