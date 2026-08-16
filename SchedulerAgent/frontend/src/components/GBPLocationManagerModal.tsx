import React, { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchApi } from '../lib/api';
import { Button } from './ui/Button';
import { Search, MapPin, RefreshCw, CheckCircle2, Building, X, Globe } from 'lucide-react';

interface GBPLocation {
  id: string;
  googleLocationId: string;
  locationName: string;
  address: string | null;
  city: string | null;
  state: string | null;
  status: string;
  isLinked: boolean;
}

interface GBPConnection {
  id: string;
  googleEmail: string | null;
  googleAccountId: string;
  status: string;
  locations: GBPLocation[];
}

interface GBPLocationManagerModalProps {
  workspaceId: string;
  workspaceName: string;
  onClose: () => void;
}

export const GBPLocationManagerModal: React.FC<GBPLocationManagerModalProps> = ({
  workspaceId,
  workspaceName,
  onClose,
}) => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [syncingConnId, setSyncingConnId] = useState<string | null>(null);
  const [togglingLocId, setTogglingLocId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ['workspace-gbp-locations', workspaceId],
    queryFn: () => fetchApi<{ connections: GBPConnection[] }>(`/workspaces/${workspaceId}/gbp-locations`),
    staleTime: 5000,
  });

  const connections = data?.connections || [];

  const handleToggle = async (locationId: string, currentStatus: boolean) => {
    setTogglingLocId(locationId);
    setMessage(null);
    try {
      await fetchApi(`/workspaces/${workspaceId}/gbp-locations/toggle`, {
        method: 'POST',
        body: JSON.stringify({
          googleBusinessLocationId: locationId,
          enable: !currentStatus,
        }),
      });
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] });
      setMessage(!currentStatus ? 'Location connected to workspace.' : 'Location disconnected from workspace.');
    } catch (err: any) {
      setMessage(`Error: ${err.message}`);
    } finally {
      setTogglingLocId(null);
    }
  };

  const handleSync = async (connectionId: string) => {
    setSyncingConnId(connectionId);
    setMessage(null);
    try {
      const res = await fetchApi<{ count: number }>(`/oauth/google-business/sync-locations`, {
        method: 'POST',
        body: JSON.stringify({ connectionId }),
      });
      await refetch();
      setMessage(`Synced! Found ${res.count} total locations.`);
    } catch (err: any) {
      setMessage(`Sync failed: ${err.message}`);
    } finally {
      setSyncingConnId(null);
    }
  };

  const [showManualForm, setShowManualForm] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualAddress, setManualAddress] = useState('');
  const [manualLocId, setManualLocId] = useState('');
  const [isSubmittingManual, setIsSubmittingManual] = useState(false);

  const handleAddManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualName.trim()) return;
    setIsSubmittingManual(true);
    setMessage(null);
    try {
      await fetchApi(`/workspaces/${workspaceId}/gbp-locations/manual`, {
        method: 'POST',
        body: JSON.stringify({
          locationName: manualName,
          address: manualAddress,
          googleLocationId: manualLocId || undefined,
        }),
      });
      await refetch();
      queryClient.invalidateQueries({ queryKey: ['workspace', workspaceId] });
      setMessage(`Added location "${manualName}" successfully!`);
      setManualName('');
      setManualAddress('');
      setManualLocId('');
      setShowManualForm(false);
    } catch (err: any) {
      setMessage(`Failed to add location: ${err.message}`);
    } finally {
      setIsSubmittingManual(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl border border-white/10 bg-[#0b101d] shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Building className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Google Business Profile Locations</h3>
              <p className="text-xs text-slate-400">Managing accessible locations for <span className="text-indigo-400 font-semibold">{workspaceName}</span></p>
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
              placeholder="Search location name, city, address..."
              className="w-full pl-9 pr-3 py-1.5 rounded-lg border border-white/10 bg-slate-900 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-indigo-500"
            />
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setShowManualForm(!showManualForm)}
            className="text-xs"
          >
            {showManualForm ? 'Cancel' : '+ Add Location'}
          </Button>
        </div>

        {/* Manual Location Form */}
        {showManualForm && (
          <form onSubmit={handleAddManual} className="p-4 border-b border-emerald-500/20 bg-emerald-500/5 space-y-3">
            <div className="text-xs font-bold text-emerald-300">Add Location Manually</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                value={manualName}
                onChange={e => setManualName(e.target.value)}
                placeholder="Business / Store Name *"
                required
                className="px-3 py-1.5 rounded-lg border border-white/10 bg-slate-900 text-xs text-slate-200 outline-none focus:border-emerald-500"
              />
              <input
                type="text"
                value={manualAddress}
                onChange={e => setManualAddress(e.target.value)}
                placeholder="Address (Optional)"
                className="px-3 py-1.5 rounded-lg border border-white/10 bg-slate-900 text-xs text-slate-200 outline-none focus:border-emerald-500"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button size="sm" variant="primary" type="submit" isLoading={isSubmittingManual} className="bg-emerald-600 hover:bg-emerald-500 text-xs">
                Save & Link Location
              </Button>
            </div>
          </form>
        )}

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
              <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
              <span>Discovering accessible Google Business Profile locations...</span>
            </div>
          ) : connections.length === 0 ? (
            <div className="text-center py-12 text-slate-400 space-y-3">
              <Globe className="w-10 h-10 mx-auto text-slate-600" />
              <p className="text-sm font-medium">No Google accounts connected yet.</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">Connect your Google Business Profile account in Workspace Settings to discover and manage your locations.</p>
            </div>
          ) : (
            connections.map(conn => (
              <div key={conn.id} className="rounded-xl border border-white/10 bg-slate-900/60 overflow-hidden">
                <div className="px-4 py-3 border-b border-white/5 bg-slate-900/90 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                    <span className="text-xs font-semibold text-slate-200">{conn.googleEmail || conn.googleAccountId}</span>
                    <span className="text-[10px] text-slate-500 font-mono">({conn.locations.length} locations)</span>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => handleSync(conn.id)}
                    isLoading={syncingConnId === conn.id}
                    icon={<RefreshCw className="w-3 h-3" />}
                    className="text-[11px] py-1"
                  >
                    Sync Locations
                  </Button>
                </div>

                <div className="divide-y divide-white/5">
                  {conn.locations.filter(loc => {
                    if (!search.trim()) return true;
                    const query = search.toLowerCase();
                    return (
                      loc.locationName.toLowerCase().includes(query) ||
                      (loc.address && loc.address.toLowerCase().includes(query)) ||
                      (loc.city && loc.city.toLowerCase().includes(query))
                    );
                  }).length === 0 ? (
                    <div className="p-4 text-center text-xs text-slate-500">No matching locations found for this account.</div>
                  ) : (
                    conn.locations.filter(loc => {
                      if (!search.trim()) return true;
                      const query = search.toLowerCase();
                      return (
                        loc.locationName.toLowerCase().includes(query) ||
                        (loc.address && loc.address.toLowerCase().includes(query)) ||
                        (loc.city && loc.city.toLowerCase().includes(query))
                      );
                    }).map(loc => (
                      <div key={loc.id} className="p-3.5 flex items-center justify-between hover:bg-white/[0.02]">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-100">{loc.locationName}</span>
                            {loc.isLinked && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                                <CheckCircle2 className="w-3 h-3" /> Connected
                              </span>
                            )}
                          </div>
                          {loc.address && (
                            <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                              <MapPin className="w-3.5 h-3.5 text-slate-500 flex-shrink-0" />
                              <span className="truncate">{loc.address}</span>
                            </div>
                          )}
                          <div className="text-[10px] font-mono text-slate-600">ID: {loc.googleLocationId}</div>
                        </div>

                        <Button
                          size="sm"
                          variant={loc.isLinked ? 'secondary' : 'primary'}
                          onClick={() => handleToggle(loc.id, loc.isLinked)}
                          isLoading={togglingLocId === loc.id}
                          className={loc.isLinked ? 'border-rose-500/30 hover:border-rose-500/50 text-rose-300 hover:bg-rose-500/10' : 'bg-emerald-600 hover:bg-emerald-500 text-white font-bold'}
                        >
                          {loc.isLinked ? 'Disconnect' : 'Connect'}
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
