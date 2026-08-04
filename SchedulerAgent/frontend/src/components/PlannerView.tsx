import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useMedia } from '../hooks/useMedia';
import { usePosts, useCreatePost, useDeletePost, usePublishNow } from '../hooks/usePosts';
import { fetchApi, API_BASE } from '../lib/api';
import { Badge } from './ui/Badge';
import { Card } from './ui/Card';
import { Button } from './ui/Button';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { EmptyState } from './ui/EmptyState';
import { ErrorState } from './ui/ErrorState';
import { SkeletonList } from './ui/Skeleton';
import { Toast } from './ui/Toast';
import {
  CalendarDays, Video, ChevronDown, ChevronUp, Loader2, AlertTriangle,
  Plus, Sparkles, Link, RefreshCw, Trash2, Check
} from 'lucide-react';

import { formatInWorkspaceTimezone } from '../lib/date-utils';

const PLATFORM_NAMES: Record<string, string> = { LINKEDIN: 'LinkedIn', PINTEREST: 'Pinterest', YOUTUBE: 'YouTube' };

interface PreviewContent { title?: string; body: string; hashtags?: string[]; warnings?: string[] }

export const PlannerView: React.FC = () => {
  const { currentWorkspace } = useApp();
  const mediaQuery = useMedia();
  const postsQuery = usePosts();
  const createPost = useCreatePost();
  const deletePost = useDeletePost();
  const publishNow = usePublishNow();

  const [selectedMedia, setSelectedMedia] = useState<any>(null);
  const [platforms, setPlatforms] = useState<string[]>(['LINKEDIN']);
  const [scheduledFor, setScheduledFor] = useState('');
  const [preview, setPreview] = useState<PreviewContent | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [expandedLogs, setExpandedLogs] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Confirm dialog state
  const [confirmAction, setConfirmAction] = useState<{ type: 'delete' | 'publish'; id: string } | null>(null);

  const allMedia = mediaQuery.data?.media || [];
  const scheduledPosts = postsQuery.data?.posts || [];

  // Default scheduled time
  useEffect(() => {
    const d = new Date(Date.now() + 5 * 60_000);
    setScheduledFor(new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16));
  }, []);

  // Live preview
  useEffect(() => {
    if (!selectedMedia || !currentWorkspace || !platforms.length) { setPreview(null); return; }
    let cancelled = false;
    setPreviewLoading(true); setPreviewError(null);
    fetchApi<any>(`/media/${selectedMedia.id}/preview?platform=${platforms[0]}`)
      .then(d => { if (!cancelled) setPreview(d.rendered); })
      .catch(e => { if (!cancelled) { setPreviewError(e.message); setPreview(null); } })
      .finally(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [selectedMedia?.id, platforms[0], currentWorkspace?.id]);

  const handleSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMedia || !scheduledFor || !platforms.length) return;
    try {
      await Promise.all(platforms.map(p =>
        createPost.mutateAsync({ mediaId: selectedMedia.id, platform: p, scheduledFor: new Date(scheduledFor).toISOString() })
      ));
      setToast({ type: 'success', message: 'Post scheduled successfully!' });
      setSelectedMedia(null); setPreview(null);
    } catch (err: any) {
      setToast({ type: 'error', message: err.message || 'Failed to schedule' });
    }
  };

  const togglePlatform = (p: string) => {
    // Enforce: YouTube only for VIDEO
    if (p === 'YOUTUBE' && selectedMedia?.mediaType === 'IMAGE') return;
    setPlatforms(prev => prev.includes(p) ? (prev.length === 1 ? prev : prev.filter(x => x !== p)) : [...prev, p]);
  };

  // Auto-deselect YouTube when switching to IMAGE media
  useEffect(() => {
    if (selectedMedia?.mediaType === 'IMAGE' && platforms.includes('YOUTUBE')) {
      setPlatforms(prev => {
        const filtered = prev.filter(p => p !== 'YOUTUBE');
        return filtered.length === 0 ? ['LINKEDIN'] : filtered;
      });
    }
  }, [selectedMedia?.id]);

  const executeConfirm = async () => {
    if (!confirmAction) return;
    try {
      if (confirmAction.type === 'delete') await deletePost.mutateAsync(confirmAction.id);
      else await publishNow.mutateAsync(confirmAction.id);
      setToast({ type: 'success', message: confirmAction.type === 'delete' ? 'Post deleted' : 'Publish triggered' });
    } catch (err: any) {
      setToast({ type: 'error', message: err.message });
    }
    setConfirmAction(null);
  };

  if (!currentWorkspace) return <div className="flex items-center justify-center h-full text-slate-400">Select a workspace to configure schedules.</div>;

  return (
    <div className="space-y-10 pb-16 animate-fade-in">
      <div>
        <h1 className="text-2xl font-extrabold text-white tracking-tight flex items-center gap-2"><CalendarDays className="w-7 h-7 text-indigo-400" />Campaign Planner</h1>
        <p className="text-slate-400 text-sm mt-1">Cross-platform campaign builder and scheduled posts queue.</p>
      </div>

      {/* Builder */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Media selector */}
        <Card className="p-5 space-y-4 min-h-[400px] max-h-[560px] flex flex-col">
          <h3 className="text-sm font-bold text-slate-300 border-b border-white/5 pb-2">1. Select Media</h3>
          <div className="flex-1 overflow-y-auto space-y-2 pr-1">
            {mediaQuery.isLoading ? <SkeletonList count={3} /> :
             mediaQuery.isError ? <ErrorState onRetry={() => mediaQuery.refetch()} /> :
             allMedia.length === 0 ? <div className="text-center text-xs text-slate-500 italic p-6">No media assets found. Upload in Media Library first.</div> :
             allMedia.map(m => {
               const isAnalyzed = m.status === 'ANALYZED';
               const isProcessing = m.status === 'NEW' || m.status === 'ANALYZING';
               const isFailed = m.status === 'FAILED';
               return (
                <div key={m.id} role="button" tabIndex={0}
                  onClick={() => { if (isAnalyzed) setSelectedMedia(m); }}
                  onKeyDown={e => { if (e.key === 'Enter' && isAnalyzed) setSelectedMedia(m); }}
                  className={`border p-3 rounded-xl transition flex gap-3 items-center ${
                    !isAnalyzed ? 'opacity-60 cursor-not-allowed border-white/5 bg-[#080d16]/20' :
                    selectedMedia?.id === m.id ? 'border-indigo-500 bg-indigo-500/5 cursor-pointer' : 'border-white/5 bg-[#080d16]/40 hover:border-white/10 cursor-pointer'
                  }`}>
                  <div className="w-12 h-12 bg-slate-900 border border-white/10 rounded-lg overflow-hidden flex-shrink-0 relative">
                    <img src={`${API_BASE}/media/${m.id}/thumbnail`} alt={m.filename} className="w-full h-full object-cover" />
                    {m.mediaType === 'VIDEO' && <div className="absolute inset-0 flex items-center justify-center bg-black/30"><Video className="w-4 h-4 text-white" /></div>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-slate-300 truncate">{m.filename}</div>
                    <div className="text-[10px] text-slate-500 truncate mt-0.5">
                      {isProcessing ? <span className="text-indigo-400 font-semibold flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" />Processing...</span> :
                       isFailed ? <span className="text-rose-400 font-semibold">Analysis Failed</span> :
                       (m.aiMasterJson?.product || 'Ready to Schedule')}
                    </div>
                  </div>
                </div>
               );
             })}
          </div>
        </Card>

        {/* Settings + Preview */}
        <div className="md:col-span-2 flex flex-col md:flex-row gap-6">
          <Card className="flex-1 p-5 space-y-4 flex flex-col justify-between">
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-slate-300 border-b border-white/5 pb-2">2. Design & Queue</h3>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Platforms</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['LINKEDIN', 'PINTEREST', 'YOUTUBE'] as const).map(p => {
                    const isYouTubeDisabled = p === 'YOUTUBE' && selectedMedia?.mediaType === 'IMAGE';
                    return (
                      <button key={p} type="button" onClick={() => togglePlatform(p)} aria-pressed={platforms.includes(p)}
                        disabled={isYouTubeDisabled}
                        title={isYouTubeDisabled ? 'YouTube requires video assets' : undefined}
                        className={`py-2 px-3 border rounded-xl text-xs font-bold transition text-center uppercase tracking-wide focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                          isYouTubeDisabled ? 'border-white/5 bg-[#080d16] text-slate-600 cursor-not-allowed opacity-50' :
                          platforms.includes(p) ? 'border-indigo-500 bg-indigo-500/5 text-indigo-400 cursor-pointer' : 'border-white/5 bg-[#080d16] text-slate-400 hover:border-white/10 cursor-pointer'}`}>
                        {PLATFORM_NAMES[p]}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label htmlFor="scheduled-date" className="block text-xs font-semibold uppercase tracking-wider text-slate-500 mb-1.5">Schedule Time</label>
                <input id="scheduled-date" type="datetime-local" required value={scheduledFor} onChange={e => setScheduledFor(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[#080d16] border border-white/5 rounded-xl text-slate-200 focus:outline-none focus:border-indigo-500 transition text-sm" />
              </div>
            </div>
            <Button variant="primary" size="lg" className="w-full" onClick={handleSchedule} isLoading={createPost.isPending} disabled={!selectedMedia || previewLoading} icon={<Plus className="w-5 h-5" />}>
              Schedule Campaign Post
            </Button>
          </Card>

          <Card className="flex-1 p-5 flex flex-col justify-between">
            <h3 className="text-sm font-bold text-slate-300 border-b border-white/5 pb-2 flex justify-between items-center">
              <span>3. Live Preview</span>
              {platforms.length > 1 && <span className="text-[10px] bg-slate-800 text-slate-400 px-2 py-0.5 rounded capitalize">{platforms[0].toLowerCase()}</span>}
            </h3>
            <div className="flex-1 overflow-y-auto py-4 flex flex-col justify-center">
              {previewLoading ? <div className="text-center text-xs text-slate-500 py-8 flex flex-col items-center gap-2"><Loader2 className="w-5 h-5 animate-spin text-indigo-400" />Generating...</div> :
               previewError ? <div className="bg-rose-500/5 border border-rose-500/10 text-rose-400 text-xs rounded-xl p-4 flex items-start gap-2"><AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" /><div><strong>Preview Error</strong><div className="mt-0.5">{previewError}</div></div></div> :
               preview ? (
                <div className="bg-[#080d16] border border-white/5 rounded-xl p-4 space-y-3 text-xs">
                  {preview.title && <h4 className="text-sm font-bold text-slate-200 truncate">{preview.title}</h4>}
                  <p className="text-slate-300 leading-relaxed whitespace-pre-wrap">{preview.body}</p>
                  {preview.hashtags?.length ? <div className="text-indigo-400 font-semibold">{preview.hashtags.join(' ')}</div> : null}
                  {preview.warnings?.length ? <div className="bg-amber-500/10 border border-amber-500/20 text-amber-300 text-[11px] rounded-lg p-2.5 flex items-start gap-1.5"><AlertTriangle className="w-3.5 h-3.5 mt-0.5 text-amber-400 flex-shrink-0" /><div>{preview.warnings.map((w, i) => <div key={i}>{w}</div>)}</div></div> : null}
                </div>
              ) : <div className="text-center text-xs text-slate-500 italic p-6">Select media to preview.</div>}
            </div>
          </Card>
        </div>
      </div>

      {/* Queue */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-slate-300 flex items-center gap-1.5"><CalendarDays className="w-5 h-5 text-indigo-400" />Publishing Queue</h2>
        {postsQuery.isLoading ? <SkeletonList count={3} /> :
         postsQuery.isError ? <ErrorState onRetry={() => postsQuery.refetch()} /> :
         scheduledPosts.length === 0 ? <EmptyState icon={<CalendarDays className="w-7 h-7" />} title="No scheduled posts" description="Select an asset above to design and queue a post." /> : (
          <div className="space-y-4">
            {scheduledPosts.map(post => {
              const isExpanded = !!expandedLogs[post.id];
              return (
                <Card key={post.id} className="p-0 overflow-hidden">
                  <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-lg bg-slate-900 border border-white/10 overflow-hidden flex-shrink-0 relative">
                        <img src={`${API_BASE}/media/${post.mediaId}/thumbnail`} alt="Thumb" className="w-full h-full object-contain" />
                        {post.media.mediaType === 'VIDEO' && <div className="absolute inset-0 flex items-center justify-center bg-black/30"><Video className="w-4 h-4 text-white" /></div>}
                      </div>
                      <div>
                        <div className="flex items-center gap-2"><span className="text-xs font-bold uppercase tracking-wider text-slate-400">{PLATFORM_NAMES[post.platform] || post.platform}</span><Badge type={post.status} /></div>
                        <div className="text-[11px] text-slate-500 mt-1">Scheduled: <strong className="text-slate-300">{formatInWorkspaceTimezone(post.scheduledFor, currentWorkspace?.timezone || 'Asia/Kolkata')} ({currentWorkspace?.timezone || 'Asia/Kolkata'})</strong></div>
                        {post.externalPostId && <div className="text-[10px] text-indigo-400 font-bold mt-0.5 truncate max-w-xs flex items-center gap-1"><Link className="w-3 h-3" />ID: {post.externalPostId}</div>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 ml-auto sm:ml-0">
                      {post.status === 'PENDING_REVIEW' && (
                        <Button
                          variant="secondary"
                          size="sm"
                          icon={<Check className="w-3.5 h-3.5 text-emerald-400" />}
                          onClick={async () => {
                            try {
                              await fetchApi(`/workspaces/${currentWorkspace.id}/scheduled-posts/${post.id}`, {
                                method: 'PUT',
                                body: JSON.stringify({ status: 'PENDING' }),
                              });
                              postsQuery.refetch();
                              setToast({ type: 'success', message: 'Post approved!' });
                            } catch (err: any) {
                              setToast({ type: 'error', message: err.message || 'Failed to approve' });
                            }
                          }}
                        >
                          Approve
                        </Button>
                      )}
                      {post.status !== 'PUBLISHED' && <Button variant="primary" size="sm" icon={<Sparkles className="w-3.5 h-3.5" />} onClick={() => setConfirmAction({ type: 'publish', id: post.id })}>Publish Now</Button>}
                      <Button variant="secondary" size="sm" icon={<RefreshCw className="w-3.5 h-3.5" />} onClick={() => setExpandedLogs(p => ({ ...p, [post.id]: !p[post.id] }))} aria-expanded={isExpanded}>
                        Logs {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </Button>
                      <Button variant="danger" size="sm" icon={<Trash2 className="w-4 h-4" />} onClick={() => setConfirmAction({ type: 'delete', id: post.id })} aria-label="Delete post" />
                    </div>
                  </div>
                  {isExpanded && (
                    <div className="bg-[#080d16] border-t border-white/5 p-4 space-y-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Activity Logs</h4>
                      {post.postLogs.length === 0 ? <div className="text-xs text-slate-500 italic">No logs yet.</div> :
                        post.postLogs.map(log => (
                          <div key={log.id} className="flex items-start justify-between border-b border-white/5 pb-2 last:border-0 last:pb-0 gap-4">
                            <div className="flex items-center gap-2"><Badge type={log.event} /><span className="text-xs text-slate-300 font-semibold">{log.message}</span></div>
                            <span className="text-[10px] text-slate-500 shrink-0">{new Date(log.createdAt).toLocaleString()}</span>
                          </div>
                        ))}
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmDialog isOpen={!!confirmAction} title={confirmAction?.type === 'delete' ? 'Delete Scheduled Post' : 'Publish Immediately'}
        message={confirmAction?.type === 'delete' ? 'This will permanently remove the scheduled post and its execution logs.' : 'This will force immediate publishing. Ensure your social account tokens are valid.'}
        confirmLabel={confirmAction?.type === 'delete' ? 'Delete' : 'Publish Now'} variant={confirmAction?.type === 'delete' ? 'danger' : 'warning'}
        isLoading={deletePost.isPending || publishNow.isPending} onConfirm={executeConfirm} onClose={() => setConfirmAction(null)} />

      {toast && <Toast type={toast.type} message={toast.message} onClose={() => setToast(null)} />}
    </div>
  );
};
