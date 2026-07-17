'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@aagam/utils';
import { Bell, CheckCircle2, Command, Loader2, Search } from 'lucide-react';
import Sidebar from './Sidebar';
import PushNotificationManager from './PushNotificationManager';

interface DashboardLayoutProps {
  children: React.ReactNode;
  allowedRole: 'ADMIN' | 'RIDER' | 'CUSTOMER' | 'STORE_OWNER';
}

type SessionUser = {
  id?: string;
  role: DashboardLayoutProps['allowedRole'];
  name?: string | null;
  email?: string | null;
  avatarUrl?: string | null;
};

let cachedSession: SessionUser | null = null;
let sessionRequest: Promise<SessionUser> | null = null;

function loadSession() {
  if (!sessionRequest) {
    sessionRequest = apiClient
      .get('/auth/me')
      .then((response) => {
        cachedSession = response.data as SessionUser;
        return cachedSession;
      })
      .finally(() => {
        sessionRequest = null;
      });
  }
  return sessionRequest;
}

function homeForRole(role: string) {
  if (role === 'ADMIN') return '/admin';
  if (role === 'RIDER') return '/rider';
  if (role === 'STORE_OWNER') return '/store';
  return '/shop';
}

const notificationHrefByRole: Record<DashboardLayoutProps['allowedRole'], string> = {
  ADMIN: '/admin/notifications',
  CUSTOMER: '/shop/notifications',
  STORE_OWNER: '/store/orders',
  RIDER: '/rider',
};

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, allowedRole }) => {
  const initialSession = cachedSession;
  const [ready, setReady] = useState(initialSession?.role === allowedRole);
  const [userRole, setUserRole] = useState<string | null>(initialSession?.role || null);
  const router = useRouter();

  useEffect(() => {
    let active = true;

    const acceptSession = (user: SessionUser) => {
      if (!active) return;
      if (user.role !== allowedRole) {
        setReady(false);
        router.replace(homeForRole(user.role));
        return;
      }
      setUserRole(user.role);
      setReady(true);
      localStorage.setItem('user_name', user.name || '');
      localStorage.setItem('user_email', user.email || '');
      localStorage.setItem('user_avatar', user.avatarUrl || '');
    };

    if (cachedSession) acceptSession(cachedSession);

    loadSession()
      .then(acceptSession)
      .catch(() => {
        if (!active) return;
        cachedSession = null;
        setReady(false);
        router.replace('/login');
      });

    return () => {
      active = false;
    };
  }, [allowedRole, router]);

  if (!ready) {
    return (
      <div className="min-h-screen overflow-hidden bg-slate-950 text-white">
        <div className="absolute inset-0 enterprise-subtle-grid opacity-20" />
        <div className="relative flex min-h-screen items-center justify-center px-6">
          <div className="enterprise-card max-w-md p-8 text-center text-slate-950">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-2xl shadow-slate-950/25">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
            <p className="enterprise-kicker mx-auto w-fit">Secure session</p>
            <h1 className="mt-4 text-2xl font-black tracking-tight">Opening your workspace</h1>
            <p className="mt-2 text-sm font-semibold text-slate-500">Verifying account access once for this session.</p>
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
                {allowedRole === 'ADMIN'
                  ? 'Operations control tower'
                  : allowedRole === 'RIDER'
                    ? 'Rider live workspace'
                    : allowedRole === 'STORE_OWNER'
                      ? 'Store management workspace'
                      : 'Premium shopping workspace'}
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
              <PushNotificationManager />
              <button
                onClick={() => router.push(notificationHrefByRole[allowedRole])}
                aria-label="Open notifications"
                className="flex h-12 w-12 items-center justify-center rounded-2xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:text-teal-700"
              >
                <Bell className="h-5 w-5" />
              </button>
            </div>
          </div>
          <div className="relative">{children}</div>
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;
