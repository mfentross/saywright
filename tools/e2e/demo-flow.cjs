const { chromium } = require('playwright');
(async () => {
  const out = process.argv[2];
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e)));
  const text = async () => (await p.locator('body').innerText()).replace(/\s+/g, ' ');
  const check = (name, ok) => console.log((ok ? 'PASS ' : 'FAIL ') + name);

  // Fullscreen: water Pilea
  await p.goto('http://localhost:8099/fullscreen', { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Watered: Pilea' }).click();
  let t = await text();
  check('headline updates', t.includes('1 plant is thirsty'));
  check('turn line updates', t.includes('You’re done for today. Jonas is up next.'));
  check('status updates', t.includes('Watered just now by you · next turn: Jonas'));
  // Add a plant via FAB form
  await p.getByRole('button', { name: 'Add a plant' }).click();
  await p.getByLabel('Name').fill('Cactus');
  await p.getByRole('button', { name: 'Add plant' }).click();
  check('add plant', (await text()).includes('Cactus'));
  // Tabs
  await p.getByRole('tab', { name: 'Flatmates' }).click();
  check('flatmates tab', (await text()).includes('Alex (you)'));

  // Test drive: reset + view as + skip a day
  await p.goto('http://localhost:8099/test-drive', { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Watered: Monstera' }).click();
  check('inline preview water', (await text()).includes('1 plant is thirsty'));
  await p.getByRole('button', { name: 'Reset test data' }).click();
  check('reset', (await text()).includes('2 plants are thirsty'));
  await p.getByRole('button', { name: /^Viewing as/ }).click();
  check('view as next person', (await text()).includes('VIEWING AS JONAS') || (await text()).toLowerCase().includes('viewing as jonas'));
  await p.getByRole('button', { name: 'Skip ahead one day to test reminders' }).click();
  await p.getByRole('button', { name: 'Skip ahead one day to test reminders' }).click();
  t = await text();
  check('fake notification shows', t.includes('Thirsty · to'));
  await p.screenshot({ path: `${out}/test-drive-tools.png` });

  // Building: chips single-select
  await p.goto('http://localhost:8099/building', { waitUntil: 'networkidle' });
  await p.getByRole('button', { name: 'Daily' }).click();
  check('frequency chip selected', (await p.getByRole('button', { name: 'Daily' }).getAttribute('aria-pressed')) === 'true');

  // Purchase: CTA follows plan
  await p.goto('http://localhost:8099/purchase', { waitUntil: 'networkidle' });
  await p.getByRole('radio', { name: /Keep it \+ changes/ }).click();
  check('cta follows plan', (await text()).includes('Start · €9.99 / month'));
  check('radio exposes checked', (await p.getByRole('radio', { name: /Keep it \+ changes/ }).getAttribute('aria-checked')) === 'true');
  await p.screenshot({ path: `${out}/purchase.png` });

  // Delivery: disabled when none
  await p.goto('http://localhost:8099/delivery', { waitUntil: 'networkidle' });
  await p.getByRole('checkbox', { name: /Add to my phone/ }).click();
  await p.getByRole('checkbox', { name: /Publish to App Store/ }).click();
  t = await text();
  check('cta disabled with none', t.includes('Pick at least one'));
  check('checkbox exposes unchecked', (await p.getByRole('checkbox', { name: /Add to my phone/ }).getAttribute('aria-checked')) === 'false');
  console.log('errors:', JSON.stringify(errors));
  await b.close();
})();
