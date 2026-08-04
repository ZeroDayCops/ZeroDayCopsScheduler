import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import {
  useBulkUploadUrls,
  useBatchStatus,
  useBatchReorder,
  useSchedulePreview,
  useBatchCommit,
  useBatchApprove,
  type ScheduleConfigInput,
} from '../hooks/useBulkUpload';
import { API_BASE } from '../lib/api';
import { Button } from './ui/Button';
import {
  UploadCloud,
  X,
  GripVertical,
  Calendar,
  Clock,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Loader2,
  Sliders,
  Check,
  Eye,
  ArrowRight,
} from 'lucide-react';

interface BulkUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const BulkUploadModal: React.FC<BulkUploadModalProps> = ({ isOpen, onClose }) => {
  const { currentWorkspace } = useApp();
  const bulkUploadUrlsMutation = useBulkUploadUrls();
  const reorderMutation = useBatchReorder();
  const previewMutation = useSchedulePreview();
  const commitMutation = useBatchCommit();
  const approveMutation = useBatchApprove();

  const [createdBatchId, setCreatedBatchId] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [draggedMediaIndex, setDraggedMediaIndex] = useState<number | null>(null);

  // Schedule config state
  const todayStr = new Date().toISOString().split('T')[0];
  const [strategy, setStrategy] = useState<'sequential-daily' | 'filename-sequence'>('sequential-daily');
  const [startDate, setStartDate] = useState<string>(todayStr);
  const [perDay, setPerDay] = useState<number>(1);
  const [timeSlots, setTimeSlots] = useState<string[]>([currentWorkspace?.defaultSlotTime || '20:00']);

  // Mode override state (null = workspace default)
  const [publishModeOverride, setPublishModeOverride] = useState<string | null>(null);
  const [previewList, setPreviewList] = useState<any[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: batchData } = useBatchStatus(createdBatchId);
  const batch = batchData?.batch;
  const mediaList = batch?.media || [];

  // Re-run schedule preview when config or media order changes
  useEffect(() => {
    if (createdBatchId && mediaList.length > 0) {
      const scheduleConfig: ScheduleConfigInput = {
        strategy,
        startDate,
        perDay,
        timeSlots,
      };
      previewMutation.mutate(
        { batchId: createdBatchId, scheduleConfig },
        {
          onSuccess: (data) => setPreviewList(data.preview),
        }
      );
    }
  }, [createdBatchId, mediaList.length, strategy, startDate, perDay, timeSlots.join(',')]);

  if (!isOpen) return null;

  const handleFileSelect = (files: FileList | File[]) => {
    const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const arr = Array.from(files).filter(f => {
      // Check MIME type first, then fallback to extension (File.type can be empty on some OS/browser combos)
      if (f.type && f.type.startsWith('image/')) return true;
      const ext = f.name.toLowerCase().slice(f.name.lastIndexOf('.'));
      return IMAGE_EXTS.includes(ext);
    }).slice(0, 20);
    if (arr.length === 0) return;

    bulkUploadUrlsMutation.mutate(arr, {
      onSuccess: (batchResult) => {
        setCreatedBatchId(batchResult.id);
      },
    });
  };

  const handleDropFiles = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    if (e.dataTransfer.files) {
      handleFileSelect(e.dataTransfer.files);
    }
  };

  // Drag-and-drop reorder handlers for thumbnail grid
  const handleDragStartMedia = (index: number) => {
    setDraggedMediaIndex(index);
  };

  const handleDropMedia = (targetIndex: number) => {
    if (draggedMediaIndex === null || draggedMediaIndex === targetIndex || !createdBatchId) return;

    const newMedia = [...mediaList];
    const [moved] = newMedia.splice(draggedMediaIndex, 1);
    newMedia.splice(targetIndex, 0, moved);

    const mediaIds = newMedia.map((m) => m.id);
    reorderMutation.mutate({ batchId: createdBatchId, mediaIds });
    setDraggedMediaIndex(null);
  };

  const isAnalyzingAny = mediaList.some((m) => m.status === 'NEW' || m.status === 'ANALYZING');
  const failedCount = mediaList.filter((m) => m.status === 'FAILED').length;
  const analyzedCount = mediaList.filter((m) => m.status === 'ANALYZED').length;

  const effectiveMode = publishModeOverride ?? currentWorkspace?.automationMode ?? 'MANUAL';

  const handleCommit = () => {
    if (!createdBatchId) return;
    const scheduleConfig: ScheduleConfigInput = {
      strategy,
      startDate,
      perDay,
      timeSlots,
    };
    commitMutation.mutate({
      batchId: createdBatchId,
      scheduleConfig,
      publishModeOverride,
    });
  };

  const handleApproveAll = () => {
    if (!createdBatchId) return;
    approveMutation.mutate(createdBatchId);
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 sm:p-6 animate-fade-in overflow-y-auto">
      <div className="bg-[#0c1220] border border-white/10 rounded-3xl w-full max-w-5xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh] my-auto">
        {/* Modal Header */}
        <div className="p-6 border-b border-white/5 flex items-center justify-between bg-[#080d18]">
          <div>
            <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              Bulk Image Upload & Smart Scheduling
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Upload up to 20 images at once. AI will analyze each asset while you configure your post schedule.
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/5 rounded-xl text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 overflow-y-auto flex-1">
          {/* Step 1: File Drop Zone (if no batch created yet) */}
          {!createdBatchId && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingFile(true);
              }}
              onDragLeave={() => setIsDraggingFile(false)}
              onDrop={handleDropFiles}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-3xl p-12 flex flex-col items-center justify-center text-center cursor-pointer transition ${
                isDraggingFile ? 'border-indigo-500 bg-indigo-500/10' : 'border-white/10 hover:border-indigo-500/50 hover:bg-[#080d18]'
              }`}
            >
              <input
                type="file"
                ref={fileInputRef}
                multiple
                accept="image/*"
                onChange={(e) => {
                  if (e.target.files) handleFileSelect(e.target.files);
                  e.target.value = '';
                }}
                className="hidden"
              />
              <div className="w-16 h-16 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-4 text-indigo-400">
                {bulkUploadUrlsMutation.isPending ? (
                  <Loader2 className="w-8 h-8 animate-spin" />
                ) : (
                  <UploadCloud className="w-8 h-8" />
                )}
              </div>
              <h3 className="text-base font-bold text-slate-200">
                {bulkUploadUrlsMutation.isPending ? 'Preparing Upload Batch...' : 'Drag and drop up to 20 images here'}
              </h3>
              <p className="text-xs text-slate-400 mt-2 max-w-sm">
                Select JPEG, PNG, WEBP, or GIF files. Each image will be analyzed individually by Gemini AI.
              </p>
              {bulkUploadUrlsMutation.isError && (
                <div className="mt-4 text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 px-4 py-2 rounded-xl">
                  {(bulkUploadUrlsMutation.error as Error).message}
                </div>
              )}
            </div>
          )}

          {/* Step 2 & 3: Thumbnail Grid & Scheduling Config */}
          {createdBatchId && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Left Column: Thumbnail Grid (7 cols) */}
              <div className="lg:col-span-7 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2">
                    <span>Batch Assets ({mediaList.length})</span>
                    {isAnalyzingAny && (
                      <span className="flex items-center gap-1 text-xs text-indigo-400">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Analyzing AI captions...
                      </span>
                    )}
                  </h3>
                  <span className="text-[11px] text-slate-500">Drag items to reorder schedule sequence</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[380px] overflow-y-auto pr-1">
                  {mediaList.map((media, idx) => (
                    <div
                      key={media.id}
                      draggable
                      onDragStart={() => handleDragStartMedia(idx)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleDropMedia(idx)}
                      className={`bg-[#080d18] border rounded-2xl p-2.5 space-y-2 cursor-grab active:cursor-grabbing group hover:border-indigo-500/50 transition relative ${
                        media.status === 'FAILED' ? 'border-rose-500/40 bg-rose-500/5' : 'border-white/10'
                      }`}
                    >
                      <div className="aspect-square bg-black/60 rounded-xl overflow-hidden relative flex items-center justify-center">
                        <img
                          src={`${API_BASE}/media/${media.id}/thumbnail`}
                          alt={media.filename}
                          className="max-w-full max-h-full object-contain"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                        <div className="absolute top-1.5 left-1.5 bg-black/70 backdrop-blur-sm text-[10px] font-bold px-1.5 py-0.5 rounded-md text-slate-300 flex items-center gap-1">
                          <GripVertical className="w-3 h-3 text-slate-500" />
                          #{idx + 1}
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="text-[11px] font-bold text-slate-200 truncate" title={media.filename}>
                          {media.filename}
                        </div>
                        <div className="flex items-center justify-between text-[10px]">
                          {media.status === 'ANALYZED' ? (
                            <span className="text-emerald-400 font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" /> Ready
                            </span>
                          ) : media.status === 'FAILED' ? (
                            <span className="text-rose-400 font-bold flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Failed
                            </span>
                          ) : (
                            <span className="text-indigo-400 font-bold flex items-center gap-1">
                              <Loader2 className="w-3 h-3 animate-spin" /> Analyzing
                            </span>
                          )}
                        </div>
                        {media.aiMasterJson?.headline && (
                          <div className="text-[10px] text-indigo-300 italic truncate" title={media.aiMasterJson.headline}>
                            "{media.aiMasterJson.headline}"
                          </div>
                        )}
                        {media.status === 'FAILED' && (
                          <div className="text-[10px] text-rose-400 leading-tight line-clamp-2">
                            {media.aiMasterJson?.error || 'Analysis failed'}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Column: Schedule Config & Preview (5 cols) */}
              <div className="lg:col-span-5 bg-[#080d18] border border-white/5 rounded-2xl p-5 space-y-5">
                <div className="flex items-center justify-between border-b border-white/5 pb-3">
                  <h3 className="text-sm font-bold text-slate-200 flex items-center gap-1.5">
                    <Sliders className="w-4 h-4 text-indigo-400" /> Schedule Settings
                  </h3>
                </div>

                {/* Strategy Selector */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Sequence Order Strategy
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setStrategy('sequential-daily')}
                      className={`p-2.5 rounded-xl border text-xs font-bold text-left transition ${
                        strategy === 'sequential-daily'
                          ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                          : 'border-white/10 bg-slate-900/50 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Drag & Drop Order
                    </button>
                    <button
                      type="button"
                      onClick={() => setStrategy('filename-sequence')}
                      className={`p-2.5 rounded-xl border text-xs font-bold text-left transition ${
                        strategy === 'filename-sequence'
                          ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                          : 'border-white/10 bg-slate-900/50 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      Original Filename Sort
                    </button>
                  </div>
                </div>

                {/* Start Date & Posts Per Day */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-indigo-400" /> Start Date
                    </label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full bg-slate-900/80 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-slate-200 focus:outline-none focus:border-indigo-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                      Posts Per Day
                    </label>
                    <select
                      value={perDay}
                      onChange={(e) => setPerDay(parseInt(e.target.value, 10))}
                      className="w-full bg-slate-900/80 border border-white/10 rounded-xl px-3 py-2 text-xs font-bold text-slate-200 focus:outline-none focus:border-indigo-500"
                    >
                      <option value={1}>1 post / day</option>
                      <option value={2}>2 posts / day</option>
                      <option value={3}>3 posts / day</option>
                      <option value={4}>4 posts / day</option>
                    </select>
                  </div>
                </div>

                {/* Time Slot Picker */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-indigo-400" /> Daily Time Slot(s)
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {timeSlots.map((slot, i) => (
                      <div key={i} className="flex items-center gap-1 bg-slate-900 border border-white/10 rounded-xl px-2.5 py-1 text-xs font-bold text-indigo-300">
                        <input
                          type="time"
                          value={slot}
                          onChange={(e) => {
                            const newSlots = [...timeSlots];
                            newSlots[i] = e.target.value;
                            setTimeSlots(newSlots);
                          }}
                          className="bg-transparent text-xs font-bold text-indigo-300 focus:outline-none"
                        />
                        {timeSlots.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setTimeSlots(timeSlots.filter((_, idx) => idx !== i))}
                            className="text-slate-500 hover:text-rose-400 ml-1"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                    {timeSlots.length < perDay && (
                      <button
                        type="button"
                        onClick={() => setTimeSlots([...timeSlots, '12:00'])}
                        className="px-2.5 py-1 rounded-xl border border-dashed border-white/20 text-xs font-bold text-slate-400 hover:text-white hover:border-indigo-400 transition"
                      >
                        + Add Slot
                      </button>
                    )}
                  </div>
                </div>

                {/* Live Preview Table */}
                <div className="space-y-2 border-t border-white/5 pt-3">
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                    <span>Schedule Preview</span>
                    {previewMutation.isPending && <Loader2 className="w-3 h-3 animate-spin text-indigo-400" />}
                  </label>
                  <div className="max-h-[140px] overflow-y-auto space-y-1 pr-1 font-mono text-[11px]">
                    {previewList.map((item, idx) => (
                      <div key={item.mediaId} className="flex items-center justify-between bg-slate-900/60 p-2 rounded-lg text-slate-300 border border-white/5">
                        <span className="truncate max-w-[140px] font-semibold text-slate-400">#{idx + 1} {item.filename}</span>
                        <span className="font-bold text-indigo-400">
                          {new Date(item.scheduledFor).toLocaleDateString([], { month: 'short', day: 'numeric' })} @ {new Date(item.scheduledFor).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Mode Override Panel & Commit Bar */}
          {createdBatchId && (
            <div className="bg-[#080d18] border border-white/10 rounded-2xl p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-300">Publishing Mode for This Batch</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Workspace Default: <span className="font-bold text-indigo-400">{currentWorkspace?.automationMode || 'MANUAL'}</span>
                  </p>
                </div>
                <div className="flex gap-2">
                  {[
                    { label: 'Use Workspace Default', value: null },
                    { label: 'Review Required (MANUAL)', value: 'MANUAL' },
                    { label: 'Auto-Publish', value: 'AUTO_PUBLISH' },
                  ].map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => setPublishModeOverride(option.value)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition ${
                        publishModeOverride === option.value
                          ? 'border-indigo-500 bg-indigo-500/10 text-indigo-300'
                          : 'border-white/10 bg-slate-900/40 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Status Note & Action Buttons */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="text-xs text-slate-400">
                  {effectiveMode === 'MANUAL' ? (
                    <span className="text-amber-400 font-semibold flex items-center gap-1.5">
                      <Eye className="w-4 h-4" /> Posts will require approval before publishing (status: PENDING_REVIEW).
                    </span>
                  ) : (
                    <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4" /> Posts will publish automatically once due (status: PENDING).
                    </span>
                  )}
                  {failedCount > 0 && (
                    <div className="text-rose-400 text-[11px] font-bold mt-1">
                      ⚠️ {failedCount} item(s) failed analysis and will be excluded from scheduling.
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-3">
                  {commitMutation.data?.postStatus === 'PENDING_REVIEW' && (
                    <Button
                      variant="secondary"
                      onClick={handleApproveAll}
                      isLoading={approveMutation.isPending}
                      icon={<Check className="w-4 h-4 text-emerald-400" />}
                    >
                      Approve All ({analyzedCount} posts)
                    </Button>
                  )}

                  <Button
                    variant="primary"
                    disabled={isAnalyzingAny || analyzedCount === 0 || commitMutation.data?.success}
                    isLoading={commitMutation.isPending}
                    onClick={handleCommit}
                    icon={commitMutation.data?.success ? <Check className="w-4 h-4" /> : <ArrowRight className="w-4 h-4" />}
                  >
                    {commitMutation.data?.success
                      ? 'Batch Committed Successfully!'
                      : isAnalyzingAny
                      ? 'Analyzing Images...'
                      : `Commit ${analyzedCount} Image(s)`}
                  </Button>
                </div>
              </div>

              {commitMutation.isError && (
                <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl">
                  {(commitMutation.error as Error).message}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
