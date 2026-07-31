'use client';

import Image from 'next/image';
import Link from 'next/link';

type AagamLogoProps = {
  href?: string;
  label?: string;
  inverse?: boolean;
  compact?: boolean;
};

export default function AagamLogo({
  href = '/',
  label = 'fresh, quality and trust',
  inverse = false,
  compact = false,
}: AagamLogoProps) {
  return (
    <Link href={href} className="inline-flex min-w-0 items-center gap-3" aria-label="Aagaam home">
      <span className={`flex ${compact ? 'h-10 w-10' : 'h-12 w-12'} shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white p-1 shadow-xl ${inverse ? 'shadow-black/30' : 'border border-slate-100 shadow-slate-950/15'}`}>
        <Image src="/brand/aagam-mark.png" width={96} height={96} alt="Aagaam" className="h-full w-full object-contain" priority />
      </span>
      <span className="min-w-0">
        <span className={`block font-black tracking-[-0.05em] ${compact ? 'text-xl' : 'text-2xl'} ${inverse ? 'text-white' : 'text-slate-950'}`}>Aagaam</span>
        <span className={`block truncate text-[9px] font-bold uppercase tracking-[0.16em] ${inverse ? 'text-teal-200' : 'text-teal-700'}`}>{label}</span>
      </span>
    </Link>
  );
}
