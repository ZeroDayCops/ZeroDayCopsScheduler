import React from 'react';
import { Link } from 'react-router-dom';
import { Shield, ArrowLeft } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  return (
    <div className="animate-fade-in min-h-[60vh] flex items-center justify-center px-6">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-indigo-500/20 to-purple-500/10 border border-indigo-500/10 mb-8">
          <Shield className="w-10 h-10 text-indigo-400/50" />
        </div>

        <h1 className="text-7xl font-black text-white mb-2">404</h1>
        <p className="text-xl font-semibold text-slate-400 mb-2">Page Not Found</p>
        <p className="text-sm text-slate-500 mb-8 max-w-md mx-auto">
          The route you're looking for doesn't exist or has been moved. Let's get you back on track.
        </p>

        <Link
          to="/"
          className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>
      </div>
    </div>
  );
};
