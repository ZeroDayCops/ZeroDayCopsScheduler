import React, { useState } from 'react';
import {
  Layers,
  Calendar,
  Sparkles,
  ListTodo,
  CheckCircle2,
  Clock,
  ArrowUpRight,
  Share2,
  Tag,
  Bot,
  RefreshCw,
  FileCheck,
  Building2
} from 'lucide-react';

interface MockWorkspace {
  id: string;
  name: string;
  category: string;
  avatar: string;
  activeCount: number;
  successRate: string;
  lastPublish: string;
  platforms: string[];
}

const mockWorkspaces: MockWorkspace[] = [
  {
    id: 'ws-1',
    name: 'Aura Luxe',
    category: 'Ethnic Wear & Bridal',
    avatar: 'AL',
    activeCount: 42,
    successRate: '99.4%',
    lastPublish: '12m ago',
    platforms: ['LinkedIn', 'Pinterest', 'YouTube'],
  },
  {
    id: 'ws-2',
    name: 'Verve Couture',
    category: 'Men\'s Couture',
    avatar: 'VC',
    activeCount: 28,
    successRate: '98.9%',
    lastPublish: '27m ago',
    platforms: ['LinkedIn', 'Pinterest'],
  },
  {
    id: 'ws-3',
    name: 'UrbanPulse',
    category: 'Fast Fashion Retail',
    avatar: 'UP',
    activeCount: 89,
    successRate: '100%',
    lastPublish: '1h ago',
    platforms: ['LinkedIn', 'Pinterest', 'YouTube'],
  },
  {
    id: 'ws-4',
    name: 'ZeroDayCops',
    category: 'Agency Command',
    avatar: 'ZC',
    activeCount: 154,
    successRate: '99.8%',
    lastPublish: '3m ago',
    platforms: ['LinkedIn', 'Pinterest', 'YouTube'],
  },
];

const mockPosts = [
  {
    id: 'post-101',
    brand: 'Aura Luxe',
    title: 'Festive Silk Sherwani Collection 2026',
    platform: 'Pinterest',
    platformColor: 'bg-red-500/10 text-red-400 border-red-500/20',
    time: 'Today at 4:30 PM',
    status: 'Scheduled',
    statusColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
    aiScore: '98/100',
  },
  {
    id: 'post-102',
    brand: 'UrbanPulse',
    title: 'Autumn Velvet Kurta Set — Drop 03',
    platform: 'LinkedIn',
    platformColor: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
    time: 'Published 27m ago',
    status: 'Live',
    statusColor: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
    aiScore: '96/100',
  },
  {
    id: 'post-103',
    brand: 'Verve Couture',
    title: 'Behind The Scenes: Royal Heritage Stitching',
    platform: 'YouTube',
    platformColor: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
    time: 'Tomorrow at 10:00 AM',
    status: 'Queued',
    statusColor: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    aiScore: '94/100',
  },
];

export const HeroPreviewCanvas: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'workspace' | 'planner' | 'ai' | 'queue'>('workspace');
  const [selectedWorkspace, setSelectedWorkspace] = useState(mockWorkspaces[0]);

  return (
    <div className="w-full rounded-2xl border border-white/10 bg-[#0b101c] shadow-2xl overflow-hidden backdrop-blur-2xl relative">
      {/* Top Window Bar */}
      <div className="px-5 py-3.5 border-b border-white/5 bg-[#070b14]/80 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-rose-500/80" />
          <div className="w-3 h-3 rounded-full bg-amber-500/80" />
          <div className="w-3 h-3 rounded-full bg-emerald-500/80" />
          <span className="ml-3 text-xs font-mono text-slate-500 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
            ZeroDayCops SchedulerAgent v2.4.0
          </span>
        </div>

        {/* Tab Switcher */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-slate-900/90 border border-white/5">
          <button
            onClick={() => setActiveTab('workspace')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'workspace'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Workspaces
          </button>
          <button
            onClick={() => setActiveTab('planner')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'planner'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            Planner Grid
          </button>
          <button
            onClick={() => setActiveTab('ai')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'ai'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            AI Caption Engine
          </button>
          <button
            onClick={() => setActiveTab('queue')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 ${
              activeTab === 'queue'
                ? 'bg-indigo-600 text-white shadow-md shadow-indigo-500/20'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <ListTodo className="w-3.5 h-3.5" />
            Publishing Queue
          </button>
        </div>
      </div>

      {/* Main Canvas Body */}
      <div className="p-6">
        {/* TAB 1: WORKSPACES */}
        {activeTab === 'workspace' && (
          <div className="space-y-6 animate-fade-in">
            {/* Top Workspace Bar */}
            <div className="flex items-center justify-between flex-wrap gap-4 pb-4 border-b border-white/5">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-indigo-400" />
                  Active Client Workspaces
                </h3>
                <p className="text-xs text-slate-400">Managing 385+ agency client brands with isolated token vaults</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs px-2.5 py-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-400 font-medium flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> All Workspaces Operational
                </span>
              </div>
            </div>

            {/* Workspace Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {mockWorkspaces.map((ws) => (
                <div
                  key={ws.id}
                  onClick={() => setSelectedWorkspace(ws)}
                  className={`p-4 rounded-xl border transition-all cursor-pointer ${
                    selectedWorkspace.id === ws.id
                      ? 'border-indigo-500 bg-indigo-500/10 shadow-lg shadow-indigo-500/10'
                      : 'border-white/5 bg-[#090d16] hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-black text-sm">
                      {ws.avatar}
                    </div>
                    <span className="text-[11px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                      {ws.successRate}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold text-white">{ws.name}</h4>
                  <p className="text-xs text-slate-400 mb-3">{ws.category}</p>
                  <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-white/5">
                    <span>{ws.activeCount} scheduled</span>
                    <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {ws.lastPublish}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Selected Workspace Activity */}
            <div className="p-4 rounded-xl border border-white/5 bg-[#070b14] space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Live Queue for {selectedWorkspace.name}
                </span>
                <span className="text-xs text-indigo-400 hover:underline cursor-pointer flex items-center gap-1">
                  View Full Schedule <ArrowUpRight className="w-3 h-3" />
                </span>
              </div>
              <div className="space-y-2">
                {mockPosts.map((p) => (
                  <div
                    key={p.id}
                    className="p-3 rounded-lg border border-white/5 bg-[#0b101c] flex items-center justify-between gap-4 flex-wrap hover:border-indigo-500/30 transition"
                  >
                    <div className="flex items-center gap-3">
                      <div className="p-2 rounded-lg bg-slate-900 border border-white/5">
                        <Share2 className="w-4 h-4 text-slate-400" />
                      </div>
                      <div>
                        <h5 className="text-xs font-bold text-slate-200">{p.title}</h5>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className={`text-[10px] px-2 py-0.5 rounded border font-medium ${p.platformColor}`}>
                            {p.platform}
                          </span>
                          <span className="text-[11px] text-slate-500">{p.time}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right hidden sm:block">
                        <span className="text-[10px] text-slate-400 block">Gemini Vision Score</span>
                        <span className="text-xs font-mono font-bold text-indigo-400">{p.aiScore}</span>
                      </div>
                      <span className={`text-xs px-2.5 py-1 rounded-full border font-bold ${p.statusColor}`}>
                        {p.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: PLANNER GRID */}
        {activeTab === 'planner' && (
          <div className="space-y-4 animate-fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-white/5">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-indigo-400" />
                Multi-Platform Schedule Matrix (Autumn Festive Drop)
              </h3>
              <span className="text-xs text-slate-400">Timezone: Asia/Kolkata (IST)</span>
            </div>
            <div className="grid grid-cols-5 gap-2 text-center text-xs">
              {['Mon 10', 'Tue 11', 'Wed 12', 'Thu 13', 'Fri 14'].map((day, idx) => (
                <div key={day} className="p-2 rounded-lg bg-[#070b14] border border-white/5">
                  <span className="font-bold text-slate-300 block mb-2">{day}</span>
                  <div className="space-y-1.5 text-left">
                    <div className="p-2 rounded bg-indigo-500/10 border border-indigo-500/20">
                      <span className="text-[10px] font-bold text-indigo-300 block">10:00 AM · LinkedIn</span>
                      <span className="text-[10px] text-slate-400 truncate block">Aura Silk Reel</span>
                    </div>
                    {idx % 2 === 0 && (
                      <div className="p-2 rounded bg-red-500/10 border border-red-500/20">
                        <span className="text-[10px] font-bold text-red-300 block">4:30 PM · Pinterest</span>
                        <span className="text-[10px] text-slate-400 truncate block">UrbanPulse Moodboard</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: AI VISION ENGINE */}
        {activeTab === 'ai' && (
          <div className="space-y-4 animate-fade-in">
            <div className="p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shrink-0">
                <Bot className="w-6 h-6" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  Gemini Multimodal Vision Analysis
                  <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/30">
                    Live Inspection
                  </span>
                </h4>
                <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                  Asset detected: <code className="text-indigo-300 font-mono">AuraLuxe_Bridal_Lehenga_Red_04.png</code>
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <span className="text-[11px] bg-slate-900 border border-white/10 px-2.5 py-1 rounded-lg text-slate-300">
                    <Tag className="w-3 h-3 inline mr-1 text-indigo-400" /> Velvet Silk Embroidered
                  </span>
                  <span className="text-[11px] bg-slate-900 border border-white/10 px-2.5 py-1 rounded-lg text-slate-300">
                    <Sparkles className="w-3 h-3 inline mr-1 text-amber-400" /> High-Conscious Luxury Tone
                  </span>
                  <span className="text-[11px] bg-slate-900 border border-white/10 px-2.5 py-1 rounded-lg text-slate-300">
                    <Clock className="w-3 h-3 inline mr-1 text-emerald-400" /> Optimal Slot: 6:45 PM IST
                  </span>
                </div>
              </div>
            </div>
            <div className="p-3 rounded-lg border border-white/5 bg-[#070b14] text-xs font-mono text-slate-400">
              <p className="text-indigo-400 font-bold mb-1">// Generated Platform-Native Caption:</p>
              <p>"Unveiling royal craftsmanship: The Heritage Crimson Bridal Lehenga by Aura Luxe. Hand-embroidered zari threads woven over 180 hours of precision..."</p>
            </div>
          </div>
        )}

        {/* TAB 4: QUEUE MONITOR */}
        {activeTab === 'queue' && (
          <div className="space-y-3 animate-fade-in">
            <div className="flex items-center justify-between pb-2 border-b border-white/5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <ListTodo className="w-4 h-4 text-emerald-400" />
                Atomic Locks & Execution Log
              </h4>
              <span className="text-[11px] text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                0 Blocked · 99.96% Uptime
              </span>
            </div>
            <div className="space-y-2 text-xs font-mono">
              <div className="p-2.5 rounded bg-[#070b14] border border-white/5 flex items-center justify-between text-slate-300">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  [14:02:11] Pinterest Pin #8841 published to board 'Bridal Trends 2026'
                </span>
                <span className="text-slate-500">27m ago</span>
              </div>
              <div className="p-2.5 rounded bg-[#070b14] border border-white/5 flex items-center justify-between text-slate-300">
                <span className="flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                  [14:28:05] YouTube Short #4102 rendering thumbnail metadata...
                </span>
                <span className="text-slate-500">1m ago</span>
              </div>
              <div className="p-2.5 rounded bg-[#070b14] border border-white/5 flex items-center justify-between text-slate-300">
                <span className="flex items-center gap-2">
                  <FileCheck className="w-3.5 h-3.5 text-amber-400" />
                  [14:29:40] Watch Folder Ingest: 4 new media assets validated for Verve Couture
                </span>
                <span className="text-slate-500">Just now</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
