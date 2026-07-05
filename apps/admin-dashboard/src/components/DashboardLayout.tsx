'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from './Sidebar';
import { Bell, CheckCircle2, Command, Loader2, Search } from 'lucide-react';

import { apiClient } from '@aagam/utils';

interface DashboardLayoutProps {
  children: React.ReactNode;
  allowedRole: 'ADMIN' | 'RIDER' | 'CUSTOMER' | 'STORE_OWNER';
}

const notificationHrefByRole: Record<DashboardLayoutProps['allowedRole'], string> = {
  ADMIN: '/admin/notifications',
  CUSTOMER: '/shop/notifications',
  STORE_OWNER: '/store/orders',
  RIDER: '/rider',
};

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, allowedRole }) => {
  const [mounted, setMounted] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const verifySession = async () => {
      console.log(`[DashboardLayout] Verifying session for role: ${allowedRole}`);
      try {
        const response = await apiClient.get('/auth/me');
        const user = response.data;
        console.log('[DashboardLayout] Session verified. User:', user);
        
        if (user.role !== allowedRole) {
          console.warn(`[DashboardLayout] Role mismatch. Expected ${allowedRole}, got ${user.role}. Redirecting...`);
          if (user.role === 'ADMIN') router.push('/admin');
          else if (user.role === 'RIDER') router.push('/rider');
          else if (user.role === 'STORE_OWNER') router.push('/store');
          else router.push('/shop');
          return;
        }

        setUserRole(user.role);
        if (typeof window !== 'undefined') {
          localStorage.setItem('user_name', user.name || '');
          localStorage.setItem('user_email', user.email || '');
          localStorage.setItem('user_avatar', user.avatarUrl || '');
        }
        setMounted(true);
      } catch (error: any) {
        console.error('[DashboardLayout] Session verification failed:', error.response?.data || error.message);
        router.push('/login');
      }
    };

    verifySession();
  }, [allowedRole, router]);

  if (!mounted) {
    return (
      <div className="min-h-screen overflow-hidden bg-slate-950 text-white">
        <div className="absolute inset-0 enterprise-subtle-grid opacity-20" />
        <div className="absolute -left-32 top-10 h-96 w-96 rounded-full bg-teal-500/20 blur-3xl" />
        <div className="absolute -right-24 bottom-0 h-96 w-96 rounded-full bg-amber-500/20 blur-3xl" />
        <div className="relative flex min-h-screen items-center justify-center px-6">
          <div className="enterprise-card max-w-md p-8 text-center text-slate-950">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-2xl shadow-slate-950/25">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
            <p className="enterprise-kicker mx-auto w-fit">Secure session</p>
            <h1 className="mt-4 text-2xl font-black tracking-tight">Preparing your command center</h1>
            <p className="mt-2 text-sm font-semibold text-slate-500">Checking role access, live data, and workspace permissions.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative flex h-screen overflow-hidden bg-slate-100 text-slate-950 text-[13px] xl:text-sm">
      <div className="pointer-events-none absolute inset-0 enterprise-subtle-grid opacity-60" />
      <div className="pointer-events-none absolute -left-24 top-0 h-96 w-96 rounded-full bg-teal-300/25 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-20 h-96 w-96 rounded-full bg-amber-200/35 blur-3xl" />
      <Sidebar role={userRole as any} />
      <main className="relative flex-1 overflow-y-auto p-3 pb-24 md:p-5 lg:pb-6">
        <div className="mx-auto max-w-[1500px]">
          <div className="mb-4 flex flex-col gap-3 rounded-[1.5rem] border border-white/75 bg-white/80 p-3 shadow-[0_20px_70px_rgba(15,23,42,0.08)] backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="enterprise-kicker">Aagam Commerce OS</p>
              <h2 className="mt-1 text-xl font-black tracking-[-0.03em] text-slate-950">
                {allowedRole === 'ADMIN' ? 'Operations control tower' : allowedRole === 'RIDER' ? 'Rider live workspace' : allowedRole === 'STORE_OWNER' ? 'Store management workspace' : 'Premium shopping workspace'}
              </h2>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              {allowedRole !== 'CUSTOMER' ? (
                <div className="hidden items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-500 md:flex">
                  <Search className="h-4 w-4" />
                  Search orders, products, stores
                  <span className="ml-5 inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[11px] text-slate-400 shadow-sm">
                    <Command className="h-3 w-3" /> K
                  </span>
                </div>
              ) : null}
              {allowedRole !== 'CUSTOMER' ? (
                <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-black text-emerald-700">
                  <CheckCircle2 className="h-4 w-4" />
                  Live systems
                </div>
              ) : null}
              <button
                onClick={() => router.push(notificationHrefByRole[allowedRole])}
                aria-label="Open notifications"
                className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:text-teal-700"
              >
                <Bell className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="relative">
          {children}
          </div>
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;
