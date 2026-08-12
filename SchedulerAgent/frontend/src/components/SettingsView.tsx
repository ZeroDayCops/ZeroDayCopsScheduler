import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchApi, API_BASE } from '../lib/api';
import { Badge } from './ui/Badge';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import { Toast } from './ui/Toast';
import { ConfirmDialog } from './ui/ConfirmDialog';
import {
  Settings, Hash, Globe, MessageCircle, Zap, Building, UserCircle, X, Link,
  Sparkles, Clock, ChevronDown, Unlink
} from 'lucide-react';

import { GBPLocationManagerModal } from './GBPLocationManagerModal';

const PLATFORM_NAMES: Record<string, string> = { LINKEDIN: 'LinkedIn', PINTEREST: 'Pinterest', YOUTUBE: 'YouTube', GOOGLE_BUSINESS: 'Google Business Profile' };
const PLATFORM_COLORS: Record<string, string> = { LINKEDIN: 'text-blue-400', PINTEREST: 'text-pink-500', YOUTUBE: 'text-red-400', GOOGLE_BUSINESS: 'text-emerald-400' };

export const SettingsView: React.FC = () => {
  const { currentWorkspace, setCurrentWorkspace } = useApp();
  const queryClient = useQueryClient();

  const [showGBPModal, setShowGBPModal] = useState(false);

  // React Query for fresh workspace data — refetch automatically
  const wsQuery = useQuery({
    queryKey: ['workspace', currentWorkspace?.id],
    queryFn: () => fetchApi<{ workspace: any }>(`/workspaces/${currentWorkspace!.id}`),
    enabled: !!currentWorkspace?.id,
    staleTime: 5_000,
    refetchInterval: (query) => {
      const ws = query.state.data?.workspace;
      if (ws?.socialAccounts?.some((s: any) => s.status === 'EXPIRED')) return 5_000;
      return 15_000;
    },
  });

  const freshWs = wsQuery.data?.workspace || currentWorkspace;

  // Form state
  const [brandName, setBrandName] = useState('');
  const [website, setWebsite] = useState('');
  const [cta, setCta] = useState('');
  const [brandVoice, setBrandVoice] = useState('');
  const [brandDescription, setBrandDescription] = useState('');
  const [contactInfoBlock, setContactInfoBlock] = useState('');
  const [emojiStyle, setEmojiStyle] = useState('moderate');
  const [hashtags, setHashtags] = useState<string[]>([]);
  const [newHashtag, setNewHashtag] = useState('');
  const [automationMode, setAutomationMode] = useState('MANUAL');
  const [defaultSlotTime, setDefaultSlotTime] = useState('20:00');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [allowVideoImageFallback, setAllowVideoImageFallback] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Per-platform AI style guides state
  const [styleGuides, setStyleGuides] = useState<{ LINKEDIN: string; PINTEREST: string; YOUTUBE: string }>({ LINKEDIN: '', PINTEREST: '', YOUTUBE: '' });
  const [savingStyleGuide, setSavingStyleGuide] = useState<Record<string, boolean>>({});

  // Disconnect target dialog
  const [disconnectTarget, setDisconnectTarget] = useState<string | null>(null);
  const [isDisconnecting, setIsDisconnecting] = useState(false);

  // OAuth config
  const [configStatus, setConfigStatus] = useState<Record<string, boolean>>({});
  const [linkedInAuthor, setLinkedInAuthor] = useState('');
  const [linkedInCompanies, setLinkedInCompanies] = useState<any[]>([]);

  // Initialize form from workspace (only on workspace switch)
  useEffect(() => {
    if (!currentWorkspace) return;
    setBrandName(currentWorkspace.brandName || '');
    setWebsite(currentWorkspace.website || '');
    setCta(currentWorkspace.cta || '');
    setBrandVoice(currentWorkspace.brandVoice || '');
    setBrandDescription(currentWorkspace.brandDescription || '');
    setContactInfoBlock(currentWorkspace.contactInfoBlock || '');
    setEmojiStyle(currentWorkspace.emojiStyle || 'moderate');
    setHashtags(currentWorkspace.defaultHashtags || []);
    setAutomationMode(currentWorkspace.automationMode || 'MANUAL');
    setDefaultSlotTime(currentWorkspace.defaultSlotTime || '20:00');
    setTimezone(currentWorkspace.timezone || 'Asia/Kolkata');
    setAllowVideoImageFallback(!!currentWorkspace.allowVideoImageFallback);
  }, [currentWorkspace?.id]);

  // Fetch per-platform style guides
  useEffect(() => {
    if (!currentWorkspace?.id) return;
    fetchApi<{ styleGuides: Record<string, string | null> }>(`/workspaces/${currentWorkspace.id}/style-guides`)
      .then(d => {
        setStyleGuides({
          LINKEDIN: d.styleGuides.LINKEDIN || '',
          PINTEREST: d.styleGuides.PINTEREST || '',
          YOUTUBE: d.styleGuides.YOUTUBE || '',
        });
      })
      .catch(() => {});
  }, [currentWorkspace?.id]);

  // Check URL query parameters for connection outcome messages
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get('error') || params.get('error_description');
    const successParam = params.get('connected');

    if (errorParam) {
      setToast({ type: 'error', message: `OAuth Error: ${errorParam}` });
      window.history.replaceState({}, '', window.location.pathname);
    } else if (successParam) {
      setToast({ type: 'success', message: `Successfully connected ${successParam}!` });
      window.history.replaceState({}, '', window.location.pathname);
      queryClient.invalidateQueries({ queryKey: ['workspace', currentWorkspace?.id] });
    }
  }, [currentWorkspace?.id]);

  // Fetch OAuth config status
  useEffect(() => {
    fetchApi<any>('/oauth/config-status')
      .then(d => setConfigStatus(d.config || {}))
      .catch(() => {});
  }, []);

  // Fetch LinkedIn companies if connected
  useEffect(() => {
    if (!currentWorkspace?.id) return;
    const liAccount = freshWs?.socialAccounts?.find((s: any) => s.platform === 'LINKEDIN' && s.status === 'CONNECTED');
    if (liAccount) {
      fetchApi<any>(`/oauth/linkedin/companies?workspaceId=${currentWorkspace.id}`)
        .then(d => {
          setLinkedInCompanies(d.companies || []);
          setLinkedInAuthor(liAccount.linkedinAuthorType === 'ORGANIZATION' ? liAccount.linkedinOrganizationId || '' : '');
        })
        .catch(() => {});
    }
  }, [freshWs?.socialAccounts?.find((s: any) => s.platform === 'LINKEDIN')?.status]);

  const handleSave = async () => {
    if (!currentWorkspace) return;
    setSaving(true);
    try {
      const res = await fetchApi<{ workspace: any }>(`/workspaces/${currentWorkspace.id}`, {
        method: 'PUT',
        body: JSON.stringify({ brandName, website, cta, defaultHashtags: hashtags, brandVoice, brandDescription, contactInfoBlock, emojiStyle, automationMode, defaultSlotTime, timezone, allowVideoImageFallback }),
      });
      setCurrentWorkspace(res.workspace);
      queryClient.invalidateQueries({ queryKey: ['workspace', currentWorkspace.id] });
      setToast({ type: 'success', message: 'Settings saved successfully!' });
    } catch (err: any) {
      setToast({ type: 'error', message: err.message || 'Failed to save workspace settings' });
    } finally {
      setSaving(false);
    }
  };

  const handleSaveStyleGuide = async (platform: 'LINKEDIN' | 'PINTEREST' | 'YOUTUBE') => {
    if (!currentWorkspace?.id) return;
    setSavingStyleGuide(prev => ({ ...prev, [platform]: true }));
    try {
      await fetchApi(`/workspaces/${currentWorkspace.id}/style-guides/${platform}`, {
        method: 'PATCH',
        body: JSON.stringify({ aiStyleGuide: styleGuides[platform] }),
      });
      setToast({ type: 'success', message: `${PLATFORM_NAMES[platform]} style guide saved!` });
    } catch (err: any) {
      setToast({ type: 'error', message: err.message || `Failed to save ${PLATFORM_NAMES[platform]} style guide` });
    } finally {
      setSavingStyleGuide(prev => ({ ...prev, [platform]: false }));
    }
  };

  const addHashtag = () => {
    const tag = newHashtag.startsWith('#') ? newHashtag : `#${newHashtag}`;
    if (tag.length > 1 && !hashtags.includes(tag)) { setHashtags([...hashtags, tag]); setNewHashtag(''); }
  };

  const handleConnect = (platform: string) => {
    if (!currentWorkspace) return;
    // Direct browser redirect to backend connect endpoint for real OAuth flow
    window.location.href = `${API_BASE}/oauth/${platform.toLowerCase()}/connect?workspaceId=${currentWorkspace.id}`;
  };

  const handleDisconnectConfirm = async () => {
    if (!disconnectTarget || !currentWorkspace) return;
    setIsDisconnecting(true);
    try {
      await fetchApi(`/oauth/${disconnectTarget.toLowerCase()}/disconnect`, {
        method: 'POST',
        body: JSON.stringify({ workspaceId: currentWorkspace.id }),
      });
      setToast({ type: 'success', message: `${PLATFORM_NAMES[disconnectTarget]} disconnected successfully` });
      queryClient.invalidateQueries({ queryKey: ['workspace', currentWorkspace.id] });
    } catch (err: any) {
      setToast({ type: 'error', message: err.message || 'Failed to disconnect' });
    } finally {
      setIsDisconnecting(false);
      setDisconnectTarget(null);
    }
  };

  const handleLinkedInAuthorChange = async (val: string) => {
    setLinkedInAuthor(val);
    if (!currentWorkspace) return;
    const liAccount = freshWs?.socialAccounts?.find((s: any) => s.platform === 'LINKEDIN' && s.status === 'CONNECTED');
    if (!liAccount) return;
    try {
      const selectedAuthorUrn = val ? `urn:li:organization:${val}` : null;
      await fetchApi(`/oauth/linkedin/author`, {
        method: 'PUT',
        body: JSON.stringify({ workspaceId: currentWorkspace.id, selectedAuthorUrn }),
      });
      setToast({ type: 'success', message: 'Author setting updated successfully' });
      queryClient.invalidateQueries({ queryKey: ['workspace', currentWorkspace.id] });
    } catch (err: any) {
      setToast({ type: 'error', message: err.message || 'Failed to update author setting' });
    }
  };

  if (!currentWorkspace) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] text-center max-w-md mx-auto space-y-4 py-12">
        <Building className="w-12 h-12 text-slate-500" />
        <h2 className="text-xl font-bold text-white">No Workspace Selected</h2>
        <p className="text-slate-400 text-xs">Create or select a brand workspace to configure brand identity and social account connections.</p>
      </div>
    );
  }

  return (
    <div className="space-y-8 pb-16 animate-fade-in max-w-5xl">
      <div>
        <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2"><Settings className="w-7 h-7 text-indigo-400" />Workspace Settings</h1>
        <p className="text-slate-400 text-sm mt-1">Brand identity, automation rules, and real-time social connections.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Brand Identity */}
        <Card className="lg:col-span-2 space-y-5 p-6">
          <h2 className="text-base font-bold text-slate-200 flex items-center gap-2"><Building className="w-5 h-5 text-indigo-400" />Brand Identity</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Input label="Brand Name" icon={<Sparkles className="w-4 h-4" />} value={brandName} onChange={e => setBrandName(e.target.value)} required />
            <Input label="Website" icon={<Globe className="w-4 h-4" />} type="url" value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://..." />
            <Input label="Call to Action" icon={<MessageCircle className="w-4 h-4" />} value={cta} onChange={e => setCta(e.target.value)} placeholder="Learn more at..." />
            <div>
              <label htmlFor="emoji-style" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Emoji Style</label>
              <div className="relative">
                <select id="emoji-style" value={emojiStyle} onChange={e => setEmojiStyle(e.target.value)}
                  className="w-full py-2.5 px-3.5 bg-[#080d16] border border-white/5 rounded-xl text-slate-200 text-sm appearance-none focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition cursor-pointer">
                  <option value="none">None</option><option value="minimal">Minimal</option><option value="moderate">Moderate</option><option value="heavy">Heavy</option>
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Brand Voice</label>
            <textarea value={brandVoice} onChange={e => setBrandVoice(e.target.value)} rows={2} placeholder="E.g., 'Bold, confident, action-oriented...'"
              className="w-full px-3.5 py-2.5 bg-[#080d16] border border-white/5 rounded-xl text-slate-200 text-sm resize-none focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition" />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Brand Description (AI Context)</label>
            <textarea value={brandDescription} onChange={e => setBrandDescription(e.target.value)} rows={3} placeholder="Detailed brand background, target audience, core values, products..."
              className="w-full px-3.5 py-2.5 bg-[#080d16] border border-white/5 rounded-xl text-slate-200 text-sm resize-none focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition" />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Contact & Location Info Block (Render-Time Only)</label>
            <textarea value={contactInfoBlock} onChange={e => setContactInfoBlock(e.target.value)} rows={3} placeholder="Fixed address, store hours, contact phone numbers... (Substituted into {{contactBlock}} at render time, AI never sees this text)"
              className="w-full px-3.5 py-2.5 bg-[#080d16] border border-white/5 rounded-xl text-slate-200 text-sm resize-none focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition" />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Default Hashtags</label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {hashtags.map((h, i) => (
                <span key={i} className="text-xs px-2.5 py-0.5 bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 rounded-lg font-semibold flex items-center gap-1">
                  {h}<button type="button" onClick={() => setHashtags(hashtags.filter((_, j) => j !== i))} className="hover:text-rose-400 transition" aria-label={`Remove ${h}`}><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <Input icon={<Hash className="w-4 h-4" />} value={newHashtag} onChange={e => setNewHashtag(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addHashtag(); } }} placeholder="#new_tag" />
              <Button variant="secondary" size="md" onClick={addHashtag}>Add</Button>
            </div>
          </div>
          <Button variant="primary" size="lg" className="w-full" isLoading={saving} onClick={handleSave}>Save Settings</Button>
        </Card>

        {/* Real Social Connections */}
        <Card className="space-y-5 p-5">
          <h2 className="text-base font-bold text-slate-200 flex items-center gap-2"><Link className="w-5 h-5 text-indigo-400" />Real Social Connections</h2>
          {(['LINKEDIN', 'PINTEREST', 'YOUTUBE'] as const).map(platform => {
            const account = freshWs?.socialAccounts?.find((s: any) => s.platform === platform);
            const status = account?.status || 'NOT_CONNECTED';
            const isConfigured = configStatus[platform] ?? true;

            return (
              <div key={platform} className="border border-white/5 rounded-xl p-4 space-y-3 bg-[#080d16]/50">
                <div className="flex items-center justify-between">
                  <span className={`text-sm font-bold ${PLATFORM_COLORS[platform]}`}>{PLATFORM_NAMES[platform]}</span>
                  <Badge type={status} />
                </div>

                {status === 'CONNECTED' && account?.accountName && (
                  <div className="text-xs font-semibold text-emerald-400 flex items-center gap-1 bg-emerald-500/5 border border-emerald-500/10 rounded-lg p-2">
                    <UserCircle className="w-4 h-4 flex-shrink-0" />
                    <span>Connected as <strong>{account.accountName}</strong></span>
                  </div>
                )}

                {status === 'CONNECTED' && platform === 'LINKEDIN' && linkedInCompanies.length > 0 && (
                  <div>
                    <label htmlFor={`li-author-${platform}`} className="block text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-1">Post as</label>
                    <div className="relative">
                      <select id={`li-author-${platform}`} value={linkedInAuthor} onChange={e => handleLinkedInAuthorChange(e.target.value)}
                        className="w-full py-2 px-3 bg-[#070a13] border border-white/5 rounded-lg text-slate-200 text-xs appearance-none focus:outline-none focus:border-indigo-500 transition">
                        <option value="">Personal Profile</option>
                        {linkedInCompanies.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
                    </div>
                  </div>
                )}

                <div className="flex gap-2 pt-1">
                  {status !== 'CONNECTED' ? (
                    <Button variant="primary" size="sm" onClick={() => handleConnect(platform)} disabled={!isConfigured}>
                      {status === 'EXPIRED' ? 'Reconnect' : `Connect ${PLATFORM_NAMES[platform]}`}
                    </Button>
                  ) : (
                    <Button variant="danger" size="sm" icon={<Unlink className="w-3.5 h-3.5" />} onClick={() => setDisconnectTarget(platform)}>
                      Disconnect
                    </Button>
                  )}
                </div>
              </div>
            );
          })}

          {/* Google Business Profile Connection Card */}
          <div className="border border-white/5 rounded-xl p-4 space-y-3 bg-[#080d16]/50">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-emerald-400">Google Business Profile</span>
              <Badge type={freshWs?.googleLocations?.length > 0 ? 'CONNECTED' : 'NOT_CONNECTED'} />
            </div>

            <p className="text-xs text-slate-400">
              Publish local updates, photos, and videos to multiple Google Business locations seamlessly.
            </p>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                variant="primary"
                size="sm"
                onClick={() => {
                  window.location.href = `${API_BASE}/oauth/google-business/connect?workspaceId=${currentWorkspace?.id}`;
                }}
              >
                Connect Google Account
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<Building className="w-3.5 h-3.5" />}
                onClick={() => setShowGBPModal(true)}
              >
                Manage Locations ({freshWs?.googleLocations?.length || 0})
              </Button>
            </div>
          </div>
        </Card>
      </div>

      {showGBPModal && currentWorkspace && (
        <GBPLocationManagerModal
          workspaceId={currentWorkspace.id}
          workspaceName={currentWorkspace.brandName}
          onClose={() => setShowGBPModal(false)}
        />
      )}

      {/* AI Caption Style Guides */}
      <Card className="p-6 space-y-5">
        <div>
          <h2 className="text-base font-bold text-slate-200 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-400" />
            AI Caption Style Guides (Per Platform)
          </h2>
          <p className="text-slate-400 text-xs mt-1">
            Configure optional per-platform style rules. When set, the single AI vision call will generate tailored platform variants alongside the generic Master JSON.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {(['LINKEDIN', 'PINTEREST', 'YOUTUBE'] as const).map(platform => {
            const placeholders: Record<string, string> = {
              LINKEDIN: 'E.g., "Use professional B2B tone with 2 bullet points highlighting craftsmanship and heritage."',
              PINTEREST: 'E.g., "Concise visual discovery hook focusing on aesthetic details, max 200 chars."',
              YOUTUBE: 'E.g., "Engaging video intro description encouraging subscribers and comments."',
            };

            return (
              <div key={platform} className="border border-white/5 rounded-2xl p-4 bg-[#080d16]/50 space-y-3 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className={`text-xs font-extrabold uppercase tracking-wider ${PLATFORM_COLORS[platform]}`}>
                      {PLATFORM_NAMES[platform]} Style Guide
                    </span>
                    {styleGuides[platform] && (
                      <span className="text-[10px] bg-indigo-500/10 text-indigo-300 px-2 py-0.5 rounded-md font-bold">Active</span>
                    )}
                  </div>
                  <textarea
                    value={styleGuides[platform]}
                    onChange={e => setStyleGuides({ ...styleGuides, [platform]: e.target.value })}
                    rows={4}
                    placeholder={placeholders[platform]}
                    className="w-full px-3 py-2 bg-[#070a13] border border-white/5 rounded-xl text-slate-200 text-xs resize-none focus:outline-none focus:border-indigo-500 transition"
                  />
                </div>
                <Button
                  variant="secondary"
                  size="sm"
                  className="w-full"
                  isLoading={savingStyleGuide[platform]}
                  onClick={() => handleSaveStyleGuide(platform)}
                >
                  Save {PLATFORM_NAMES[platform]} Guide
                </Button>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Automation Rules */}
      <Card className="p-6 space-y-5">
        <h2 className="text-base font-bold text-slate-200 flex items-center gap-2"><Zap className="w-5 h-5 text-amber-400" />Automation Rules</h2>
        <div role="radiogroup" aria-label="Automation mode">
          <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">Ingestion Mode</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {([
              { key: 'MANUAL', label: 'Manual', desc: 'Review and schedule manually', icon: <Settings className="w-4 h-4" /> },
              { key: 'AUTO_SCHEDULE', label: 'Auto-Schedule', desc: 'Queue posts after analysis', icon: <Clock className="w-4 h-4" /> },
              { key: 'AUTO_PUBLISH', label: 'Auto-Publish', desc: 'Publish immediately', icon: <Zap className="w-4 h-4" /> },
            ] as const).map(mode => (
              <button key={mode.key} type="button" role="radio" aria-checked={automationMode === mode.key}
                onClick={() => setAutomationMode(mode.key)}
                className={`flex items-start gap-3 border rounded-xl p-4 text-left transition cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                  automationMode === mode.key ? 'border-indigo-500 bg-indigo-500/5' : 'border-white/5 bg-[#080d16] hover:border-white/10'}`}>
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${automationMode === mode.key ? 'bg-indigo-500/20 text-indigo-400' : 'bg-slate-800 text-slate-500'}`}>{mode.icon}</div>
                <div><div className="text-sm font-bold text-slate-200">{mode.label}</div><div className="text-[11px] text-slate-400 mt-0.5">{mode.desc}</div></div>
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <Input label="Default Time Slot" icon={<Clock className="w-4 h-4" />} type="time" value={defaultSlotTime} onChange={e => setDefaultSlotTime(e.target.value)} />
          </div>
          <div>
            <label htmlFor="workspace-timezone" className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">Workspace Timezone (IANA)</label>
            <div className="relative">
              <select id="workspace-timezone" value={timezone} onChange={e => setTimezone(e.target.value)}
                className="w-full py-2.5 px-3.5 bg-[#080d16] border border-white/5 rounded-xl text-slate-200 text-sm appearance-none focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition cursor-pointer">
                <option value="Asia/Kolkata">Asia/Kolkata (IST +05:30)</option>
                <option value="America/New_York">America/New_York (EST/EDT -05:00)</option>
                <option value="America/Los_Angeles">America/Los_Angeles (PST/PDT -08:00)</option>
                <option value="Europe/London">Europe/London (GMT/BST +00:00)</option>
                <option value="Asia/Tokyo">Asia/Tokyo (JST +09:00)</option>
                <option value="UTC">UTC (Coordinated Universal Time)</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            </div>
          </div>
        </div>
        <div className="pt-2 border-t border-white/5">
          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={allowVideoImageFallback} onChange={e => setAllowVideoImageFallback(e.target.checked)} className="w-4 h-4 text-indigo-500 rounded bg-[#070a13] border-white/10 focus:ring-indigo-500" />
            <div>
              <span className="text-xs font-bold text-slate-200 block">Allow Pinterest Video-to-Image Fallback</span>
              <span className="text-[11px] text-slate-400">If native video upload fails on Pinterest, publish extracted static cover frame as image pin. If unchecked, native video failure will fail fast.</span>
            </div>
          </label>
        </div>
      </Card>

      {/* User Notification Preferences */}
      <Card className="p-6 space-y-4">
        <h2 className="text-base font-bold text-slate-200 flex items-center gap-2"><Sparkles className="w-5 h-5 text-indigo-400" />Notification Preferences</h2>
        <p className="text-slate-400 text-xs">Configure which activity notifications appear in your tray and trigger desktop alerts.</p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <label className="flex items-center gap-3 p-3 bg-[#080d16] border border-white/5 rounded-xl cursor-pointer hover:border-white/10">
            <input type="checkbox" defaultChecked={true} className="w-4 h-4 text-indigo-500 rounded bg-[#070a13] border-white/10 focus:ring-indigo-500" />
            <span className="text-xs font-semibold text-slate-200">Alert on Failures</span>
          </label>
          <label className="flex items-center gap-3 p-3 bg-[#080d16] border border-white/5 rounded-xl cursor-pointer hover:border-white/10">
            <input type="checkbox" defaultChecked={false} className="w-4 h-4 text-indigo-500 rounded bg-[#070a13] border-white/10 focus:ring-indigo-500" />
            <span className="text-xs font-semibold text-slate-200">Mute Success Toasts</span>
          </label>
          <label className="flex items-center gap-3 p-3 bg-[#080d16] border border-white/5 rounded-xl cursor-pointer hover:border-white/10">
            <input type="checkbox" defaultChecked={false} className="w-4 h-4 text-indigo-500 rounded bg-[#070a13] border-white/10 focus:ring-indigo-500" />
            <span className="text-xs font-semibold text-slate-200">Mute Auto-Schedule Toasts</span>
          </label>
        </div>
      </Card>

      {/* Disconnect Confirmation Dialog */}
      <ConfirmDialog
        isOpen={!!disconnectTarget}
        title={`Disconnect ${disconnectTarget ? PLATFORM_NAMES[disconnectTarget] : ''}?`}
        message="This will revoke access, remove stored OAuth tokens from the database, and set the status back to Not Connected."
        confirmLabel="Disconnect Now"
        variant="danger"
        isLoading={isDisconnecting}
        onConfirm={handleDisconnectConfirm}
        onClose={() => setDisconnectTarget(null)}
      />

      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </div>
  );
};
