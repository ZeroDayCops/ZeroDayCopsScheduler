import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '../lib/api';
import { Button } from './ui/Button';
import { Search, RefreshCw, CheckCircle2, Share2, X, Globe } from 'lucide-react';

interface FacebookPage {
  id: string;
  facebookPageId: string;
  pageName: string;
  instagramBusinessAccountId: string | null;
  status: string;
  isLinked: boolean;
}

interface FacebookConnection {
  id: string;
  facebookName: string | null;
  facebookUserId: string;
  status: string;
  pages: FacebookPage[];
}

interface FacebookPageManagerModalProps {
  workspaceId: string;
  workspaceName: string;
  onClose: () => void;
}

export const FacebookPageManagerModal: React.FC<FacebookPageManagerModalProps> = ({
  workspaceId,
  workspaceName,
  onClose,
}) => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [togglingPageId, setTogglingPageId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['workspace-facebook-pages', workspaceId],
    queryFn: () => fetchApi<{ connections: FacebookConnection[] }>(`/workspaces/${workspaceId}/facebook-pages`),
    staleTime: 5000,
  });

  const connections = data?.connections || [];

  const handleToggle = async (pageId: string, currentStatus: boolean) => {
    setTogglingPageId(pageId);
    setMessage(null);
    try {
      await fetchApi(`/workspaces/${workspaceId}/facebook-pages/toggle`, {
        method: 'POST',
        body: JSON.stringify({
          facebookPageId: pageId,
          enable: !currentStatus,
        }),
      });
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] });
      setMessage(!currentStatus ? 'Facebook Page connected to workspace.' : 'Facebook Page disconnected from workspace.');
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setTogglingPageId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-white/10 bg-[#0b101d] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Facebook Pages</h3>
              <p className="text-xs text-slate-400">Managing connected pages for <span className="text-indigo-400 font-semibold">{workspaceName}</span></p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter Bar */}
        <div className="p-4 border-b border-white/5 bg-slate-900/50 flex gap-3 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search Facebook page name..."
              className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-white/10 bg-slate-900 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-indigo-500"
            />
          </div>
        </div>

        {/* Notification Toast Message */}
        {message && (
          <div className="mx-6 mt-3 p-2.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-xs text-indigo-300 flex items-center justify-between">
            <span>{message}</span>
            <button type="button" onClick={() => setMessage(null)} className="text-indigo-400 hover:text-white"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {/* Content List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isLoading ? (
            <div className="text-center py-12 text-xs text-slate-400 flex flex-col items-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-blue-400" />
              <span>Fetching connected Facebook pages...</span>
            </div>
          ) : connections.length === 0 ? (
            <div className="text-center py-12 text-slate-400 space-y-3">
              <Globe className="w-10 h-10 mx-auto text-slate-600" />
              <p className="text-sm font-medium">No Facebook accounts connected yet.</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">Connect your Facebook account in Workspace Settings to discover and manage your pages.</p>
            </div>
          ) : (
            connections.map(conn => (
              <div key={conn.id} className="rounded-xl border border-white/10 bg-slate-900/60 overflow-hidden">
                <div className="px-4 py-3 border-b border-white/5 bg-slate-900/90 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
                    <span className="text-xs font-semibold text-slate-200">{conn.facebookName || conn.facebookUserId}</span>
                    <span className="text-[10px] text-slate-500 font-mono">({conn.pages.length} pages)</span>
                  </div>
                </div>

                <div className="divide-y divide-white/5">
                  {conn.pages.filter(p => {
                    if (!search.trim()) return true;
                    return p.pageName.toLowerCase().includes(search.toLowerCase());
                  }).length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-500">No matching pages found for this account.</div>
                  ) : (
                    conn.pages.filter(p => {
                      if (!search.trim()) return true;
                      return p.pageName.toLowerCase().includes(search.toLowerCase());
                    }).map(p => (
                      <div key={p.id} className="p-3.5 flex items-center justify-between hover:bg-white/[0.02]">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-100">{p.pageName}</span>
                            {p.isLinked && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full border border-blue-500/20">
                                <CheckCircle2 className="w-3 h-3" /> Connected
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] font-mono text-slate-600">ID: {p.facebookPageId}</div>
                        </div>

                        <Button
                          size="sm"
                          variant={p.isLinked ? 'secondary' : 'primary'}
                          onClick={() => handleToggle(p.id, p.isLinked)}
                          isLoading={togglingPageId === p.id}
                          className={p.isLinked ? 'border-rose-500/30 hover:border-rose-500/50 text-rose-300 hover:bg-rose-500/10' : 'bg-blue-600 hover:bg-blue-500 text-white font-bold'}
                        >
                          {p.isLinked ? 'Disconnect' : 'Connect'}
                        </Button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-white/10 px-6 py-3 bg-slate-900/80 flex justify-end">
          <Button size="sm" variant="secondary" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    </div>
  );
};
