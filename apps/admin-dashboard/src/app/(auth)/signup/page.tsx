'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '@aagam/utils';
import { ArrowRight, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Lock, Mail, ShieldCheck, User } from 'lucide-react';
import AagamLogo from '@/components/AagamLogo';
import { customerAuthHref, safeCustomerReturnPath } from '@/lib/customer-return-path';

const friendlyError = (error: any, fallback: string) => {
  const value = error?.response?.data?.message;
  return (Array.isArray(value) ? value.join(' ') : value) || fallback;
};

function SignupPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = safeCustomerReturnPath(searchParams.get('returnTo'));
  const [step, setStep] = useState<'DETAILS' | 'VERIFY'>('DETAILS');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [masked, setMasked] = useState('');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!countdown) return;
    const timer = window.setInterval(() => setCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [countdown]);

  const requestCode = async () => {
    setError('');
    if (name.trim().length < 2) return setError('Enter your full name.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('Enter a valid email address.');
    if (password.length < 8) return setError('Use at least 8 characters for your password.');
    if (password !== confirmPassword) return setError('Passwords do not match.');
    setLoading(true);
    try {
      const { data } = await apiClient.post('/auth/email/signup/request', { email: email.trim() });
      setMasked(data.maskedDestination); setCode(''); setCountdown(30); setStep('VERIFY');
    } catch (requestError: any) {
      setError(friendlyError(requestError, 'Verification email could not be sent.'));
    } finally { setLoading(false); }
  };

  const verifyCode = async () => {
    if (!/^\d{6}$/.test(code)) return;
    setLoading(true); setError('');
    try {
      const { data } = await apiClient.post('/auth/email/signup/verify', { email: email.trim(), name: name.trim(), password, confirmPassword, code });
      const user = data.user;
      localStorage.setItem('user_role', user.role || 'CUSTOMER');
      localStorage.setItem('user_name', user.name || '');
      localStorage.setItem('user_email', user.email || '');
      localStorage.setItem('user_avatar', user.avatarUrl || '');
      localStorage.removeItem('access_token');
      router.push(returnTo);
    } catch (requestError: any) {
      setCode(''); setError(friendlyError(requestError, 'The verification code is invalid or expired.'));
    } finally { setLoading(false); }
  };

  return <main className="relative h-[100dvh] overflow-hidden bg-[#03151c] px-4 py-3 text-white sm:px-6 lg:px-10">
    <img src="/generated/aagaam-commerce-3d-login-v1.png" alt="A 3D farm-to-store local commerce landscape" className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center opacity-95" />
    <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(2,16,22,.08),rgba(2,16,22,.05)_44%,rgba(2,16,22,.58)_73%,rgba(2,16,22,.94))]" />
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_22%,rgba(45,212,191,.15),transparent_27%),linear-gradient(0deg,rgba(2,12,18,.64),transparent_48%)]" />
    <div className="relative mx-auto flex h-full max-w-[1440px] flex-col">
      <header className="shrink-0 py-1"><AagamLogo inverse label="Fresh, Quality & Trust" /></header>
      <div className="grid min-h-0 flex-1 items-center gap-8 py-1 lg:grid-cols-[1fr_460px]">
        <section className="hidden self-end pb-8 lg:block"><div className="max-w-sm rounded-2xl border border-white/10 bg-slate-950/35 p-4 backdrop-blur-xl"><p className="text-sm font-black text-white">Verified before your first order.</p><p className="mt-1 text-xs font-semibold leading-5 text-teal-100">A single-use code protects your account while local farmers and stores remain close at hand.</p></div></section>
        <section className="relative mx-auto w-full max-w-[460px] rounded-[1.75rem] border border-white/20 bg-white/[.9] p-5 text-slate-950 shadow-[0_40px_120px_-30px_rgba(0,0,0,.9)] backdrop-blur-2xl sm:p-7 [@media(max-height:680px)]:scale-[.82] [@media(max-height:760px)]:scale-[.9] [@media(max-height:760px)]:origin-center">
          <div className="pointer-events-none absolute -inset-px -z-10 rounded-[1.75rem] bg-gradient-to-br from-teal-300/60 via-transparent to-amber-200/40 blur-sm" />
          <div className="mb-4 flex items-start justify-between"><div><p className="enterprise-kicker">Join Aagaam</p><h1 className="mt-2 text-3xl font-black tracking-[-.04em]">{step === 'DETAILS' ? 'Create your account' : 'Check your email'}</h1><p className="mt-1 text-xs font-bold text-slate-500">{step === 'DETAILS' ? 'Fresh local shopping starts here.' : `We sent a six-digit code to ${masked}.`}</p></div><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-600 to-emerald-500 text-white shadow-lg shadow-teal-700/25">{step === 'DETAILS' ? <ShieldCheck className="h-5 w-5" /> : <Mail className="h-5 w-5" />}</div></div>
          {error ? <div role="alert" className="mb-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{error}</div> : null}
          {step === 'DETAILS' ? <div className="space-y-3">
            <label className="block"><span className="mb-1 block text-xs font-black">Full name</span><span className="relative block"><User className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input required value={name} onChange={(event) => setName(event.target.value)} className="enterprise-input py-2.5 pl-11" placeholder="Your full name" autoComplete="name" /></span></label>
            <label className="block"><span className="mb-1 block text-xs font-black">Email address</span><span className="relative block"><Mail className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-teal-700" /><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="enterprise-input py-2.5 pl-11" placeholder="you@example.com" autoComplete="email" /></span></label>
            <label className="block"><span className="mb-1 block text-xs font-black">Password</span><span className="relative block"><Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input required minLength={8} maxLength={72} type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} className="enterprise-input py-2.5 pl-11 pr-11" autoComplete="new-password" placeholder="At least 8 characters" /><button type="button" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword((value) => !value)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">{showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button></span></label>
            <label className="block"><span className="mb-1 block text-xs font-black">Confirm password</span><span className="relative block"><Lock className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input required type={showPassword ? 'text' : 'password'} value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="enterprise-input py-2.5 pl-11" autoComplete="new-password" placeholder="Repeat your password" /></span></label>
            <button type="button" onClick={() => void requestCode()} disabled={loading} className="enterprise-button w-full gap-2 py-2.5 disabled:opacity-60">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Email verification code <ArrowRight className="h-4 w-4" /></>}</button>
          </div> : <div className="space-y-4"><div className="rounded-2xl border border-teal-100 bg-teal-50 p-4 text-center"><KeyRound className="mx-auto h-6 w-6 text-teal-700" /><p className="mt-2 text-xs font-bold text-teal-900">Enter your single-use verification code</p></div><input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="enterprise-input text-center text-2xl font-black tracking-[.5em]" inputMode="numeric" maxLength={6} autoFocus autoComplete="one-time-code" placeholder="000000" /><button onClick={() => void verifyCode()} disabled={loading || code.length !== 6} className="enterprise-button w-full gap-2 disabled:opacity-60">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <><CheckCircle2 className="h-4 w-4" /> Verify and create account</>}</button><button onClick={() => countdown === 0 ? void requestCode() : undefined} disabled={countdown > 0 || loading} className="w-full text-xs font-black text-teal-700 disabled:text-slate-400">{countdown ? `Resend in 00:${String(countdown).padStart(2, '0')}` : 'Resend email code'}</button><button onClick={() => { setStep('DETAILS'); setCode(''); setError(''); }} className="w-full text-xs font-bold text-slate-500">Edit account details</button></div>}
          <p className="mt-4 text-center text-xs font-semibold text-slate-500">Already registered? <Link href={customerAuthHref('/login', returnTo)} className="font-black text-teal-700">Sign in</Link></p>
        </section>
      </div>
    </div>
  </main>;
}

export default function SignupPage() {
  return <Suspense fallback={<main className="grid h-[100dvh] place-items-center bg-[#03151c]"><Loader2 className="h-7 w-7 animate-spin text-teal-300" /></main>}><SignupPageContent /></Suspense>;
}
