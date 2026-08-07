import React, { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { fetchApi } from '../../lib/api';
import { Lock, KeyRound, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

export const ResetPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tokenFromUrl = searchParams.get('token') || '';

  const [token, setToken] = useState(tokenFromUrl);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);
    try {
      await fetchApi('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: token.trim(), newPassword }),
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
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-gradient-to-br from-emerald-500/15 to-indigo-600/0 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-gradient-to-tr from-purple-500/10 to-cyan-600/0 blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10 animate-fade-in">
        <div className="flex flex-col items-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-500 to-cyan-500 shadow-xl shadow-emerald-500/10 mb-4 ring-1 ring-white/10">
            <KeyRound className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-emerald-200 bg-clip-text text-transparent">
            Reset<span className="text-emerald-400">Password</span>
          </h1>
          <p className="text-slate-400 text-sm mt-2 text-center">
            Enter your verification code and new password
          </p>
        </div>

        <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl shadow-black/40">
          {success ? (
            <div className="text-center space-y-4 animate-fade-in">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 mx-auto">
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              </div>
              <h2 className="text-xl font-semibold text-white">Password Updated!</h2>
              <p className="text-slate-400 text-sm leading-relaxed">
                Your password has been successfully reset. You can now sign in with your new password.
              </p>
              <div className="pt-4">
                <Button
                  variant="primary"
                  className="w-full"
                  onClick={() => navigate('/login')}
                >
                  Sign In Now
                </Button>
              </div>
            </div>
          ) : (
            <>
              <h2 className="text-xl font-semibold mb-2 flex items-center gap-2">
                <Lock className="w-5 h-5 text-emerald-400" />
                Set New Password
              </h2>
              <p className="text-slate-400 text-sm mb-6">
                Enter the 6-digit code from your email (or paste the full token from the reset link).
              </p>

              {error && (
                <div className="bg-rose-500/10 border border-rose-500/20 text-rose-300 text-sm rounded-xl p-4 mb-6">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <Input
                  label="Verification Code or Token"
                  icon={<KeyRound className="w-4 h-4" />}
                  type="text"
                  required
                  placeholder="123456 or paste full token"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  disabled={isLoading}
                  helperText="Check your email for the 6-digit code"
                />
                <Input
                  label="New Password"
                  icon={<Lock className="w-4 h-4" />}
                  type="password"
                  required
                  placeholder="••••••••"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={isLoading}
                  helperText="Must be at least 6 characters"
                />
                <Input
                  label="Confirm New Password"
                  icon={<Lock className="w-4 h-4" />}
                  type="password"
                  required
                  placeholder="••••••••"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isLoading}
                  error={confirmPassword && confirmPassword !== newPassword ? 'Passwords do not match' : undefined}
                />
                <Button type="submit" isLoading={isLoading} className="w-full mt-2" size="lg">
                  Reset Password
                </Button>
              </form>

              <div className="mt-6 pt-6 border-t border-white/5 flex items-center justify-between text-sm text-slate-400">
                <Link
                  to="/forgot-password"
                  className="text-slate-400 hover:text-slate-200 transition flex items-center gap-1"
                >
                  <ArrowLeft className="w-3 h-3" />
                  Resend Code
                </Link>
                <Link
                  to="/login"
                  className="text-indigo-400 font-semibold hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded"
                >
                  Back to Sign In
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
