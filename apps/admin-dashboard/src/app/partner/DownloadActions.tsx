'use client';

import { useEffect, useRef, useState } from 'react';
import { Download, FileCheck2, HelpCircle, ShieldCheck, Smartphone, X } from 'lucide-react';

type DownloadActionsProps = {
  downloadUrl: string | null;
  versionName?: string | null;
  publishedAt?: string | null;
};

function formatPublishedAt(value?: string | null) {
  if (!value) return null;
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    return new Intl.DateTimeFormat('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(d);
  } catch {
    return null;
  }
}

export default function DownloadActions({ downloadUrl, versionName, publishedAt }: DownloadActionsProps) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const publishedLabel = formatPublishedAt(publishedAt);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    // focus close button when opened
    requestAnimationFrame(() => closeRef.current?.focus());
    // lock scroll
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);

  const handleDownload = () => {
    if (!downloadUrl) return;
    // Branded direct distribution — never expose raw URL as text.
    window.location.href = downloadUrl;
  };

  const hasBuild = Boolean(downloadUrl && versionName);

  return (
    <div className="flex flex-col gap-3">
      {/* version meta — branded only */}
      <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold">
        {versionName ? (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#063b3a]/10 bg-white px-3 py-1.5 text-[#063b3a]">
            <span className="h-2 w-2 rounded-full bg-[#078b70]" aria-hidden />
            {versionName}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-amber-900">
            Verified build preparing
          </span>
        )}
        {publishedLabel ? (
          <span className="inline-flex items-center rounded-full bg-[#063b3a] px-3 py-1.5 text-white">
            Updated {publishedLabel}
          </span>
        ) : null}
        <span className="inline-flex items-center gap-1.5 text-[11px] font-black tracking-wide text-[#475a56]" translate="no">
          <ShieldCheck className="h-3.5 w-3.5 text-[#078b70]" aria-hidden /> Secure AAGAM Distribution • Verified Build
        </span>
      </div>

      {/* Primary CTA — 44px height, window.location.href only */}
      <button
        type="button"
        onClick={handleDownload}
        disabled={!downloadUrl}
        aria-label={downloadUrl ? `Download AAGAM Partners version ${versionName || ''} for Android` : 'Partner build currently unavailable'}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[12px] bg-[#067a64] px-6 text-[14px] font-black text-white shadow-[0_8px_20px_rgba(6,122,100,0.28)] transition hover:bg-[#065f4e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#063b3a] focus-visible:ring-offset-2 focus-visible:ring-offset-white disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none min-h-[44px]"
      >
        <Download className="h-4 w-4 shrink-0" aria-hidden />
        Download for Android
      </button>

      {!hasBuild ? (
        <p className="text-[12px] font-semibold leading-5 text-[#475a56]" role="status">
          A verified Android build is being prepared for this release. Please check back shortly or contact support for assistance.
        </p>
      ) : (
        <p className="text-[11px] font-semibold leading-4 text-[#5a6e69]">
          Direct AAGAM distribution for verified Store and Delivery partners. No third-party store required.
        </p>
      )}

      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[12px] border border-[#063b3a]/15 bg-white px-5 text-[13px] font-bold text-[#063b3a] transition hover:bg-[#f1f5f4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#067a64] focus-visible:ring-offset-2"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="how-to-install-drawer"
      >
        <HelpCircle className="h-4 w-4 text-[#078b70]" aria-hidden />
        How to install
      </button>

      {/* Drawer — accessible dialog */}
      {open ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center overscroll-contain sm:items-center sm:p-6">
          <button
            type="button"
            aria-label="Close how to install"
            onClick={() => {
              setOpen(false);
              triggerRef.current?.focus();
            }}
            className="absolute inset-0 bg-[#063b3a]/60 backdrop-blur-[2px] touch-manipulation"
          />
          <div
            id="how-to-install-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-title"
            className="relative flex max-h-[86vh] w-full max-w-[560px] flex-col overflow-hidden overscroll-contain rounded-t-[20px] bg-white shadow-[0_24px_64px_rgba(6,59,58,0.28)] sm:rounded-[20px]"
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4 sm:px-6">
              <div className="flex items-center gap-3">
                <span className="grid h-10 w-10 place-items-center rounded-full bg-[#063b3a] text-white">
                  <Smartphone className="h-5 w-5" aria-hidden />
                </span>
                <div>
                  <h3 id="install-title" className="text-[14px] font-black tracking-tight text-[#063b3a]">
                    How to install on Android
                  </h3>
                  <p className="text-[12px] font-semibold text-[#5a6e69]">Takes about 30 seconds</p>
                </div>
              </div>
              <button
                ref={closeRef}
                type="button"
                onClick={() => {
                  setOpen(false);
                  triggerRef.current?.focus();
                }}
                className="grid h-11 w-11 place-items-center rounded-full border border-slate-200 bg-white text-[#063b3a] transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#067a64]"
                aria-label="Close"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-auto overscroll-contain px-5 py-5 sm:px-6" style={{ overscrollBehavior: 'contain' }}>
              <ol className="space-y-3">
                {[
                  {
                    title: 'Tap Download for Android',
                    copy: 'Use the verified AAGAM button above. Your download starts immediately — no store login needed.',
                  },
                  {
                    title: 'Allow install from this source',
                    copy: 'When prompted, tap Settings → Allow from this source, then return to complete the install.',
                  },
                  {
                    title: 'Open and sign in',
                    copy: 'Open AAGAM Partners, sign in with your registered partner number, and you are ready to operate.',
                  },
                ].map((step, idx) => (
                  <li key={step.title} className="flex gap-3 rounded-[14px] border border-[#e6ecea] bg-[#f7f8f7] p-3.5">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#063b3a] text-[12px] font-black text-white">
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <h4 className="text-[13px] font-black text-[#16231f]">{step.title}</h4>
                      <p className="mt-1 text-[12px] font-medium leading-5 text-[#475a56]">{step.copy}</p>
                    </div>
                  </li>
                ))}
              </ol>

              <div className="mt-5 flex items-start gap-3 rounded-[14px] border border-emerald-100 bg-emerald-50 p-3.5">
                <FileCheck2 className="mt-0.5 h-5 w-5 shrink-0 text-[#067a64]" aria-hidden />
                <div>
                  <p className="text-[12px] font-black text-[#063b3a]">Verified & secure</p>
                  <p className="mt-1 text-[12px] font-medium leading-5 text-[#3b4f4b]">
                    Every build is signed and distributed directly by AAGAM. You will never be asked to enter payment details to install.
                  </p>
                </div>
              </div>

              <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                <button
                  type="button"
                  onClick={handleDownload}
                  disabled={!downloadUrl}
                  className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-[12px] bg-[#067a64] px-5 text-[14px] font-black text-white transition hover:bg-[#065f4e] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#063b3a] disabled:opacity-50 min-h-[44px]"
                >
                  <Download className="h-4 w-4" aria-hidden />
                  Download for Android
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    triggerRef.current?.focus();
                  }}
                  className="inline-flex h-11 items-center justify-center rounded-[12px] border border-slate-200 bg-white px-5 text-[13px] font-bold text-[#063b3a] hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#067a64] min-h-[44px]"
                >
                  Got it
                </button>
              </div>

              <p className="mt-4 text-center text-[11px] font-semibold text-[#6b7a77]">
                Need help? Contact partner support from your approved store profile.
              </p>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
