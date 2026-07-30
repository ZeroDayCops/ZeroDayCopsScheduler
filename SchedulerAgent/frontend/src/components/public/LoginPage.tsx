import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../../context/AppContext';
import { fetchApi } from '../../lib/api';
import { Shield, Sparkles, Mail, Lock } from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

export const LoginPage: React.FC = () => {
  const { login } = useApp();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const data: any = await fetchApi('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      login(data.user, data.organizations);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.message || 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-gradient-to-br from-indigo-500/20 to-purple-600/0 blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-gradient-to-tr from-cyan-500/10 to-indigo-600/0 blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10 animate-fade-in">
        <div className="flex flex-col items-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 shadow-xl shadow-indigo-500/10 mb-4 ring-1 ring-white/10">
            <Shield className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-200 to-indigo-200 bg-clip-text text-transparent">
            Scheduler<span className="text-indigo-400">Agent</span>
          </h1>
          <p className="text-slate-400 text-sm mt-2 text-center">
            Multi-Tenant Social Media Scheduling for Agencies
          </p>
        </div>

        <div className="bg-slate-900/60 backdrop-blur-xl border border-white/10 rounded-3xl p-8 shadow-2xl shadow-black/40">
          <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            Sign In to Workspace
          </h2>

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
            <Input
              label="Password"
              icon={<Lock className="w-4 h-4" />}
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isLoading}
            />
            <Button type="submit" isLoading={isLoading} className="w-full mt-2" size="lg">
              Sign In
            </Button>
          </form>

          <div className="mt-6 pt-6 border-t border-white/5 text-center text-sm text-slate-400">
            New to SchedulerAgent?{' '}
            <Link
              to="/register"
              className="text-indigo-400 font-semibold hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded"
            >
              Create Agency Account
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
