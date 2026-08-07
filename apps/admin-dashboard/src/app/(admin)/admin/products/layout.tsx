'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Package, Scale } from 'lucide-react';

export default function AdminProductsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const onWeights = pathname.startsWith('/admin/products/routing-weights');

  return (
    <>
      {children}
      <Link
        href={onWeights ? '/admin/products' : '/admin/products/routing-weights'}
        aria-label={onWeights ? 'Back to product catalog' : 'Maintain product routing weights'}
        className="fixed bottom-24 right-4 z-[70] inline-flex min-h-12 items-center gap-2 rounded-2xl border border-white/70 bg-slate-950 px-4 py-3 text-sm font-black text-white shadow-2xl shadow-slate-950/25 transition hover:-translate-y-0.5 hover:bg-emerald-700 lg:bottom-6 lg:right-6"
      >
        {onWeights ? <Package className="h-4 w-4" /> : <Scale className="h-4 w-4" />}
        {onWeights ? 'Product catalog' : 'Routing weights'}
      </Link>
    </>
  );
}
