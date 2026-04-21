'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '@aagam/utils';
import { Lock, Mail, User, Loader2, ArrowRight, Check, X, Eye, EyeOff } from 'lucide-react';

interface PasswordRequirement {
  label: string;
  test: (password: string) => boolean;
}

const passwordRequirements: PasswordRequirement[] = [
  { label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { label: 'At least one uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { label: 'At least one lowercase letter', test: (p) => /[a-z]/.test(p) },
  { label: 'At least one number', test: (p) => /\d/.test(p) },
];

function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  const passed = passwordRequirements.filter((req) => req.test(password)).length;
  if (passed === 0) return { score: 0, label: 'Very Weak', color: 'bg-gray-200' };
  if (passed === 1) return { score: 20, label: 'Weak', color: 'bg-red-500' };
  if (passed === 2) return { score: 40, label: 'Fair', color: 'bg-orange-500' };
  if (passed === 3) return { score: 60, label: 'Good', color: 'bg-yellow-400' };
  if (passed === 4) return { score: 100, label: 'Strong', color: 'bg-emerald-500' };
  return { score: 0, label: 'Very Weak', color: 'bg-gray-200' };
}

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('CUSTOMER');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();

  const strength = getPasswordStrength(password);
  const metRequirements = passwordRequirements.filter((req) => req.test(password));

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (metRequirements.length < 4) {
      setError('Please meet all password requirements');
      return;
    }
    
    setLoading(true);
    setError('');

    try {
      await apiClient.post('/auth/signup', { 
        email, 
        password, 
        name,
        role: role
      });
      
      router.push('/login');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8 font-sans">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <Link href="/" className="flex justify-center mb-6">
           <span className="text-4xl font-black tracking-tighter text-emerald-600">AAGAM</span>
        </Link>
        <h2 className="text-center text-3xl font-extrabold text-gray-900 tracking-tight">
          Create your account
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Already have an account?{' '}
          <Link href="/login" className="font-bold text-emerald-600 hover:text-emerald-500 transition-colors">
            Sign in
          </Link>
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow-2xl shadow-emerald-900/5 sm:rounded-3xl sm:px-10 border border-gray-100">
          <form className="space-y-6" onSubmit={handleSignup}>
            {error && (
              <div className="bg-red-50 border border-red-100 text-red-600 px-4 py-3 rounded-xl text-sm font-medium">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Full Name
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <User className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="block w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all sm:text-sm"
                  placeholder="John Doe"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Email address
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Mail className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="block w-full pl-11 pr-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all sm:text-sm"
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                  <Lock className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full pl-11 pr-12 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all sm:text-sm"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-4 flex items-center"
                >
                  {showPassword ? (
                    <EyeOff className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                  ) : (
                    <Eye className="h-5 w-5 text-gray-400 hover:text-gray-600" />
                  )}
                </button>
              </div>
              
              {/* Password Strength Bar */}
              {password && (
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium text-gray-500">Password Strength</span>
                    <span className={`text-xs font-bold ${
                      strength.label === 'Very Weak' ? 'text-red-500' :
                      strength.label === 'Weak' ? 'text-red-500' :
                      strength.label === 'Fair' ? 'text-orange-500' :
                      strength.label === 'Good' ? 'text-yellow-500' :
                      'text-emerald-600'
                    }`}>
                      {strength.label}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className={`h-full ${strength.color} transition-all duration-300`}
                      style={{ width: `${strength.score}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Password Requirements */}
            <div className="bg-gray-50 rounded-xl p-3">
              <p className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wide">
                Password Requirements
              </p>
              <div className="grid grid-cols-2 gap-2">
                {passwordRequirements.map((req, idx) => (
                  <div 
                    key={idx} 
                    className={`flex items-center text-xs ${
                      req.test(password) ? 'text-emerald-600' : 'text-gray-400'
                    }`}
                  >
                    {req.test(password) ? (
                      <Check className="h-3 w-3 mr-1 flex-shrink-0" />
                    ) : (
                      <X className="h-3 w-3 mr-1 flex-shrink-0" />
                    )}
                    <span className={req.test(password) ? 'font-medium' : ''}>
                      {req.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-gray-700 mb-2">
                Join as
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="block w-full px-4 py-3 bg-gray-50 border border-gray-100 rounded-2xl text-gray-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all sm:text-sm appearance-none"
              >
                <option value="CUSTOMER">Customer (Shop & Order)</option>
                <option value="RIDER">Rider (Deliver Orders)</option>
              </select>
            </div>

            <div>
              <button
                type="submit"
                disabled={loading || metRequirements.length < 4}
                className="w-full flex justify-center items-center py-4 px-4 border border-transparent rounded-2xl shadow-lg text-sm font-black text-white bg-emerald-600 hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 transition-all disabled:opacity-50 disabled:cursor-not-allowed group"
              >
                {loading ? <Loader2 className="animate-spin h-5 w-5" /> : (
                  <>
                    CREATE ACCOUNT
                    <ArrowRight className="ml-2 h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}