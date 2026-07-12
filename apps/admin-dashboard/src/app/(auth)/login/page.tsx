'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '@aagam/utils';
import { ArrowRight, CheckCircle2, Loader2, Lock, Mail, ShieldCheck, Sparkles } from 'lucide-react';
import Script from 'next/script';

const DEFAULT_GOOGLE_WEB_CLIENT_ID = '879444331583-a4r4m3j8547i5vrlf8aje0li4mvh0fdv.apps.googleusercontent.com';

declare global {
  interface Window {
    google?: any;
    handleGoogleCredentialResponse?: (response: { credential?: string }) => void;
  }
}

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const router = useRouter();
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID || DEFAULT_GOOGLE_WEB_CLIENT_ID;

  const routeByRole = (role: string) => {
    if (role === 'ADMIN') router.push('/admin');
    else if (role === 'RIDER') router.push('/rider');
    else if (role === 'STORE_OWNER') router.push('/store');
    else router.push('/shop');
  };

  const persistUserContext = (user: any) => {
    localStorage.setItem('user_role', user.role);
    localStorage.setItem('user_name', user.name || '');
    localStorage.setItem('user_email', user.email || '');
    localStorage.setItem('user_avatar', user.avatarUrl || '');
    // Remove any bearer token left by an older web build. Browser sessions are
    // authenticated exclusively by the HttpOnly cookie set by the API.
    localStorage.removeItem('access_token');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const response = await apiClient.post('/auth/login', { email, password });
      const { user } = response.data;
      persistUserContext(user);
      routeByRole(user.role);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  const initializeGoogleButton = () => {
    if (!googleClientId || !window.google || !window.handleGoogleCredentialResponse) return;
    const target = document.getElementById('google-signin-button');
    if (!target) return;
    target.innerHTML = '';
    window.google.accounts.id.initialize({ client_id: googleClientId, callback: window.handleGoogleCredentialResponse, auto_select: false, cancel_on_tap_outside: true });
    window.google.accounts.id.renderButton(target, { type: 'standard', shape: 'pill', theme: 'outline', text: 'continue_with', size: 'large', logo_alignment: 'left', width: 360 });
  };

  useEffect(() => {
    if (!googleClientId) return;
    window.handleGoogleCredentialResponse = async (response: { credential?: string }) => {
      if (!response?.credential) { setError('Google sign-in failed. Please try again.'); return; }
      setError('');
      setGoogleLoading(true);
      try {
        const result = await apiClient.post('/auth/google', { idToken: response.credential });
        const { user } = result.data;
        persistUserContext(user);
        routeByRole(user.role);
      } catch (err: any) {
        setError(err.response?.data?.message || 'Google sign-in failed');
      } finally {
        setGoogleLoading(false);
      }
    };
    if (window.google) window.setTimeout(initializeGoogleButton, 0);
  }, [googleClientId, router]);

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8 text-slate-950 sm:px-6 lg:px-8">
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onLoad={initializeGoogleButton} />
      <div className="pointer-events-none absolute inset-0 enterprise-subtle-grid opacity-60" />
      <div className="pointer-events-none absolute -left-24 top-12 h-96 w-96 rounded-full bg-teal-300/25 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-0 h-[28rem] w-[28rem] rounded-full bg-amber-200/40 blur-3xl" />
      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-7xl items-center">
        <div className="grid w-full gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <section className="hidden lg:block">
            <Link href="/" className="inline-flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-lg font-black text-white">A</span><span className="text-2xl font-black tracking-[-0.05em]">Aagam</span></Link>
            <p className="enterprise-kicker mt-12"><Sparkles className="mr-2 h-3.5 w-3.5" /> Secure commerce access</p>
            <h1 className="mt-5 max-w-xl text-5xl font-black tracking-[-0.07em]">One login for shop, rider, and operations.</h1>
            <p className="mt-5 max-w-lg text-lg font-semibold leading-8 text-slate-600">Enter the workspace and continue from catalogue browsing to checkout, delivery tracking, or admin control.</p>
            <div className="mt-8 grid max-w-lg gap-3">{['Role-aware routing', 'HttpOnly web sessions', 'Realtime order workspace'].map((item) => <div key={item} className="flex items-center gap-3 rounded-2xl border border-white/80 bg-white/70 p-4 font-bold text-slate-700 shadow-xl shadow-slate-900/5 backdrop-blur-xl"><CheckCircle2 className="h-5 w-5 text-teal-700" />{item}</div>)}</div>
          </section>
          <section className="enterprise-panel mx-auto w-full max-w-md p-6 sm:p-8">
            <div className="mb-8 text-center lg:hidden"><Link href="/" className="text-3xl font-black tracking-[-0.06em]">Aagam</Link></div>
            <div className="mb-8"><div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-xl shadow-slate-950/20"><ShieldCheck className="h-7 w-7" /></div><p className="enterprise-kicker">Welcome back</p><h2 className="mt-4 text-3xl font-black tracking-[-0.05em]">Sign in to your workspace</h2><p className="mt-2 text-sm font-semibold text-slate-500">New here? <Link href="/signup" className="text-teal-700 hover:text-teal-900">Create an account</Link></p></div>
            {error && <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div>}
            <div><div id="google-signin-button" className="flex min-h-[44px] items-center justify-center" />{googleLoading ? <p className="mt-2 text-center text-xs font-semibold text-slate-500">Verifying Google sign-in...</p> : null}</div>
            <div className="my-5 flex items-center gap-3 text-xs font-bold uppercase tracking-[0.2em] text-slate-400"><span className="h-px flex-1 bg-slate-200" />or use email<span className="h-px flex-1 bg-slate-200" /></div>
            <form className="space-y-5" onSubmit={handleLogin}>
              <label className="block"><span className="mb-2 block text-sm font-black text-slate-700">Email address</span><span className="relative block"><Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="enterprise-input pl-12" placeholder="you@company.com" /></span></label>
              <label className="block"><span className="mb-2 block text-sm font-black text-slate-700">Password</span><span className="relative block"><Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /><input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="enterprise-input pl-12" placeholder="Enter password" /></span></label>
              <button type="submit" disabled={loading} className="enterprise-button w-full gap-2 disabled:cursor-not-allowed disabled:opacity-60">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Continue <ArrowRight className="h-4 w-4" /></>}</button>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
