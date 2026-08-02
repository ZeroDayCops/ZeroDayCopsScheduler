import React, { useState, useEffect, useRef, Suspense, lazy } from 'react';
import { useApp } from '../context/AppContext';
import { fetchApi } from '../lib/api';
import { Badge } from './ui/Badge';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { SkeletonCard } from './ui/Skeleton';
import {
  LayoutDashboard, Settings, LogOut, FolderHeart, CalendarDays, Sparkles,
  Building, Briefcase, Compass, PanelLeftClose, PanelLeftOpen,
  Bell, X, Plus
} from 'lucide-react';
import { CreateWorkspaceModal } from './CreateWorkspaceModal';

const SettingsView = lazy(() => import('./SettingsView').then(m => ({ default: m.SettingsView })));
const MediaLibraryView = lazy(() => import('./MediaLibraryView').then(m => ({ default: m.MediaLibraryView })));
const PlannerView = lazy(() => import('./PlannerView').then(m => ({ default: m.PlannerView })));

const PLATFORM_NAMES: Record<string, string> = { LINKEDIN: 'LinkedIn', PINTEREST: 'Pinterest', YOUTUBE: 'YouTube' };

const NavItem: React.FC<{ active: boolean; icon: React.ReactNode; label: string; collapsed: boolean; onClick: () => void }> = ({ active, icon, label, collapsed, onClick }) => (
  <button type="button" onClick={onClick} aria-current={active ? 'page' : undefined}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
      active ? 'bg-indigo-500/10 text-indigo-400 shadow-sm' : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
    } ${collapsed ? 'justify-center px-3' : ''}`}>
    {icon}
    {!collapsed && label}
  </button>
);

const SuspenseFallback = () => (
  <div className="space-y-4 p-4"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>
);

export const MainLayout: React.FC = () => {
  const { user, organizations, currentOrg, setCurrentOrg, workspaces, currentWorkspace, setCurrentWorkspace, activeTab, setActiveTab, logout } = useApp();
  const [showOrgDd, setShowOrgDd] = useState(false);
  const [showWsDd, setShowWsDd] = useState(false);
  const [showNotifDd, setShowNotifDd] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [seenFailedNotifIds, setSeenFailedNotifIds] = useState<Set<string>>(new Set());

  // Analytics state
  const [analyticsDays, setAnalyticsDays] = useState<number>(30);
  const [analytics, setAnalytics] = useState<any>(null);
  const [showHealthModal, setShowHealthModal] = useState(false);

  const orgRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);

  // Request native OS Notification permissions on load
  useEffect(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      if (window.Notification.permission === 'default') {
        window.Notification.requestPermission();
      }
    }
  }, []);

  // Fetch notifications with Desktop Native OS alert on FAILED events
  useEffect(() => {
    if (!currentWorkspace?.id) return;
    const fetchNotifs = () => {
      fetchApi<any>(`/workspaces/${currentWorkspace.id}/notifications`)
        .then(d => {
          const list = d.notifications || [];
          setNotifications(list);
          setUnreadCount(d.unreadCount || 0);

          // Desktop Native OS notification on FAILURE
          list.forEach((n: any) => {
            if ((n.type === 'FAILED' || n.title.includes('Failed')) && !seenFailedNotifIds.has(n.id)) {
              setSeenFailedNotifIds(prev => new Set(prev).add(n.id));
              if (typeof window !== 'undefined' && 'Notification' in window && window.Notification.permission === 'granted') {
                new window.Notification(n.title, {
                  body: n.message,
                  icon: '/favicon.ico',
                });
              }
            }
          });
        })
        .catch(() => {});
    };
    fetchNotifs();
    const interval = setInterval(fetchNotifs, 10000);
    return () => clearInterval(interval);
  }, [currentWorkspace?.id]);

  // Fetch Analytics
  useEffect(() => {
    if (!currentWorkspace?.id) return;
    fetchApi<any>(`/workspaces/${currentWorkspace.id}/analytics?days=${analyticsDays}`)
      .then(d => setAnalytics(d))
      .catch(() => {});
  }, [currentWorkspace?.id, analyticsDays, activeTab]);

  const markAllRead = async () => {
    if (!currentWorkspace?.id) return;
    try {
      await fetchApi(`/workspaces/${currentWorkspace.id}/notifications/read`, { method: 'PUT' });
      setUnreadCount(0);
      setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    } catch {}
  };

  // Click-outside close
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (orgRef.current && !orgRef.current.contains(e.target as Node)) setShowOrgDd(false);
      if (wsRef.current && !wsRef.current.contains(e.target as Node)) setShowWsDd(false);
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifDd(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Escape key closes
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') { setShowOrgDd(false); setShowWsDd(false); setShowNotifDd(false); } };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  const closeDropdowns = () => { setShowOrgDd(false); setShowWsDd(false); setShowNotifDd(false); };
  const switchTab = (tab: string) => { setActiveTab(tab); closeDropdowns(); };

  const handleActionClick = (url?: string) => {
    if (!url) return;
    if (url.startsWith('settings')) {
      switchTab('settings');
    } else if (url === 'media') {
      switchTab('media');
    } else if (url === 'calendar') {
      switchTab('calendar');
    }
  };

  const renderDashboard = () => {
    const health = analytics?.automationHealth || { status: 'HEALTHY', reasons: [] };
    const funnel = analytics?.funnel || { uploaded: 0, analyzed: 0, failedAnalysis: 0, autoScheduled: 0, published: 0, failedPublish: 0 };
    const latency = analytics?.latency || { averageMinutes: 0, medianMinutes: 0, sampleCount: 0 };
    const sources = analytics?.scheduleSources || { filenameParserPct: 0, defaultRulePct: 0, manualOverridePct: 0 };
    const platforms = analytics?.platformStats || {};

    return (
      <div className="space-y-8 max-w-5xl animate-fade-in">
        {/* Header Hero Banner */}
        <div className="bg-gradient-to-r from-indigo-500/10 via-purple-500/5 to-transparent border border-indigo-500/10 rounded-3xl p-8 relative overflow-hidden shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <Sparkles className="absolute right-8 top-1/2 -translate-y-1/2 opacity-10 pointer-events-none w-48 h-48 text-indigo-400" />
            <h1 className="text-3xl font-extrabold text-white tracking-tight">
              Welcome back, <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">{user?.name}</span>!
            </h1>
            <p className="text-slate-400 text-sm mt-2 max-w-lg leading-relaxed">
              Automated end-to-end media ingestion, Gemini analysis, and cross-platform multi-tenant scheduling.
            </p>
          </div>

          {/* Automation Health Indicator */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setShowHealthModal(true)}
              className={`px-4 py-2.5 rounded-2xl border text-xs font-bold flex items-center gap-2.5 transition cursor-pointer shadow-lg ${
                health.status === 'HEALTHY'
                  ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400 hover:bg-emerald-500/20'
                  : 'bg-rose-500/10 border-rose-500/30 text-rose-400 hover:bg-rose-500/20 animate-pulse'
              }`}
            >
              <span className={`w-2.5 h-2.5 rounded-full ${health.status === 'HEALTHY' ? 'bg-emerald-400' : 'bg-rose-500'}`} />
              <span>Automation Health: <strong>{health.status === 'HEALTHY' ? 'HEALTHY' : 'NEEDS ATTENTION'}</strong></span>
            </button>
            <div className="flex gap-1 bg-[#0c1220] border border-white/10 rounded-xl p-1 text-xs">
              <button onClick={() => setAnalyticsDays(7)} className={`px-2.5 py-1 rounded-lg font-semibold transition ${analyticsDays === 7 ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-white'}`}>7D</button>
              <button onClick={() => setAnalyticsDays(30)} className={`px-2.5 py-1 rounded-lg font-semibold transition ${analyticsDays === 30 ? 'bg-indigo-500 text-white' : 'text-slate-400 hover:text-white'}`}>30D</button>
            </div>
          </div>
        </div>

        {/* Pipeline Funnel Stats */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Content Pipeline Funnel ({analyticsDays} Days)</h3>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <Card className="text-center p-3.5"><span className="text-[10px] font-bold text-slate-500 uppercase">1. Uploaded</span><div className="text-xl font-black text-slate-200 mt-1">{funnel.uploaded}</div></Card>
            <Card className="text-center p-3.5"><span className="text-[10px] font-bold text-indigo-400 uppercase">2. Analyzed</span><div className="text-xl font-black text-indigo-400 mt-1">{funnel.analyzed}</div></Card>
            <Card className="text-center p-3.5"><span className="text-[10px] font-bold text-rose-400 uppercase">Analysis Failed</span><div className="text-xl font-black text-rose-400 mt-1">{funnel.failedAnalysis}</div></Card>
            <Card className="text-center p-3.5"><span className="text-[10px] font-bold text-purple-400 uppercase">3. Auto-Scheduled</span><div className="text-xl font-black text-purple-400 mt-1">{funnel.autoScheduled}</div></Card>
            <Card className="text-center p-3.5"><span className="text-[10px] font-bold text-emerald-400 uppercase">4. Published</span><div className="text-xl font-black text-emerald-400 mt-1">{funnel.published}</div></Card>
            <Card className="text-center p-3.5"><span className="text-[10px] font-bold text-rose-400 uppercase">Publish Failed</span><div className="text-xl font-black text-rose-400 mt-1">{funnel.failedPublish}</div></Card>
          </div>
        </div>

        {/* Latency & Schedule Sources Breakdown */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card className="p-5 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Time-to-Publish Latency</h3>
            <p className="text-slate-500 text-xs">Duration from media ingestion (NEW) to platform publication.</p>
            <div className="grid grid-cols-2 gap-4 pt-2">
              <div className="bg-[#080d16] border border-white/5 rounded-xl p-3 text-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Average Latency</span>
                <div className="text-lg font-extrabold text-indigo-400 mt-1">{latency.averageMinutes} min</div>
              </div>
              <div className="bg-[#080d16] border border-white/5 rounded-xl p-3 text-center">
                <span className="text-[10px] font-bold text-slate-500 uppercase">Median Latency</span>
                <div className="text-lg font-extrabold text-purple-400 mt-1">{latency.medianMinutes} min</div>
              </div>
            </div>
          </Card>

          <Card className="p-5 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Schedule Time Sourcing Breakdown</h3>
            <p className="text-slate-500 text-xs">Origin of scheduled time slots across posts in window.</p>
            <div className="space-y-2.5 pt-1">
              <div>
                <div className="flex justify-between text-xs font-semibold text-slate-300 mb-1">
                  <span>Smart Filename Parser</span>
                  <span>{sources.filenameParserPct}%</span>
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${sources.filenameParserPct}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs font-semibold text-slate-300 mb-1">
                  <span>Default Slot Automation</span>
                  <span>{sources.defaultRulePct}%</span>
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-purple-500 transition-all duration-500" style={{ width: `${sources.defaultRulePct}%` }} />
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs font-semibold text-slate-300 mb-1">
                  <span>Manual Override</span>
                  <span>{sources.manualOverridePct}%</span>
                </div>
                <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-slate-400 transition-all duration-500" style={{ width: `${sources.manualOverridePct}%` }} />
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Per-Platform Connections & Success Rates */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold uppercase tracking-wider text-slate-400">Platform Connections & Success Rates</h3>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {['LINKEDIN', 'PINTEREST', 'YOUTUBE'].map((platform) => {
              const account = currentWorkspace?.socialAccounts?.find((s: any) => s.platform === platform);
              const status = account?.status || 'NOT_CONNECTED';
              const pStat = platforms[platform] || { successRate: 100, published: 0, failed: 0 };
              return (
                <Card key={platform} className="p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-300 uppercase">{PLATFORM_NAMES[platform]}</span>
                    <Badge type={status} />
                  </div>
                  <div className="pt-1">
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span className="text-slate-400">Success Rate</span>
                      <span className={pStat.successRate >= 90 ? 'text-emerald-400' : 'text-rose-400'}>{pStat.successRate}%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                      <div className={`h-full ${pStat.successRate >= 90 ? 'bg-emerald-500' : 'bg-rose-500'}`} style={{ width: `${pStat.successRate}%` }} />
                    </div>
                    <div className="flex justify-between text-[10px] text-slate-500 mt-1.5">
                      <span>Pub: {pStat.published}</span>
                      <span>Fail: {pStat.failed}</span>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Health Diagnostics Modal */}
        {showHealthModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-[#0c1220] border border-white/10 rounded-2xl max-w-md w-full p-6 space-y-4 shadow-2xl">
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <h3 className="font-bold text-slate-200 text-base">Automation Health Diagnostics</h3>
                <button onClick={() => setShowHealthModal(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>
              <div className="space-y-2">
                {health.reasons.length === 0 ? (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-400 text-xs font-semibold">
                    ✅ All social connections are active and recent publishing success rate is optimal.
                  </div>
                ) : (
                  health.reasons.map((r: string, idx: number) => (
                    <div key={idx} className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-300 text-xs font-medium flex items-start gap-2">
                      <span className="text-rose-400 font-bold">•</span>
                      <span>{r}</span>
                    </div>
                  ))
                )}
              </div>
              <Button variant="secondary" size="sm" className="w-full" onClick={() => setShowHealthModal(false)}>Close</Button>
            </div>
          </div>
        )}
      </div>
    );
  };

  const [showCreateWsModal, setShowCreateWsModal] = useState(false);

  const renderNoWorkspaceState = () => (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center max-w-xl mx-auto space-y-6 animate-fade-in py-12">
      <div className="w-20 h-20 rounded-3xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 shadow-2xl">
        <Briefcase className="w-10 h-10 animate-pulse" />
      </div>
      <div className="space-y-2">
        <h2 className="text-2xl font-black text-white tracking-tight">No Workspaces Found</h2>
        <p className="text-slate-400 text-sm leading-relaxed">
          {currentOrg ? `Organization "${currentOrg.name}" doesn't have any brand workspaces yet.` : 'You do not have any active brand workspaces yet.'} Workspaces house your social connections, brand voice, and content schedule.
        </p>
      </div>
      <Button
        variant="primary"
        size="lg"
        icon={<Plus className="w-5 h-5" />}
        onClick={() => setShowCreateWsModal(true)}
      >
        Create Your First Workspace
      </Button>
    </div>
  );

  const renderContent = () => {
    if (!currentWorkspace) {
      return renderNoWorkspaceState();
    }

    switch (activeTab) {
      case 'settings': return <Suspense fallback={<SuspenseFallback />}><SettingsView /></Suspense>;
      case 'media': return <Suspense fallback={<SuspenseFallback />}><MediaLibraryView /></Suspense>;
      case 'calendar': return <Suspense fallback={<SuspenseFallback />}><PlannerView /></Suspense>;
      default: return renderDashboard();
    }
  };

  return (
    <div className="min-h-screen bg-[#090d16] text-[#f8fafc] flex">
      <aside className={`${collapsed ? 'w-20' : 'w-72'} border-r border-white/5 bg-[#0b101c] flex flex-col p-4 space-y-6 flex-shrink-0 transition-all duration-300`}>
        {/* Logo */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-extrabold text-lg shadow-lg shadow-indigo-500/20">S</div>
            {!collapsed && <span className="font-black text-lg tracking-tight text-white">Scheduler<span className="text-indigo-400">Agent</span></span>}
          </div>
          <button onClick={() => setCollapsed(!collapsed)} className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-white/5 transition" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}>
            {collapsed ? <PanelLeftOpen className="w-4 h-4" /> : <PanelLeftClose className="w-4 h-4" />}
          </button>
        </div>

        {/* Org/Workspace Switchers */}
        {!collapsed && (
          <>
            <div className="space-y-1.5 relative" ref={orgRef}>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Organization</label>
              <button type="button" onClick={() => { setShowOrgDd(!showOrgDd); setShowWsDd(false); setShowNotifDd(false); }} aria-expanded={showOrgDd} aria-haspopup="listbox"
                className="w-full flex items-center justify-between px-3 py-2.5 bg-[#070b14] border border-white/5 rounded-xl text-slate-200 font-semibold text-sm transition text-left cursor-pointer hover:border-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
                <span className="flex items-center gap-2 truncate"><Building className="w-4 h-4 text-indigo-400 flex-shrink-0" />{currentOrg?.name || 'Select'}</span>
                <Compass className="w-3.5 h-3.5 text-slate-500" />
              </button>
              {showOrgDd && (
                <div role="listbox" className="absolute left-0 right-0 mt-1 bg-[#0c1220] border border-white/10 rounded-xl shadow-2xl z-50 p-1.5 max-h-48 overflow-y-auto">
                  {organizations.map(org => (
                    <button key={org.id} role="option" aria-selected={currentOrg?.id === org.id} onClick={() => { setCurrentOrg(org); setShowOrgDd(false); }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${currentOrg?.id === org.id ? 'bg-indigo-500/10 text-indigo-400' : 'hover:bg-white/5 text-slate-400 hover:text-slate-200'}`}>{org.name}</button>
                  ))}
                </div>
              )}
            </div>
            <div className="space-y-1.5 relative" ref={wsRef}>
              <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Workspace</label>
              <button type="button" onClick={() => { setShowWsDd(!showWsDd); setShowOrgDd(false); setShowNotifDd(false); }} aria-expanded={showWsDd} aria-haspopup="listbox"
                className="w-full flex items-center justify-between px-3 py-2.5 bg-[#070b14] border border-white/5 rounded-xl text-slate-200 font-semibold text-sm transition text-left cursor-pointer hover:border-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">
                <span className="flex items-center gap-2 truncate"><Briefcase className="w-4 h-4 text-purple-400 flex-shrink-0" />{currentWorkspace?.brandName || 'Select'}</span>
                <Compass className="w-3.5 h-3.5 text-slate-500" />
              </button>
              {showWsDd && (
                <div role="listbox" className="absolute left-0 right-0 mt-1 bg-[#0c1220] border border-white/10 rounded-xl shadow-2xl z-50 p-1.5 max-h-56 overflow-y-auto space-y-1">
                  {workspaces.map(ws => (
                    <button key={ws.id} role="option" aria-selected={currentWorkspace?.id === ws.id} onClick={() => { setCurrentWorkspace(ws); setShowWsDd(false); }}
                      className={`w-full text-left px-3 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${currentWorkspace?.id === ws.id ? 'bg-purple-500/10 text-purple-400' : 'hover:bg-white/5 text-slate-400 hover:text-slate-200'}`}>{ws.brandName}</button>
                  ))}
                  {workspaces.length === 0 && <span className="block text-center text-xs text-slate-500 p-2 italic">No workspaces found</span>}
                  <div className="border-t border-white/10 pt-1">
                    <button
                      type="button"
                      onClick={() => { setShowWsDd(false); setShowCreateWsModal(true); }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold text-indigo-400 hover:bg-indigo-500/10 transition cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Create New Workspace
                    </button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        <nav className="flex-1 space-y-1" role="navigation" aria-label="Main navigation">
          <NavItem active={activeTab === 'dashboard'} icon={<LayoutDashboard className="w-4.5 h-4.5" />} label="Dashboard" collapsed={collapsed} onClick={() => switchTab('dashboard')} />
          <NavItem active={activeTab === 'media'} icon={<FolderHeart className="w-4.5 h-4.5" />} label="Media Library" collapsed={collapsed} onClick={() => switchTab('media')} />
          <NavItem active={activeTab === 'calendar'} icon={<CalendarDays className="w-4.5 h-4.5" />} label="Planner & Queue" collapsed={collapsed} onClick={() => switchTab('calendar')} />
          <NavItem active={activeTab === 'settings'} icon={<Settings className="w-4.5 h-4.5" />} label="Settings" collapsed={collapsed} onClick={() => switchTab('settings')} />
        </nav>

        <div className="border-t border-white/5 pt-4">
          <NavItem active={false} icon={<LogOut className="w-4.5 h-4.5" />} label="Sign Out" collapsed={collapsed} onClick={logout} />
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-white/5 flex items-center justify-between px-8 bg-[#0b101c] flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="text-slate-300 font-bold text-sm tracking-wide">
              {currentOrg?.name || '—'} <span className="text-slate-600 mx-2">/</span> <span className="text-indigo-400">{currentWorkspace?.brandName || '—'}</span>
            </div>
            <button
              onClick={() => setShowCreateWsModal(true)}
              className="px-2.5 py-1 bg-indigo-500/10 border border-indigo-500/20 hover:bg-indigo-500/20 text-indigo-400 rounded-lg text-xs font-bold transition flex items-center gap-1 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Workspace</span>
            </button>
          </div>
          <div className="flex items-center gap-4">
            {/* Notification Bell */}
            <div className="relative" ref={notifRef}>
              <button onClick={() => setShowNotifDd(!showNotifDd)} className="p-2 text-slate-400 hover:text-slate-200 rounded-xl hover:bg-white/5 relative transition focus:outline-none" aria-label="Notifications">
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-indigo-500 rounded-full animate-ping" />}
                {unreadCount > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-indigo-500 rounded-full" />}
              </button>

              {showNotifDd && (
                <div className="absolute right-0 mt-2 w-80 bg-[#0c1220] border border-white/10 rounded-2xl shadow-2xl z-50 p-4 space-y-3">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2">
                    <span className="font-bold text-xs uppercase tracking-wider text-slate-300">Activity Notifications</span>
                    {unreadCount > 0 && (
                      <button onClick={markAllRead} className="text-[10px] font-bold text-indigo-400 hover:underline">Mark all read</button>
                    )}
                  </div>
                  <div className="max-h-64 overflow-y-auto space-y-2 pr-1">
                    {notifications.length === 0 ? (
                      <div className="text-center text-xs text-slate-500 py-6 italic">No notifications yet.</div>
                    ) : (
                      notifications.map(n => (
                        <div key={n.id} onClick={() => handleActionClick(n.actionUrl)}
                          className={`p-2.5 rounded-xl border text-xs space-y-1 transition cursor-pointer ${n.read ? 'bg-[#080d16]/40 border-white/5' : 'bg-indigo-500/5 border-indigo-500/20 hover:border-indigo-500/40'}`}>
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-200">{n.title}</span>
                            <span className="text-[9px] text-slate-500">{new Date(n.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <p className="text-[11px] text-slate-400 leading-relaxed">{n.message}</p>
                          {n.actionUrl && (
                            <span className="inline-block text-[10px] font-bold text-indigo-400 hover:underline pt-0.5">View details →</span>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="text-right">
              <div className="text-sm font-bold text-slate-200">{user?.name}</div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">{currentOrg?.role}</div>
            </div>
            <div className="w-9 h-9 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center font-bold text-indigo-400" aria-hidden="true">
              {user?.name?.charAt(0).toUpperCase()}
            </div>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-8 bg-[#090d16]">{renderContent()}</main>
      </div>

      {/* Create Workspace Modal */}
      <CreateWorkspaceModal
        isOpen={showCreateWsModal}
        onClose={() => setShowCreateWsModal(false)}
      />
    </div>
  );
};
