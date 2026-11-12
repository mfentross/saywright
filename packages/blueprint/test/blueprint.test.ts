import { describe, expect, it } from 'vitest';
import {
  BudgetExceeded,
  Blueprint,
  createSandbox,
  evaluate,
  ExprError,
  thirsty,
  runclub,
  validateBlueprint,
  smokeTest,
  type EvalHost,
} from '../src';

const host: EvalHost = {
  resolve: (n) => (n === 'nums' ? [1, 2, 3, 4] : n === 'big' ? Array.from({ length: 4000 }, (_, i) => i) : undefined),
  now: () => Date.UTC(2026, 10, 5, 12),
  memberName: (id) => String(id),
  meId: () => 'you',
  nextMember: () => null,
};

describe('expressions', () => {
  it('evaluates arithmetic, logic and strings', () => {
    expect(evaluate('1 + 2 * 3', host)).toBe(7);
    expect(evaluate("'a' + 1", host)).toBe('a1');
    expect(evaluate('3 > 2 && !false', host)).toBe(true);
    expect(evaluate("2 > 3 ? 'x' : 'y'", host)).toBe('y');
  });

  it('supports list functions with `it`', () => {
    expect(evaluate('count(nums, it > 2)', host)).toBe(2);
    expect(evaluate("join(map(nums, it * 2), '-')", host)).toBe('2-4-6-8');
    expect(evaluate("plural(2, 'day')", host)).toBe('2 days');
  });

  it('rejects unknown functions and names', () => {
    expect(() => evaluate('fetch("http://example.com")', host)).toThrow(ExprError);
    expect(() => evaluate('constructor', host)).toThrow(ExprError);
    expect(() => evaluate('eval("1")', host)).toThrow(ExprError);
  });

  it('cannot reach host object internals', () => {
    expect(evaluate('nums.constructor', host)).toBe(null);
    expect(evaluate('nums.__proto__', host)).toBe(null);
  });

  it('stops runaway work with the step budget (no mining, no hanging)', () => {
    expect(() => evaluate('count(big, count(big, it > 0) > 0)', host)).toThrow(BudgetExceeded);
  });

  it('rejects overly long or deeply nested expressions', () => {
    expect(() => evaluate('1+'.repeat(400) + '1', host)).toThrow(ExprError);
    expect(() => evaluate('('.repeat(60) + '1' + ')'.repeat(60), host)).toThrow(ExprError);
  });
});

describe('validation', () => {
  it('accepts the Thirsty reference blueprint', () => {
    const r = validateBlueprint(thirsty);
    expect(r.issues).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('rejects password, card and ID fields', () => {
    const bad = structuredClone(thirsty) as any;
    bad.collections.plants.fields.password = { type: 'text' };
    bad.collections.plants.fields.cardNumber = { type: 'text' };
    bad.collections.plants.fields.notes = { type: 'text', label: 'Passport number' };
    const r = validateBlueprint(bad);
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.path)).toEqual(
      expect.arrayContaining([
        'collections.plants.fields.password',
        'collections.plants.fields.cardNumber',
        'collections.plants.fields.notes',
      ]),
    );
  });

  it('rejects blocks that do not exist (e.g. a web view or script)', () => {
    const bad = structuredClone(thirsty) as any;
    bad.screens[0].blocks.push({ type: 'webview', url: 'https://evil.example' });
    bad.screens[0].blocks.push({ type: 'script', code: 'while(true){}' });
    expect(validateBlueprint(bad).ok).toBe(false);
  });

  it('reports unknown references with a path the AI can repair', () => {
    const bad = structuredClone(thirsty) as any;
    bad.screens[0].blocks[2].item.button.action = 'nope';
    bad.collections.plants.computed.due = 'httpGet(item.name)';
    const r = validateBlueprint(bad);
    expect(r.issues).toEqual(
      expect.arrayContaining([
        { path: 'screens.0.blocks.2.item.button.action', message: 'Unknown action "nope"' },
        { path: 'collections.plants.computed.due', message: 'Unknown function "httpGet"' },
      ]),
    );
  });
});

describe('Thirsty in the sandbox', () => {
  // Thursday 5 Nov 2026, 12:00 local time
  const fixed = new Date(2026, 10, 5, 12, 0, 0).getTime();
  const make = () => createSandbox(Blueprint.parse(thirsty), { now: () => fixed });
  const hero = (sb: ReturnType<typeof make>) => {
    const b = sb.blueprint.screens[0]!.blocks[0]!;
    if (b.type !== 'hero') throw new Error('expected hero');
    return { eyebrow: sb.text(b.eyebrow!), title: sb.text(b.title), turn: sb.text(b.people!.text) };
  };
  const status = (sb: ReturnType<typeof make>) => Object.fromEntries(sb.rows('plants').map((r) => [r.name, r.status]));

  it('starts with the sample data from the design', () => {
    const sb = make();
    expect(hero(sb)).toEqual({
      eyebrow: 'Thursday',
      title: '2 plants are thirsty',
      turn: 'Your turn: Pilea. Lea has the Monstera.',
    });
    expect(status(sb)).toEqual({
      Monstera: 'Water today · Lea’s turn',
      Pilea: 'Water today · your turn',
      Fern: 'Watered today by Jonas',
      Basil: 'Next in 2 days · Jonas',
    });
  });

  it('"Watered" marks a plant done and updates headline and turn line', () => {
    const sb = make();
    expect(sb.run('water', { collection: 'plants', itemId: 'pilea' })).toMatchObject({ ok: true });
    expect(status(sb).Pilea).toBe('Watered just now by you · next turn: Jonas');
    expect(hero(sb).title).toBe('1 plant is thirsty');
    expect(hero(sb).turn).toBe('You’re done for today. Jonas is up next.');
    sb.run('water', { collection: 'plants', itemId: 'monstera' });
    expect(hero(sb).title).toBe('All plants happy');
  });

  it('reset restores the sample data', () => {
    const sb = make();
    sb.run('water', { collection: 'plants', itemId: 'pilea' });
    sb.reset();
    expect(hero(sb).title).toBe('2 plants are thirsty');
  });

  it('can view the app as another person', () => {
    const sb = make();
    sb.setViewAs('lea');
    expect(hero(sb).turn).toBe('Your turn: Monstera. Alex has the Pilea.');
    expect(status(sb).Monstera).toBe('Water today · your turn');
  });

  it('adds a plant through the form action', () => {
    const sb = make();
    sb.run('addPlant', { form: { name: 'Cactus', everyDays: 14 } });
    expect(sb.rows('plants').map((r) => r.name)).toContain('Cactus');
  });

  it('fast-forwarding two days makes plants due and sends the reminder', () => {
    const sb = make();
    sb.advance(2 * 24 * 3_600_000);
    expect(status(sb).Fern).toBe('Water today · Lea’s turn');
    expect(sb.getState().notices.map((n) => n.text)).toContain('Fern is thirsty. It’s your turn to water it.');
  });
});

describe('smoke test', () => {
  it('passes for Thirsty', () => {
    expect(smokeTest(Blueprint.parse(thirsty))).toEqual([]);
  });

  it('catches titles that render empty because of a wrong field name', () => {
    const bad = structuredClone(thirsty) as any;
    bad.screens[0].blocks[2].item.title = '{{item.title}}';
    const issues = smokeTest(Blueprint.parse(bad));
    expect(issues.map((i) => i.path)).toContain('screens.0.blocks.2.item.title');
  });

  it('catches runaway expressions at runtime', () => {
    const bad = structuredClone(thirsty) as any;
    bad.collections.plants.computed.heavy = 'count(plants, count(plants, count(plants, count(plants, count(plants, it.due) > 0) > 0) > 0) > 0)';
    for (let i = 0; i < 30; i++) bad.sample.records.plants.push({ id: `p${i}`, name: `P${i}`, everyDays: 3, lastWatered: '@now', lastWateredBy: 'lea', turn: 'lea' });
    const issues = smokeTest(Blueprint.parse(bad));
    expect(issues.some((i) => i.path === 'collections.plants.computed.heavy' && /step budget/.test(i.message))).toBe(true);
  });
});

describe('Run Club (every building block)', () => {
  const fixed = new Date(2026, 10, 5, 12, 0, 0).getTime();
  const bp = () => Blueprint.parse(runclub);

  it('validates and passes the smoke test', () => {
    expect(validateBlueprint(runclub).issues).toEqual([]);
    expect(smokeTest(bp(), { now: fixed })).toEqual([]);
  });

  it('uses every block type', () => {
    const used = new Set(bp().screens.flatMap((s) => s.blocks.map((b) => b.type)));
    const all = Blueprint.shape.screens.element.shape.blocks.element.options.map((o: any) => o.shape.type.value);
    expect([...all].filter((t) => !used.has(t))).toEqual([]);
  });

  it('edits fields with type coercion and limits', () => {
    const sb = createSandbox(bp(), { now: () => fixed });
    expect(sb.setField('runs', 'r1', 'km', '72')).toMatchObject({ ok: true });
    expect(sb.rows('runs').find((r) => r.id === 'r1')?.km).toBe(50); // clamped to max
    sb.setField('runs', 'r1', 'kind', 'Sprint'); // not an option
    expect(sb.rows('runs').find((r) => r.id === 'r1')?.kind).toBe('Easy');
    sb.toggle('runs', 'r5', 'done');
    expect(sb.rows('runs').find((r) => r.id === 'r5')?.done).toBe(true);
    expect(sb.setField('runs', 'r1', 'nope', 1)).toMatchObject({ ok: false });
  });

  it('filters with screen state and runs confirm/toast/back actions', () => {
    const sb = createSandbox(bp(), { now: () => fixed });
    const list = bp().screens[1]!.blocks.find((b) => b.type === 'list')!;
    if (list.type !== 'list') throw new Error();
    const visible = (ui: Record<string, unknown>) =>
      sb.rows('runs').filter((item) => sb.value(list.where!, { item, ui: ui as any })).map((r) => r.id);
    expect(visible({ q: '', kind: 'All', mine: false })).toHaveLength(5);
    expect(visible({ q: '', kind: 'Tempo', mine: false })).toEqual(['r2', 'r3']);
    expect(visible({ q: 'hill', kind: 'All', mine: false })).toEqual(['r3']);
    expect(visible({ q: '', kind: 'All', mine: true })).toEqual(['r2', 'r4']);
    const r = sb.run('deleteRun', { collection: 'runs', itemId: 'r3' });
    expect(r).toMatchObject({ ok: true, back: true, toast: 'Run deleted' });
    expect(sb.rows('runs').map((x) => x.id)).not.toContain('r3');
  });

  it('rejects a detail screen used without a record and field editors on tab screens', () => {
    const bad = structuredClone(runclub) as any;
    bad.screens[0].blocks.push({ type: 'field', field: 'km' });
    bad.actions.addRun.steps.push({ navigate: 'run' });
    const paths = validateBlueprint(bad).issues.map((i) => i.path);
    expect(paths).toEqual(expect.arrayContaining(['screens.0.blocks.6', 'actions.addRun.steps.2.navigate']));
  });
});
