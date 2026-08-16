import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '../lib/api';
import { Button } from './ui/Button';
import { Search, RefreshCw, CheckCircle2, X, Globe, UserCheck } from 'lucide-react';

const InstagramIcon: React.FC<{ className?: string }> = ({ className = 'w-5 h-5' }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect width="20" height="20" x="2" y="2" rx="5" ry="5" />
    <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
    <line x1="17.5" x2="17.51" y1="6.5" y2="6.5" />
  </svg>
);

interface InstagramAccount {
  id: string;
  instagramAccountId: string;
  username: string;
  name: string | null;
  profilePictureUrl: string | null;
  status: string;
  facebookPageName: string;
  facebookPageId: string | null;
  isLinked: boolean;
}

interface InstagramAccountManagerModalProps {
  workspaceId: string;
  workspaceName: string;
  onClose: () => void;
}

export const InstagramAccountManagerModal: React.FC<InstagramAccountManagerModalProps> = ({
  workspaceId,
  workspaceName,
  onClose,
}) => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [togglingIgId, setTogglingIgId] = useState<string | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['workspace-instagram-accounts', workspaceId],
    queryFn: () => fetchApi<{ instagramAccounts: InstagramAccount[] }>(`/workspaces/${workspaceId}/instagram-accounts`),
    staleTime: 5000,
  });

  const instagramAccounts = data?.instagramAccounts || [];

  const handleToggle = async (igId: string, currentStatus: boolean) => {
    setTogglingIgId(igId);
    setMessage(null);
    try {
      await fetchApi(`/workspaces/${workspaceId}/instagram-accounts/toggle`, {
        method: 'POST',
        body: JSON.stringify({
          instagramAccountId: igId,
          enable: !currentStatus,
        }),
      });
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] });
      setMessage(!currentStatus ? 'Instagram account connected to workspace.' : 'Instagram account disconnected from workspace.');
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setTogglingIgId(null);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    setMessage(null);
    try {
      const res = await fetchApi<{ success: boolean; totalDiscovered: number }>(`/workspaces/${workspaceId}/instagram-accounts/sync`, {
        method: 'POST',
      });
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] });
      setMessage(`Synced! Discovered ${res.totalDiscovered} Instagram Professional account(s).`);
    } catch (err: any) {
      setMessage(`Sync failed: ${err.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-white/10 bg-[#0b101d] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-pink-500/10 text-pink-400 border border-pink-500/20">
              <InstagramIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Instagram Accounts</h3>
              <p className="text-xs text-slate-400">Managing connected Instagram Professional accounts for <span className="text-pink-400 font-semibold">{workspaceName}</span></p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/5">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filter & Action Bar */}
        <div className="p-4 border-b border-white/5 bg-slate-900/50 flex gap-3 items-center">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search Instagram handle or name..."
              className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-white/10 bg-slate-900 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-pink-500"
            />
          </div>
          <Button
            size="sm"
            variant="secondary"
            icon={<RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />}
            isLoading={isSyncing}
            onClick={handleSync}
            className="border-pink-500/30 text-pink-300 hover:bg-pink-500/10 text-xs font-semibold"
          >
            Sync Accounts
          </Button>
        </div>

        {/* Notification Toast Message */}
        {message && (
          <div className="mx-6 mt-3 p-2.5 rounded-lg bg-pink-500/10 border border-pink-500/20 text-xs text-pink-300 flex items-center justify-between">
            <span>{message}</span>
            <button type="button" onClick={() => setMessage(null)} className="text-pink-400 hover:text-white"><X className="w-3.5 h-3.5" /></button>
          </div>
        )}

        {/* Content List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {isLoading ? (
            <div className="text-center py-12 text-xs text-slate-400 flex flex-col items-center gap-2">
              <RefreshCw className="w-6 h-6 animate-spin text-pink-400" />
              <span>Fetching discovered Instagram accounts...</span>
            </div>
          ) : instagramAccounts.length === 0 ? (
            <div className="text-center py-12 text-slate-400 space-y-3">
              <Globe className="w-10 h-10 mx-auto text-slate-600" />
              <p className="text-sm font-medium">No Instagram Professional accounts found.</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">Ensure your Instagram account is converted to Professional (Business or Creator) and linked to a Facebook Page managed by your Meta connection.</p>
            </div>
          ) : (
            instagramAccounts.filter(ig => {
              if (!search.trim()) return true;
              const q = search.toLowerCase();
              return ig.username.toLowerCase().includes(q) || (ig.name && ig.name.toLowerCase().includes(q)) || ig.facebookPageName.toLowerCase().includes(q);
            }).map(ig => (
              <div key={ig.id} className="p-4 rounded-xl border border-white/10 bg-slate-900/60 flex items-center justify-between hover:bg-white/[0.02]">
                <div className="flex items-center gap-3.5">
                  {ig.profilePictureUrl ? (
                    <img src={ig.profilePictureUrl} alt={ig.username} className="w-10 h-10 rounded-full border border-pink-500/30 object-cover" />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-amber-500 via-rose-500 to-purple-600 flex items-center justify-center text-white font-bold text-sm shadow-md">
                      @{ig.username.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">@{ig.username}</span>
                      {ig.isLinked && (
                        <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-pink-400 bg-pink-500/10 px-2 py-0.5 rounded-full border border-pink-500/20">
                          <CheckCircle2 className="w-3 h-3" /> Connected
                        </span>
                      )}
                    </div>
                    {ig.name && <div className="text-xs text-slate-300 font-medium">{ig.name}</div>}
                    <div className="text-[10px] text-slate-400 flex items-center gap-1">
                      <UserCheck className="w-3 h-3 text-blue-400" />
                      <span>Connected via Facebook Page: <strong>{ig.facebookPageName}</strong></span>
                    </div>
                  </div>
                </div>

                <Button
                  size="sm"
                  variant={ig.isLinked ? 'secondary' : 'primary'}
                  onClick={() => handleToggle(ig.id, ig.isLinked)}
                  isLoading={togglingIgId === ig.id}
                  className={ig.isLinked ? 'border-rose-500/30 hover:border-rose-500/50 text-rose-300 hover:bg-rose-500/10' : 'bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 text-white font-bold'}
                >
                  {ig.isLinked ? 'Disconnect' : 'Connect'}
                </Button>
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
