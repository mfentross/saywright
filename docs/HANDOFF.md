# Saywright — design handoff for Claude Code

Saywright is a mobile app where people describe an app by text or voice, an LLM builds it,
they test it fullscreen, and if they like it they buy it and receive a **finished, installed app**
(never source code). This folder holds the design and everything needed to implement it.

## What's in here

- `HANDOFF.md` — this brief
- `design/*.dc.html` — one file per screen (390×844). They use a design-canvas runtime
  (`support.js`, `<x-dc>`, `<sc-for>`, `<sc-if>`, `{{holes}}`) that is NOT included, so they
  won't render on their own. Read them as the source of truth for layout, copy, inline styles,
  and the interaction logic in each file's `class Component` script.
- `design/canvas.json` — screen order and canvas layout.

## Screens and flow

| # | File | Screen | Goes to |
|---|------|--------|---------|
| 1 | Main.dc.html | Create: idea text box, Speak button, starter ideas, resume draft, tab bar | Voice, Building, TestDrive, Library |
| 2 | Voice.dc.html | Listening: live transcript, waveform, Type / Pause / Build it | Building, Main |
| 3 | Building.dc.html | Chat: user prompt, generated plan (screens, data, notifications), build progress, clarifying question | FullscreenTest |
| 4 | FullscreenTest.dc.html | The generated app full-bleed; the ONLY Saywright UI is a small ✕ (top-right, 44px hit area) | TestDrive |
| 5 | TestDrive.dc.html | Review: inline preview + expand-to-fullscreen, change requests by text/voice, "Keep this app" | FullscreenTest, Purchase |
| 6 | Purchase.dc.html | Pick plan: "Own it" (one-time) or "Own it + changes" (monthly) | Delivery |
| 7 | Delivery.dc.html | Where it goes (multi-select): install on phone, App Store & Google Play, web link | Publishing |
| 8 | Publishing.dc.html | Status: installed on phone; store pipeline built → listing → review → live | Library |
| 9 | Library.dc.html | My apps: success banner, Owned, Testing & building, tab bar | — |

Example content throughout: "Thirsty", a plant-watering app for a shared flat (flatmates Lea, Jonas, you).

## Design tokens

Colors
- Ground `#EFEFEA` · Surface `#FFFFFF` · Ink `#141414` · Line `#DADAD3` / divider `#E6E6E0` · Control border `#D4D4CC`
- Muted text `#55554F` (body) / `#5C5C57` (mono labels) · Placeholder `#6B6B65`
- Accent `#FF4F12` (always with ink text on top, never white). Alternates: `#FFB000`, `#7CDB5B`
- Dark (Voice screen): bg `#141414`, text `#F4F4EF`, secondary `#9A9A93` / `#B4B4AD`, borders `#3A3A36`
- Generated app (Thirsty) has its own theme: primary `#1F7A4D`, bg `#F2F7EF`, ink `#12301F`, muted `#3F5E4B`, tint `#CFE5C6` — keep generated apps visually distinct from Saywright's chrome.

Type (Google Fonts)
- Display: Bricolage Grotesque 700, tight tracking (-0.02 to -0.03em): h1 34–38px, app names 22px
- Body/UI: Geist 400/500/600: 15–17px body, 14px secondary, 11px tab labels
- Labels/status: Geist Mono 11–12px, uppercase section labels with 0.08em tracking

Shape and spacing
- Screen side padding 20px; top safe area ~52px
- Radii: cards 20–24px, pills full, icon tiles 12–15px, buttons full-round
- Touch targets ≥44px; primary buttons 52–56px tall
- Icons: 24px viewBox, 1.8–2px round strokes (any Lucide-style set matches)

## Interactions to keep

- Building: frequency chips (Per plant / Daily / Every 2 days), single-select
- Test screens: "Watered" marks a plant done, headline and turn line update; reset restores sample data
- Purchase: radio plans, CTA text follows the selected plan
- Delivery: checkbox routes, CTA disabled when none selected
- Fullscreen test: nothing but the generated app plus the ✕; consider long-press on ✕ for "Change something / Keep this app"

## Product rules

- Users never see or handle source code. Saywright builds, signs, hosts, updates and publishes.
- Testing is free and uses sample data; payment happens only when keeping an app.
- Placeholders still to decide: `[PRICE]` (both plans), `[N]` (share limit).

## Open risks to resolve before building delivery

Verify against current Apple/Google policies:
- App Store guideline 4.2.6 rejects apps from app-generation services unless the content owner submits them.
  Publishing under each user's name likely needs their own developer account.
- iOS doesn't allow direct installs outside the App Store (EU alternative marketplaces aside). Options: unlisted
  App Store distribution, a home-screen web app, or a Saywright "player" app (check guideline 2.5.2 on downloaded code).
- Android allows direct installs and Play publishing more easily.

## Suggested first prompt for Claude Code

> Read HANDOFF.md and every file in design/. Build the Saywright mobile app with Expo (React Native + TypeScript)
> and expo-router. Start with the 9 screens and the navigation in the flow table, mock data only, matching
> the tokens and copy exactly. Put tokens in one theme file and shared pieces (pill button, card, tab bar,
> section label, icon tile) in components/. Leave LLM, voice and payments as typed stubs, and list what's
> stubbed when done.
