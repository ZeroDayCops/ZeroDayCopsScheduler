import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchApi } from '../../lib/api';
import { Shield, Mail, ArrowLeft, Send } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

export const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      await fetchApi('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setSuccess(true);
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-gradient-to-br from-amber-500/15 to-purple-600/0 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-gradient-to-tr from-indigo-500/10 to-cyan-600/0 blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10 animate-fade-in">
        <div className="flex flex-col items-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-500 via-orange-500 to-rose-500 shadow-xl shadow-amber-500/10 mb-4 ring-1 ring-white/10">
            <Shield className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-amber-200 bg-clip-text text-transparent">
            Password<span className="text-amber-400">Recovery</span>
          </h1>
          <p className="text-slate-400 text-sm mt-2 text-center">
            We'll send a secure reset link to your inbox
          </p>
        </div>

        <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl shadow-black/40">
          {success ? (
            <div className="text-center space-y-4 animate-fade-in">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 mx-auto">
                <Send className="w-7 h-7 text-emerald-400" />
              </div>
              <h2 className="text-xl font-semibold text-white">Check Your Email</h2>
              <p className="text-slate-400 text-sm leading-relaxed">
                If <span className="text-white font-medium">{email}</span> is registered, you'll receive a password reset email with a verification code and reset link.
              </p>
              <p className="text-slate-500 text-xs">
                Can't find it? Check your spam folder. The link expires in 1 hour.
              </p>
              <div className="pt-4 space-y-3">
                <Link to="/reset-password">
                  <Button variant="primary" className="w-full">
                    Enter Reset Code
                  </Button>
                </Link>
                <Link to="/login" className="block">
                  <Button variant="ghost" className="w-full" icon={<ArrowLeft className="w-4 h-4" />}>
                    Back to Sign In
                  </Button>
                </Link>
              </div>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-semibold mb-2 flex items-center gap-2">
                <Mail className="w-5 h-5 text-amber-400" />
                Forgot Password?
              </h2>
              <p className="text-slate-400 text-sm mb-6">
                Enter your email and we'll send you a secure 6-digit code and reset link.
              </p>

              {error && (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm rounded-xl p-4 mb-6">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label="Email Address"
                  icon={<Mail className="w-4 h-4" />}
                  type="email"
                  required
                  placeholder="jane@agency.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                />
                <Button type="submit" isLoading={isLoading} className="w-full mt-2" size="lg">
                  Send Reset Link
                </Button>
              </form>

              <div className="mt-6 pt-6 border-t border-white/5 text-center text-sm text-slate-400">
                Remember your password?{' '}
                <Link
                  to="/login"
                  className="text-indigo-400 font-semibold hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded"
                >
                  Sign In
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
