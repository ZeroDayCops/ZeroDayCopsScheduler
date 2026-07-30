import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { AuthView } from './components/AuthView';
import { MainLayout } from './components/MainLayout';
import { Shield } from 'lucide-react';

const AppContent: React.FC = () => {
  const { isAuthenticated, isLoading } = useApp();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#090d16] flex flex-col items-center justify-center text-[#f8fafc]">
        <div className="relative flex flex-col items-center">
          <div className="w-16 h-16 rounded-full border-4 border-indigo-500/20 border-t-indigo-500 animate-spin"></div>
          <Shield className="w-6 h-6 text-indigo-400 absolute top-5 animate-pulse" />
          <span className="mt-6 text-xs uppercase tracking-widest text-slate-500 font-bold animate-pulse">
            Loading System
          </span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <AuthView />;
  }

  return <MainLayout />;
};

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
