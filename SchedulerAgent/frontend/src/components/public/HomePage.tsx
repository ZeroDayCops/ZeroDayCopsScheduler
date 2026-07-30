import React from 'react';
import { Link } from 'react-router-dom';
import { brand } from '../../content/brand';
import {
  FolderInput, Sparkles, CalendarClock, Building, ShieldCheck,
  ArrowRight, Zap, ChevronRight,
} from 'lucide-react';

const iconMap: Record<string, React.ReactNode> = {
  FolderInput: <FolderInput className="w-6 h-6" />,
  Sparkles: <Sparkles className="w-6 h-6" />,
  CalendarClock: <CalendarClock className="w-6 h-6" />,
  Building: <Building className="w-6 h-6" />,
  ShieldCheck: <ShieldCheck className="w-6 h-6" />,
};

const stepColors = [
  'from-indigo-500 to-blue-500',
  'from-purple-500 to-indigo-500',
  'from-pink-500 to-purple-500',
  'from-amber-500 to-orange-500',
  'from-emerald-500 to-teal-500',
];

export const HomePage: React.FC = () => {
  return (
    <div className="animate-fade-in">
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-[-30%] left-[-15%] w-[60%] h-[60%] rounded-full bg-gradient-to-br from-indigo-500/15 to-purple-600/0 blur-[140px]" />
          <div className="absolute bottom-[-30%] right-[-15%] w-[60%] h-[60%] rounded-full bg-gradient-to-tr from-cyan-500/10 to-indigo-600/0 blur-[140px]" />
        </div>

        <div className="max-w-6xl mx-auto px-6 pt-24 pb-20 relative z-10">
          <div className="max-w-3xl mx-auto text-center">
            <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/5 text-indigo-400 text-xs font-bold uppercase tracking-wider mb-8">
              <Zap className="w-3.5 h-3.5" />
              AI-Powered Social Automation
            </div>

            <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black tracking-tight leading-[1.05]">
              <span className="bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                {brand.tagline}
              </span>
            </h1>

            <p className="mt-6 text-lg text-slate-400 leading-relaxed max-w-2xl mx-auto">
              {brand.valueProposition}
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
              <Link
                to={brand.cta.primary.href}
                className="group px-8 py-4 rounded-2xl text-base font-bold bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-xl shadow-indigo-500/20 hover:shadow-indigo-500/40 transition-all flex items-center gap-2"
              >
                {brand.cta.primary.text}
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link
                to={brand.cta.secondary.href}
                className="px-8 py-4 rounded-2xl text-base font-semibold text-slate-300 border border-white/10 hover:border-white/20 hover:bg-white/5 transition-all"
              >
                {brand.cta.secondary.text}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Platform Logos */}
      <section className="border-y border-white/5 bg-[#070b14]/50">
        <div className="max-w-4xl mx-auto px-6 py-10 flex items-center justify-center gap-12 flex-wrap">
          <span className="text-xs font-bold uppercase tracking-wider text-slate-600">Publishes To</span>
          {brand.platforms.map((p) => (
            <div key={p.name} className="flex items-center gap-2.5">
              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: p.color }} />
              <span className="text-sm font-bold text-slate-400">{p.name}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Feature Highlights */}
      <section className="max-w-6xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
            Everything Runs While You Sleep
          </h2>
          <p className="mt-4 text-slate-400 max-w-xl mx-auto">
            From media ingestion to cross-platform publishing — every step is automated, audited, and fail-safe.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {brand.features.map((feature, i) => (
            <div
              key={feature.title}
              className="group p-6 rounded-2xl border border-white/5 bg-[#0b101c] hover:border-indigo-500/20 hover:bg-indigo-500/[0.03] transition-all duration-300"
            >
              <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stepColors[i % stepColors.length]} flex items-center justify-center text-white mb-4 shadow-lg group-hover:scale-110 transition-transform`}>
                {iconMap[feature.icon]}
              </div>
              <h3 className="text-lg font-bold text-white mb-2">{feature.title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="bg-[#070b14] border-y border-white/5">
        <div className="max-w-5xl mx-auto px-6 py-24">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-black tracking-tight text-white">
              Five Steps. Zero Manual Work.
            </h2>
            <p className="mt-4 text-slate-400 max-w-lg mx-auto">
              The entire pipeline from file drop to live post runs unattended.
            </p>
          </div>

          <div className="space-y-6">
            {brand.howItWorks.map((step, i) => (
              <div
                key={step.step}
                className="flex items-start gap-6 p-6 rounded-2xl border border-white/5 bg-[#0b101c]/60 hover:border-indigo-500/10 transition group"
              >
                <div className={`flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br ${stepColors[i]} flex items-center justify-center text-white font-black text-lg shadow-lg`}>
                  {step.step}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    {step.title}
                    {i < brand.howItWorks.length - 1 && (
                      <ChevronRight className="w-4 h-4 text-slate-600 hidden sm:inline" />
                    )}
                  </h3>
                  <p className="text-sm text-slate-400 mt-1 leading-relaxed">{step.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="max-w-4xl mx-auto px-6 py-24 text-center">
        <div className="p-12 rounded-3xl bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent border border-indigo-500/10 relative overflow-hidden">
          <div className="absolute inset-0 pointer-events-none">
            <div className="absolute top-[-50%] right-[-20%] w-[60%] h-[100%] rounded-full bg-indigo-500/5 blur-[100px]" />
          </div>
          <div className="relative z-10">
            <h2 className="text-3xl font-black text-white mb-4">
              Ready to Automate Your Agency?
            </h2>
            <p className="text-slate-400 mb-8 max-w-md mx-auto">
              Set up your first workspace in under two minutes. No credit card required.
            </p>
            <Link
              to="/register"
              className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-base font-bold bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-xl shadow-indigo-500/20 hover:shadow-indigo-500/40 transition-all"
            >
              Get Started Free
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};
