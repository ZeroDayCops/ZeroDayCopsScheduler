import React from 'react';
import { FileText } from 'lucide-react';

export const TermsPage: React.FC = () => {
  return (
    <div className="animate-fade-in">
      <section className="max-w-3xl mx-auto px-6 pt-20 pb-24">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-black tracking-tight text-white">Terms of Service</h1>
          <p className="mt-3 text-slate-500 text-sm">Last updated: July 2026</p>
        </div>

        <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-300 text-sm mb-8 flex items-start gap-3">
          <FileText className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>
            <strong>Placeholder Legal Text.</strong> This document contains standard boilerplate and has not been reviewed by legal counsel. It must be replaced with real terms drafted or reviewed by an attorney before commercial launch.
          </span>
        </div>

        <div className="prose prose-invert prose-sm max-w-none space-y-6 text-slate-400 leading-relaxed">
          <h2 className="text-lg font-bold text-white">1. Acceptance of Terms</h2>
          <p>
            By accessing or using ZeroDayCops SchedulerAgent ("the Service"), you agree to be bound by these Terms of Service. If you do not agree to these terms, you may not use the Service.
          </p>

          <h2 className="text-lg font-bold text-white">2. Description of Service</h2>
          <p>
            SchedulerAgent provides AI-powered social media content scheduling and publishing tools for agencies and businesses. The Service includes automated media analysis, caption generation, scheduling, and publishing across supported social media platforms.
          </p>

          <h2 className="text-lg font-bold text-white">3. User Accounts</h2>
          <p>
            You must provide accurate and complete registration information. You are responsible for maintaining the confidentiality of your account credentials. You are responsible for all activities that occur under your account.
          </p>

          <h2 className="text-lg font-bold text-white">4. Acceptable Use</h2>
          <p>
            You agree not to use the Service to: violate any applicable law or regulation; infringe upon intellectual property rights; transmit malicious code; interfere with the Service's infrastructure; or use automated systems to overload the Service.
          </p>

          <h2 className="text-lg font-bold text-white">5. Content Ownership</h2>
          <p>
            You retain ownership of all content you upload to the Service. By using the Service, you grant us a limited license to process, analyze, and publish your content as directed by your scheduling instructions.
          </p>

          <h2 className="text-lg font-bold text-white">6. Platform Integrations</h2>
          <p>
            The Service integrates with third-party platforms (LinkedIn, Pinterest, YouTube). Your use of these platforms is subject to their respective terms of service. We are not responsible for changes to third-party APIs that may affect Service functionality.
          </p>

          <h2 className="text-lg font-bold text-white">7. Limitation of Liability</h2>
          <p>
            The Service is provided "as is" without warranties of any kind. In no event shall ZeroDayCops be liable for any indirect, incidental, special, consequential, or punitive damages arising from your use of the Service.
          </p>

          <h2 className="text-lg font-bold text-white">8. Termination</h2>
          <p>
            We reserve the right to suspend or terminate your account at any time for violation of these terms. You may terminate your account at any time by contacting us.
          </p>

          <h2 className="text-lg font-bold text-white">9. Changes to Terms</h2>
          <p>
            We may modify these terms at any time. Continued use of the Service after changes constitutes acceptance of the new terms.
          </p>
        </div>
      </section>
    </div>
  );
};
