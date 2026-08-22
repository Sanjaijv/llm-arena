# Coding standards

These rules define the default for LLM Arena. When a rule needs an exception,
make the exception local, explain why in code or in the pull request, and retain
the safety property the rule was meant to provide.

## Design principles

- Prefer simple, explicit code over premature abstraction.
- Keep data immutable and functions pure by default. Push network, database,
  analytics, logging, and time-dependent behavior to the edges.
- Group code by product feature. A feature should own its contract, UI, and
  server implementation rather than distributing them into global layer folders.
- Extract shared code only after there is a real second consumer and the shared
  concept has a stable name.
- Optimize for safe failure: validate at boundaries, expose human error
  messages, and keep provider details and secrets on the server.

## Project structure

```text
app/                         Route composition and Next.js special files
features/<feature>/          Feature contracts and universal code
features/<feature>/server/   Server-only feature implementation
features/<feature>/ui/       Feature-owned components, when needed
prisma/                      Schema and migrations
public/                      Static browser assets
```

`app/` files should stay thin: authenticate, parse input, call feature code, and
translate the result into a response or UI. Use Next.js special filenames only
for their documented purpose. Import across top-level directories with `@/`; use
relative imports for files within the same small module.

Mark server-only modules with `import "server-only"`. Components are Server
Components unless they need state, event handlers, effects, or browser APIs. Put
`"use client"` at the narrowest useful boundary because its import graph ships
to the browser.

## TypeScript and data

- Write TypeScript for application code. Do not add JavaScript application
  files.
- Never use `any`. Start with `unknown`, validate or narrow it, and preserve the
  useful type information.
- Use `const`, `readonly`, and non-mutating array operations. Do not mutate
  parameters or use mutable module-level state.
- Prefer discriminated unions for state and event variants. Make switches
  exhaustive when every variant must be handled.
- Infer types from their source of truth, such as a Zod schema or Prisma model.
  Do not maintain a second hand-written version of the same shape.
- Validate every untrusted boundary: request bodies, URL parameters, environment
  variables, provider responses when their SDK does not guarantee the shape, and
  persisted JSON.
- Avoid type assertions. If an assertion is unavoidable at an integration
  boundary, keep it next to a runtime check and explain the invariant.

Use named exports for application modules. Default exports are reserved for
Next.js special files and integrations that require them. Name booleans as facts
or questions (`isLoaded`, `hasAccess`) and functions as actions (`createStream`,
`parseRequest`).

## React and UI

- Render on the server by default and keep client components small.
- Keep render functions free of side effects. Effects synchronize with external
  systems; they are not a substitute for deriving state during render.
- Compose small components with explicit props. Do not create a component merely
  to hide a few one-off elements.
- Reuse design tokens and repeated patterns from `globals.css` or a shared
  component. Do not duplicate the same long utility-class sequence.
- Every screen must support keyboard operation, visible focus, semantic HTML,
  sufficient contrast, useful accessible names, and reduced-motion preferences.
- Give loading, empty, error, and retry states the same attention as success.

## Routes, security, and errors

- Use Web `Request` and `Response` primitives in route handlers unless a
  specific Next.js extension is needed.
- Authenticate before doing user-scoped work. Authorize access to the individual
  resource; authentication alone is not authorization.
- Apply abuse controls before expensive provider or database operations.
- Return stable, minimal response contracts and appropriate HTTP status codes.
- Do not show raw exceptions, SQL details, provider errors, or stack traces to a
  user. Log diagnostic context on the server and return a plain recovery action.
- Never log secrets, authorization headers, raw prompts, model responses, or
  personal data. Analytics events use deliberate, documented properties only.
- Fail fast when required environment variables are missing. Browser-visible
  variables must use `NEXT_PUBLIC_`; secrets must never use that prefix.

## Database and external services

- Access Prisma and third-party SDKs only from server-only modules.
- Keep one development Prisma client and reuse it across hot reloads.
- Make schema changes through reviewed migrations. Avoid destructive migrations
  without a documented backup and rollout plan.
- Set explicit timeouts where supported. Propagate cancellation signals for work
  tied to an HTTP request.
- Treat external failures as normal. Decide whether to retry, fail closed, or
  fail open based on user safety and cost, and document security-related
  fail-open behavior next to the code.

## Formatting, imports, and comments

Prettier owns whitespace, wrapping, quotes, and trailing commas. Do not
hand-tune formatting that Prettier will replace. Imports are grouped in this
order with one blank line between groups:

1. Framework and third-party packages.
2. Absolute project imports using `@/`.
3. Relative imports and styles.

Comments explain constraints and decisions, not a line-by-line translation of
the code. Delete stale comments and commented-out code.

## Verification and definition of done

A change is complete when:

1. `pnpm format` has been run.
2. `pnpm check` passes with no warnings.
3. The changed behavior has been exercised in a browser or with `curl`,
   including its important failure state.
4. `pnpm build` succeeds with a complete local environment.
5. New environment variables are documented in `.env.example`; schema changes
   include a migration; user-visible changes meet the accessibility baseline.

The repository currently uses focused manual verification rather than an
automated test runner. When that decision changes, tests should live beside the
behavior they cover and should verify outcomes rather than implementation
detail.
