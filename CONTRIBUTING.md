# Contributing

## Before coding

1. Read [`docs/coding-standards.md`](docs/coding-standards.md).
2. Check the local `AGENTS.md` before changing Next.js code. This repository's
   installed Next.js documentation is the source of truth for framework APIs.
3. Keep each change focused on one behavior. Record assumptions when the desired
   behavior is not obvious.

## Development loop

1. Start from the supported Node and pnpm versions in `package.json`.
2. Run `pnpm install --frozen-lockfile` and copy `.env.example` to `.env.local`.
3. Make the smallest coherent change, keeping code inside its owning feature.
4. Run `pnpm format`, then `pnpm check`.
5. Exercise the changed path through a browser or `curl`.
6. Run `pnpm build` before handoff.

There is intentionally no automated test runner yet. Do not introduce one as a
side effect of unrelated work. Describe the manual scenario you verified in the
pull request.

## Pull requests

- Explain the user-visible outcome and why the approach fits the feature.
- Call out schema, environment, security, analytics, and accessibility changes.
- Include screenshots for visual changes and sample requests/responses for API
  changes, with secrets and personal data removed.
- Keep generated files out of commits unless a tool explicitly requires them.
- Never commit `.env.local`, credentials, provider payloads, or user prompts.

Reviewers should be able to reproduce the change using the commands and manual
verification notes in the pull request.
