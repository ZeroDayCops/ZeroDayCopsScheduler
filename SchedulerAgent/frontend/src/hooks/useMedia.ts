import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '../lib/api';
import { useApp } from '../context/AppContext';

interface MediaItem {
  id: string; filename: string; mediaType: 'IMAGE' | 'VIDEO';
  status: 'NEW' | 'ANALYZING' | 'ANALYZED' | 'FAILED';
  statusDetail?: string | null; aiMasterJson?: any; createdAt: string;
}

export function useMedia(opts?: { status?: string }) {
  const { currentWorkspace } = useApp();
  const wsId = currentWorkspace?.id;
  const statusParam = opts?.status ? `?status=${opts.status}` : '';

  return useQuery<{ media: MediaItem[] }>({
    queryKey: ['media', wsId, opts?.status],
    queryFn: () => fetchApi(`/workspaces/${wsId}/media${statusParam}`),
    enabled: !!wsId,
    refetchInterval: (query) => {
      const media = query.state.data?.media;
      if (media?.some(m => m.status === 'NEW' || m.status === 'ANALYZING')) return 3000;
      return false;
    },
  });
}

export function useUploadMedia() {
  const { currentWorkspace } = useApp();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      // If file > 4.5MB, attempt direct Cloudflare R2 presigned upload (bypasses Vercel 4.5MB body limit)
      if (file.size > 4.5 * 1024 * 1024) {
        try {
          const presigned = await fetchApi<any>(`/workspaces/${currentWorkspace!.id}/media/upload-url`, {
            method: 'POST',
            body: JSON.stringify({ filename: file.name, mimeType: file.type }),
          });

          if (presigned?.uploadUrl) {
            // Upload raw file directly to R2 bucket
            const uploadRes = await fetch(presigned.uploadUrl, {
              method: 'PUT',
              headers: { 'Content-Type': file.type },
              body: file,
            });

            if (!uploadRes.ok) {
              throw new Error(`Direct R2 upload failed with status ${uploadRes.status}`);
            }

            // Signal completion and trigger AI analysis
            return fetchApi(`/workspaces/${currentWorkspace!.id}/media/${presigned.mediaId}/complete-r2`, {
              method: 'POST',
            });
          }
        } catch (r2Err) {
          console.warn('[UPLOAD] Presigned R2 upload failed or not configured, falling back to direct server upload:', r2Err);
        }
      }

      // Standard direct upload (for smaller files or local server)
      const fd = new FormData();
      fd.append('file', file);
      return fetchApi(`/workspaces/${currentWorkspace!.id}/media`, { method: 'POST', body: fd });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['media', currentWorkspace?.id] }),
  });
}

export function useDeleteMedia() {
  const { currentWorkspace } = useApp();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (mediaId: string) => fetchApi(`/media/${mediaId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['media', currentWorkspace?.id] }),
  });
}
