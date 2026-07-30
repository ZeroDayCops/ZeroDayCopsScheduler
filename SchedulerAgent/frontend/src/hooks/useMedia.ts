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
