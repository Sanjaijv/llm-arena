# LLM Arena

LLM Arena lets people send one prompt to multiple free-tier AI models, compare
their streamed answers, and vote for the best response. The resulting votes and
per-call measurements power an evidence-based model leaderboard.

## Prerequisites

- Node.js 22.21.x or 24.5+
- pnpm 10.27.0 (the version declared in `package.json`)
- PostgreSQL

## Local setup

1. Install dependencies:

   ```bash
   corepack enable
   pnpm install --frozen-lockfile
   ```

2. Copy `.env.example` to `.env.local` and fill in every value.

3. Apply the database migrations, generate the Prisma client, and start the app:

   ```bash
   pnpm prisma:migrate
   pnpm prisma:generate
   pnpm dev
   ```

4. Open [http://localhost:3000](http://localhost:3000).

Environment variables are validated at startup. A missing or malformed value is
expected to stop the application immediately.

## Quality checks

Run the same static checks as CI:

```bash
pnpm check
```

Before handing off a change, also produce a real production build:

```bash
pnpm build
```

Use `pnpm format` and `pnpm lint:fix` for safe automatic fixes. See
[`CONTRIBUTING.md`](CONTRIBUTING.md) and
[`docs/coding-standards.md`](docs/coding-standards.md) before making a change.

## Main directories

- `app/` contains Next.js routes, layouts, and route handlers.
- `features/` contains product behavior grouped by feature.
- `prisma/` contains the database schema and migrations.
- `public/` contains static assets.

The application uses Next.js 16 App Router, React 19, strict TypeScript, Prisma,
Clerk, Arcjet, OpenRouter, and PostHog.
