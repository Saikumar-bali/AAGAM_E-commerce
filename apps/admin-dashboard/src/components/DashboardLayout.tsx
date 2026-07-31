'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@aagam/utils';
import { Command, Loader2, Search, X } from 'lucide-react';
import Sidebar from './Sidebar';
import PushNotificationManager from './PushNotificationManager';
import AagamLogo from './AagamLogo';

interface DashboardLayoutProps {
  children: React.ReactNode;
  allowedRole: 'ADMIN' | 'RIDER' | 'CUSTOMER' | 'STORE_OWNER';
}

type SessionUser = { id?: string; role: DashboardLayoutProps['allowedRole']; roles?: string[]; name?: string | null; email?: string | null; avatarUrl?: string | null };
let cachedSession: SessionUser | null = null;
let sessionRequest: Promise<SessionUser> | null = null;

function loadSession() {
  if (!sessionRequest) {
    sessionRequest = apiClient.get('/auth/me').then((response) => {
      cachedSession = response.data as SessionUser;
      return cachedSession;
    }).finally(() => { sessionRequest = null; });
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
  STORE_OWNER: '/store/notifications',
  RIDER: '/rider/notifications',
};

const titleByRole: Record<Exclude<DashboardLayoutProps['allowedRole'], 'CUSTOMER'>, string> = {
  ADMIN: 'Operations overview',
  RIDER: 'Delivery workspace',
  STORE_OWNER: 'Store workspace',
};

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, allowedRole }) => {
  const initialSession = cachedSession;
  const initialRoles = initialSession ? (Array.isArray(initialSession.roles) ? initialSession.roles : [initialSession.role]) : [];
  const [ready, setReady] = useState(initialRoles.includes(allowedRole));
  const [userRole, setUserRole] = useState<string | null>(initialSession?.role || null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let active = true;
    const acceptSession = (user: SessionUser) => {
      if (!active) return;
      const userRoles = Array.isArray(user.roles) ? user.roles : [user.role];
      if (!userRoles.includes(allowedRole)) {
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
    loadSession().then(acceptSession).catch(() => {
      if (!active) return;
      cachedSession = null;
      setReady(false);
      router.replace(`/login?returnTo=${encodeURIComponent(window.location.pathname + window.location.search)}`);
    });
    return () => { active = false; };
  }, [allowedRole, router]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setSearchOpen(true);
      }
      if (event.key === 'Escape') setSearchOpen(false);
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);

  useEffect(() => {
    if (!searchOpen || searchQuery.trim().length < 2) {
      setSearchResults([]);
      return;
    }
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const response = await apiClient.get('/search/global', { params: { q: searchQuery.trim() } });
        setSearchResults(response.data?.results || []);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => window.clearTimeout(timer);
  }, [searchOpen, searchQuery]);

  if (!ready) {
    return (
      <div className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
        <div className="absolute inset-0 enterprise-subtle-grid opacity-20" />
        <div className="relative flex min-h-screen items-center justify-center px-6">
          <div className="enterprise-card max-w-md p-8 text-center text-slate-950">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-2xl shadow-slate-950/25"><Loader2 className="h-6 w-6 animate-spin" /></div>
            <p className="enterprise-kicker mx-auto w-fit">Secure session</p>
            <h1 className="mt-4 text-2xl font-black tracking-tight">Opening your workspace</h1>
          </div>
        </div>
      </div>
    );
  }

  const showOperationsHeader = allowedRole !== 'CUSTOMER';
  const openNotifications = () => router.push(notificationHrefByRole[allowedRole]);

  return (
    <div className="relative flex h-screen overflow-hidden bg-slate-100 text-[13px] text-slate-950 xl:text-sm">
      <div className="pointer-events-none absolute inset-0 enterprise-subtle-grid opacity-60" />
      <div className="pointer-events-none absolute -left-24 top-0 h-96 w-96 rounded-full bg-teal-300/25 blur-3xl" />
      <div className="pointer-events-none absolute right-0 top-20 h-96 w-96 rounded-full bg-amber-200/35 blur-3xl" />
      <Sidebar role={userRole as any} />
      <main className="relative flex-1 overflow-y-auto p-3 pb-24 md:p-5 lg:pb-6">
        <div className="mx-auto max-w-[1500px]">
          {showOperationsHeader ? (
            <header className="mb-4 rounded-[1.35rem] border border-white/80 bg-white/88 p-3 shadow-[0_18px_55px_rgba(15,23,42,0.08)] backdrop-blur-xl sm:p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0 lg:hidden"><AagamLogo href={homeForRole(allowedRole)} compact label={allowedRole === 'ADMIN' ? 'Commerce operations' : 'Partner operations'} /></div>
                <div className="hidden min-w-0 lg:block">
                  <p className="enterprise-kicker">Aagaam Commerce</p>
                  <p className="mt-1 text-xl font-black tracking-[-0.03em] text-slate-950">{titleByRole[allowedRole as Exclude<DashboardLayoutProps['allowedRole'], 'CUSTOMER'>]}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button onClick={() => setSearchOpen(true)} aria-label="Open global search" className="flex h-10 w-10 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-slate-600 transition hover:border-teal-300 hover:text-teal-700 sm:h-12 sm:w-12 md:hidden"><Search className="h-5 w-5" /></button>
                  <button onClick={() => setSearchOpen(true)} className="hidden items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-500 transition hover:border-teal-300 hover:text-teal-700 md:flex"><Search className="h-4 w-4" />Search workspace<span className="ml-3 inline-flex items-center gap-1 rounded-lg bg-white px-2 py-1 text-[11px] text-slate-400 shadow-sm"><Command className="h-3 w-3" /> K</span></button>
                  <PushNotificationManager onOpen={openNotifications} compact />
                </div>
              </div>
            </header>
          ) : null}
          <div className="relative">{children}</div>
        </div>
      </main>
      {searchOpen && showOperationsHeader ? (
        <div className="fixed inset-0 z-[80] flex items-start justify-center bg-slate-950/55 p-4 pt-[9vh] backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Global search" onMouseDown={(event) => { if (event.target === event.currentTarget) setSearchOpen(false); }}>
          <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-white/20 bg-white shadow-2xl">
            <div className="flex items-center gap-3 border-b border-slate-100 p-4"><Search className="h-5 w-5 text-teal-700" /><input autoFocus value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={allowedRole === 'ADMIN' ? 'Search orders, products, stores or riders…' : 'Search your workspace…'} className="min-w-0 flex-1 bg-transparent text-base font-bold outline-none" />{searching ? <Loader2 className="h-5 w-5 animate-spin text-teal-700" /> : <button onClick={() => setSearchOpen(false)} aria-label="Close global search"><X className="h-5 w-5" /></button>}</div>
            <div className="max-h-[60vh] overflow-y-auto p-2">{searchQuery.trim().length < 2 ? <p className="p-6 text-center font-semibold text-slate-500">Enter at least two characters.</p> : !searching && searchResults.length === 0 ? <p className="p-6 text-center font-semibold text-slate-500">No accessible results found.</p> : searchResults.map((result) => <button key={`${result.type}-${result.id}`} onClick={() => { setSearchOpen(false); router.push(result.href); }} className="flex w-full items-center gap-4 rounded-2xl p-4 text-left transition hover:bg-teal-50"><span className="rounded-lg bg-slate-950 px-2 py-1 text-[10px] font-black uppercase text-white">{result.type}</span><span className="min-w-0 flex-1"><span className="block truncate font-black text-slate-950">{result.title}</span><span className="block truncate text-xs font-semibold text-slate-500">{result.subtitle}</span></span></button>)}</div>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default DashboardLayout;
