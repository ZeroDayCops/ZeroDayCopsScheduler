import React from 'react';
import { Link } from 'react-router-dom';
import { Target, Users, Workflow, ArrowRight } from 'lucide-react';

export const AboutPage: React.FC = () => {
  return (
    <div className="animate-fade-in">
      <section className="max-w-4xl mx-auto px-6 pt-20 pb-24">
        <div className="text-center mb-16">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white">
            Why We Built This
          </h1>
          <p className="mt-4 text-slate-400 text-lg max-w-xl mx-auto">
            Because agencies deserve tools that work as hard as they do.
          </p>
        </div>

        <div className="space-y-12 text-slate-400 leading-relaxed">
          <div className="p-8 rounded-2xl border border-white/5 bg-[#0b101c]">
            <div className="flex items-start gap-5">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-blue-500 flex items-center justify-center text-white shadow-lg">
                <Target className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white mb-3">The Problem</h3>
                <p className="text-sm leading-relaxed">
                  Social media agencies juggle dozens of client brands. Each brand has its own voice, its own posting cadence, its own platform mix. Most schedulers force agencies into per-brand dashboards, manual uploads, and copy-paste caption workflows. When you're managing 15 clients across 3 platforms, that's 45 manual touch points a day just to keep content flowing. Creative directors burn hours on logistics instead of strategy.
                </p>
              </div>
            </div>
          </div>

          <div className="p-8 rounded-2xl border border-white/5 bg-[#0b101c]">
            <div className="flex items-start gap-5">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-500 flex items-center justify-center text-white shadow-lg">
                <Workflow className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white mb-3">Our Answer</h3>
                <p className="text-sm leading-relaxed">
                  ZeroDayCops SchedulerAgent was born from a simple idea: what if the entire posting pipeline — from the moment a designer exports an asset to the moment it appears on LinkedIn, Pinterest, or YouTube — required zero manual intervention? Drop a file into a watch folder. AI reads it, writes the caption, picks the slot, and publishes. The only human input is the creative itself. Everything after that is automated, audited, and fail-safe.
                </p>
              </div>
            </div>
          </div>

          <div className="p-8 rounded-2xl border border-white/5 bg-[#0b101c]">
            <div className="flex items-start gap-5">
              <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center text-white shadow-lg">
                <Users className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white mb-3">Built for Multi-Client Agencies</h3>
                <p className="text-sm leading-relaxed">
                  This isn't a personal posting tool with a team bolt-on. SchedulerAgent was multi-tenant from day one. Organizations represent your agency. Workspaces represent client brands. Each workspace has its own brand voice, hashtag set, CTA, timezone, and connected social accounts. Role-based access ensures your junior social manager can't accidentally post to the wrong client's LinkedIn. Tokens are encrypted at rest. Every action is logged.
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="text-center mt-16">
          <Link
            to="/register"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl text-base font-bold bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-xl shadow-indigo-500/20 hover:shadow-indigo-500/40 transition-all"
          >
            Start Your Agency Workspace
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    </div>
  );
};
