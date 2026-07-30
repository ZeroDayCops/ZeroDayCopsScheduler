import React from 'react';
import { CheckCircle2, AlertTriangle, XCircle, Clock, Loader2, Sparkles } from 'lucide-react';

export type BadgeType =
  // Social Account Statuses
  | 'CONNECTED'
  | 'EXPIRED'
  | 'NOT_CONNECTED'
  // Post Statuses
  | 'PENDING'
  | 'PROCESSING'
  | 'PUBLISHED'
  | 'FAILED'
  // Log Events
  | 'ATTEMPT'
  | 'SUCCESS'
  | 'FAILURE'
  | 'RETRY';

interface BadgeProps {
  type: BadgeType | string;
  label?: string;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ type, label, className = '' }) => {
  const upperType = type.toUpperCase();

  const getBadgeConfig = () => {
    switch (upperType) {
      case 'CONNECTED':
        return {
          bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
          icon: <CheckCircle2 className="w-3.5 h-3.5" />,
          defaultLabel: 'Connected',
        };
      case 'EXPIRED':
        return {
          bg: 'bg-amber-500/10 text-amber-400 border-amber-500/20 animate-pulse-glow',
          icon: <AlertTriangle className="w-3.5 h-3.5" />,
          defaultLabel: 'Expired',
        };
      case 'NOT_CONNECTED':
        return {
          bg: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
          icon: <XCircle className="w-3.5 h-3.5" />,
          defaultLabel: 'Not Connected',
        };
      case 'PUBLISHED':
      case 'SUCCESS':
        return {
          bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
          icon: <CheckCircle2 className="w-3.5 h-3.5" />,
          defaultLabel: 'Published',
        };
      case 'PROCESSING':
        return {
          bg: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
          icon: <Loader2 className="w-3.5 h-3.5 animate-spin" />,
          defaultLabel: 'Processing',
        };
      case 'PENDING':
        return {
          bg: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
          icon: <Clock className="w-3.5 h-3.5" />,
          defaultLabel: 'Queued',
        };
      case 'FAILED':
      case 'FAILURE':
        return {
          bg: 'bg-rose-500/10 text-rose-400 border-rose-500/20',
          icon: <XCircle className="w-3.5 h-3.5" />,
          defaultLabel: 'Failed',
        };
      case 'ATTEMPT':
        return {
          bg: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
          icon: <Sparkles className="w-3.5 h-3.5" />,
          defaultLabel: 'Attempt',
        };
      case 'RETRY':
        return {
          bg: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
          icon: <Clock className="w-3.5 h-3.5" />,
          defaultLabel: 'Retry',
        };
      default:
        return {
          bg: 'bg-slate-500/10 text-slate-400 border-slate-500/20',
          icon: null,
          defaultLabel: type,
        };
    }
  };

  const config = getBadgeConfig();

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${config.bg} ${className}`}
    >
      {config.icon}
      <span>{label || config.defaultLabel}</span>
    </span>
  );
};
