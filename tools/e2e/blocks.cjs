// Run Club (every building block) in the browser, demo mode. Usage: node blocks.cjs <shots dir>
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
  await p.getByRole('button', { name: /Run Club, Testing/ }).click();
  await p.getByRole('button', { name: 'Test fullscreen' }).click();
  await p.getByRole('heading', { name: /km this week/ }).waitFor();
  let t = await body();
  check('home: hero + stats', /\d+ km this week/.test(t) && t.includes('Avg feeling'));
  check('home: progress ring', t.includes('Club goal: 60 km') && /km to go/.test(t));
  check('home: chart + calendar + card', t.includes('Km this week') && t.includes('This week') && t.includes('Saturday long run'));
  await p.screenshot({ path: `${out}/rc-home.png`, fullPage: false });

  const app = p.locator('body');
  await p.getByRole('tab', { name: 'Runs' }).last().click();
  await p.getByRole('textbox', { name: 'Search runs' }).last().fill('hill');
  t = await body();
  check('runs: search filters', t.includes('Hill reps') && !t.includes('Riverside loop'));
  await p.getByRole('textbox', { name: 'Search runs' }).last().fill('');
  await p.getByRole('radio', { name: 'Tempo' }).last().click();
  t = await body();
  check('runs: segmented filters', t.includes('Track tempo') && !t.includes('Recovery jog'));
  await p.getByRole('radio', { name: 'All' }).last().click();
  const box = p.getByRole('checkbox', { name: 'Recovery jog' }).last();
  await box.click();
  check('runs: tick box toggles', (await box.getAttribute('aria-checked')) === 'true');
  await p.screenshot({ path: `${out}/rc-runs.png` });

  await p.getByRole('button', { name: 'Open Riverside loop' }).last().click();
  await p.getByRole('button', { name: 'Back' }).last().waitFor();
  await p.getByRole('button', { name: 'Increase Minutes' }).last().click();
  t = await body();
  check('detail: stepper edits', t.includes('49'));
  await p.getByRole('radio', { name: '5 of 5' }).last().click();
  check('detail: rating', (await p.getByRole('radio', { name: '5 of 5' }).last().getAttribute('aria-checked')) === 'true');
  await p.getByRole('switch', { name: 'Ran with the group' }).last().click().catch(async () => {
    await p.getByRole('checkbox', { name: 'Ran with the group' }).last().click();
  });
  await p.screenshot({ path: `${out}/rc-detail.png` });
  await p.getByRole('button', { name: 'Delete run' }).last().click();
  t = await body();
  check('detail: confirm asks', t.includes('Delete “Riverside loop”?'));
  await p.getByRole('button', { name: 'Yes' }).last().click();
  await p.getByText('Run deleted').last().waitFor({ timeout: 3000 });
  t = await body();
  check('detail: delete + toast + back', !t.includes('Riverside loop') && t.includes('Run deleted'));

  await p.getByRole('button', { name: 'Add a run' }).last().click();
  await p.getByRole('textbox', { name: 'Title' }).last().fill('Evening shakeout');
  await p.getByRole('button', { name: 'Add run' }).last().click();
  t = await body();
  check('form: adds a record + toast', t.includes('Evening shakeout') && t.includes('Run added'));

  await p.getByRole('tab', { name: 'Timer' }).last().click();
  check('timer shows 04:00', (await body()).includes('04:00'));
  await p.getByRole('button', { name: 'Start' }).last().click();
  await p.waitForTimeout(2300);
  check('timer counts down', /03:5[6-8]/.test(await body()));
  await p.screenshot({ path: `${out}/rc-timer.png` });
  await p.getByRole('tab', { name: 'Runners' }).last().click();
  t = await body();
  check('leaderboard ranks people', t.includes('Leaderboard this week') && /km/.test(t));
  await p.screenshot({ path: `${out}/rc-team.png` });
  console.log('errors:', JSON.stringify(errors.slice(0, 5)));
  await b.close();
})().catch((e) => {
  console.error('ERROR', e.message.split('\n')[0]);
  process.exit(1);
});
