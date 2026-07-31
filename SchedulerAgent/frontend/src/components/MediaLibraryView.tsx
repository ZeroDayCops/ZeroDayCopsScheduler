import React, { useState, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { useMedia, useUploadMedia, useDeleteMedia } from '../hooks/useMedia';
import { API_BASE } from '../lib/api';
import { Badge } from './ui/Badge';
import { Button } from './ui/Button';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { EmptyState } from './ui/EmptyState';
import { ErrorState } from './ui/ErrorState';
import { SkeletonGrid } from './ui/Skeleton';
import { UploadCloud, Image, Video, ChevronRight, Sparkles, Tag, Hash, Smile, Trash2, Loader2, XCircle } from 'lucide-react';

interface MediaItem {
  id: string; filename: string; mediaType: 'IMAGE' | 'VIDEO';
  status: 'NEW' | 'ANALYZING' | 'ANALYZED' | 'FAILED';
  statusDetail?: string | null; aiMasterJson?: any; createdAt: string;
}

const ElapsedTimer: React.FC<{ createdAt: string }> = ({ createdAt }) => {
  const [s, setS] = useState(0);
  React.useEffect(() => {
    const up = () => setS(Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 1000)));
    up(); const t = setInterval(up, 1000); return () => clearInterval(t);
  }, [createdAt]);
  return <span className="text-slate-500 font-mono text-[10px] ml-1">({s}s)</span>;
};

const MediaStatusBadge: React.FC<{ media: MediaItem }> = ({ media }) => {
  switch (media.status) {
    case 'ANALYZED': return <Badge type="PUBLISHED" label="Ready" />;
    case 'ANALYZING': return <span className="flex items-center gap-1.5 text-[11px] font-semibold text-indigo-400"><Loader2 className="w-3 h-3 animate-spin" /><span className="truncate max-w-[120px]">{media.statusDetail || 'Analyzing'}</span><ElapsedTimer createdAt={media.createdAt} /></span>;
    case 'FAILED': return <Badge type="FAILED" />;
    default: return <span className="flex items-center gap-1 text-[11px] font-semibold text-slate-400 animate-pulse-glow"><Badge type="PENDING" label="Queued" /><ElapsedTimer createdAt={media.createdAt} /></span>;
  }
};

import { parseFilenameScheduleFrontend, formatInWorkspaceTimezone } from '../lib/date-utils';

export const MediaLibraryView: React.FC = () => {
  const { currentWorkspace } = useApp();
  const { data, isLoading, isError, refetch } = useMedia();
  const uploadMutation = useUploadMedia();
  const deleteMutation = useDeleteMedia();
  const [selectedMedia, setSelectedMedia] = useState<MediaItem | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaList = data?.media || [];

  // Keep selected media in sync with fetched data
  React.useEffect(() => {
    if (selectedMedia) {
      const updated = mediaList.find(m => m.id === selectedMedia.id);
      if (updated) setSelectedMedia(updated);
    }
  }, [mediaList]);

  const handleUpload = async (file: File) => {
    try { await uploadMutation.mutateAsync(file); } catch {}
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    if (e.dataTransfer.files?.[0]) await handleUpload(e.dataTransfer.files[0]);
  };

  if (!currentWorkspace) return <div className="flex items-center justify-center h-full text-slate-400">Select a workspace first.</div>;

  return (
    <div className="flex h-full gap-8 relative pb-12 animate-fade-in">
      <div className="flex-1 space-y-8 min-w-0">
        <div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">Media Library</h1>
          <p className="text-slate-400 text-sm mt-1">Upload brand photos or videos to trigger Gemini AI analysis.</p>
        </div>

        {/* Drop zone */}
        <div onDragOver={e => { e.preventDefault(); setIsDragging(true); }} onDragLeave={() => setIsDragging(false)} onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()} role="button" tabIndex={0} aria-label="Upload media file"
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click(); }}
          className={`border-2 border-dashed rounded-3xl p-10 flex flex-col items-center justify-center text-center cursor-pointer transition relative overflow-hidden group ${isDragging ? 'border-indigo-500 bg-indigo-500/5' : 'border-white/10 hover:border-indigo-500/50 hover:bg-[#0c1220]'}`}>
          <input type="file" ref={fileInputRef} onChange={e => { if (e.target.files?.[0]) handleUpload(e.target.files[0]); e.target.value = ''; }} className="hidden" accept="image/*,video/*" />
          <div className="w-14 h-14 rounded-2xl bg-slate-900/60 border border-white/5 flex items-center justify-center mb-4 group-hover:scale-105 transition shadow-lg">
            {uploadMutation.isPending ? <Loader2 className="w-6 h-6 text-indigo-400 animate-spin" /> : <UploadCloud className="w-6 h-6 text-slate-400 group-hover:text-indigo-400 transition" />}
          </div>
          <h3 className="text-sm font-bold text-slate-200">{uploadMutation.isPending ? 'Uploading...' : 'Drag and drop your file here'}</h3>
          <p className="text-xs text-slate-500 mt-1.5 max-w-xs">Supports JPEG, PNG, WEBP, MP4, MOV</p>
          {uploadMutation.isError && <div className="mt-4 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-3 py-1.5 rounded-lg">{(uploadMutation.error as Error).message}</div>}
        </div>

        {/* Grid */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-slate-400">All Assets ({mediaList.length})</h3>
          {isLoading ? <SkeletonGrid count={8} /> :
           isError ? <ErrorState onRetry={() => refetch()} /> :
           mediaList.length === 0 ? <EmptyState icon={<FolderHeart className="w-7 h-7" />} title="No media assets yet" description="Drop files here or click upload to begin your AI content pipeline." actionLabel="Upload First Asset" onAction={() => fileInputRef.current?.click()} actionIcon={<UploadCloud className="w-4 h-4" />} /> : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
              {mediaList.map(media => (
                <div key={media.id} role="button" tabIndex={0} onClick={() => setSelectedMedia(media)} onKeyDown={e => { if (e.key === 'Enter') setSelectedMedia(media); }}
                  className={`bg-[#0d1220] border rounded-2xl overflow-hidden cursor-pointer group hover:scale-[1.02] hover:border-indigo-500/40 transition shadow-lg ${selectedMedia?.id === media.id ? 'border-indigo-500' : 'border-white/5'}`}>
                  <div className="aspect-square bg-[#070a13] relative overflow-hidden flex items-center justify-center p-1.5">
                    {media.mediaType === 'VIDEO' && <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10"><Video className="w-8 h-8 text-indigo-400" /></div>}
                    <img src={`${API_BASE}/media/${media.id}/thumbnail`} alt={media.filename} className="max-w-full max-h-full object-contain rounded-lg group-hover:scale-105 transition duration-300"
                      onError={e => { (e.target as HTMLImageElement).src = ''; (e.target as HTMLElement).style.display = 'none'; }} />
                  </div>
                  <div className="p-3 space-y-1.5">
                    <div className="text-xs font-bold text-slate-300 truncate" title={media.filename}>{media.filename}</div>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-slate-500">{new Date(media.createdAt).toLocaleDateString()}</span>
                      <MediaStatusBadge media={media} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Drawer */}
      {selectedMedia && (
        <div className="w-96 bg-[#0c1220] border-l border-white/5 p-6 space-y-6 flex flex-col flex-shrink-0 animate-slide-in overflow-y-auto z-40">
          <div className="flex items-center justify-between border-b border-white/5 pb-4">
            <h3 className="font-extrabold text-slate-200 text-base">Asset Details</h3>
            <button onClick={() => setSelectedMedia(null)} className="p-1 hover:bg-white/5 rounded-lg text-slate-400 hover:text-slate-200 transition" aria-label="Close details"><ChevronRight className="w-5 h-5" /></button>
          </div>

          <div className="aspect-video bg-black rounded-xl overflow-hidden relative flex items-center justify-center border border-white/5">
            {selectedMedia.mediaType === 'VIDEO' ? <video src={`${API_BASE}/media/${selectedMedia.id}/file`} controls className="w-full h-full object-contain" /> :
              <img src={`${API_BASE}/media/${selectedMedia.id}/file`} alt={selectedMedia.filename} className="w-full h-full object-contain" />}
          </div>

          <div className="space-y-3 text-xs">
            <div><span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Filename</span><div className="font-bold text-slate-300 break-all mt-0.5">{selectedMedia.filename}</div></div>
            {(() => {
              const res = parseFilenameScheduleFrontend(selectedMedia.filename, currentWorkspace?.defaultSlotTime || '20:00');
              if (res.isMatch) {
                return (
                  <div className="bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 p-2.5 rounded-xl flex items-center justify-between">
                    <span className="text-[11px] font-bold">Detected Schedule</span>
                    <span className="text-xs font-extrabold text-indigo-400">{res.formattedText}</span>
                  </div>
                );
              }
              return (
                <div className="bg-amber-500/10 border border-amber-500/20 text-amber-300 p-2.5 rounded-xl flex items-center justify-between">
                  <span className="text-[11px] font-bold">Detected Schedule</span>
                  <span className="text-[11px] font-bold text-amber-400">{res.error || 'Unable to detect'}</span>
                </div>
              );
            })()}
            <div className="flex gap-4">
              <div><span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Type</span><div className="font-bold text-slate-300 mt-0.5 flex items-center gap-1">{selectedMedia.mediaType === 'VIDEO' ? <Video className="w-3.5 h-3.5 text-purple-400" /> : <Image className="w-3.5 h-3.5 text-indigo-400" />}{selectedMedia.mediaType}</div></div>
              <div><span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Ingested</span><div className="font-bold text-slate-300 mt-0.5">{new Date(selectedMedia.createdAt).toLocaleString()}</div></div>
            </div>
            <div><span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Status</span><div className="mt-1"><MediaStatusBadge media={selectedMedia} /></div></div>
          </div>

          {selectedMedia.status === 'ANALYZED' && selectedMedia.aiMasterJson && (
            <div className="space-y-4 border-t border-white/5 pt-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5"><Sparkles className="w-4 h-4 text-indigo-400" />Gemini Master Content</h4>
              <div className="bg-[#070b14] border border-white/5 rounded-xl p-4 space-y-3 text-xs">
                {selectedMedia.aiMasterJson.product && <div><span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Theme</span><div className="text-sm font-bold text-indigo-300 mt-1">{selectedMedia.aiMasterJson.product}</div></div>}
                {selectedMedia.aiMasterJson.headline && <div><span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Headline</span><div className="font-bold text-slate-200 mt-1 italic">"{selectedMedia.aiMasterJson.headline}"</div></div>}
                {selectedMedia.aiMasterJson.description && <div><span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">Copy</span><div className="text-slate-300 leading-relaxed mt-1 whitespace-pre-wrap">{selectedMedia.aiMasterJson.description}</div></div>}
                {selectedMedia.aiMasterJson.suggested_cta && <div><span className="text-[10px] uppercase font-bold tracking-wider text-slate-500">CTA</span><div className="font-semibold text-purple-300 mt-1">{selectedMedia.aiMasterJson.suggested_cta}</div></div>}
                {selectedMedia.aiMasterJson.mood && <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-slate-800 text-slate-400"><Smile className="w-3.5 h-3.5" />Mood: {selectedMedia.aiMasterJson.mood}</div>}
                {selectedMedia.aiMasterJson.keywords && <div><div className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-1.5 flex items-center gap-1"><Tag className="w-3 h-3" />Keywords</div><div className="flex flex-wrap gap-1">{selectedMedia.aiMasterJson.keywords.map((kw: string, i: number) => <span key={i} className="text-[10px] px-2 py-0.5 bg-slate-800 text-slate-400 rounded-md font-semibold">{kw}</span>)}</div></div>}
                {selectedMedia.aiMasterJson.hashtags && <div><div className="text-[10px] uppercase font-bold tracking-wider text-slate-500 mb-1.5 flex items-center gap-1"><Hash className="w-3 h-3" />Hashtags</div><div className="flex flex-wrap gap-1">{selectedMedia.aiMasterJson.hashtags.map((tag: string, i: number) => <span key={i} className="text-[10px] px-2 py-0.5 bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 rounded-md font-semibold">{tag}</span>)}</div></div>}
              </div>
            </div>
          )}
          {selectedMedia.status === 'FAILED' && (
            <div className="bg-rose-500/5 border border-rose-500/10 text-rose-400 text-xs rounded-xl p-4 space-y-2">
              <h5 className="font-bold flex items-center gap-1"><XCircle className="w-4 h-4" />Ingestion Failed</h5>
              <p className="leading-relaxed">{selectedMedia.aiMasterJson?.error || 'Gemini analysis failed.'}</p>
            </div>
          )}
          {(selectedMedia.status === 'NEW' || selectedMedia.status === 'ANALYZING') && (
            <div className="bg-[#070b14] border border-white/5 text-slate-400 text-xs rounded-xl p-5 text-center italic flex flex-col items-center gap-3">
              <div className="flex items-center gap-2 font-semibold"><Loader2 className="w-4 h-4 animate-spin text-indigo-500" />{selectedMedia.statusDetail || 'Analysis in progress.'}</div>
              <div className="text-[10px] text-slate-500 font-mono">Active for <ElapsedTimer createdAt={selectedMedia.createdAt} /></div>
            </div>
          )}

          <div className="pt-4 border-t border-white/5">
            <Button variant="danger" className="w-full" icon={<Trash2 className="w-4 h-4" />} onClick={() => setDeleteTarget(selectedMedia.id)}>Delete Asset Permanently</Button>
          </div>
        </div>
      )}

      <ConfirmDialog isOpen={!!deleteTarget} title="Delete Media Asset" message="This will permanently remove the file and any scheduled posts using it. This cannot be undone."
        confirmLabel="Delete Forever" variant="danger" isLoading={deleteMutation.isPending}
        onConfirm={async () => { if (deleteTarget) { await deleteMutation.mutateAsync(deleteTarget); setSelectedMedia(null); setDeleteTarget(null); } }}
        onClose={() => setDeleteTarget(null)} />
    </div>
  );
};

// Need this import for the EmptyState icon
import { FolderHeart } from 'lucide-react';
