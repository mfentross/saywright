# Saywright

Describe an app by voice or text, test it in a sandbox, and keep it as a finished app.
Saywright builds, reviews, hosts and publishes it.

- Plan: [docs/PLAN.md](docs/PLAN.md)
- Safety & security: [docs/SECURITY.md](docs/SECURITY.md)
- Design handoff: [docs/HANDOFF.md](docs/HANDOFF.md), screens in [docs/design](docs/design)

## Repo layout

```
apps/client         Expo + expo-router app (iOS, Android, Web): the 9 screens
apps/server         Fastify API (sw-api skeleton), Dockerfile
packages/blueprint  App blueprint schema, safe expression language, validator, sandbox, Thirsty example
packages/player     React Native renderer for blueprints (also runs on web)
```

## Getting started

Requires Node 22 and pnpm 10.

```bash
pnpm install
pnpm test          # blueprint + server tests
pnpm typecheck
pnpm client        # Expo dev server (press i / a / w)
pnpm client:web    # web only
pnpm server        # Fastify on :8080
```

## What's real and what's stubbed (phase 0/1)

Real:
- Blueprint schema with no code-running, URL-calling or credential-collecting blocks
- Expression language with step budget, length and depth limits (no loops, no host access)
- Validator with repair-friendly error paths, forbidden-field checks
- Sandbox: sample data, reset, view as another person, fast-forward time, simulated notifications
- Thirsty running from its blueprint inline (Test drive) and fullscreen
- All 9 screens with design tokens, copy and interactions from the handoff
- Fastify skeleton: health, blueprint validation, projects + SSE build stream (in-memory)

Stubbed (see `apps/client/src/services/stubs.ts`):
- AI generation (phase 3: LangGraph pipeline), voice (phase 4: on-device speech recognition),
  payments (phase 5: RevenueCat / Stripe), delivery and review (phase 6–7)
- Projects are in-memory; no accounts, database or deployment yet
