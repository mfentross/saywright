# Browser checks (Playwright)

Both scripts expect the web build served on http://localhost:8099 and take a screenshot directory.

Demo mode (no server):

```bash
cd apps/client && CI=1 npx expo export -p web && npx serve@14 dist -l 8099 -s
node tools/e2e/demo-flow.cjs /tmp/shots
```

Live build against the server with scripted fake AI (free):

```bash
SAYWRIGHT_FAKE_AI=1 pnpm server
cd apps/client && CI=1 EXPO_PUBLIC_API_URL=http://localhost:8080 npx expo export -p web && npx serve@14 dist -l 8099 -s
node tools/e2e/live-build.cjs /tmp/shots
```
