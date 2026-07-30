import React, { useState } from 'react';
import { Mail, User, MessageSquare, Send, CheckCircle } from 'lucide-react';

export const ContactPage: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // TODO: Wire to backend endpoint or Formspree/Resend.
    // Currently this is a client-side-only confirmation.
    // Integration point: POST /api/contact { name, email, message }
    setSubmitted(true);
  };

  if (submitted) {
    return (
      <div className="animate-fade-in max-w-2xl mx-auto px-6 pt-20 pb-24 text-center">
        <div className="p-12 rounded-2xl border border-emerald-500/20 bg-emerald-500/5">
          <CheckCircle className="w-12 h-12 text-emerald-400 mx-auto mb-4" />
          <h2 className="text-2xl font-bold text-white mb-2">Message Received</h2>
          <p className="text-slate-400">
            Thank you, {name}! We'll get back to you at <span className="text-white font-semibold">{email}</span> as soon as we can.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-in">
      <section className="max-w-2xl mx-auto px-6 pt-20 pb-24">
        <div className="text-center mb-12">
          <h1 className="text-4xl sm:text-5xl font-black tracking-tight text-white">
            Get in Touch
          </h1>
          <p className="mt-4 text-slate-400 text-lg">
            Questions, feedback, or partnership inquiries — we'd love to hear from you.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="p-8 rounded-2xl border border-white/5 bg-[#0b101c] space-y-6">
          {/* Name */}
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-300 mb-2">
              <User className="w-4 h-4 text-indigo-400" />
              Name
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your name"
              className="w-full px-4 py-3 rounded-xl bg-[#090d16] border border-white/10 text-white placeholder-slate-600 text-sm focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition"
            />
          </div>

          {/* Email */}
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-300 mb-2">
              <Mail className="w-4 h-4 text-indigo-400" />
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@agency.com"
              className="w-full px-4 py-3 rounded-xl bg-[#090d16] border border-white/10 text-white placeholder-slate-600 text-sm focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition"
            />
          </div>

          {/* Message */}
          <div>
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-300 mb-2">
              <MessageSquare className="w-4 h-4 text-indigo-400" />
              Message
            </label>
            <textarea
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="How can we help?"
              rows={5}
              className="w-full px-4 py-3 rounded-xl bg-[#090d16] border border-white/10 text-white placeholder-slate-600 text-sm focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/30 transition resize-none"
            />
          </div>

          <button
            type="submit"
            className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl text-sm font-bold bg-gradient-to-r from-indigo-500 to-purple-600 text-white shadow-lg shadow-indigo-500/20 hover:shadow-indigo-500/40 transition-all"
          >
            <Send className="w-4 h-4" />
            Send Message
          </button>

          <p className="text-[11px] text-slate-600 text-center">
            Note: Contact form delivery is not yet wired to a backend. Messages are acknowledged client-side only.
          </p>
        </form>
      </section>
    </div>
  );
};
