/**
 * ZeroDayCops Brand Content — Single Source of Truth
 * All public marketing pages pull copy from here.
 */

export const brand = {
  name: 'ZeroDayCops',
  productName: 'SchedulerAgent',
  tagline: 'Nothing Slips Through. Every Post, On Time.',
  valueProposition:
    'ZeroDayCops SchedulerAgent is the unattended social media command center built for agencies managing multiple client brands. Drop media into a watch folder — our AI analyzes it, writes platform-native captions, slots it into the optimal schedule, and publishes it across LinkedIn, Pinterest, and YouTube. No manual review step, no missed windows, no excuses.',

  features: [
    {
      title: 'Zero-Touch Media Ingestion',
      description:
        'Drop images and videos into a watch folder. SchedulerAgent detects, validates, and queues them automatically — no manual uploads, no dashboard babysitting.',
      icon: 'FolderInput',
    },
    {
      title: 'AI-Powered Caption Engine',
      description:
        'Gemini vision analyzes every media file and generates platform-native captions, hashtags, and posting recommendations tuned to each brand\'s voice and history.',
      icon: 'Sparkles',
    },
    {
      title: 'Smart Multi-Platform Scheduling',
      description:
        'Timezone-aware slot engine with filename-parsed scheduling, default rules, and manual overrides. Posts go out exactly when they should — LinkedIn articles, Pinterest pins, YouTube shorts.',
      icon: 'CalendarClock',
    },
    {
      title: 'Multi-Tenant Agency Architecture',
      description:
        'Organizations, workspaces, and role-based access control let agencies manage dozens of client brands from a single dashboard without data leaking between accounts.',
      icon: 'Building',
    },
    {
      title: 'Fail-Safe Publishing Pipeline',
      description:
        'Atomic claim locking prevents double-publishing. Exponential backoff retries handle transient API failures. Comprehensive audit logs track every attempt, success, and failure.',
      icon: 'ShieldCheck',
    },
  ],

  howItWorks: [
    {
      step: 1,
      title: 'Drop Media',
      description: 'Add images or videos to your workspace\'s watch folder — or upload directly through the dashboard.',
    },
    {
      step: 2,
      title: 'AI Analyzes',
      description: 'Gemini vision inspects each file and generates a Master JSON with captions, hashtags, and timing for every platform.',
    },
    {
      step: 3,
      title: 'Template & Render',
      description: 'Platform-specific templates merge the AI output with your brand voice, CTA, and hashtag preferences.',
    },
    {
      step: 4,
      title: 'Schedule',
      description: 'The slot engine picks the optimal publish time — from filename hints, default rules, or your manual override.',
    },
    {
      step: 5,
      title: 'Publish',
      description: 'Posts go live across LinkedIn, Pinterest, and YouTube via authenticated OAuth. Failures retry automatically.',
    },
  ],

  platforms: [
    { name: 'LinkedIn', color: '#0a66c2' },
    { name: 'Pinterest', color: '#e60023' },
    { name: 'YouTube', color: '#ff0000' },
  ],

  cta: {
    primary: { text: 'Get Started', href: '/register' },
    secondary: { text: 'Log In', href: '/login' },
  },

  footer: {
    copyright: `© ${new Date().getFullYear()} ZeroDayCops. All rights reserved.`,
    links: [
      { text: 'Features', href: '/features' },
      { text: 'About', href: '/about' },
      { text: 'Contact', href: '/contact' },
      { text: 'Terms', href: '/terms' },
      { text: 'Privacy', href: '/privacy' },
    ],
  },
} as const;
