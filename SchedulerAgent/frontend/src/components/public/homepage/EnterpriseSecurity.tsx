import React from 'react';
import {
  ShieldCheck,
  Lock,
  Key,
  Database,
  FileCode,
  UserCheck,
  Server
} from 'lucide-react';

const securityFeatures = [
  {
    title: 'Isolated Token Vaults',
    description: 'Each client workspace retains encrypted OAuth 2.0 refresh tokens stored via AES-256 with Zero-Trust key management.',
    icon: Key,
  },
  {
    title: 'Multi-Tenant Data Partitioning',
    description: 'Strict Row Level Security (RLS) and schema isolation ensure client agency assets never leak across account boundaries.',
    icon: Database,
  },
  {
    title: 'Atomic Claim Locking',
    description: 'Distributed concurrency locks prevent double-posting, race conditions, or duplicate payload execution during server failover.',
    icon: Lock,
  },
  {
    title: 'Comprehensive Audit Logs',
    description: 'Every post submission, token rotation, schedule modification, and API call is immutably logged with precise timestamps.',
    icon: FileCode,
  },
  {
    title: 'Role-Based Access Control',
    description: 'Granular permissions for Agency Admins, Content Managers, and Client Approvers with customizable workspace roles.',
    icon: UserCheck,
  },
  {
    title: 'Fail-Safe Exponential Retries',
    description: 'Automatic retry backoff logic handles transient network blips and social network API rate limits gracefully.',
    icon: Server,
  },
];

export const EnterpriseSecurity: React.FC = () => {
  return (
    <section className="py-24 bg-[#090d16] border-b border-white/5 relative overflow-hidden">
      <div className="max-w-6xl mx-auto px-6 relative z-10">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-indigo-500/20 bg-indigo-500/10 text-indigo-400 text-xs font-bold uppercase tracking-wider mb-4">
            <ShieldCheck className="w-3.5 h-3.5" />
            Enterprise-Grade Security Architecture
          </span>
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black text-white tracking-tight">
            Built For Multi-Brand Agencies <br />
            <span className="bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
              Where Security Is Non-Negotiable
            </span>
          </h2>
          <p className="mt-4 text-slate-400 text-base max-w-xl mx-auto leading-relaxed">
            Protect client credentials and media pipelines with military-grade encryption, tenant isolation, and atomic concurrency locks.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {securityFeatures.map((sec) => {
            const Icon = sec.icon;
            return (
              <div
                key={sec.title}
                className="p-6 rounded-2xl border border-white/5 bg-[#0b101c] hover:border-indigo-500/30 transition duration-300 group"
              >
                <div className="w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-5 group-hover:scale-110 transition-transform">
                  <Icon className="w-6 h-6" />
                </div>
                <h3 className="text-lg font-bold text-white mb-2">{sec.title}</h3>
                <p className="text-sm text-slate-400 leading-relaxed">{sec.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};
