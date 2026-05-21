'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '@aagam/utils';
import { ArrowRight, CheckCircle2, Loader2, Lock, Mail, ShieldCheck, Sparkles } from 'lucide-react';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await apiClient.post('/auth/login', { email, password });
      const { user } = response.data;
      localStorage.setItem('user_role', user.role);
      localStorage.setItem('user_name', user.name);
      if (user.role === 'ADMIN') router.push('/admin');
      else if (user.role === 'RIDER') router.push('/rider');
      else router.push('/shop');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-8 text-slate-950 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 enterprise-subtle-grid opacity-60" />
      <div className="pointer-events-none absolute -left-24 top-12 h-96 w-96 rounded-full bg-teal-300/25 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-0 h-[28rem] w-[28rem] rounded-full bg-amber-200/40 blur-3xl" />

      <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] max-w-7xl items-center">
        <div className="grid w-full gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <section className="hidden lg:block">
            <Link href="/" className="inline-flex items-center gap-3">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-950 text-lg font-black text-white">A</span>
              <span className="text-2xl font-black tracking-[-0.05em]">Aagam</span>
            </Link>
            <p className="enterprise-kicker mt-12"><Sparkles className="mr-2 h-3.5 w-3.5" /> Secure commerce access</p>
            <h1 className="mt-5 max-w-xl text-5xl font-black tracking-[-0.07em]">One login for shop, rider, and operations.</h1>
            <p className="mt-5 max-w-lg text-lg font-semibold leading-8 text-slate-600">
              Enter the workspace and continue from catalogue browsing to checkout, delivery tracking, or admin control.
            </p>
            <div className="mt-8 grid max-w-lg gap-3">
              {['Role-aware routing', 'Production API cookies', 'Realtime order workspace'].map((item) => (
                <div key={item} className="flex items-center gap-3 rounded-2xl border border-white/80 bg-white/70 p-4 font-bold text-slate-700 shadow-xl shadow-slate-900/5 backdrop-blur-xl">
                  <CheckCircle2 className="h-5 w-5 text-teal-700" />
                  {item}
                </div>
              ))}
            </div>
          </section>

          <section className="enterprise-panel mx-auto w-full max-w-md p-6 sm:p-8">
            <div className="mb-8 text-center lg:hidden">
              <Link href="/" className="text-3xl font-black tracking-[-0.06em]">Aagam</Link>
            </div>
            <div className="mb-8">
              <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-xl shadow-slate-950/20">
                <ShieldCheck className="h-7 w-7" />
              </div>
              <p className="enterprise-kicker">Welcome back</p>
              <h2 className="mt-4 text-3xl font-black tracking-[-0.05em]">Sign in to your workspace</h2>
              <p className="mt-2 text-sm font-semibold text-slate-500">
                New here? <Link href="/signup" className="text-teal-700 hover:text-teal-900">Create an account</Link>
              </p>
            </div>

            <form className="space-y-5" onSubmit={handleLogin}>
              {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
                  {error}
                </div>
              )}

              <label className="block">
                <span className="mb-2 block text-sm font-black text-slate-700">Email address</span>
                <span className="relative block">
                  <Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="enterprise-input pl-12" placeholder="you@company.com" />
                </span>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-black text-slate-700">Password</span>
                <span className="relative block">
                  <Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
                  <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="enterprise-input pl-12" placeholder="Enter password" />
                </span>
              </label>

              <button type="submit" disabled={loading} className="enterprise-button w-full gap-2 disabled:cursor-not-allowed disabled:opacity-60">
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Continue <ArrowRight className="h-4 w-4" /></>}
              </button>
            </form>
          </section>
        </div>
      </div>
    </main>
  );
}
