'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiClient } from '@aagam/utils';
import { ArrowLeft, CheckCircle2, KeyRound, Loader2, Lock, Mail } from 'lucide-react';

const errorMessage = (error: any, fallback: string) => {
  const value = error?.response?.data?.message;
  return (Array.isArray(value) ? value.join(' ') : value) || fallback;
};

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<'REQUEST' | 'RESET' | 'DONE'>('REQUEST');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!countdown) return;
    const timer = window.setInterval(() => setCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [countdown]);

  const requestCode = async (event?: FormEvent) => {
    event?.preventDefault(); setLoading(true); setError('');
    try {
      await apiClient.post('/auth/password/forgot', { email: email.trim() });
      setStep('RESET'); setCountdown(30);
    } catch (requestError: any) {
      setError(errorMessage(requestError, 'We could not start password recovery. Please try again.'));
    } finally { setLoading(false); }
  };

  const resetPassword = async (event: FormEvent) => {
    event.preventDefault(); setError('');
    if (password.length < 8) return setError('Use at least 8 characters for your password.');
    if (password !== confirmPassword) return setError('Passwords do not match.');
    setLoading(true);
    try {
      await apiClient.post('/auth/password/reset', { email: email.trim(), code, password, confirmPassword });
      setStep('DONE'); window.setTimeout(() => router.push('/login'), 1800);
    } catch (requestError: any) {
      setError(errorMessage(requestError, 'The code is invalid or expired. Request a new one.'));
    } finally { setLoading(false); }
  };

  return <main className="relative h-[100dvh] overflow-hidden bg-[#03151c] px-4 py-3 text-white sm:px-6 lg:px-10">
    <img src="/generated/aagaam-commerce-3d-login-v1.png" alt="A 3D farm-to-store local commerce landscape" className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center opacity-95" />
    <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(2,16,22,.06)_0%,rgba(2,16,22,.02)_45%,rgba(2,16,22,.48)_70%,rgba(2,16,22,.9)_100%)]" />
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_25%,rgba(45,212,191,.13),transparent_28%),linear-gradient(0deg,rgba(2,12,18,.58),transparent_45%)]" />
    <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:linear-gradient(to_left,black,transparent_70%)]" />
    <div className="relative z-20 mx-auto flex h-full max-w-[1440px] flex-col">
      <header className="flex shrink-0 items-center py-1" />
      <div className="grid min-h-0 flex-1 items-center justify-center py-2">
        <section className="relative mx-auto w-full max-w-[450px] rounded-[1.75rem] border border-white/20 bg-white/[.88] p-5 text-slate-950 shadow-[0_40px_120px_-30px_rgba(0,0,0,.9),inset_0_1px_0_rgba(255,255,255,.8)] backdrop-blur-2xl sm:p-7">
          <div className="pointer-events-none absolute -inset-px -z-10 rounded-[2rem] bg-gradient-to-br from-teal-300/60 via-transparent to-amber-200/40 blur-sm" />
          <Link href="/login" className="mb-6 inline-flex items-center gap-2 text-sm font-black text-slate-500 hover:text-teal-700"><ArrowLeft className="h-4 w-4" /> Back to sign in</Link>
          <div className="mb-7 flex items-start justify-between"><div><p className="enterprise-kicker">Account recovery</p><h1 className="mt-2 text-3xl font-black tracking-[-.04em]">{step === 'DONE' ? 'Password updated' : 'Reset your password'}</h1></div></div>
          <p className="mb-4 text-sm font-semibold leading-6 text-slate-500">{step === 'REQUEST' ? 'Enter your account email and we\'ll send a secure, single-use code.' : step === 'RESET' ? `Enter the six-digit code sent to ${email}.` : 'Your new password is ready. Redirecting you to sign in…'}</p>
          {error ? <div role="alert" className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}
          {step === 'REQUEST' ? <form className="space-y-4" onSubmit={requestCode}><label className="block"><span className="mb-2 block text-sm font-black">Email address</span><span className="relative block"><Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="enterprise-input pl-12" autoComplete="email" placeholder="you@example.com" /></span></label><button disabled={loading} className="enterprise-button w-full">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Send reset code <KeyRound className="h-4 w-4" /></>}</button></form> : null}
          {step === 'RESET' ? <form className="space-y-4" onSubmit={resetPassword}><label className="block"><span className="mb-2 block text-sm font-black">Verification code</span><input required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="enterprise-input text-center text-2xl font-black tracking-[.45em]" inputMode="numeric" autoComplete="one-time-code" placeholder="000000" /></label><label className="block"><span className="mb-2 block text-sm font-black">New password</span><span className="relative block"><Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /><input required minLength={8} maxLength={72} type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="enterprise-input pl-12" autoComplete="new-password" /></span></label><label className="block"><span className="mb-2 block text-sm font-black">Confirm new password</span><span className="relative block"><Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /><input required type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="enterprise-input pl-12" autoComplete="new-password" /></span></label><button disabled={loading || code.length !== 6} className="enterprise-button w-full">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Set new password'}</button><button type="button" disabled={loading || countdown > 0} onClick={() => void requestCode()} className="w-full text-sm font-black text-teal-700 disabled:text-slate-400">{countdown ? `Resend in 00:${String(countdown).padStart(2, '0')}` : 'Resend code'}</button></form> : null}
          {step === 'DONE' ? <div className="flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 font-bold text-emerald-800"><CheckCircle2 className="h-6 w-6" /> Password reset successfully.</div> : null}
        </section>
      </div>
    </div>
  </main>;
}
