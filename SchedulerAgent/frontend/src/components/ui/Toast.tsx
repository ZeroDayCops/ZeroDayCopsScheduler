import React, { useEffect } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastProps {
  type?: ToastType;
  title?: string;
  message: string;
  durationMs?: number;
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({
  type = 'info',
  title,
  message,
  durationMs = 4000,
  onClose,
}) => {
  useEffect(() => {
    if (durationMs > 0) {
      const timer = setTimeout(onClose, durationMs);
      return () => clearTimeout(timer);
    }
  }, [durationMs, onClose]);

  const config = {
    success: {
      bg: 'bg-[#0d1220] border-emerald-500/30 text-emerald-300',
      icon: <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />,
    },
    error: {
      bg: 'bg-[#0d1220] border-rose-500/30 text-rose-300',
      icon: <XCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />,
    },
    warning: {
      bg: 'bg-[#0d1220] border-amber-500/30 text-amber-300',
      icon: <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />,
    },
    info: {
      bg: 'bg-[#0d1220] border-indigo-500/30 text-indigo-300',
      icon: <Info className="w-4 h-4 text-indigo-400 flex-shrink-0" />,
    },
  }[type];

  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 p-4 border rounded-2xl shadow-2xl backdrop-blur-xl animate-slide-in ${config.bg}`}>
      {config.icon}
      <div className="text-xs">
        {title && <div className="font-bold">{title}</div>}
        <div className="leading-relaxed opacity-90">{message}</div>
      </div>
      <button
        onClick={onClose}
        className="p-1 hover:bg-white/5 rounded-lg transition ml-2 text-slate-400 hover:text-slate-200"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
