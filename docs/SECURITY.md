# Saywright — safety & security plan

Three things to protect:
1. **Our users** (people who create apps) and their accounts, payments and store credentials.
2. **Generated apps and the people using them** (Lea and Jonas in Thirsty): their data, sign-in, and privacy.
3. **Our platform and the rest of the internet from malicious creators**: apps that try to attack
   other systems or Saywright itself, mine crypto, host illegal content, phish, spy or scam.

Guiding idea: **make abuse structurally impossible first, detect it second, review it third.**
Moderation catches what slips through; it isn't the main defence.

---

## 1. The strongest control: generated apps contain no code

Because the AI produces a blueprint (data), not a program, a whole class of attacks has nowhere to run:

| Attack | Why it can't run |
|---|---|
| Crypto mining (server or in the browser) | No user code runs anywhere. The expression language is **not Turing-complete**: no loops, no recursion, a fixed step budget per evaluation (e.g. 1,000 steps / 5 ms), and only pure functions (math, text, dates). There's nothing to put a miner in. No WebAssembly, no `eval`, no custom JS. |
| Attacking other systems (scanning, DDoS, exploits) | Blueprints **can't make arbitrary network requests**. The only network target is Saywright's own apps-runtime API. Future integrations (calendar, maps, payments…) are **Saywright-built connectors** with fixed endpoints, not user-supplied URLs. |
| Escaping to our servers | The server never executes blueprint logic as code; it interprets a validated, typed structure with bounded cost. |
| Malicious scripts in the web link | The player renders only Saywright's UI blocks; user text is always rendered as text (no HTML injection); strict CSP with no inline or third-party scripts. |
| Hidden behaviour after review | Blueprints are versioned and immutable; every new version is checked again (§4). The reviewed version is exactly what runs. |

The blueprint schema itself is a security boundary: rules are enforced by the validator, not by the AI's goodwill.

**Blocks that will never exist** (so the AI can't produce them even if asked):
- password fields for anything other than Saywright's own member sign-in (prevents credential phishing)
- card number, IBAN or ID-document fields (payments only via a Saywright payments connector, later)
- hidden or background location tracking, background audio/camera recording, reading contacts or SMS
- arbitrary file downloads/executables, links that auto-redirect
- user-defined webhooks or "fetch URL" actions

---

## 2. Protecting the platform from malicious creators

### 2.1 Isolation between services
- **Separate Magic Container apps** for Saywright core (`sw-api`, `sw-worker`) and for user apps
  (`apps-runtime`, `apps-cron`). They hold **different credentials**: apps-runtime has no access to the
  sw-core database, payments, store credentials or admin APIs.
- **Separate Bunny Database credentials per shard**, scoped to the minimum (runtime gets
  read/write on app shards only; backups use their own write-only storage key).
- AI generation workers (LangGraph.js) hold no secrets beyond the LLM provider API keys. No LangChain
  agents with tools, no code-execution or web-browsing tools, no community loaders that fetch URLs.
  LangChain packages are pinned and reviewed like any other dependency.
  Traces sent to LangSmith are scrubbed of personal data. The model has **no tools with side
  effects**; it can only return a blueprint, which is then validated.
- Three separate domains: `saywright.com` (Saywright), `saywright.show` (approved live apps) and
  `saywright.studio` (unapproved web previews, so preview abuse can't get live apps blocklisted).
  Register `saywright.show` and `saywright.studio` on the
  **Public Suffix List** so every app subdomain is its own site for cookies and storage. One app can't
  read another's data or Saywright's session.

### 2.2 Resource quotas (no free compute, no runaway cost)
Per app and per account, enforced in apps-runtime and at the edge:
- requests per minute, records, storage (1 GB), file size and type, active people (per plan allowance + the creator's spending cap, see PLAN.md §9), push notifications
  per day, invite emails per day, scheduled jobs per day
- per-request CPU/step budget and timeout; queries always paginated and indexed (no unbounded scans)
- AI usage quotas per account (free tier: 3 apps / 30 changes per month), hard daily cost cap per account,
  and a global spend alarm
- violations → throttle, then auto-suspend, then human review

### 2.3 Network & edge
- **Bunny Shield** (WAF + DDoS protection) and rate limiting in front of all public endpoints.
- No inbound access to containers except through the CDN/endpoint; admin tooling is not publicly routable.
  It sits behind SSO with hardware security keys.
- Outbound traffic from apps-runtime only to an allow-list (Bunny Database, Expo Push, Web Push
  services). Saywright-built connectors go through an **egress proxy** that blocks private IP ranges and
  metadata endpoints (prevents SSRF, where a request is tricked into hitting internal systems).

### 2.4 Prompt injection & AI misuse
- User text is treated as data: never mixed with system instructions without clear delimiters; no secrets
  or other users' data ever in the prompt context.
- Output is accepted only if it passes the schema plus policy checks; anything else is discarded.
- A separate safety classifier (small, fast model) screens the **idea**, the **change requests** and the
  **resulting blueprint** against the content policy (§3).

### 2.5 Engineering hygiene
- Dependency lockfiles, automated updates (Renovate), vulnerability scanning in CI, SBOM per image,
  signed container images, minimal base images, non-root containers, read-only filesystems.
- CI uses short-lived OIDC credentials, not long-lived deploy keys. Branch protection + required review.
- Secrets only in Magic Containers' secret store, rotated regularly; nothing in the repo.
- **External penetration test before launch**, bug bounty after launch, yearly re-test.

---

## 3. Content policy: what Saywright won't build or host

Published as an Acceptable Use Policy in the terms. Prohibited (examples):
- **Malware & attacks**: anything that attacks, scans or overloads other systems; crypto mining;
  credential theft; spam tools
- **Fraud & deception**: phishing, impersonating brands, banks, authorities or people; fake shops;
  investment/crypto schemes; fake reviews
- **Surveillance & stalking**: covert tracking of people, monitoring partners/employees without consent
- **Illegal goods & services**: drugs, weapons, counterfeit goods, unlicensed gambling, unlicensed financial
  or medical services
- **Harmful content**: child sexual abuse material (zero tolerance + legal reporting), terrorism/extremism,
  hate, harassment, self-harm promotion, non-consensual intimate imagery, adult content
- **Data harvesting**: collecting personal data beyond what the app visibly needs; health/biometric data
  without the specific flow Saywright provides

Enforcement starts at the idea: the Building chat declines prohibited ideas in plain language,
before anything is generated.

---

## 4. The Saywright approval gate (before anything goes live)

Every version passes before it gets a backend, a web link or a store upload:
1. **Automatic checks**: policy classifier on blueprint, texts, names and images; brand/impersonation check
   (names, logos, look-alike domains); link scanning (Safe-Browsing-style reputation) for any URL in the app;
   privacy analysis (what personal data, which permissions) → generates store privacy labels; store-guideline
   pre-check; risk score.
2. **Human review** for flagged or high-risk apps (risk score, new account, sensitive categories), and for
   every store submission at the start.
3. **Decision with reasons** (needed under the EU Digital Services Act): approved / needs changes (with
   one-tap fix) / rejected. Appeal possible.

The review console has full audit logs; every reviewer action is recorded.

---

## 5. After approval: monitoring and takedown

Approved apps can still turn bad, mostly through content members upload or a change in how they're used.
- **Report button in every generated app** (shown inside the player, can't be removed by the blueprint).
- **Uploads**: file type allow-list (images, PDFs), re-encoding of images (strips hidden payloads and
  metadata), malware scan, and hash matching against known CSAM databases (via an established provider).
- **Behaviour signals**: traffic spikes, many sign-ups from one source, outbound link clicks, push volume,
  reports → risk score → auto-throttle or review.
- **Kill switch per app**: because Saywright runs every backend, Saywright can suspend an app instantly everywhere.
  Web link, home-screen app and store builds all show "This app is unavailable". The store listing is removed
  through the store APIs.
- **Account-level actions**: suspend the creator, revoke all their apps, block payment method/device.

---

## 6. Protecting our users (creators)

- Sign in with Apple / Google / passkeys; email magic links as fallback. No passwords stored. Optional
  2FA, required for anyone who connected store accounts.
- **Store credentials are the highest-value secrets** (App Store Connect API key, Play service account):
  - ask for the least-privileged role (App Manager / release manager), never Admin
  - envelope-encrypted, with the master key outside the database; only sw-worker's store pipeline can decrypt
  - used only for upload/listing/review calls, every use logged and visible to the user
  - user can revoke any time; Saywright reminds them how
- Payments only via Apple/Google in-app purchase or Stripe. Saywright never sees card numbers.
- Sessions bound to device, short-lived tokens, new-device sign-in alerts, in-app account deletion (required
  by Apple), full data export.

---

## 7. Protecting generated apps and their users

- **Strict tenant isolation**: every apps-runtime query is scoped by `app_id` in a data-access layer that
  can't be bypassed, plus automated tests that try cross-tenant access. Large apps can move to their own database.
- **Member sign-in** handled by Saywright (magic link / passkey), not by the blueprint. Access rules come from
  the blueprint (e.g. "only flatmates of this flat") and are enforced server-side, never only in the UI.
- Encryption in transit everywhere; encrypted backups; backups and restore drills (see PLAN.md §4).
- **Privacy by default**: generated apps collect only the fields their screens visibly use; a privacy
  policy is generated for every app; members can export/delete their data.
- **Roles under GDPR**: the creator is the controller of their app's data and Saywright is the processor. A
  data processing agreement is part of the subscription terms. Saywright's sub-processors are listed.
- The preview sandbox uses sample data only, in an isolated player context with a sandbox-only token.
  The test app can't see the Saywright session or any real data.

---

## 8. Abuse prevention at sign-up

- Email/phone verification for the free tier; device and IP reputation; rate limits on account creation.
- Publishing requires a paid subscription through Apple/Google/Stripe, which adds real identity friction
  and fraud screening (e.g. Stripe Radar).
- New accounts start with lower quotas and stricter review; trust grows with clean history.

---

## 9. Legal & operations

- **EU Digital Services Act**: Saywright hosts user content, so it needs a notice-and-action process, statements
  of reasons for removals, an internal complaint/appeal system, a single point of contact, and transparency
  reporting (scope depends on company size — get legal advice).
- Process for law-enforcement requests and mandatory reporting of CSAM.
- Incident response plan: on-call, severity levels, 72-hour GDPR breach notification, customer comms
  templates, post-mortems.
- Terms of service + Acceptable Use Policy + creator DPA reviewed by a lawyer before launch.

---

## 10. Where this lands in the phases

| Phase | Security work |
|---|---|
| 0 Spikes | blueprint schema with forbidden blocks, step-budgeted expression evaluator, threat model review |
| 1–2 | auth, secrets handling, service/DB credential separation, CI hygiene, Bunny Shield |
| 3 Generation | safety classifier on idea/changes/blueprint, prompt-injection handling, AI cost caps |
| 5 Keep it | fraud screening, account-level quotas |
| 6 Review + apps backend | approval gate + review console, tenant isolation tests, quotas, upload scanning, report button, kill switch, `saywright.show` + `saywright.studio` on Public Suffix List |
| 7 Stores | encrypted least-privilege store credentials, credential audit view |
| 8 Hardening | external pentest, DSA processes, incident response, legal docs; bug bounty after launch |
