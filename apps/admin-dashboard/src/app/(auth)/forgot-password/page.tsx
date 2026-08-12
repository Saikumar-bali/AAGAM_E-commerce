'use client';

import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiClient } from '@aagam/utils';
import { ArrowLeft, CheckCircle2, KeyRound, Loader2, Lock, Mail, ShieldCheck } from 'lucide-react';

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

  return <main className="relative grid min-h-screen place-items-center overflow-hidden px-4 py-12 text-slate-950"><div className="pointer-events-none absolute inset-0 enterprise-subtle-grid opacity-60" /><section className="enterprise-panel relative w-full max-w-md p-6 sm:p-8"><Link href="/login" className="mb-6 inline-flex items-center gap-2 text-sm font-black text-slate-500 hover:text-teal-700"><ArrowLeft className="h-4 w-4" /> Back to sign in</Link><div className="mb-7 flex h-14 w-14 items-center justify-center rounded-2xl bg-teal-50 text-teal-700"><ShieldCheck className="h-7 w-7" /></div><h1 className="text-3xl font-black tracking-[-.04em]">{step === 'DONE' ? 'Password updated' : 'Reset your password'}</h1><p className="mt-2 text-sm font-semibold leading-6 text-slate-500">{step === 'REQUEST' ? 'Enter your account email and we’ll send a secure, single-use code.' : step === 'RESET' ? `Enter the six-digit code sent to ${email}.` : 'Your new password is ready. Redirecting you to sign in…'}</p>{error ? <div role="alert" className="mt-5 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}
    {step === 'REQUEST' ? <form className="mt-6 space-y-5" onSubmit={requestCode}><label className="block"><span className="mb-2 block text-sm font-black">Email address</span><span className="relative block"><Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="enterprise-input pl-12" autoComplete="email" placeholder="you@example.com" /></span></label><button disabled={loading} className="enterprise-button w-full">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Send reset code <KeyRound className="h-4 w-4" /></>}</button></form> : null}
    {step === 'RESET' ? <form className="mt-6 space-y-4" onSubmit={resetPassword}><label className="block"><span className="mb-2 block text-sm font-black">Verification code</span><input required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="enterprise-input text-center text-2xl font-black tracking-[.45em]" inputMode="numeric" autoComplete="one-time-code" placeholder="000000" /></label><label className="block"><span className="mb-2 block text-sm font-black">New password</span><span className="relative block"><Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /><input required minLength={8} maxLength={72} type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="enterprise-input pl-12" autoComplete="new-password" /></span></label><label className="block"><span className="mb-2 block text-sm font-black">Confirm new password</span><span className="relative block"><Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /><input required type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} className="enterprise-input pl-12" autoComplete="new-password" /></span></label><button disabled={loading || code.length !== 6} className="enterprise-button w-full">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Set new password'}</button><button type="button" disabled={loading || countdown > 0} onClick={() => void requestCode()} className="w-full text-sm font-black text-teal-700 disabled:text-slate-400">{countdown ? `Resend in 00:${String(countdown).padStart(2, '0')}` : 'Resend code'}</button></form> : null}
    {step === 'DONE' ? <div className="mt-6 flex items-center gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4 font-bold text-emerald-800"><CheckCircle2 className="h-6 w-6" /> Password reset successfully.</div> : null}</section></main>;
}
