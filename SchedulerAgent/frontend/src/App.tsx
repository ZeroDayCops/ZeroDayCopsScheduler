import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import { MainLayout } from './components/MainLayout';
import { Shield } from 'lucide-react';

// Public pages
import { PublicLayout } from './components/public/PublicLayout';
import { HomePage } from './components/public/HomePage';
import { FeaturesPage } from './components/public/FeaturesPage';
import { AboutPage } from './components/public/AboutPage';
import { ContactPage } from './components/public/ContactPage';
import { TermsPage } from './components/public/TermsPage';
import { PrivacyPage } from './components/public/PrivacyPage';
import { NotFoundPage } from './components/public/NotFoundPage';
import { LoginPage } from './components/public/LoginPage';
import { RegisterPage } from './components/public/RegisterPage';

/**
 * Protected route wrapper — redirects to /login if not authenticated.
 */
const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
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
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

/**
 * Smart home route — shows marketing page for visitors, redirects to dashboard for auth'd users.
 */
const SmartHome: React.FC = () => {
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

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <HomePage />;
};

/**
 * Redirect auth'd users away from login/register back to dashboard.
 */
const GuestOnly: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useApp();

  if (isLoading) return null;
  if (isAuthenticated) return <Navigate to="/dashboard" replace />;

  return <>{children}</>;
};

const AppContent: React.FC = () => {
  return (
    <Routes>
      {/* Public routes with shared PublicLayout (navbar + footer) */}
      <Route element={<PublicLayout />}>
        <Route path="/" element={<SmartHome />} />
        <Route path="/features" element={<FeaturesPage />} />
        <Route path="/about" element={<AboutPage />} />
        <Route path="/contact" element={<ContactPage />} />
        <Route path="/terms" element={<TermsPage />} />
        <Route path="/privacy" element={<PrivacyPage />} />
        <Route
          path="/login"
          element={<GuestOnly><LoginPage /></GuestOnly>}
        />
        <Route
          path="/register"
          element={<GuestOnly><RegisterPage /></GuestOnly>}
        />
        <Route path="*" element={<NotFoundPage />} />
      </Route>

      {/* Protected dashboard route — no PublicLayout, uses MainLayout's own sidebar */}
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <MainLayout />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
};

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
