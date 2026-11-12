import type { Blueprint, Block, Screen } from './schema';
import { createSandbox } from './sandbox';
import { evaluate, renderTemplate, type Value } from './expr';
import type { Issue } from './validate';

/**
 * Runs a (schema-valid) blueprint in a throwaway sandbox: renders every block on every
 * screen against the sample data (detail screens once per sample record, inputs at
 * their defaults) and presses every action once. Returns runtime errors with blueprint
 * paths, so the AI can repair them like validation issues.
 */
export function smokeTest(bp: Blueprint, opts: { now?: number } = {}): Issue[] {
  const issues: Issue[] = [];
  const seen = new Set<string>();
  const add = (path: string, message: string) => {
    const key = `${path}|${message}`;
    if (seen.has(key) || issues.length >= 40) return;
    seen.add(key);
    issues.push({ path, message });
  };
  const fixed = opts.now ?? Date.now();
  const sb = createSandbox(bp, { now: () => fixed });

  const tryTpl = (path: string, tpl: string | undefined, locals: Record<string, Value> = {}) => {
    if (!tpl) return '';
    try {
      return renderTemplate(tpl, sb.host(locals), locals);
    } catch (e) {
      add(path, `Runtime error: ${(e as Error).message}`);
      return '';
    }
  };
  const tryExpr = (path: string, src: string | undefined, locals: Record<string, Value> = {}): Value => {
    if (!src) return null;
    try {
      return evaluate(src, sb.host(locals), locals);
    } catch (e) {
      add(path, `Runtime error: ${(e as Error).message}`);
      return null;
    }
  };

  // Computed values, per record
  for (const [cName, c] of Object.entries(bp.collections)) {
    for (const r of sb.getState().records[cName] ?? []) {
      const item: Record<string, Value> = { ...r };
      for (const [k, src] of Object.entries(c.computed ?? {})) tryExpr(`collections.${cName}.computed.${k}`, src, { item });
    }
  }

  const uiDefaults = (sc: Screen): Record<string, Value> =>
    Object.fromEntries(
      Object.entries(sc.state ?? {}).map(([k, st]) => [k, st.default ?? (st.type === 'bool' ? false : st.type === 'number' ? 0 : '')]),
    );

  const checkBlock = (b: Block, path: string, base: Record<string, Value>) => {
    const L = (extra: Record<string, Value> = {}) => ({ ...base, ...extra });
    switch (b.type) {
      case 'hero':
        tryTpl(`${path}.eyebrow`, b.eyebrow, L());
        if (b.title && tryTpl(`${path}.title`, b.title, L()).trim() === '') add(`${path}.title`, 'Title renders as empty text; check the names it uses');
        tryTpl(`${path}.people.text`, b.people?.text, L());
        break;
      case 'section':
      case 'text':
        tryTpl(`${path}.text`, b.text, L());
        break;
      case 'card':
        tryTpl(`${path}.title`, b.title, L());
        tryTpl(`${path}.text`, b.text, L());
        tryExpr(`${path}.visible`, b.visible, L());
        break;
      case 'stats':
        b.items.forEach((it, i) => {
          tryTpl(`${path}.items.${i}.label`, it.label, L());
          tryTpl(`${path}.items.${i}.value`, it.value, L());
        });
        break;
      case 'progress': {
        tryTpl(`${path}.label`, b.label, L());
        const v = tryExpr(`${path}.value`, b.value, L());
        if (v !== null && typeof v !== 'number') add(`${path}.value`, 'Progress value must be a number between 0 and 1');
        tryTpl(`${path}.caption`, b.caption, L());
        break;
      }
      case 'chart': {
        const rows = b.of === 'people' ? bp.sample.people.map((p) => ({ person: { id: p.id, name: p.name } as Value })) : sb.rows(b.of).map((item) => ({ item: item as Value }));
        for (const r of rows) {
          tryExpr(`${path}.where`, b.where, L(r));
          tryExpr(`${path}.sortBy`, b.sortBy, L(r));
          tryExpr(`${path}.label`, b.label, L(r));
          const v = tryExpr(`${path}.value`, b.value, L(r));
          if (v !== null && typeof v !== 'number') add(`${path}.value`, 'Chart values must be numbers');
        }
        break;
      }
      case 'calendar':
        for (const item of sb.rows(b.collection)) {
          tryExpr(`${path}.where`, b.where, L({ item }));
          tryExpr(`${path}.date`, b.date, L({ item }));
        }
        tryTpl(`${path}.title`, b.title, L());
        break;
      case 'illustration':
        tryTpl(`${path}.text`, b.text, L());
        break;
      case 'timer': {
        tryTpl(`${path}.label`, b.label, L());
        const sec = tryExpr(`${path}.seconds`, b.seconds, L());
        if (sec !== null && (typeof sec !== 'number' || sec <= 0 || sec > 24 * 3600)) add(`${path}.seconds`, 'Timer length must be a number of seconds (1–86400)');
        break;
      }
      case 'list': {
        tryTpl(`${path}.empty`, b.empty, L());
        const rows = sb.rows(b.collection);
        if (rows.length && rows.every((item) => tryTpl(`${path}.item.title`, b.item.title, L({ item })).trim() === '')) {
          add(`${path}.item.title`, 'Item title renders as empty text for every record; check the field names it uses');
        }
        for (const item of rows) {
          tryExpr(`${path}.where`, b.where, L({ item }));
          tryExpr(`${path}.sortBy`, b.sortBy, L({ item }));
          tryTpl(`${path}.item.subtitle`, b.item.subtitle, L({ item }));
          tryTpl(`${path}.item.badge`, b.item.badge, L({ item }));
          if (b.item.button) {
            tryTpl(`${path}.item.button.label`, b.item.button.label, L({ item }));
            tryExpr(`${path}.item.button.visible`, b.item.button.visible, L({ item }));
          }
        }
        break;
      }
      case 'people':
        for (const p of bp.sample.people) {
          const person = { id: p.id, name: p.name };
          tryTpl(`${path}.subtitle`, b.subtitle, L({ person }));
          tryTpl(`${path}.badge`, b.badge, L({ person }));
          tryExpr(`${path}.sortBy`, b.sortBy, L({ person }));
        }
        break;
      case 'toggle':
        tryTpl(`${path}.label`, b.label, L());
        break;
      case 'field':
        tryTpl(`${path}.label`, b.label, L());
        break;
      case 'buttons':
        b.items.forEach((it, i) => {
          tryTpl(`${path}.items.${i}.label`, it.label, L());
          tryExpr(`${path}.items.${i}.visible`, it.visible, L());
        });
        break;
      case 'search':
      case 'segmented':
      case 'divider':
      case 'addButton':
        break;
    }
  };

  bp.screens.forEach((sc, si) => {
    const ui = uiDefaults(sc);
    const contexts: Array<Record<string, Value>> =
      sc.kind === 'detail' && sc.collection ? sb.rows(sc.collection).slice(0, 3).map((item) => ({ ui, item })) : [{ ui }];
    if (sc.kind === 'detail' && contexts.length === 0) add(`screens.${si}`, `Detail screen has no sample records in "${sc.collection}" to show`);
    for (const ctx of contexts) sc.blocks.forEach((b, bi) => checkBlock(b, `screens.${si}.blocks.${bi}`, ctx));
  });

  // Press every action once, in a fresh sandbox each time.
  for (const [aName, action] of Object.entries(bp.actions)) {
    const run = createSandbox(bp, { now: () => fixed });
    const usedIn = findItemContext(bp, aName);
    const form: Record<string, string | number | boolean | null> = {};
    for (const [k, f] of Object.entries(action.form?.fields ?? {})) {
      form[k] =
        f.type === 'number' ? (f.min ?? 3) : f.type === 'bool' ? true : f.type === 'date' ? fixed : f.type === 'member' ? bp.sample.me : f.type === 'choice' ? (f.options?.[0] ?? '') : 'Test';
    }
    const itemId = usedIn ? (run.getState().records[usedIn]?.[0]?.id ?? undefined) : undefined;
    const needsItem = action.steps.some((st) => 'update' in st || 'remove' in st);
    if (needsItem && !itemId) {
      add(`actions.${aName}`, usedIn ? `Action needs a record but "${usedIn}" has no sample records` : 'Action changes "item" but nothing that has a record uses it');
      continue;
    }
    if (action.confirm) {
      const item = usedIn && itemId ? run.rows(usedIn).find((r) => r.id === itemId) : undefined;
      const locals: Record<string, Value> = item ? { item } : {};
      try {
        renderTemplate(action.confirm, run.host(locals), locals);
      } catch (e) {
        add(`actions.${aName}.confirm`, `Runtime error: ${(e as Error).message}`);
      }
    }
    const r = run.run(aName, { collection: usedIn ?? undefined, itemId, form: action.form ? form : undefined });
    if (!r.ok) add(`actions.${aName}`, `Runtime error: ${r.error}`);
  }

  return issues;
}

/** The collection whose records this action runs on (list buttons, or any button/timer on a detail screen). */
function findItemContext(bp: Blueprint, action: string): string | null {
  for (const s of bp.screens) {
    for (const b of s.blocks) {
      if (b.type === 'list' && b.item.button?.action === action) return b.collection;
      if (s.kind === 'detail' && s.collection) {
        if (b.type === 'buttons' && b.items.some((i) => i.action === action)) return s.collection;
        if (b.type === 'timer' && b.onDone === action) return s.collection;
        if (b.type === 'addButton' && b.action === action) return s.collection;
      }
    }
  }
  return null;
}
