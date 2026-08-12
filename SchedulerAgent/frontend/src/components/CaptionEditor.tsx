import React, { useEffect, useState } from 'react';
import { CheckCircle2, Globe, Loader2, Save, Sparkles } from 'lucide-react';
import { fetchApi } from '../lib/api';
import { Button } from './ui/Button';

export interface CaptionEditorMedia {
  id: string;
  status: 'NEW' | 'ANALYZING' | 'ANALYZED' | 'FAILED';
  destinationUrl?: string | null;
  aiMasterJson?: Record<string, unknown> | null;
}

interface MasterJsonDraft {
  headline: string;
  description: string;
  keywords: string[];
  hashtags: string[];
  destinationUrl: string;
}

interface CaptionUpdateResponse {
  media: CaptionEditorMedia;
  aiMasterJson: Record<string, unknown>;
  refreshedPostIds: string[];
  refreshedPostCount: number;
}

interface CaptionEditorProps {
  media: CaptionEditorMedia;
  onUpdated?: (media: CaptionEditorMedia) => void;
  compact?: boolean;
}

function draftFromMasterJson(masterJson?: Record<string, unknown> | null, destinationUrl?: string | null): MasterJsonDraft {
  return {
    headline: typeof masterJson?.headline === 'string' ? masterJson.headline : '',
    description: typeof masterJson?.description === 'string' ? masterJson.description : '',
    keywords: Array.isArray(masterJson?.keywords) ? masterJson.keywords.filter((value): value is string => typeof value === 'string') : [],
    hashtags: Array.isArray(masterJson?.hashtags) ? masterJson.hashtags.filter((value): value is string => typeof value === 'string') : [],
    destinationUrl: typeof destinationUrl === 'string' ? destinationUrl : '',
  };
}

function parseList(value: string, isHashtag = false): string[] {
  return value
    .split(/[\n,]/)
    .map(item => item.trim())
    .filter(Boolean)
    .map(item => isHashtag && !item.startsWith('#') ? `#${item}` : item);
}

export const CaptionEditor: React.FC<CaptionEditorProps> = ({ media, onUpdated, compact = false }) => {
  const [draft, setDraft] = useState<MasterJsonDraft>(() => draftFromMasterJson(media.aiMasterJson, media.destinationUrl));
  const [productInput, setProductInput] = useState(() => {
    return typeof media.aiMasterJson?.product === 'string' ? media.aiMasterJson.product : '';
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  useEffect(() => {
    setDraft(draftFromMasterJson(media.aiMasterJson, media.destinationUrl));
    setProductInput(typeof media.aiMasterJson?.product === 'string' ? media.aiMasterJson.product : '');
    setError(null);
    setConfirmation(null);
  }, [media.id, media.aiMasterJson, media.destinationUrl]);

  const applyUpdate = (result: CaptionUpdateResponse) => {
    setDraft(draftFromMasterJson(result.aiMasterJson, result.media?.destinationUrl ?? draft.destinationUrl));
    if (typeof result.aiMasterJson?.product === 'string') {
      setProductInput(result.aiMasterJson.product);
    }
    setConfirmation(
      result.refreshedPostCount > 0
        ? `${result.refreshedPostCount} scheduled post${result.refreshedPostCount === 1 ? '' : 's'} updated.`
        : 'Caption saved successfully.'
    );
    onUpdated?.(result.media);
  };

  const generate = async () => {
    setIsGenerating(true);
    setError(null);
    setConfirmation(null);
    try {
      const userTags = productInput.trim()
        ? productInput.split(',').map(item => item.trim()).filter(Boolean)
        : [];
      const result = await fetchApi<CaptionUpdateResponse>(`/media/${media.id}/regenerate-caption`, {
        method: 'POST',
        body: JSON.stringify({ userTags, notes: '' }),
      });
      applyUpdate(result);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Caption generation failed.');
    } finally {
      setIsGenerating(false);
    }
  };

  const save = async () => {
    setIsSaving(true);
    setError(null);
    setConfirmation(null);
    try {
      const result = await fetchApi<CaptionUpdateResponse>(`/media/${media.id}/caption`, {
        method: 'PATCH',
        body: JSON.stringify(draft),
      });
      applyUpdate(result);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Caption save failed.');
    } finally {
      setIsSaving(false);
    }
  };

  if (media.status !== 'ANALYZED' || !media.aiMasterJson) {
    return <div className="text-xs text-slate-500 italic">Caption editing becomes available after analysis completes.</div>;
  }

  return (
    <section className={`space-y-4 ${compact ? 'pt-3' : 'border-t border-white/5 pt-4'}`} aria-label="Caption editor">
      <div className="flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-indigo-400" />
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Caption Editor</h4>
      </div>

      <div className="space-y-2">
        <label className="block text-[10px] font-bold uppercase tracking-wider text-indigo-400">
          Product / Garment Name
        </label>
        <div className="flex gap-2">
          <input
            value={productInput}
            onChange={event => setProductInput(event.target.value)}
            onKeyDown={event => {
              if (event.key === 'Enter') {
                event.preventDefault();
                generate();
              }
            }}
            placeholder="e.g. Indo-Western Sherwani, Kurta Set"
            className="min-w-0 flex-1 rounded-lg border border-indigo-500/30 bg-slate-900/90 px-3 py-2 text-xs font-semibold text-slate-100 placeholder-slate-500 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400/50"
          />
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={generate}
            isLoading={isGenerating}
            icon={isGenerating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold whitespace-nowrap"
          >
            Auto-Generate
          </Button>
        </div>
      </div>

      <div className="space-y-3 rounded-xl border border-white/5 bg-[#070b14] p-3">
        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Destination Link (URL) <span className="normal-case text-slate-600">(Overrides website link for Pinterest & social posts)</span>
          <div className="relative mt-1.5 flex items-center">
            <Globe className="absolute left-2.5 w-3.5 h-3.5 text-indigo-400 pointer-events-none" />
            <input
              value={draft.destinationUrl}
              onChange={event => setDraft(current => ({ ...current, destinationUrl: event.target.value }))}
              placeholder="https://jamairaja.in/collection/sherwani"
              className="w-full rounded-lg border border-white/10 bg-slate-900/70 pl-8 pr-2.5 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500"
            />
          </div>
        </label>
        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Headline
          <input value={draft.headline} onChange={event => setDraft(current => ({ ...current, headline: event.target.value }))}
            className="mt-1.5 w-full rounded-lg border border-white/10 bg-slate-900/70 px-2.5 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500" />
        </label>
        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Caption
          <textarea value={draft.description} onChange={event => setDraft(current => ({ ...current, description: event.target.value }))} rows={compact ? 4 : 5}
            className="mt-1.5 w-full resize-y rounded-lg border border-white/10 bg-slate-900/70 px-2.5 py-2 text-xs leading-relaxed text-slate-200 outline-none focus:border-indigo-500" />
        </label>
        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Keywords <span className="normal-case text-slate-600">(comma-separated)</span>
          <input value={draft.keywords.join(', ')} onChange={event => setDraft(current => ({ ...current, keywords: parseList(event.target.value) }))}
            className="mt-1.5 w-full rounded-lg border border-white/10 bg-slate-900/70 px-2.5 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500" />
        </label>
        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Hashtags <span className="normal-case text-slate-600">(comma-separated)</span>
          <input value={draft.hashtags.join(', ')} onChange={event => setDraft(current => ({ ...current, hashtags: parseList(event.target.value, true) }))}
            className="mt-1.5 w-full rounded-lg border border-white/10 bg-slate-900/70 px-2.5 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500" />
        </label>
      </div>

      {error && <div className="rounded-lg border border-rose-500/20 bg-rose-500/10 p-2 text-xs text-rose-300">{error}</div>}
      {confirmation && <div className="flex items-center gap-1.5 rounded-lg border border-emerald-500/20 bg-emerald-500/10 p-2 text-xs text-emerald-300"><CheckCircle2 className="w-3.5 h-3.5" />{confirmation}</div>}

      <Button type="button" variant="primary" size="sm" onClick={save} isLoading={isSaving} icon={<Save className="w-3.5 h-3.5" />}>Save caption</Button>
    </section>
  );
};
