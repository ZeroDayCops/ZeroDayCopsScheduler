import React from 'react';
import { FileText } from 'lucide-react';

export const PrivacyPage: React.FC = () => {
  return (
    <div className="animate-fade-in">
      <section className="max-w-3xl mx-auto px-6 pt-20 pb-24">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-black tracking-tight text-white">Privacy Policy</h1>
          <p className="mt-3 text-slate-500 text-sm">Last updated: July 2026</p>
        </div>

        <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 text-amber-300 text-sm mb-8 flex items-start gap-3">
          <FileText className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <span>
            <strong>Placeholder Privacy Policy.</strong> This document contains standard boilerplate and has not been reviewed by legal counsel. It must be replaced with a real privacy policy before commercial launch.
          </span>
        </div>

        <div className="prose prose-invert prose-sm max-w-none space-y-6 text-slate-400 leading-relaxed">
          <h2 className="text-lg font-bold text-white">1. Information We Collect</h2>
          <p>
            We collect information you provide directly: name, email address, organization name, and content you upload for scheduling. We also collect usage data including log files, device information, and interaction patterns with the Service.
          </p>

          <h2 className="text-lg font-bold text-white">2. How We Use Your Information</h2>
          <p>
            We use your information to: operate and maintain the Service; process and publish your social media content as directed; analyze usage patterns to improve the Service; communicate with you about your account; and comply with legal obligations.
          </p>

          <h2 className="text-lg font-bold text-white">3. Third-Party Platform Data</h2>
          <p>
            When you connect social media accounts (LinkedIn, Pinterest, YouTube), we receive and store OAuth access tokens to publish content on your behalf. These tokens are encrypted at rest using AES-256 encryption. We access only the minimum platform permissions required for content publishing.
          </p>

          <h2 className="text-lg font-bold text-white">4. Data Storage & Security</h2>
          <p>
            Your data is stored in cloud databases with encryption at rest and in transit. Media files are stored in Cloudflare R2 with access controlled by workspace-level permissions. We implement industry-standard security measures including encrypted tokens, httpOnly cookies, and role-based access control.
          </p>

          <h2 className="text-lg font-bold text-white">5. AI Processing</h2>
          <p>
            Uploaded media is processed by Google Gemini AI models for caption generation. Media is sent to Google's API for analysis and is subject to Google's AI data processing policies. Generated captions are stored in our database associated with your workspace.
          </p>

          <h2 className="text-lg font-bold text-white">6. Data Sharing</h2>
          <p>
            We do not sell your personal information. We share data only with: social media platforms (to publish your content as directed); cloud infrastructure providers (for hosting and storage); and as required by law.
          </p>

          <h2 className="text-lg font-bold text-white">7. Data Retention</h2>
          <p>
            We retain your account data for as long as your account is active. Published content records are retained indefinitely for audit trail purposes. You may request deletion of your account and associated data at any time.
          </p>

          <h2 className="text-lg font-bold text-white">8. Your Rights</h2>
          <p>
            You have the right to: access your personal data; correct inaccurate data; delete your account and data; export your data; and opt out of non-essential communications.
          </p>

          <h2 className="text-lg font-bold text-white">9. Contact</h2>
          <p>
            For privacy-related inquiries, contact us through our <a href="/contact" className="text-indigo-400 hover:underline">Contact page</a>.
          </p>
        </div>
      </section>
    </div>
  );
};
