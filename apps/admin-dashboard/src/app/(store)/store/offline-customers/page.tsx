'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function StoreOfflineCustomersPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/store/settings?tab=recycle-bin');
  }, [router]);

  return (
    <div className="flex h-64 items-center justify-center gap-2 text-sm text-slate-500">
      <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
      <span>Redirecting to Recycle Bin in Store Settings...</span>
    </div>
  );
}
