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
    try {
      const response = await fetch(`${API_BASE}/auth/me`, {
        headers: { 'Content-Type': 'application/json' },
        // Pass credentials (token cookie)
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        setOrganizations(data.organizations || []);
        setIsAuthenticated(true);

        // Auto-select first organization if none selected
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
    } finally {
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
        setWorkspaces(data.workspaces || []);
        
        // Auto-select first workspace if none selected
        if (data.workspaces && data.workspaces.length > 0) {
          setCurrentWorkspaceState(data.workspaces[0]);
        } else {
          setCurrentWorkspaceState(null);
        }
      }
    } catch (err) {
      console.error('Failed to fetch workspaces:', err);
    }
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
