import React, { useState } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';

interface FAQItem {
  question: string;
  answer: string;
  category: string;
}

const faqList: FAQItem[] = [
  {
    category: 'Workspaces & Licensing',
    question: 'How do client workspace boundaries and data isolation work?',
    answer: 'Every client brand created in ZeroDayCops SchedulerAgent gets an isolated workspace context. OAuth refresh tokens, media watch folders, hashtag vaults, and default slot schedules are strictly partitioned via database Row-Level Security (RLS). Users in Workspace A cannot view or publish to Workspace B.',
  },
  {
    category: 'Publishing Engine',
    question: 'What happens if a social API endpoint experiences rate limits or goes offline?',
    answer: 'Our atomic claim lock engine automatically flags the failed request and puts it into an exponential backoff retry queue (3 retry attempts by default). If the failure persists, the workspace administrator receives an instant notification while subsequent queued posts remain safely buffered.',
  },
  {
    category: 'AI & Captions',
    question: 'Can we customize the AI vision prompt and brand tone for each client brand?',
    answer: 'Yes! Each workspace contains Brand Settings where you can define specific brand voice directives (e.g. "Formal Couture Tone", "Youthful Streetwear"), mandatory hashtag rules, CTA links, and excluded words. Gemini vision incorporates these directives into every generated post draft.',
  },
  {
    category: 'Platforms & Media',
    question: 'Which social platforms are supported for direct native publishing?',
    answer: 'SchedulerAgent currently supports direct native OAuth publishing to LinkedIn (Company Pages & Personal Profiles), Pinterest (Pin Boards & Video Pins), YouTube (Shorts & Standard Video), Google Business Profile, Instagram, Facebook, and X. TikTok integration is currently in private beta.',
  },
  {
    category: 'Security & Auth',
    question: 'How are client OAuth access tokens and credentials secured?',
    answer: 'All OAuth refresh tokens and client secrets are encrypted at rest using AES-256 GCM encryption. Token exchanges occur strictly over HTTPS/TLS 1.3, and refresh tokens are automatically rotated according to official platform OAuth specifications.',
  },
  {
    category: 'Watch Folders',
    question: 'Can we automate media ingestion directly from local server directories or NAS drives?',
    answer: 'Absolutely. The SchedulerAgent backend supports local disk watch folders, SFTP drop zones, and S3-compatible cloud storage buckets. Simply drop media files into the folder and the scheduler ingests, analyzes, and queues them automatically.',
  },
];

export const EnterpriseFAQ: React.FC = () => {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  const toggle = (idx: number) => {
    setOpenIdx(openIdx === idx ? null : idx);
  };

  return (
    <section className="py-24 bg-[#070b14] border-b border-white/5">
      <div className="max-w-4xl mx-auto px-6">
        <div className="text-center mb-16">
          <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/10 text-indigo-400 text-xs font-bold uppercase tracking-wider mb-4">
            <HelpCircle className="w-3.5 h-3.5" />
            Frequently Asked Questions
          </span>
          <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
            Everything You Need To Know About <br />
            <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              ZeroDayCops SchedulerAgent
            </span>
          </h2>
          <p className="mt-4 text-slate-400 text-sm max-w-lg mx-auto">
            Clear, straightforward answers about our architecture, multi-tenant security, scheduling engine, and API limits.
          </p>
        </div>

        <div className="space-y-4">
          {faqList.map((item, idx) => {
            const isOpen = openIdx === idx;
            return (
              <div
                key={item.question}
                className="rounded-2xl border border-white/5 bg-[#0b101c] overflow-hidden transition"
              >
                <button
                  onClick={() => toggle(idx)}
                  className="w-full p-6 text-left flex items-center justify-between gap-4 hover:bg-white/[0.02] transition"
                >
                  <div>
                    <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-indigo-400 block mb-1">
                      {item.category}
                    </span>
                    <h3 className="text-base font-bold text-white">{item.question}</h3>
                  </div>
                  <div className={`p-2 rounded-xl bg-slate-900 border border-white/5 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180 text-indigo-400' : ''}`}>
                    <ChevronDown className="w-4 h-4" />
                  </div>
                </button>

                {isOpen && (
                  <div className="px-6 pb-6 text-sm text-slate-300 leading-relaxed border-t border-white/5 pt-4 animate-fade-in">
                    {item.answer}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
