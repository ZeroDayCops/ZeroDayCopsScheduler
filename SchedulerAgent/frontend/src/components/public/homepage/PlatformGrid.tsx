import React from 'react';
import { CheckCircle2, Globe } from 'lucide-react';

interface PlatformItem {
  name: string;
  category: string;
  status: 'Official Native' | 'Coming Soon' | 'Beta';
  statusColor: string;
  color: string;
  features: string[];
}

const platformsList: PlatformItem[] = [
  {
    name: 'LinkedIn',
    category: 'Professional Network',
    status: 'Official Native',
    statusColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    color: '#0a66c2',
    features: ['Company Pages', 'Personal Profiles', 'PDF Slide Carousels', 'Article Drops'],
  },
  {
    name: 'Pinterest',
    category: 'Visual Discovery',
    status: 'Official Native',
    statusColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    color: '#e60023',
    features: ['Pin Boards', 'Idea Pins', 'Direct Destination Links', 'Alt-Text SEO'],
  },
  {
    name: 'YouTube',
    category: 'Video Publishing',
    status: 'Official Native',
    statusColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    color: '#ff0000',
    features: ['YouTube Shorts', 'Standard Video Uploads', 'Custom Thumbnails', 'Playlists'],
  },
  {
    name: 'Google Business Profile',
    category: 'Local Search & Retail',
    status: 'Official Native',
    statusColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    color: '#4285f4',
    features: ['Local Offers', 'Product Updates', 'Store Announcements', 'CTA Buttons'],
  },
  {
    name: 'Instagram',
    category: 'Visual & Reels',
    status: 'Official Native',
    statusColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    color: '#e1306c',
    features: ['Reels', 'Feed Carousels', 'Stories', 'First Comment Hashtags'],
  },
  {
    name: 'Facebook',
    category: 'Social Pages',
    status: 'Official Native',
    statusColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    color: '#1877f2',
    features: ['Page Posts', 'Video Drops', 'Multi-Group Publishing', 'Schedule Pins'],
  },
  {
    name: 'TikTok',
    category: 'Short Video',
    status: 'Coming Soon',
    statusColor: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    color: '#00f2fe',
    features: ['Direct Short Uploads', 'Sound Sync', 'TikTok Shop Tags', 'Auto-Captions'],
  },
  {
    name: 'X (Twitter)',
    category: 'Real-Time Feed',
    status: 'Official Native',
    statusColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    color: '#f8fafc',
    features: ['Threads', 'Media Cards', 'Scheduled Tweets', 'Poll Sync'],
  },
  {
    name: 'Webhooks & API',
    category: 'Custom Automation',
    status: 'Official Native',
    statusColor: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    color: '#6366f1',
    features: ['Zapier & Make Sync', 'Custom Payloads', 'Real-Time Triggers', 'HMAC Signing'],
  },
];

export const PlatformGrid: React.FC = () => {
  return (
    <section className="py-24 bg-[#070b14] border-b border-white/5 relative">
      <div className="max-w-6xl mx-auto px-6">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/10 text-indigo-400 text-xs font-bold uppercase tracking-wider mb-4">
            <Globe className="w-3.5 h-3.5" />
            Official Platform API Ecosystem
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight">
            Seamless Direct Publishing Across <br />
            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
              Every Major Social Channel
            </span>
          </h2>
          <p className="mt-4 text-slate-400 text-base max-w-xl mx-auto leading-relaxed">
            Authenticated directly via official OAuth 2.0 API integrations. No browser emulation hacks or third-party web scraping.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {platformsList.map((platform) => (
            <div
              key={platform.name}
              className="p-6 rounded-2xl border border-white/5 bg-[#0b101c] hover:border-indigo-500/30 transition duration-300 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-4 h-4 rounded-full shadow-sm"
                      style={{ backgroundColor: platform.color }}
                    />
                    <h3 className="text-lg font-bold text-white">{platform.name}</h3>
                  </div>
                  <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${platform.statusColor}`}>
                    {platform.status}
                  </span>
                </div>
                <p className="text-xs text-slate-500 uppercase font-mono tracking-wider mb-4">{platform.category}</p>

                <div className="space-y-2 pt-2 border-t border-white/5">
                  {platform.features.map((feat) => (
                    <div key={feat} className="flex items-center gap-2 text-xs text-slate-300">
                      <CheckCircle2 className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};
