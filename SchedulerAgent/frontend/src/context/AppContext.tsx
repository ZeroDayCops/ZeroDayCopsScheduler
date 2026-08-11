import React, { createContext, useContext, useState, useEffect } from 'react';

// API configuration
export const API_BASE = '/api';

interface User {
  id: string;
  email: string;
  name: string;
}

interface Organization {
  id: string;
  name: string;
  role: string;
}

interface Workspace {
  id: string;
  organizationId: string;
  brandName: string;
  website?: string | null;
  cta?: string | null;
  defaultHashtags: string[];
  brandVoice?: string | null;
  brandDescription?: string | null;
  contactInfoBlock?: string | null;
  emojiStyle?: string | null;
  automationMode?: string | null;
  defaultSlotTime?: string | null;
  timezone?: string | null;
  allowVideoImageFallback?: boolean;
  socialAccounts?: any[];
}

interface AppContextType {
  user: User | null;
  organizations: Organization[];
  currentOrg: Organization | null;
  workspaces: Workspace[];
  currentWorkspace: Workspace | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  setCurrentOrg: (org: Organization | null) => void;
  setCurrentWorkspace: (ws: Workspace | null) => void;
  login: (user: User, orgs: Organization[]) => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  fetchWorkspaces: (orgId: string) => Promise<void>;
  createWorkspace: (data: {
    organizationId: string;
    brandName: string;
    website?: string;
    cta?: string;
    defaultHashtags?: string[];
    brandVoice?: string;
    emojiStyle?: string;
  }) => Promise<Workspace>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [currentOrg, setCurrentOrgState] = useState<Organization | null>(null);
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [currentWorkspace, setCurrentWorkspaceState] = useState<Workspace | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');

  // Load user session on startup
  useEffect(() => {
    refreshUser();
  }, []);

  const refreshUser = async () => {
    setIsLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(`${API_BASE}/auth/me`, {
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        signal: controller.signal,
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        setOrganizations(data.organizations || []);
        setIsAuthenticated(true);

        if (data.organizations && data.organizations.length > 0) {
          const defaultOrg = data.organizations[0];
          setCurrentOrgState(defaultOrg);
          await fetchWorkspaces(defaultOrg.id);
        }
      } else {
        setIsAuthenticated(false);
        setUser(null);
        setOrganizations([]);
        setCurrentOrgState(null);
        setWorkspaces([]);
        setCurrentWorkspaceState(null);
      }
    } catch (err) {
      console.error('Failed to restore auth session:', err);
      setIsAuthenticated(false);
      setUser(null);
      setOrganizations([]);
      setCurrentOrgState(null);
      setWorkspaces([]);
      setCurrentWorkspaceState(null);
    } finally {
      clearTimeout(timeoutId);
      setIsLoading(false);
    }
  };

  const fetchWorkspaces = async (orgId: string) => {
    try {
      const response = await fetch(`${API_BASE}/workspaces?organizationId=${orgId}`, {
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        const wsList = data.workspaces || [];
        setWorkspaces(wsList);
        
        if (wsList.length > 0) {
          setCurrentWorkspaceState(wsList[0]);
        } else {
          setCurrentWorkspaceState(null);
        }
      }
    } catch (err) {
      console.error('Failed to fetch workspaces:', err);
    }
  };

  const createWorkspace = async (workspaceData: {
    organizationId: string;
    brandName: string;
    website?: string;
    cta?: string;
    defaultHashtags?: string[];
    brandVoice?: string;
    emojiStyle?: string;
  }): Promise<Workspace> => {
    const response = await fetch(`${API_BASE}/workspaces`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(workspaceData),
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error || 'Failed to create workspace');
    }

    const data = await response.json();
    const newWs = data.workspace;
    setWorkspaces((prev) => [...prev, newWs]);
    setCurrentWorkspaceState(newWs);
    return newWs;
  };

  const setCurrentOrg = async (org: Organization | null) => {
    setCurrentOrgState(org);
    if (org) {
      await fetchWorkspaces(org.id);
    } else {
      setWorkspaces([]);
      setCurrentWorkspaceState(null);
    }
  };

  const setCurrentWorkspace = (ws: Workspace | null) => {
    setCurrentWorkspaceState(ws);
    if (ws) {
      setWorkspaces((prev) => prev.map((w) => (w.id === ws.id ? { ...w, ...ws } : w)));
    }
  };

  const login = (userData: User, orgsData: Organization[]) => {
    setUser(userData);
    setOrganizations(orgsData);
    setIsAuthenticated(true);
    if (orgsData && orgsData.length > 0) {
      setCurrentOrg(orgsData[0]);
    }
  };

  const logout = async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch (err) {
      console.error('Logout error:', err);
    }
    setUser(null);
    setOrganizations([]);
    setCurrentOrgState(null);
    setWorkspaces([]);
    setCurrentWorkspaceState(null);
    setIsAuthenticated(false);
    setActiveTab('dashboard');
  };

  return (
    <AppContext.Provider
      value={{
        user,
        organizations,
        currentOrg,
        workspaces,
        currentWorkspace,
        isAuthenticated,
        isLoading,
        activeTab,
        setActiveTab,
        setCurrentOrg,
        setCurrentWorkspace,
        createWorkspace,
        login,
        logout,
        refreshUser,
        fetchWorkspaces,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
