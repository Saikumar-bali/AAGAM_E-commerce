'use client';

import Link from 'next/link';

type AagamLogoProps = {
  href?: string;
  label?: string;
  inverse?: boolean;
  compact?: boolean;
};

export default function AagamLogo({ href = '/', label = 'Commerce OS', inverse = false, compact = false }: AagamLogoProps) {
  const content = (
    <>
      <span className={`relative flex ${compact ? 'h-10 w-10' : 'h-12 w-12'} shrink-0 items-center justify-center overflow-hidden rounded-2xl shadow-xl ${inverse ? 'bg-white text-slate-950 shadow-teal-950/30' : 'bg-slate-950 text-white shadow-slate-950/20'}`}>
        <span className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(45,212,191,0.9),transparent_32%),radial-gradient(circle_at_75%_85%,rgba(245,158,11,0.9),transparent_36%)]" />
        <svg viewBox="0 0 48 48" aria-hidden="true" className="relative h-7 w-7"><path d="M8 38 21 8h7l13 30h-8l-2.5-7H18.5L16 38H8Zm13-14h7l-3.5-9.5L21 24Z" fill="currentColor"/><path d="M35 9h5v15h-5z" fill="#5eead4"/><circle cx="37.5" cy="31.5" r="3" fill="#fbbf24"/></svg>
      </span>
      <span className="min-w-0">
        <span className={`block font-black tracking-[-0.06em] ${compact ? 'text-xl' : 'text-2xl'} ${inverse ? 'text-white' : 'text-slate-950'}`}>Aagam</span>
        <span className={`block text-[10px] font-black uppercase tracking-[0.26em] ${inverse ? 'text-teal-200' : 'text-teal-700'}`}>{label}</span>
      </span>
    </>
  );

  return (
    <Link href={href} className="inline-flex items-center gap-3">
      {content}
    </Link>
  );
}
