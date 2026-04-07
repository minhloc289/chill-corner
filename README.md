# OptiDev Starter Template

A minimal React + Vite template for building digital signage, dashboards, and kiosk applications with AI assistance.

**Clean canvas, powered by Claude Agent** 🤖

## Features

- ✨ Minimal starter with single hero page
- 🤖 Claude Agent AI assistant in Power Mode
- 🎨 React 19, Vite 6, Tailwind CSS, Framer Motion
- ☁️ Optional backend (database, auth, storage, functions)
- 🎭 Visual Editor support via `.optidev/` plugins

## Tech Stack

- React 19 with TypeScript (strict mode)
- Vite 6 with SWC (~1 second builds)
- Tailwind CSS 3, Framer Motion, React Router v7, pnpm (required)

## Getting Started

```bash
# Install dependencies
pnpm install

# Start dev server (port 5173)
pnpm dev

# Build for production
pnpm build
```

## What's Included

```
/src
  /components/  - HomePage with hero section
  /hooks/       - useInactivityTimer, useOrientation
  /lib/         - env.ts (runtime env helper), utils.ts
/.optidev      - Visual Editor Vite plugins
```

**Available**: Auto-return timer hook, orientation detection, Tailwind dark mode, Framer Motion animations

## Building with Claude Agent

Works with **Claude Agent** in OptiDev Power Mode (Plan → Execute → Visual Editor).

Ask Claude to build: digital signage, dashboards, kiosks, web apps.

## OptiDev Cloud Backend

Activate on-demand: PostgreSQL database, email/phone/Google auth, file storage, edge functions.

When you activate OptiDev Cloud, `src/lib/supabaseClient.ts` is automatically created:

```typescript
import { supabase } from '@/lib/supabaseClient';

// Query data
const { data } = await supabase.from('todos').select();
```

## Deployment

```bash
pnpm build
```

Deploy `dist/` folder to CloudFlare R2 (via OptiDev), static hosting, or your web server.

## Performance

- Fast builds: ~1 second
- Bundle: ~346KB (112KB gzipped)
- Code splitting: React, UI, utils chunks
- Smooth 60fps animations

## License

MIT
