import React from 'react';
import { Link } from 'react-router-dom';
import { brand } from '../../content/brand';
import {
  FolderInput, Sparkles, CalendarClock, Building, ShieldCheck, ArrowRight,
} from 'lucide-react';

const iconMap: Record<string, React.ReactNode> = {
  FolderInput: <FolderInput className="w-7 h-7" />,
  Sparkles: <Sparkles className="w-7 h-7" />,
  CalendarClock: <CalendarClock className="w-7 h-7" />,
  Building: <Building className="w-7 h-7" />,
  ShieldCheck: <ShieldCheck className="w-7 h-7" />,
};

const expandedDetails: Record<string, string> = {
  'Zero-Touch Media Ingestion':
    'Our chokidar-powered filesystem watcher monitors your workspace upload directory in real time. The moment a new image or video lands, SchedulerAgent validates the file type, creates a database record, and kicks off AI analysis — all without a single click. Supports JPG, PNG, WebP, GIF, MP4, MOV, WebM, AVI, and MKV.',
  'AI-Powered Caption Engine':
    'Powered by Google Gemini vision models, the caption engine reads visual content — products, scenes, text overlays, brand elements — and generates a complete Master JSON payload: platform-specific captions, hashtags, posting time recommendations, and content descriptors. Each generation is tuned to your workspace\'s brand voice, CTA, and emoji style settings.',
  'Smart Multi-Platform Scheduling':
    'The scheduling engine supports three modes: MANUAL (you pick every slot), AUTO_SCHEDULE (AI picks the time, you review before publishing), and AUTO_PUBLISH (fully unattended). Filenames can encode schedule hints (e.g., 2026-07-30_2000_LinkedIn.jpg), and the system falls back to your default slot time and timezone if no hint is found.',
  'Multi-Tenant Agency Architecture':
    'Organizations represent your agency. Workspaces represent individual client brands. Memberships control who sees what — Owners and Admins manage all workspaces, Members only see workspaces they\'ve been granted access to. Social account tokens are encrypted at rest with AES-256.',
  'Fail-Safe Publishing Pipeline':
    'The scheduler claims due posts with a raw SQL UPDATE ... RETURNING atomic lock, preventing any other process from double-publishing the same post. If a platform API returns a transient error, the system retries with exponential backoff (5 min → 15 min → 30 min). Every attempt, success, failure, and retry is logged to the PostLog audit trail.',
};

export const FeaturesPage: React.FC = () => {
  return (
    <div className="animate-fade-in">
      <section className="max-w-5xl mx-auto px-6 pt-20 pb-24">
        <div className="text-center mb-16">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white">
            Features Built for Agencies
          </h1>
          <p className="mt-4 text-slate-400 max-w-xl mx-auto text-lg">
            Every feature exists because a real agency workflow demanded it.
          </p>
        </div>

        <div className="space-y-8">
          {brand.features.map((feature, i) => (
            <div
              key={feature.title}
              className="p-8 rounded-2xl border border-white/5 bg-[#0b101c] hover:border-indigo-500/10 transition-all group"
            >
              <div className="flex items-start gap-6">
                <div className={`flex-shrink-0 w-14 h-14 rounded-xl bg-gradient-to-br ${
                  ['from-indigo-500 to-blue-500', 'from-purple-500 to-indigo-500', 'from-pink-500 to-purple-500', 'from-amber-500 to-orange-500', 'from-emerald-500 to-teal-500'][i]
                } flex items-center justify-center text-white shadow-lg`}>
                  {iconMap[feature.icon]}
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white mb-2">{feature.title}</h3>
                  <p className="text-sm text-slate-400 leading-relaxed mb-3">{feature.description}</p>
                  <p className="text-sm text-slate-500 leading-relaxed">
                    {expandedDetails[feature.title]}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="text-center mt-16">
          <Link
            to="/register"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-base font-bold bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-xl shadow-indigo-500/20 hover:shadow-indigo-500/40 transition-all"
          >
            Get Started Free
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  );
};
