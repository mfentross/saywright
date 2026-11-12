# Saywright

Describe an app by voice or text, test it in a sandbox, and keep it as a finished app.
Saywright builds, reviews, hosts and publishes it.

- Plan: [docs/PLAN.md](docs/PLAN.md)
- Safety & security: [docs/SECURITY.md](docs/SECURITY.md)
- Building blocks for generated apps: [docs/BLOCKS.md](docs/BLOCKS.md)
- Design handoff: [docs/HANDOFF.md](docs/HANDOFF.md), screens in [docs/design](docs/design)

## Repo layout

```
apps/client         Expo + expo-router app (iOS, Android, Web): the 9 screens
apps/server         Fastify API (sw-api skeleton), Dockerfile
packages/blueprint  App blueprint schema, safe expression language, validator, sandbox, Thirsty example
packages/player     React Native renderer for blueprints (also runs on web)
packages/ai         LangGraph generation pipeline (idea → safety → plan → blueprint → check/repair → review), evals
```

## Getting started

Requires Node 22 and pnpm 10.

```bash
pnpm install
pnpm test          # blueprint + server tests
pnpm typecheck
pnpm client        # Expo dev server (press i / a / w)
pnpm client:web    # web only
pnpm server        # Fastify on :8080 (real AI: needs ANTHROPIC_API_KEY)
SAYWRIGHT_FAKE_AI=1 SAYWRIGHT_DEV_LOGIN=1 pnpm server   # scripted fake AI + sign-in without email, free (dev only)
pnpm --filter @saywright/server worker                  # sw-worker, when the API runs with SAYWRIGHT_WORKER=none
```

Point the app at a server with `EXPO_PUBLIC_API_URL=http://localhost:8080`; without it the app runs in demo mode.

Server configuration:

| Variable | Default | |
|---|---|---|
| `LIBSQL_URL` | `file:./data/saywright.db` | `libsql://…` for Bunny Database |
| `LIBSQL_AUTH_TOKEN` | – | Bunny Database token |
| `ANTHROPIC_API_KEY` | – | for the default Claude models |
| `SAYWRIGHT_MODEL_<STEP>` | `anthropic:claude-opus-5-5` | `SCREEN`, `PLAN`, `WRITE`; any LangChain provider:model |
| `SAYWRIGHT_EFFORT_<STEP>` | low / medium / medium | Anthropic effort per step |
| `CORS_ORIGINS` | localhost dev ports | comma-separated |
| `SAYWRIGHT_WORKER` | `inline` | `none` in production: builds run in sw-worker |
| `SAYWRIGHT_APP_URL` | `http://localhost:8081` | base of sign-in links in emails |
| `SAYWRIGHT_FREE_APPS_PER_MONTH` / `_CHANGES_PER_MONTH` | 3 / 30 | free-tier limits |
| `SAYWRIGHT_DAILY_AI_CAP_USD` | 3 | hard daily AI cost cap per account |

AI evaluation (spends real money; needs `ANTHROPIC_API_KEY`):

```bash
pnpm --filter @saywright/ai eval                       # all ideas, stops at EVAL_BUDGET_USD (default 15)
EVAL_DRY=1 pnpm --filter @saywright/ai eval            # scripted fake model, free
```

## What's real and what's stubbed (phase 0/1)

Real:
- Blueprint schema with no code-running, URL-calling or credential-collecting blocks
- Expression language with step budget, length and depth limits (no loops, no host access)
- Validator with repair-friendly error paths, forbidden-field checks
- Sandbox: sample data, reset, view as another person, fast-forward time, simulated notifications
- Thirsty running from its blueprint inline (Test drive) and fullscreen
- Full building-block library (docs/BLOCKS.md): stats, progress, charts, calendar, timer, search/filters,
  tick boxes, detail screens with field editors, buttons, confirmations, toasts; Run Club demo uses all of them
- All 9 screens with design tokens, copy and interactions from the handoff
- Fastify API: projects stored in libSQL, builds run the AI pipeline, live progress over SSE,
  clarifying question + answer, versions
- AI pipeline (LangGraph) with a libSQL checkpointer, so paused builds survive restarts
- Building screen follows a live build (set `EXPO_PUBLIC_API_URL`)
- Change requests from Test drive: AI edits the blueprint (JSON Patch), checked and stored as a new version
- Jobs queue: the API enqueues, sw-worker runs builds/changes with leases (crash-safe)
- Email sign-in links, hashed session tokens, projects owned by accounts, free-tier limits and a daily AI cost cap

Stubbed (see `apps/client/src/services/stubs.ts`):
- Voice (phase 4: on-device speech recognition),
  payments (phase 5: RevenueCat / Stripe), delivery and review (phase 6–7)
- Sign-in emails are logged, not sent (no mail provider yet); Apple/Google/passkey sign-in not yet
- Not deployed yet
