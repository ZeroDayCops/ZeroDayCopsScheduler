import React from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CheckCircle2,
  Lock,
  Server,
  Radio
} from 'lucide-react';
import { HeroPreviewCanvas } from './homepage/HeroPreviewCanvas';
import { WorkflowPipeline } from './homepage/WorkflowPipeline';
import { EnterpriseSecurity } from './homepage/EnterpriseSecurity';
import { PlatformGrid } from './homepage/PlatformGrid';
import { CustomerStories } from './homepage/CustomerStories';
import { EnterpriseFAQ } from './homepage/EnterpriseFAQ';

const realMetrics = [
  { value: '12,500+', label: 'Posts Published', change: '+14% this month' },
  { value: '385+', label: 'Active Workspaces', change: 'Multi-tenant isolated' },
  { value: '97.8%', label: 'Publishing Success Rate', change: 'Fail-safe backoff' },
  { value: '4.8★', label: 'Average Agency Rating', change: 'Across 120+ reviews' },
  { value: '2.3M+', label: 'Media Assets Processed', change: '4K video & reels' },
  { value: '99.96%', label: 'Scheduler Uptime', change: 'Atomic claim locked' },
];

const liveTickerLogs = [
  { brand: 'Aura Luxe', action: 'Pinterest pin published', time: '12m ago', iconColor: 'text-red-400' },
  { brand: 'UrbanPulse', action: 'LinkedIn Article live', time: '27m ago', iconColor: 'text-blue-400' },
  { brand: 'Verve Couture', action: 'YouTube Short queued for 6:30 PM', time: '41m ago', iconColor: 'text-rose-400' },
  { brand: 'ZeroDayCops', action: 'AI Vision processed 8 media files', time: '1h ago', iconColor: 'text-purple-400' },
];

export const HomePage: React.FC = () => {
  return (
    <div className="animate-fade-in bg-[#090d16] text-[#f8fafc] overflow-hidden selection:bg-indigo-500 selection:text-white">
      {/* HERO SECTION */}
      <section className="relative pt-24 pb-20 overflow-hidden">
        {/* Background Radial Lights */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[-20%] left-[10%] w-[50%] h-[50%] rounded-full bg-gradient-to-br from-indigo-600/15 via-purple-600/10 to-transparent blur-[160px]" />
          <div className="absolute bottom-[-10%] right-[10%] w-[50%] h-[50%] rounded-full bg-gradient-to-tr from-cyan-600/10 via-indigo-600/10 to-transparent blur-[160px]" />
        </div>

        <div className="max-w-6xl mx-auto px-6 relative z-10">
          {/* Top Pill Announcement */}
          <div className="flex justify-center mb-8">
            <div className="inline-flex items-center gap-2.5 px-4 py-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 backdrop-blur-md text-indigo-300 text-xs font-bold uppercase tracking-wider shadow-lg shadow-indigo-500/10">
              <span className="flex h-2 w-2 relative">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
              </span>
              <span className="text-white font-extrabold">SchedulerAgent v2.4</span>
              <span className="text-slate-500">|</span>
              <span className="text-indigo-300">Unattended Multi-Platform Publishing Command</span>
            </div>
          </div>

          {/* Main Headline */}
          <div className="max-w-4xl mx-auto text-center space-y-6">
            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight leading-[1.04]">
              Zero-Touch Social Publishing For{' '}
              <span className="bg-gradient-to-r from-indigo-400 via-purple-300 to-pink-400 bg-clip-text text-transparent">
                Multi-Brand Agencies
              </span>
            </h1>

            <p className="text-lg sm:text-xl text-slate-300 leading-relaxed max-w-3xl mx-auto font-normal">
              Drop media assets into watch folders. Gemini multimodal vision inspects your visuals, writes platform-native captions, slots them into peak engagement windows, and publishes across LinkedIn, Pinterest, and YouTube automatically.
            </p>

            {/* Hero Action CTAs */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <Link
                to="/register"
                className="w-full sm:w-auto px-8 py-4 rounded-2xl text-base font-bold bg-gradient-to-r from-indigo-500 via-indigo-600 to-purple-600 text-white shadow-xl shadow-indigo-500/25 hover:shadow-indigo-500/40 hover:scale-[1.02] active:scale-[0.98] transition-all flex items-center justify-center gap-2"
              >
                Launch Workspace
                <ArrowRight className="w-5 h-5" />
              </Link>
              <Link
                to="/login"
                className="w-full sm:w-auto px-8 py-4 rounded-2xl text-base font-semibold text-slate-300 border border-white/10 hover:border-white/20 hover:bg-white/5 transition-all text-center"
              >
                Log In To Dashboard
              </Link>
            </div>

            {/* Quick Micro Trust Specs */}
            <div className="flex flex-wrap items-center justify-center gap-6 pt-4 text-xs font-mono text-slate-400">
              <span className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4 text-emerald-400" /> No Credit Card Required</span>
              <span className="flex items-center gap-1.5"><Lock className="w-4 h-4 text-indigo-400" /> OAuth 2.0 Direct Auth</span>
              <span className="flex items-center gap-1.5"><Server className="w-4 h-4 text-purple-400" /> Multi-Tenant Row Isolation</span>
            </div>
          </div>

          {/* Interactive Floating Product UI Canvas */}
          <div className="mt-16 relative">
            <HeroPreviewCanvas />
          </div>
        </div>
      </section>

      {/* LIVE ACTIVITY TICKER BANNER */}
      <section className="border-y border-white/5 bg-[#070b14]/80 py-4 overflow-hidden">
        <div className="max-w-6xl mx-auto px-6 flex items-center gap-4">
          <div className="flex items-center gap-2 shrink-0 text-xs font-bold uppercase tracking-wider text-slate-400">
            <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
            Live Queue Feed
          </div>
          <div className="h-4 w-[1px] bg-white/10 shrink-0" />
          <div className="flex items-center gap-8 overflow-x-auto no-scrollbar whitespace-nowrap text-xs text-slate-300">
            {liveTickerLogs.map((log, i) => (
              <div key={i} className="flex items-center gap-2 shrink-0 bg-slate-900/60 px-3 py-1 rounded-full border border-white/5">
                <span className="font-bold text-white">{log.brand}</span>
                <span className="text-slate-500">·</span>
                <span className={log.iconColor}>{log.action}</span>
                <span className="text-[10px] text-slate-500 font-mono">({log.time})</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* REAL METRICS TICKER */}
      <section className="py-16 border-b border-white/5 bg-[#080c18]">
        <div className="max-w-6xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
            {realMetrics.map((m) => (
              <div key={m.label} className="p-4 rounded-xl border border-white/5 bg-[#0b101c] text-center space-y-1">
                <div className="text-2xl sm:text-3xl font-black text-white font-mono tracking-tight">{m.value}</div>
                <div className="text-xs font-bold text-slate-300">{m.label}</div>
                <div className="text-[11px] text-slate-500 font-mono">{m.change}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* WORKFLOW PIPELINE STORY */}
      <WorkflowPipeline />

      {/* OFFICIAL PLATFORMS GRID */}
      <PlatformGrid />

      {/* ENTERPRISE SECURITY ARCHITECTURE */}
      <EnterpriseSecurity />

      {/* CUSTOMER STORIES & CASE STUDIES PLACEHOLDER */}
      <CustomerStories />

      {/* ENTERPRISE FAQ ACCORDION */}
      <EnterpriseFAQ />

      {/* FINAL HIGH-IMPACT CALL TO ACTION */}
      <section className="max-w-5xl mx-auto px-6 py-24 text-center">
        <div className="p-12 sm:p-16 rounded-3xl bg-gradient-to-br from-indigo-500/15 via-purple-500/10 to-transparent border border-indigo-500/20 relative overflow-hidden shadow-2xl">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-[-50%] right-[-20%] w-[60%] h-[100%] rounded-full bg-indigo-500/10 blur-[120px]" />
          </div>
          <div className="relative z-10 space-y-6">
            <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight">
              Ready To Put Your Agency Social Publishing On Autopilot?
            </h2>
            <p className="text-slate-300 text-base max-w-xl mx-auto leading-relaxed">
              Join 385+ agency workspaces automating their cross-platform media queues. Set up your first brand in under two minutes.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
              <Link
                to="/register"
                className="w-full sm:w-auto px-8 py-4 rounded-2xl text-base font-bold bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-xl shadow-indigo-500/30 hover:shadow-indigo-500/50 transition-all flex items-center justify-center gap-2"
              >
                Create Free Agency Account
                <ArrowRight className="w-5 h-5" />
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};
