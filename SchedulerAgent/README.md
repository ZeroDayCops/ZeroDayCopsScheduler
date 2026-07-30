# SchedulerAgent

A multi-tenant social media content scheduling tool for agencies managing multiple clients.

## Overview

SchedulerAgent is a full-stack application that automates social media content creation and scheduling across LinkedIn, Pinterest, and YouTube. It uses AI-powered content analysis (Google Gemini) to generate platform-optimized posts from uploaded media assets, with per-client brand voice customization.

## Architecture

- **Backend** — Node.js + Express + Prisma + PostgreSQL
- **Frontend** — React + Vite + TypeScript + Tailwind CSS
- **AI Engine** — Google Gemini (vision + video analysis)
- **Publishing** — OAuth2 integrations with LinkedIn, Pinterest, YouTube

## Multi-Tenancy Model

- **Organization** — the agency
- **Users** — belong to an Organization with a role (Owner, Admin, Member)
- **Workspaces** — one per client brand, scoped to an Organization
- **WorkspaceAccess** — grants individual users access to specific client workspaces

## Key Features

- Watch-folder and manual upload media ingestion
- AI-powered content analysis producing a single Master Content JSON per asset
- Deterministic template rendering per platform (no extra AI calls)
- Calendar-based post scheduling with cron-driven publishing
- OAuth2 social account connections with encrypted token storage
- Retry logic with exponential backoff for failed publishes
- In-app notifications and analytics dashboard

## Project Structure

```
SchedulerAgent/
├── backend/          # Express API server + Prisma ORM
├── frontend/         # React + Vite + TypeScript + Tailwind
├── uploads/          # Watch-folder root (one subfolder per workspace)
├── templates/        # Platform template definitions
├── logs/             # Application logs
├── docs/             # Architecture docs
└── .agents/skills/   # AI agent skill definitions
```

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+
- npm

### Environment Setup

```bash
cp .env.example .env
# Edit .env with your database URL, API keys, and OAuth credentials
```

### Backend

```bash
cd backend
npm install
npx prisma migrate dev
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Environment Variables

See `.env.example` for the full list of required configuration variables.
