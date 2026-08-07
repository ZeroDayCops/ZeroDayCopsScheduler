import React, { useState } from 'react';
import {
  UploadCloud,
  Sparkles,
  Sliders,
  CalendarClock,
  Send,
  LineChart,
  CheckCircle,
  ArrowRight,
  ShieldCheck
} from 'lucide-react';

const workflowSteps = [
  {
    step: '01',
    title: 'Zero-Touch Media Ingest',
    tag: 'Watch Folder / Manual Drop',
    icon: UploadCloud,
    color: 'from-blue-500 to-indigo-600',
    description: 'Drop high-res images, video shorts, or reels into designated watch folders or API endpoints.',
    detailTitle: 'Automated Asset Parsing',
    detailBox: 'Detected file: Festive_Silk_Sherwani_Drop01.mp4 (4K 60fps, 48.2 MB)',
  },
  {
    step: '02',
    title: 'Gemini Vision AI Engine',
    tag: 'Multimodal Inspection',
    icon: Sparkles,
    color: 'from-indigo-500 to-purple-600',
    description: 'AI analyzes visual details, color palettes, subjects, and framing to write authentic platform captions.',
    detailTitle: 'AI Output JSON',
    detailBox: 'Generated native copy for LinkedIn, Pinterest & YouTube Shorts with 18 niche hashtags.',
  },
  {
    step: '03',
    title: 'Brand Voice & Rules',
    tag: 'Tenant Rule Engine',
    icon: Sliders,
    color: 'from-purple-500 to-pink-600',
    description: 'Merges AI copy with workspace-level guidelines, CTA preferences, and client hashtag vaults.',
    detailTitle: 'Applied Ruleset: Mahavir NX Luxury',
    detailBox: 'Enforced formal tone, appended #MahavirBridal #Sherwani2026, excluded forbidden terms.',
  },
  {
    step: '04',
    title: 'Timezone Slot Engine',
    tag: 'Optimal Peak Scheduling',
    icon: CalendarClock,
    color: 'from-pink-500 to-rose-600',
    description: 'Schedules posts into audience peak engagement windows across timezones without collision.',
    detailTitle: 'Target Slot Assigned',
    detailBox: 'Scheduled for Thursday at 6:30 PM IST (Peak Engagement Window +42% CTR).',
  },
  {
    step: '05',
    title: 'Atomic Multi-Publishing',
    tag: 'OAuth 2.0 Auth Vault',
    icon: Send,
    color: 'from-emerald-500 to-teal-600',
    description: 'Publishes natively through direct official APIs with automatic retry lock mechanism.',
    detailTitle: 'Status Live',
    detailBox: 'LinkedIn Article live · Pinterest Pin board synced · YouTube Short live.',
  },
  {
    step: '06',
    title: 'Analytics & Audit Feed',
    tag: 'Real-Time Insights',
    icon: LineChart,
    color: 'from-cyan-500 to-blue-600',
    description: 'Consolidates reach, impressions, pins, and engagement back into your agency dashboard.',
    detailTitle: 'Performance Snapshot',
    detailBox: '+14.2k Impressions · 892 Saves · 99.8% Publishing Success Record',
  },
];

export const WorkflowPipeline: React.FC = () => {
  const [activeStep, setActiveStep] = useState(0);

  return (
    <section className="py-24 bg-[#070b14] border-y border-white/5 relative overflow-hidden">
      <div className="max-w-6xl mx-auto px-6 relative z-10">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/10 text-indigo-400 text-xs font-bold uppercase tracking-wider mb-4">
            <ShieldCheck className="w-3.5 h-3.5" />
            End-to-End Enterprise Workflow
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight leading-tight">
            How Media Transforms Into <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              High-Performing Multi-Platform Posts
            </span>
          </h2>
          <p className="mt-4 text-slate-400 text-base max-w-xl mx-auto leading-relaxed">
            No messy manual review, no broken formatting, no missed posting windows. Everything runs in an automated, fail-safe pipeline.
          </p>
        </div>

        {/* Step Selector Buttons */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-10">
          {workflowSteps.map((s, idx) => {
            const Icon = s.icon;
            const isActive = activeStep === idx;
            return (
              <button
                key={s.step}
                onClick={() => setActiveStep(idx)}
                className={`p-3.5 rounded-xl border text-left transition-all relative overflow-hidden ${
                  isActive
                    ? 'border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/10'
                    : 'border-white/5 bg-[#0b101c] hover:border-white/20'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[11px] font-mono font-bold text-slate-500">{s.step}</span>
                  <div className={`w-7 h-7 rounded-lg bg-gradient-to-br ${s.color} flex items-center justify-center text-white`}>
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                </div>
                <h4 className="text-xs font-bold text-slate-200 line-clamp-1">{s.title}</h4>
              </button>
            );
          })}
        </div>

        {/* Detailed Workflow Canvas Card */}
        <div className="p-8 rounded-2xl border border-white/10 bg-[#0b101c] shadow-2xl grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          <div className="lg:col-span-7 space-y-5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-bold bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              Step {workflowSteps[activeStep].step} · {workflowSteps[activeStep].tag}
            </div>
            <h3 className="text-2xl sm:text-3xl font-black text-white">
              {workflowSteps[activeStep].title}
            </h3>
            <p className="text-slate-300 text-sm leading-relaxed">
              {workflowSteps[activeStep].description}
            </p>
            <div className="p-4 rounded-xl border border-white/5 bg-[#070b14] space-y-2">
              <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider block">
                {workflowSteps[activeStep].detailTitle}
              </span>
              <p className="text-xs font-mono text-slate-300">
                {workflowSteps[activeStep].detailBox}
              </p>
            </div>
            <div className="flex items-center gap-4 pt-2">
              <button
                onClick={() => setActiveStep((prev) => (prev + 1) % workflowSteps.length)}
                className="px-5 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-500 text-white transition flex items-center gap-2 shadow-lg shadow-indigo-600/20"
              >
                Next Workflow Stage
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="lg:col-span-5 p-6 rounded-xl border border-white/5 bg-[#070b14] space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-white/5">
              <span className="text-xs font-bold text-slate-400">Pipeline Execution Node</span>
              <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Validated
              </span>
            </div>

            {/* Simulated Live Post Transformation Preview */}
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-[#0b101c] border border-white/5 text-xs space-y-2">
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Target Brand</span>
                  <span className="font-bold text-slate-200">Mahavir NX (Workspace)</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Platforms Sync</span>
                  <span className="text-indigo-400 font-bold">LinkedIn · Pinterest · YouTube</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400">
                  <span>Retry Policy</span>
                  <span className="text-slate-300">Exponential Backoff (3 Max)</span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-indigo-500/5 border border-indigo-500/20 text-xs">
                <span className="text-[11px] text-indigo-300 font-bold block mb-1">Live Pipeline Status:</span>
                <p className="text-[11px] text-slate-300 font-mono">
                  Post claim lock acquired. OAuth token validated for LinkedIn API v2 & Pinterest API v5.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
