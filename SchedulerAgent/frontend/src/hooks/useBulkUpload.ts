import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '../lib/api';
import { useApp } from '../context/AppContext';

export interface BulkUploadFile {
  filename: string;
  mimeType: string;
  fileObj: File;
}

export interface BatchMediaItem {
  id: string;
  filename: string;
  sequenceIndex: number;
  status: 'NEW' | 'ANALYZING' | 'ANALYZED' | 'FAILED';
  statusDetail?: string | null;
  aiMasterJson?: any;
  createdAt: string;
}

export interface UploadBatchData {
  id: string;
  workspaceId: string;
  status: 'UPLOADING' | 'ANALYZING' | 'READY' | 'COMMITTED' | 'PARTIALLY_FAILED';
  scheduleConfig?: any;
  publishModeOverride?: string | null;
  createdAt: string;
  media: BatchMediaItem[];
}

export interface ScheduleConfigInput {
  strategy: 'sequential-daily' | 'filename-sequence';
  startDate: string;
  perDay: number;
  timeSlots: string[];
}

export function useBatchStatus(batchId: string | null) {
  return useQuery<{ batch: UploadBatchData }>({
    queryKey: ['upload-batch', batchId],
    queryFn: () => fetchApi(`/upload-batches/${batchId}`),
    enabled: !!batchId,
    refetchInterval: (query) => {
      const status = query.state.data?.batch?.status;
      if (status === 'UPLOADING' || status === 'ANALYZING') {
        return 3000;
      }
      return false;
    },
  });
}

export function useBulkUploadUrls() {
  const { currentWorkspace } = useApp();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (files: File[]) => {
      const wsId = currentWorkspace?.id;
      if (!wsId) throw new Error('No active workspace');

      const payloadFiles = files.map((f) => ({
        filename: f.name,
        mimeType: f.type || 'image/jpeg',
      }));

      // 1. Get presigned upload URLs
      const res = await fetchApi<{
        batch: { id: string };
        uploads: { mediaId: string; uploadUrl: string | null; key: string; filename: string; sequenceIndex: number }[];
      }>(`/workspaces/${wsId}/media/bulk-upload-urls`, {
        method: 'POST',
        body: JSON.stringify({ files: payloadFiles }),
      });

      // 2. Upload files directly to R2 in parallel
      const uploadPromises = res.uploads.map(async (u, idx) => {
        const fileObj = files[idx];
        if (u.uploadUrl) {
          try {
            const putRes = await fetch(u.uploadUrl, {
              method: 'PUT',
              headers: { 'Content-Type': fileObj.type || 'image/jpeg' },
              body: fileObj,
            });
            if (!putRes.ok) {
              console.warn(`[R2 DIRECT PUT WARNING] Upload failed for ${fileObj.name}: ${putRes.status}`);
            }
          } catch (r2Err) {
            console.warn(`[R2 DIRECT PUT ERROR] Upload error for ${fileObj.name}:`, r2Err);
          }
        }

        // Signal complete-r2 to trigger AI analysis
        return fetchApi(`/workspaces/${wsId}/media/${u.mediaId}/complete-r2`, {
          method: 'POST',
        });
      });

      await Promise.allSettled(uploadPromises);

      qc.invalidateQueries({ queryKey: ['media', wsId] });
      return res.batch;
    },
  });
}

export function useBatchReorder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ batchId, mediaIds }: { batchId: string; mediaIds: string[] }) =>
      fetchApi<{ success: boolean; media: BatchMediaItem[] }>(`/upload-batches/${batchId}/order`, {
        method: 'PATCH',
        body: JSON.stringify({ mediaIds }),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['upload-batch', vars.batchId] });
    },
  });
}

export function useSchedulePreview() {
  return useMutation({
    mutationFn: ({ batchId, scheduleConfig }: { batchId: string; scheduleConfig: ScheduleConfigInput }) =>
      fetchApi<{ preview: { mediaId: string; filename: string; sequenceIndex: number; scheduledFor: string }[] }>(
        `/upload-batches/${batchId}/schedule-preview`,
        {
          method: 'POST',
          body: JSON.stringify({ scheduleConfig }),
        }
      ),
  });
}

export function useBatchCommit() {
  const { currentWorkspace } = useApp();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({
      batchId,
      scheduleConfig,
      publishModeOverride,
    }: {
      batchId: string;
      scheduleConfig: ScheduleConfigInput;
      publishModeOverride?: string | null;
    }) =>
      fetchApi<{
        success: boolean;
        batch: { id: string; status: string };
        effectiveMode: string;
        postStatus: string;
        committed: any[];
        excluded: any[];
      }>(`/upload-batches/${batchId}/commit`, {
        method: 'POST',
        body: JSON.stringify({ scheduleConfig, publishModeOverride }),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['upload-batch', vars.batchId] });
      qc.invalidateQueries({ queryKey: ['media', currentWorkspace?.id] });
      qc.invalidateQueries({ queryKey: ['scheduled-posts', currentWorkspace?.id] });
    },
  });
}

export function useBatchApprove() {
  const { currentWorkspace } = useApp();
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (batchId: string) =>
      fetchApi<{ success: boolean; approvedCount: number; message: string }>(`/upload-batches/${batchId}/approve`, {
        method: 'POST',
      }),
    onSuccess: (_, batchId) => {
      qc.invalidateQueries({ queryKey: ['upload-batch', batchId] });
      qc.invalidateQueries({ queryKey: ['scheduled-posts', currentWorkspace?.id] });
    },
  });
}
