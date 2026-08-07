import React from 'react';
import { Building2, Sparkles, ArrowRight, Award } from 'lucide-react';

const agencyCategories = [
  { name: 'Fashion & Apparel Retail', count: '140+ Workspaces' },
  { name: 'Wedding & Bridal Couture', count: '95+ Workspaces' },
  { name: 'Digital Marketing Agencies', count: '85+ Workspaces' },
  { name: 'Multi-Location Chains', count: '65+ Workspaces' },
];

export const CustomerStories: React.FC = () => {
  return (
    <section className="py-24 bg-[#090d16] border-b border-white/5 relative overflow-hidden">
      <div className="max-w-6xl mx-auto px-6">
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-purple-500/20 bg-purple-500/10 text-purple-400 text-xs font-bold uppercase tracking-wider mb-4">
            <Award className="w-3.5 h-3.5" />
            Agency Trust & Case Studies
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight">
            Trusted By 385+ Workspaces Across <br />
            <span className="bg-gradient-to-r from-purple-400 to-pink-400 bg-clip-text text-transparent">
              Fashion, Couture & Agency Brands
            </span>
          </h2>
          <p className="mt-4 text-slate-400 text-base max-w-xl mx-auto leading-relaxed">
            ZeroDayCops SchedulerAgent powers automated publishing pipelines for top-tier retail brands and digital agencies.
          </p>
        </div>

        {/* Agency Niche Category Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
          {agencyCategories.map((cat) => (
            <div
              key={cat.name}
              className="p-6 rounded-2xl border border-white/5 bg-[#0b101c] flex flex-col justify-between hover:border-purple-500/30 transition"
            >
              <div>
                <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 mb-4">
                  <Building2 className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold text-white mb-1">{cat.name}</h3>
                <span className="text-xs font-mono text-purple-400 font-medium">{cat.count}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Case Studies Coming Soon Banner */}
        <div className="p-8 rounded-3xl border border-purple-500/20 bg-gradient-to-r from-purple-500/10 via-indigo-500/5 to-transparent relative overflow-hidden flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center md:text-left">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
              <Sparkles className="w-3.5 h-3.5" /> Customer Case Studies — Coming Soon
            </div>
            <h3 className="text-xl font-bold text-white">
              Detailed Brand Breakdown Reports In Production
            </h3>
            <p className="text-xs text-slate-400 max-w-lg">
              We never fabricate customer identities or publish fake reviews. Official brand case studies and ROI teardowns are being documented with partner consent.
            </p>
          </div>
          <button className="px-6 py-3 rounded-xl text-xs font-bold border border-white/10 bg-white/5 hover:bg-white/10 text-white transition shrink-0 flex items-center gap-2">
            Request Enterprise Demo <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </section>
  );
};
