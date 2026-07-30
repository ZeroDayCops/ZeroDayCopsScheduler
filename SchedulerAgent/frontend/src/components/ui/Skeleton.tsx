import React from 'react';

export const SkeletonLine: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`bg-slate-800/60 animate-pulse rounded-lg ${className}`} />
);

export const SkeletonCard: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`bg-[#0d1220] border border-white/5 rounded-2xl p-6 space-y-4 animate-pulse ${className}`}>
    <SkeletonLine className="h-4 w-1/3" />
    <SkeletonLine className="h-8 w-2/3" />
    <SkeletonLine className="h-3 w-1/2" />
  </div>
);

export const SkeletonGrid: React.FC<{ count?: number; columns?: string }> = ({
  count = 6,
  columns = 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4',
}) => (
  <div className={`grid ${columns} gap-4`}>
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="bg-[#0d1220] border border-white/5 rounded-2xl p-3 space-y-3 animate-pulse">
        <div className="aspect-square bg-slate-800/60 rounded-xl" />
        <SkeletonLine className="h-3 w-3/4" />
        <SkeletonLine className="h-3 w-1/2" />
      </div>
    ))}
  </div>
);

export const SkeletonList: React.FC<{ count?: number }> = ({ count = 3 }) => (
  <div className="space-y-3">
    {Array.from({ length: count }).map((_, i) => (
      <div key={i} className="bg-[#0d1220] border border-white/5 rounded-2xl p-4 flex items-center gap-4 animate-pulse">
        <div className="w-12 h-12 bg-slate-800/60 rounded-xl flex-shrink-0" />
        <div className="flex-1 space-y-2">
          <SkeletonLine className="h-3 w-1/4" />
          <SkeletonLine className="h-3 w-1/2" />
        </div>
      </div>
    ))}
  </div>
);
