import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '../lib/api';
import { useApp } from '../context/AppContext';

export interface PostLog { id: string; event: string; message: string; createdAt: string; }
export interface ScheduledPost {
  id: string; mediaId: string; platform: 'LINKEDIN' | 'PINTEREST' | 'YOUTUBE' | 'FACEBOOK' | 'INSTAGRAM';
  renderedContent: { body?: string; title?: string; hashtags?: string[] };
  scheduledFor: string; status: string; publishedAt?: string | null;
  externalPostId?: string | null; retryCount: number;
  facebookPageId?: string | null; instagramAccountId?: string | null;
  media: { id: string; filename: string; mediaType: string; status: string; aiMasterJson?: any };
  postLogs: PostLog[];
}

export function usePosts() {
  const { currentWorkspace } = useApp();
  const wsId = currentWorkspace?.id;
  return useQuery<{ posts: ScheduledPost[] }>({
    queryKey: ['posts', wsId],
    queryFn: () => fetchApi(`/workspaces/${wsId}/scheduled-posts`),
    enabled: !!wsId,
    refetchInterval: (query) => {
      const posts = query.state.data?.posts;
      if (posts?.some(p => p.status === 'PENDING' || p.status === 'PROCESSING')) return 5000;
      return false;
    },
  });
}

export function useCreatePost() {
  const { currentWorkspace } = useApp();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { mediaId: string; platform: string; scheduledFor: string; facebookPageId?: string; instagramAccountId?: string }) =>
      fetchApi(`/workspaces/${currentWorkspace!.id}/scheduled-posts`, {
        method: 'POST', body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['posts', currentWorkspace?.id] }),
  });
}

export function useDeletePost() {
  const { currentWorkspace } = useApp();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) =>
      fetchApi(`/workspaces/${currentWorkspace!.id}/scheduled-posts/${postId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['posts', currentWorkspace?.id] }),
  });
}

export function usePublishNow() {
  const { currentWorkspace } = useApp();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (postId: string) =>
      fetchApi(`/workspaces/${currentWorkspace!.id}/scheduled-posts/${postId}/publish-now`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['posts', currentWorkspace?.id] }),
  });
}
