import type { Blueprint, Block } from './schema';
import { createSandbox } from './sandbox';
import { evaluate, renderTemplate, type Value } from './expr';
import type { Issue } from './validate';

/**
 * Runs a (schema-valid) blueprint in a throwaway sandbox: renders every block on every
 * screen against the sample data and presses every action once. Returns runtime errors
 * with blueprint paths, so the AI can repair them like validation issues.
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
    if (!tpl) return;
    try {
      renderTemplate(tpl, sb.host(locals), locals);
    } catch (e) {
      add(path, `Runtime error: ${(e as Error).message}`);
    }
  };
  const tryExpr = (path: string, src: string | undefined, locals: Record<string, Value> = {}) => {
    if (!src) return;
    try {
      evaluate(src, sb.host(locals), locals);
    } catch (e) {
      add(path, `Runtime error: ${(e as Error).message}`);
    }
  };

  // Computed values, per record
  for (const [cName, c] of Object.entries(bp.collections)) {
    const raw = sb.getState().records[cName] ?? [];
    for (const r of raw) {
      const item: Record<string, Value> = { ...r };
      for (const [k, src] of Object.entries(c.computed ?? {})) {
        tryExpr(`collections.${cName}.computed.${k}`, src, { item });
      }
    }
  }

  const checkBlock = (b: Block, path: string) => {
    switch (b.type) {
      case 'hero':
        tryTpl(`${path}.eyebrow`, b.eyebrow);
        tryTpl(`${path}.title`, b.title);
        if (b.title && sb.text(b.title).trim() === '') add(`${path}.title`, 'Title renders as empty text; check the names it uses');
        tryTpl(`${path}.people.text`, b.people?.text);
        break;
      case 'section':
      case 'text':
        tryTpl(`${path}.text`, b.text);
        break;
      case 'list':
        tryTpl(`${path}.empty`, b.empty);
        {
          const rows = sb.rows(b.collection);
          if (rows.length && rows.every((item) => sb.text(b.item.title, { item }).trim() === '')) {
            add(`${path}.item.title`, 'Item title renders as empty text for every record; check the field names it uses');
          }
        }
        for (const item of sb.rows(b.collection)) {
          tryExpr(`${path}.where`, b.where, { item });
          tryExpr(`${path}.sortBy`, b.sortBy, { item });
          tryTpl(`${path}.item.title`, b.item.title, { item });
          tryTpl(`${path}.item.subtitle`, b.item.subtitle, { item });
          if (b.item.button) {
            tryTpl(`${path}.item.button.label`, b.item.button.label, { item });
            tryExpr(`${path}.item.button.visible`, b.item.button.visible, { item });
          }
        }
        break;
      case 'people':
        for (const p of bp.sample.people) tryTpl(`${path}.subtitle`, b.subtitle, { person: { id: p.id, name: p.name } });
        break;
      case 'addButton':
        break;
    }
  };
  bp.screens.forEach((s, si) => s.blocks.forEach((b, bi) => checkBlock(b, `screens.${si}.blocks.${bi}`)));

  // Press every action once, in a fresh sandbox each time.
  for (const [aName, action] of Object.entries(bp.actions)) {
    const run = createSandbox(bp, { now: () => fixed });
    const usedIn = findItemContext(bp, aName);
    const form: Record<string, string | number | boolean | null> = {};
    for (const [k, f] of Object.entries(action.form?.fields ?? {})) {
      form[k] = f.type === 'number' ? 3 : f.type === 'bool' ? true : f.type === 'date' ? fixed : f.type === 'member' ? bp.sample.me : f.type === 'choice' ? (f.options?.[0] ?? '') : 'Test';
    }
    const itemId = usedIn ? (run.getState().records[usedIn]?.[0]?.id ?? undefined) : undefined;
    const needsItem = action.steps.some((st) => 'update' in st || 'remove' in st);
    if (needsItem && !itemId) {
      add(`actions.${aName}`, usedIn ? `Action needs a record but "${usedIn}" has no sample records` : 'Action changes "item" but no list button uses it');
      continue;
    }
    const r = run.run(aName, { collection: usedIn ?? undefined, itemId, form: action.form ? form : undefined });
    if (!r.ok) add(`actions.${aName}`, `Runtime error: ${r.error}`);
  }

  return issues;
}

/** The collection whose list buttons call this action (for actions that change "item"). */
function findItemContext(bp: Blueprint, action: string): string | null {
  for (const s of bp.screens) {
    for (const b of s.blocks) {
      if (b.type === 'list' && b.item.button?.action === action) return b.collection;
    }
  }
  return null;
}
