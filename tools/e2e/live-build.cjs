const { chromium } = require('playwright');
(async () => {
  const out = process.argv[2];
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  p.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  const check = (n, ok) => console.log((ok ? 'PASS ' : 'FAIL ') + n);
  const body = async () => (await p.locator('body').innerText()).replace(/\s+/g, ' ');

  await p.goto('http://localhost:8099/', { waitUntil: 'networkidle' });
  await p.getByRole('textbox', { name: 'Your idea' }).fill('An app where my flatmates and I can see which plants need water');
  await p.getByRole('button', { name: 'Build this app' }).click();
  // Not signed in yet: Building asks first.
  await p.getByText('Sign in to build this app').waitFor({ timeout: 10000 });
  check('asks to sign in', true);
  await p.getByRole('button', { name: 'Sign in', exact: true }).click();
  await p.getByRole('textbox', { name: 'Your email' }).fill('tester@example.com');
  await p.getByRole('button', { name: 'Send sign-in link' }).click();
  await p.getByText('Check your email').waitFor({ timeout: 10000 });
  await p.getByRole('button', { name: 'Open the link (development)' }).click();
  await p.getByText('Quick question:').waitFor({ timeout: 15000 });
  check('build starts after sign-in', true);
  let t = await body();
  check('plan card from server', t.includes('Plant care for a shared flat') && t.includes('Plants, Schedule, Flatmates'));
  check('live steps', t.includes('Checked the idea') && t.includes('Planned the screens'));
  check('test drive disabled while waiting', await p.getByRole('button', { name: 'Open test drive' }).isDisabled());
  await p.screenshot({ path: `${out}/e2e-question.png` });
  await p.getByRole('button', { name: 'Daily' }).click();
  await p.getByText('Ready to test').waitFor({ timeout: 20000 });
  t = await body();
  check('steps after answer', t.includes('Wrote the app') && t.includes('Final safety check'));
  check('test drive enabled', !(await p.getByRole('button', { name: 'Open test drive' }).isDisabled()));
  await p.screenshot({ path: `${out}/e2e-ready.png` });
  await p.getByRole('button', { name: 'Open test drive' }).click();
  await p.getByRole('heading', { name: /plants are thirsty/ }).waitFor({ timeout: 10000 });
  check('generated app runs fullscreen', (await body()).includes('Monstera'));

  // Change request from Test drive
  await p.getByRole('button', { name: 'Exit test and go back to Saywright' }).click();
  await p.getByText('Tell Saywright what to change').first().waitFor({ timeout: 10000 }).catch(() => {});
  await p.getByRole('button', { name: 'Darker look' }).click();
  await p.getByText('v2 · Darker look').waitFor({ timeout: 20000 });
  check('change applied as v2', (await body()).includes('TEST DRIVE · V2') || (await body()).toLowerCase().includes('test drive · v2'));
  await p.screenshot({ path: `${out}/e2e-changed.png` });

  // Declined idea (still signed in)
  await p.goto('http://localhost:8099/', { waitUntil: 'networkidle' });
  await p.getByRole('textbox', { name: 'Your idea' }).fill('Copy the bank login of my Sparkasse');
  await p.getByRole('button', { name: 'Build this app' }).click();
  await p.getByText('Saywright can’t build this app').waitFor({ timeout: 15000 });
  check('declined message shown', (await body()).includes('copy a bank’s login'));
  await p.screenshot({ path: `${out}/e2e-declined.png` });
  console.log('errors:', JSON.stringify(errors.slice(0, 5)));
  await b.close();
})().catch((e) => { console.error('ERROR', e.message); process.exit(1); });
