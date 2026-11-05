# Saywright — implementation plan (v2)

Targets: **iOS, Android, Web** from one codebase. Everything server-side (Saywright's own backend *and*
the backends of generated apps) runs on **bunny.net Magic Containers + Bunny Database**.
Source of truth for UI: `HANDOFF.md` + `docs/design/*.dc.html` (copy updated, see §8).
Safety & security: see `docs/SECURITY.md` (abuse prevention, isolation, approval gate, takedown).

---

## 1. Framework choice

The deciding requirement is unusual: **Saywright must run apps that didn't exist when Saywright was
shipped, inside itself, on iOS, Android and web**, and the same apps must also work as a web link
and as standalone store apps.

| | Expo / React Native | Flutter | Kotlin / Compose Multiplatform | Rust (Dioxus, Tauri mobile) |
|---|---|---|---|---|
| iOS + Android | mature | mature | Android mature, iOS stable since 2025 | early, small ecosystem |
| Web | react-native-web renders **real HTML** — small, fast, accessible, link-preview friendly | canvas/Wasm rendering — large first download, weaker text/SEO/accessibility | Wasm web target **Beta** | Dioxus web OK, mobile immature |
| Running apps made at runtime | easy: render a JSON app description with RN components; WebView sandbox also available | possible (Remote Flutter Widgets) | possible, little tooling | possible, little tooling |
| Per-user build + store submit | **EAS Build / Submit** has an API for exactly this | Codemagic etc., more glue | Gradle/Xcode CI, more glue | DIY |
| Voice, push, IAP, secure storage | expo modules + RevenueCat | plugins + RevenueCat | mostly DIY per platform | mostly DIY |
| Hiring / LLM code quality | TypeScript, largest pool; LLMs write it best | Dart, good | Kotlin, good | Rust, smaller pool |

**Recommendation: stay with Expo (React Native + TypeScript).** Flutter is the only serious
alternative and would be fine for the native apps, but the web side matters twice here (Saywright on web
*and* every generated app's web link), and Flutter's canvas web output is the weaker fit. Kotlin
Multiplatform's web target is still Beta; Rust mobile UI isn't production-ready. Bonus: one language
(TypeScript) across client, server, the app runtime and the LLM output.

Rust could still be useful later on the server for hot paths — not needed at the start.

---

## 2. The "app description" approach, explained

When someone says *"an app where my flatmates and I see which plants need water"*, the AI does
**not** write program code. It fills in a structured form — a blueprint — like this (shortened):

```json
{
  "name": "Thirsty",
  "theme": { "primary": "#1F7A4D", "background": "#F2F7EF" },
  "data": {
    "plants":    { "fields": { "name": "text", "everyDays": "number", "lastWatered": "date" } },
    "flatmates": { "fields": { "name": "text" } }
  },
  "screens": [
    { "id": "plants", "title": "Plants",
      "blocks": [
        { "type": "headline", "text": "{{count(plants where due)}} plants are thirsty" },
        { "type": "list", "of": "plants",
          "item": { "title": "{{name}}", "subtitle": "{{status}}",
                    "button": { "label": "Watered", "do": "markWatered" } } }
      ] }
  ],
  "actions":       { "markWatered": { "set": { "lastWatered": "now" }, "then": "nextTurn" } },
  "notifications": [ { "when": "plant due", "notify": "whoseTurn" } ]
}
```

Saywright ships one **player** (the "runtime") that knows how to turn any blueprint into a working app:
lists, buttons, forms, calendars, charts, photos, maps, reminders… It's like sheet music
(the blueprint) and a pianist (the player): Saywright only ever ships new sheet music, never a new pianist.

Why this is the right call for Saywright:
- **Preview without installing anything** — the player is already inside Saywright, so a new app appears
  instantly (§3).
- **Apple-compliant** — Apple forbids iOS apps from downloading and running new code (guideline 2.5.2).
  A blueprint is data, not code.
- **Reliable** — every blueprint is checked against strict rules before it's shown; the AI fixes
  mistakes automatically. Free-form AI code breaks far more often.
- **Cheap, fast changes** — "remind at 8 am" changes one line of the blueprint; every version is kept,
  undo is free.
- **"Never code"** is true by construction, and the same blueprint runs on iPhone, Android and web.

The limit: apps can only use building blocks the player knows. We expand the block library over time;
when an idea needs something missing, the Building chat says so honestly and offers the closest version.

---

## 3. Preview inside Saywright (sandbox, no install)

Test drive and Fullscreen test render the blueprint **inside the Saywright app** in a sandbox:

- **Isolated player view** — the generated app renders in its own container with its own theme;
  it can't touch Saywright's screens, account, payments or storage.
- **Sample data only** — an in-memory database seeded with generated sample records ("Monstera, Lea's
  turn"). Reset restores it. Nothing is saved or sent (matches "Sample data · nothing is saved").
- **Capability allow-list** — the blueprint can only call actions the player offers (store a record,
  navigate, show a notification, open camera with permission prompt). No network access except
  Saywright's own API; no arbitrary scripts.
- **Simulated time & notifications** — "fast-forward a day" and a fake notification banner so users
  can test reminders without waiting.
- **Simulated people** — switch "viewing as Lea / Jonas / you" to test shared apps alone.

On web the same sandbox runs in a sandboxed `<iframe>` on a separate domain (`*.saywright.studio`), so a
generated app can never read the Saywright web session.

---

## 4. System overview — all on bunny.net

```
 Saywright client (Expo: iOS / Android / Web)        Live apps (home screen, web link, store builds)
        │                                                  │
        ▼                                                  ▼
 api.saywright.com                                    api.saywright.show  /  <slug>.saywright.show
   ┌──────────────────────── Magic Containers ─────────────────────────────────┐
   │ sw-api        Fastify (Node/TS): accounts, projects, versions, purchases, │
   │               live build stream (SSE)                                     │
   │ sw-worker     AI generation (LangGraph.js), delivery pipeline (EAS        │
   │               builds, store submissions), backups                         │
   │ apps-runtime  Fastify: shared backend for ALL generated apps: data API,   │
   │               member sign-in, invites, file uploads, realtime updates     │
   │ apps-cron     schedules from blueprints → push notifications              │
   └───────────────────────────────────────────────────────────────────────────┘
        │                         │                             │
  Bunny Database (libSQL)    Bunny Storage + CDN           External
  · sw-core (accounts,     · Saywright web client             · Claude API (generation)
    projects, versions, jobs)· player web shell            · EAS Build/Submit (native builds)
  · apps-shard-NN (data of   · blueprints, photos,         · RevenueCat + Stripe (payments)
    generated apps)            screenshots, backups        · Expo Push / Web Push
```

### Generated apps' backends on Magic Containers
- **One shared, multi-tenant `apps-runtime` service** serves every live (approved, subscribed) app, rather than one
  container per app. A container per app would cost money for thousands of mostly idle apps and
  be slow to start. Every request carries the app ID; data is strictly separated per app.
- App data lives in **Bunny Database shards** (`apps-shard-01`, `-02`, …), each holding many apps,
  every row scoped by `app_id`. Reason: the public preview limits Bunny Database to **50 databases
  per account and 1 GB each** (raisable on request). When limits allow, big or paying-a-lot apps can
  move to their own database without changing the blueprint.
- Scale-out: Magic Containers autoscale `apps-runtime`; add regions with Bunny Database read replicas
  for read-heavy apps. Writes go to the primary region (Frankfurt).

### Bunny caveats and how we handle them
- **Bunny Database is in public preview; automatic backups are still on its roadmap** → `sw-worker`
  runs our own backups: nightly full export of every database + hourly incremental export of changed rows
  to Bunny Storage (separate region), with a monthly restore drill. This is a launch blocker, not optional.
- libSQL is SQLite-compatible: use Drizzle ORM (libSQL driver) + SQL migration files applied with the
  Bunny CLI. No Postgres-only features.
- Job queue: a `jobs` table in `sw-core` with leases (no extra queue service).
- Magic Containers persistent volumes are node-bound with no backups → used only for scratch/cache.
- iOS builds need macOS → EAS Build (not runnable on Magic Containers).
- CI: GitHub Actions → Docker image → GHCR → Bunny API rolls containers. Web client and player shell →
  `expo export -p web` → Bunny Storage → purge CDN.

---

## 5. Repo layout (pnpm + Turborepo)

```
apps/
  client/          Expo + expo-router — Saywright app (iOS, Android, Web)
  server/          Fastify; one Docker image, entrypoints: sw-api, sw-worker, apps-runtime, apps-cron
packages/
  ai/              LangChain/LangGraph graphs, prompts, model config, libSQL checkpointer, evals
  tokens/  ui/     Saywright design tokens + chrome components
  blueprint/       blueprint schema (Zod), validation, versioning, diffs
  player/          blueprint renderer + building-block library + sandbox (sample data, fake time)
  sdk/             typed API clients
templates/
  app-shell/       Expo project for per-app store builds (player + pinned blueprint)
infra/             GH Actions, Bunny deploy scripts, DB migrations, backup jobs
```

---

## 6. Server & AI stack

### Server: Fastify (Node.js, TypeScript)
- **Fastify** for `sw-api` and `apps-runtime` (and a small HTTP health/metrics server in workers).
- `fastify-type-provider-zod`: the same Zod schemas validate requests, type the handlers and feed
  `@fastify/swagger` → OpenAPI → generated typed client in `packages/sdk`.
- Security plugins: `@fastify/helmet`, `@fastify/rate-limit`, `@fastify/cors`, `@fastify/cookie`,
  `@fastify/multipart` (uploads with size/type limits), `@fastify/under-pressure` (load shedding).
- Build progress to the Building screen via Server-Sent Events (SSE).
- Logging with Fastify's built-in pino logger (JSON) → Bunny log forwarding / Sentry.
- Data access: Drizzle ORM on the libSQL client for Bunny Database.

### AI: LangChain.js + LangGraph.js (model-agnostic)
- **`@langchain/core` + provider packages** (`@langchain/anthropic`, `@langchain/openai`,
  `@langchain/google-genai`, `@langchain/mistralai`, …). Models are picked by config, not code
  (`initChatModel("anthropic:claude-sonnet-5-5")`), so each step can use a different provider and
  we can switch without a rewrite. Default: Claude (`claude-sonnet-5-5` for blueprints, `claude-opus-5-5`
  for complex apps, `claude-haiku-5-5` for clarifying questions and safety classification).
- **Fallbacks**: `.withFallbacks()` to a second provider when one is down or rate-limited.
- **Structured output**: `model.withStructuredOutput(blueprintZodSchema)` returns a typed blueprint on every
  provider. Keep the blueprint schema to features all major providers support (no exotic JSON Schema
  constructs), and test that in CI against each enabled model.
- **LangGraph.js** models the generation pipeline as a graph that runs inside `sw-worker` on Magic
  Containers (no LangGraph Platform needed):

```
 idea ─▶ safety check ─▶ understand ─▶ clarify? ──(interrupt: ask user, wait)──▶ write blueprint
                │                                                                      │
             decline                                                          validate & check
                                                                               │   ok   │ errors
                                                                               ▼        ▼
                                                       sample data ◀────── safety check   repair (max 3) ─┘
                                                            │
                                                         version ─▶ SSE "ready for test drive"
```

  - The **clarifying question** ("how often should it remind?") is a LangGraph `interrupt`. The graph
    pauses, the chip answer resumes it, even hours later.
  - Graph state is saved by a **checkpointer**. LangGraph ships Postgres/SQLite savers but none for
    remote libSQL, so we write a small **Bunny Database checkpointer** (based on the SQLite saver, using
    the libSQL client). It's a phase-0 spike item.
  - Graph progress events are streamed to SSE and become the step list on the Building screen.
  - Change requests are a second graph: request → safety check → blueprint diff → validate → new version.
- **Observability & evals: LangSmith** (EU region) for traces, prompt versions, cost per step, and eval
  datasets (e.g. 200 reference ideas → "valid blueprint rate", "passes safety", "matches intent"), run in CI
  before switching models or prompts. Redact personal data before tracing. If tracing data must stay on
  our own infrastructure, self-host Langfuse on Magic Containers instead (it has LangChain integration).
- Guardrails: free-tier quotas, a per-account daily AI cost cap (token usage from LangChain callbacks),
  and no tools with side effects for the model (see SECURITY.md).

Caveat: provider abstraction means lowest-common-denominator prompting in places. Provider-specific
extras (e.g. Anthropic prompt caching through `@langchain/anthropic`) are used where they cut cost,
behind the same interface.

---

## 7. Delivery routes

### Business model: licensed and run by Saywright, not owned
Users never own the app or its code. Saywright **licenses** it to them for as long as they subscribe, and
Saywright runs every service behind it. Saywright uploads the app to the **user's** store developer accounts
(they're the seller listed in the store, as Apple 4.2.6 requires), but the build, backend and
updates stay with Saywright.

### Saywright approval gate (before anything goes live)
Nothing leaves the sandbox until Saywright approves it. This applies to every route: home screen, web link and stores.
1. **Automatic checks** (sw-worker): content moderation of blueprint, text and images; privacy
   check (what personal data it stores → generates store privacy labels); quality checks (empty
   screens, broken actions); pre-check against App Store / Play guidelines; abuse signals
   (phishing, impersonation, gambling, etc.).
2. **Human review** for anything flagged, and for all store submissions at the start (later only a sample).
3. Outcome: *Approved* → Saywright provisions the backend (apps-runtime tenant, database shard, schedules,
   web link) and starts delivery. *Needs changes* → the user gets a plain-language reason and a
   one-tap "fix it" change request. Target: within 24 h.
4. Every new version from a change request goes through the gate again. Small changes that pass the
   automatic checks can be approved automatically.

Saywright-side tooling: an internal **review console** (queue, blueprint preview in the sandbox, check
results, approve/reject with reason templates, audit log). It's a small admin web app on the same stack.

### When a subscription ends
The app is **paused**, not deleted: the backend stops serving it, the player shows a "paused by owner"
screen, Saywright removes the store listing from sale through the store APIs, and the web link stops working.
Data stays exportable for 30 days, then it's deleted (GDPR). Resubscribing within 30 days restores it.
This has to be stated in the terms and at checkout.

| Route | Android | iOS | Web |
|---|---|---|---|
| **Add to my phone** | home-screen web app (PWA) with push; signed APK later | home-screen web app (PWA), push on iOS 16.4+; also always openable inside Saywright | — |
| **App Store & Google Play** | user's own Google Play developer account | user's own Apple Developer account (guideline 4.2.6) | — |
| **Web link** | `thirsty-lea.saywright.show` | same | same |

Store pipeline: connect developer accounts (guided, one time; App Store Connect API key + Play
service account stored encrypted) → EAS build with unique bundle ID → AI-written listing + screenshots
rendered from the test drive → submit → poll review → notify. Store rejections are fixed & resubmitted
automatically where possible.

---

## 8. Copy changes made in `design/`

| Screen | Before | After |
|---|---|---|
| Delivery – route 1 | Install on my phone · *Built and installed for you…* | **Add to my phone** · *Puts Thirsty on your home screen in about a minute, with notifications. No store needed.* |
| Delivery – route 2 | *…Published under your name.* | *Published under your name, from your own Apple and Google developer accounts (store fees are paid to Apple and Google). We guide you through the one-time setup, then write the listing, take the screenshots and handle review.* |
| Delivery – footer | *No code, no developer account, no setup…* | *No code and no technical setup. Saywright builds, hosts and updates your app. For the stores you connect your own developer accounts once, and we show you how.* |
| Publishing – phone | Installed | **On home screen** |
| Publishing – store steps | (starts at Built and signed) | new first step **Developer accounts connected · Apple and Google, under your name** |
| Publishing – last step | We'll send a notification | *Usually 1–7 days · we'll notify you* |
| Library banner / row | Installed on your phone… / v1 · installed · in store review | *It's on your home screen…* / *v1 · on your phone · in store review* |
| Main | …test before you buy | *…test before you decide to keep it* |
| Purchase – title / intro | Make Thirsty yours / Pick how you want to keep it | **Keep Thirsty running** / *Saywright checks it, publishes it and runs it for you.* |
| Purchase – plans | Own it · Own it + changes · [PRICE] | **Keep it · €4.99 / month**, **Keep it + changes · €9.99 / month** |
| Purchase – included / footer | We publish it for you · Share with [N] people / You only pay for apps you keep | *Checked and published by Saywright* · *50 active people a month included, then pay as you grow* / *Testing is free. Cancel anytime and take your data with you.* |
| Test drive | Keep it from [PRICE] | *Keep it from €4.99 / month* |
| Delivery – label / footer | Paid · Thirsty v1 / (as above) | *Subscribed · Thirsty v1* / *Saywright checks every app before it goes live, usually within a day. Then we build, host and update it. For the stores you connect your developer accounts once, and we upload it there for you.* |
| Publishing | — | phone card *Approved · on home screen*; new first step **Approved by Saywright · Content, privacy and quality check passed** |
| Library | Thirsty is yours / Owned | **Thirsty is live** / section **Live** |

Still to design:
- "Connect your developer accounts" flow (only when the store route is picked)
- "In Saywright review" state for Publishing and Library (shown while waiting), and a "Needs changes" state with a fix-it button
- "Paused" state for apps whose subscription ended
- **Usage** screen per app (active people, storage, credit balance, spending cap, forecast) + "Add credits" sheet
- "This app is full right now" screen for new people when an app hits its cap

---

## 9. Pricing: base plan + pay as you grow

An app might be used by three flatmates or go viral with 50,000 people. So pricing has two parts:
- a **fixed base** per app, which covers Saywright's fixed work (review, maintenance, store upkeep, backups) and includes a usage allowance
- **usage beyond the allowance, billed per use**, so a quiet app stays cheap and a booming app pays for what it uses

### 9.1 Base plans (per app)

| | Price | Includes |
|---|---|---|
| **Testing** | free | 3 new apps + 30 change requests per month, sandbox with sample data only |
| **Keep it** | **€4.99 / month** (€49 / year) | Saywright review, hosting + backend, phone + web link + upload to your store accounts, keep-it-working fixes, data export, **usage allowance below** |
| **Keep it + changes** | **€9.99 / month** (€99 / year) | everything above + changes by voice/text (fair use ~200/month), each version reviewed, **double usage allowance** |
| Later: **Saywright Studio** | €24.99 / month | changes plan for up to 5 apps, shared allowance |
| Later: **Dedicated** | custom | very large apps (> ~25k active people): own database and containers, custom regions, SLA |

### 9.2 Usage: what's included and what more costs

| Meter | Included (Keep it / + changes) | Beyond that |
|---|---|---|
| **Active people**: anyone who opens the app in a calendar month | 50 / 100 | **€1.50 per 100 people** (€0.015 each) |
| **Storage**: records, photos, files | 1 GB / 2 GB | **€0.20 per GB per month** |
| **Transfer**: photos/files downloaded | 10 GB / 20 GB | **€0.05 per GB** |
| **Notifications** | 100 per active person per month | fair use, then throttled |

"Active people" is the main meter on purpose: it's easy to understand ("how many people use my app"),
while requests, CPU and database rows aren't. It also tracks our real cost well. Storage and transfer only
matter for photo-heavy apps.

Examples:
- **Thirsty, 3 flatmates**: €4.99. No usage charges, ever.
- **Sports club app, 400 people**: €4.99 + 3.5 × €1.50 = **€10.24 / month**
- **App goes viral, 50,000 people, 30 GB photos**: €4.99 + 499.5 × €1.50 + 29 × €0.20 ≈ **€760 / month**.
  At that size we suggest Dedicated and the creator monetising the app (see 9.5).

### 9.3 How usage is paid: Saywright credits (works on iOS, Android and web)
Apple and Google subscriptions have a **fixed** price; they can't bill a different amount each month.
So usage is paid from a **credit balance**:
- **App (iOS/Android)**: credit packs as consumable in-app purchases (€5 / €20 / €50 / €100) via RevenueCat.
- **Web**: credit packs via Stripe, plus optional **auto top-up** ("add €20 when below €5").
- Credits bought on any platform work everywhere (Apple/Google allow this as long as the packs are also sold in-app).
- The base plan stays a normal subscription (in-app purchase or Stripe). Credits are only touched once an app
  passes its allowance, so most apps never need any.
- Usage is charged **daily** from the balance, so the balance always shows the truth. Nothing is billed in arrears,
  and nothing is a surprise.

### 9.4 Never a surprise bill: spending caps and alerts
- Each app has a **monthly usage cap** (default €20, adjustable, can be €0 = "never charge beyond the plan").
- Alerts at 50 %, 80 % and 100 % of the cap and when the credit balance is low (push + email).
- **At the cap or an empty balance, the app keeps working for people who already use it.** New people see
  "This app is full right now", and the creator gets a one-tap "raise cap / add credits". We never switch off
  an app for its existing users without warning.
- **Quiet apps**: after 60 days with no active people, we suggest pausing (data kept 90 days, €0) or switching
  to yearly billing.

### 9.5 Later: when an app takes off
- Let creators **charge their own users** (paid membership in the generated app, via a Saywright payments
  connector), so a viral app pays for itself. Saywright takes a small share.
- Automatic **Dedicated** upgrade offer above ~25k active people.

### 9.6 Cost check (to verify with load tests in phases 0 and 6)
Estimated cost per active person per month on Magic Containers + Bunny Database + CDN: **under €0.005**.
Bunny Database writes are $0.30 per million rows, reads $0.30 per billion rows, storage $0.10/GB per region.
At €0.015 per active person, that leaves margin after Apple/Google's 15–30 % on in-app purchases, VAT and
support. Re-check prices once Bunny Database leaves preview.

### 9.7 How usage is metered (implementation)
- `apps-runtime` emits usage events: first visit per person per app per month (deduplicated with a daily
  rollup), bytes stored per app (nightly scan), transfer from Bunny CDN statistics, notification counts.
- `sw-worker` aggregates daily → **credit ledger** in `sw-core` (append-only, double-entry: purchases,
  daily usage, refunds, adjustments). Every number on the bill can be traced to events.
- Cap enforcement happens in `apps-runtime` on sign-in of a new person (cheap check against a cached
  "app is full" flag).
- New screen to design: **Usage** per app (active people chart, storage, balance, cap, forecast
  "at this rate: €12 this month"), reached from Library.

### 9.8 Other notes
- Store fees (Apple €99/year, Google €25 one-time) are paid by the user to Apple/Google directly. This is
  said clearly on the Delivery screen.
- Prices use standard store price points. Consumer prices include VAT.
- Validate with a pricing test before launch (base €4.99 vs €3.99; €1.50 vs €1.00 per 100 people).

---

## 10. Name & domains

**Saywright**: like a playwright writes plays, a saywright *says* apps into being.
The theatre theme gives a vocabulary for the product: rehearse (test), stage, show, premiere, cast (members).

Recommended setup (three separate registrable domains, for security, see SECURITY.md §2.1):

| Purpose | Domain | Example | Why |
|---|---|---|---|
| Saywright itself (app, web, API) | **saywright.com** (+ saywright.app redirect) | `saywright.com`, `api.saywright.com` | the brand |
| Live, approved apps (web link / home screen) | **saywright.show** | `thirsty-lea.saywright.show` | "the show": the app is live, on stage. Brand recognisable, yet a separate domain |
| Web preview sandbox (unapproved test drives) | **saywright.studio** | `p-7f3k2.saywright.studio` | the studio is where you rehearse. Keeps unreviewed content away from live apps, so a phishing attempt in a preview can't get the live-apps domain blocklisted |

Alternatives for the live-apps domain:
- **onstage.page**: `thirsty.onstage.page`, reads like a sentence ("Thirsty is on stage")
- **saidso.app**: `thirsty.saidso.app`, "you said so, now it exists"
- **premiere.page**: `thirsty.premiere.page`, fits the launch moment
- **sayw.app**: shortest to type or say out loud (`thirsty.sayw.app`)

Alternatives for the preview domain: **rehearsal.page**, **saywright.dev**, **sayw.studio**.

Register both app domains on the Public Suffix List. Before committing: check availability at a registrar
and have a lawyer run a trademark search for "Saywright" (EUIPO, DPMA, USPTO; classes 9 and 42).
Register the social handles and app-store developer name at the same time.

---

## 11. Phases

| Phase | Scope | Exit criterion |
|---|---|---|
| 0 Spikes (1–2 wk) | hand-write Thirsty blueprint, render in sandbox on iPhone/Android/web; Bunny Database + Magic Containers hello-world incl. backup/restore; ask Bunny about raising DB limits; LangGraph checkpointer on Bunny Database; Fastify + Zod skeleton | Thirsty runs from a blueprint on all 3 platforms, restore tested |
| 1 Client shell | 9 screens, tokens, components, navigation, mock data; web on Bunny CDN | click-through matches design |
| 2 Saywright backend | sw-api + sw-worker, sw-core DB, sign-in (Apple/Google/email), projects/versions, SSE, CI/CD | client on real API |
| 3 Generation | §6, change requests, quotas | idea → testable app in < ~60 s |
| 4 Voice | on-device speech recognition + server fallback | Voice screen live |
| 5 Keep it | RevenueCat + Stripe subscriptions + credit packs, credit ledger, usage metering, caps & alerts, pause on cancel | subscription → app enters Saywright review |
| 6 Review + apps backend + delivery v1 | automatic checks + review console, apps-runtime, apps-cron, shards, invites, push, web link, home-screen install | flatmates use Thirsty for real |
| 7 Stores | developer account connect flow, EAS build/submit, listing + screenshots | one user app live in both stores |
| 8 Hardening | moderation, GDPR (export/delete, DPAs), monitoring, rate limits | launch-ready |
