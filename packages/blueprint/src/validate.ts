import { z } from 'zod';
import { Blueprint, type Block, type Step } from './schema';
import { collectRefs, ExprError, FUNCTIONS, parse, parseTemplate } from './expr';

export interface Issue {
  path: string;
  message: string;
}

export type ValidationResult =
  | { ok: true; blueprint: Blueprint; issues: [] }
  | { ok: false; issues: Issue[] };

/**
 * Field names that suggest collecting data Saywright apps must never collect
 * (credentials, payment cards, bank or identity documents). See docs/SECURITY.md §1.
 */
const FORBIDDEN_FIELD = [
  /pass(word|wd|code)?$/i,
  /^pin$/i,
  /secret/i,
  /token/i,
  /card(number|no)?$/i,
  /creditcard/i,
  /cvv|cvc/i,
  /iban|bic|swift/i,
  /routing|accountnumber/i,
  /ssn|socialsecurity|taxid/i,
  /passport|idcard|nationalid|driverslicen[cs]e/i,
];

const FUNCTION_SET = new Set<string>(FUNCTIONS);
const BUILTIN_IDS = new Set(['item', 'it', 'me', 'form', 'people', 'person', 'ui']);

export function validateBlueprint(input: unknown): ValidationResult {
  const parsed = Blueprint.safeParse(input);
  if (!parsed.success) {
    return { ok: false, issues: zodIssues(parsed.error) };
  }
  const bp = parsed.data;
  const issues: Issue[] = [];
  const add = (path: string, message: string) => issues.push({ path, message });

  const collections = new Set(Object.keys(bp.collections));
  const actions = new Set(Object.keys(bp.actions));
  const screens = new Set(bp.screens.map((s) => s.id));
  const people = new Set(bp.sample.people.map((p) => p.id));
  const knownIds = new Set([...BUILTIN_IDS, ...collections]);

  const checkExpr = (path: string, src: string) => {
    try {
      const refs = collectRefs(parse(src));
      for (const fn of refs.fns) if (!FUNCTION_SET.has(fn)) add(path, `Unknown function "${fn}"`);
      for (const name of refs.ids) if (!knownIds.has(name)) add(path, `Unknown name "${name}"`);
    } catch (e) {
      add(path, e instanceof ExprError ? e.message : 'Invalid expression');
    }
  };
  const checkTemplate = (path: string, tpl: string | undefined) => {
    if (tpl === undefined) return;
    try {
      for (const part of parseTemplate(tpl)) if ('expr' in part) checkExpr(path, part.expr);
    } catch (e) {
      add(path, e instanceof ExprError ? e.message : 'Invalid template');
    }
  };

  // Collections
  for (const [cName, c] of Object.entries(bp.collections)) {
    for (const [fName, f] of Object.entries(c.fields)) {
      const path = `collections.${cName}.fields.${fName}`;
      if (FORBIDDEN_FIELD.some((re) => re.test(fName)) || FORBIDDEN_FIELD.some((re) => re.test(f.label ?? ''))) {
        add(path, 'Saywright apps may not collect passwords, payment cards, bank or ID details');
      }
      if (f.type === 'choice' && !f.options?.length) add(path, 'A choice field needs options');
    }
    for (const [k, src] of Object.entries(c.computed ?? {})) {
      if (k in c.fields) add(`collections.${cName}.computed.${k}`, 'Computed value has the same name as a field');
      checkExpr(`collections.${cName}.computed.${k}`, src);
    }
  }

  // Screens
  if (screens.size !== bp.screens.length) add('screens', 'Screen ids must be unique');
  const screenById = new Map(bp.screens.map((sc) => [sc.id, sc]));
  if (!bp.screens.some((sc) => (sc.kind ?? 'tab') === 'tab')) add('screens', 'At least one screen must be a tab screen');
  if (bp.screens.filter((sc) => (sc.kind ?? 'tab') === 'tab').length > 5) add('screens', 'At most 5 tab screens');
  bp.screens.forEach((sc, si) => {
    const path = `screens.${si}`;
    const detail = sc.kind === 'detail';
    if (detail && (!sc.collection || !collections.has(sc.collection))) add(`${path}.collection`, 'A detail screen needs the collection of the record it shows');
    if (!detail && sc.collection) add(`${path}.collection`, 'Only detail screens have a collection');
    sc.blocks.forEach((b, bi) => checkBlock(b, `${path}.blocks.${bi}`, sc));
  });

  function checkState(path: string, sc: (typeof bp.screens)[number], name: string, types: string[]) {
    const st = sc.state?.[name];
    if (!st) add(path, `Declare "${name}" in this screen's state`);
    else if (!types.includes(st.type)) add(path, `State "${name}" must be of type ${types.join(' or ')}`);
  }

  function checkBlock(b: Block, path: string, sc: (typeof bp.screens)[number]) {
    const detail = sc.kind === 'detail';
    switch (b.type) {
      case 'hero':
        checkTemplate(`${path}.eyebrow`, b.eyebrow);
        checkTemplate(`${path}.title`, b.title);
        checkTemplate(`${path}.people.text`, b.people?.text);
        break;
      case 'section':
      case 'text':
        checkTemplate(`${path}.text`, b.text);
        break;
      case 'card':
        checkTemplate(`${path}.title`, b.title);
        checkTemplate(`${path}.text`, b.text);
        if (b.visible) checkExpr(`${path}.visible`, b.visible);
        break;
      case 'stats':
        b.items.forEach((it, i) => {
          checkTemplate(`${path}.items.${i}.label`, it.label);
          checkTemplate(`${path}.items.${i}.value`, it.value);
        });
        break;
      case 'progress':
        checkTemplate(`${path}.label`, b.label);
        checkExpr(`${path}.value`, b.value);
        checkTemplate(`${path}.caption`, b.caption);
        break;
      case 'chart':
        if (b.of !== 'people' && !collections.has(b.of)) add(`${path}.of`, `Unknown collection "${b.of}" (or use "people")`);
        if (b.where) checkExpr(`${path}.where`, b.where);
        if (b.sortBy) checkExpr(`${path}.sortBy`, b.sortBy);
        checkExpr(`${path}.label`, b.label);
        checkExpr(`${path}.value`, b.value);
        checkTemplate(`${path}.title`, b.title);
        break;
      case 'calendar':
        if (!collections.has(b.collection)) add(`${path}.collection`, `Unknown collection "${b.collection}"`);
        checkExpr(`${path}.date`, b.date);
        if (b.where) checkExpr(`${path}.where`, b.where);
        checkTemplate(`${path}.title`, b.title);
        break;
      case 'illustration':
        checkTemplate(`${path}.text`, b.text);
        break;
      case 'divider':
        break;
      case 'timer':
        checkTemplate(`${path}.label`, b.label);
        checkExpr(`${path}.seconds`, b.seconds);
        if (b.onDone && !actions.has(b.onDone)) add(`${path}.onDone`, `Unknown action "${b.onDone}"`);
        break;
      case 'list': {
        if (!collections.has(b.collection)) add(`${path}.collection`, `Unknown collection "${b.collection}"`);
        if (b.where) checkExpr(`${path}.where`, b.where);
        if (b.sortBy) checkExpr(`${path}.sortBy`, b.sortBy);
        checkTemplate(`${path}.empty`, b.empty);
        checkTemplate(`${path}.item.title`, b.item.title);
        checkTemplate(`${path}.item.subtitle`, b.item.subtitle);
        checkTemplate(`${path}.item.badge`, b.item.badge);
        if (b.item.check) {
          const f = bp.collections[b.collection]?.fields[b.item.check];
          if (!f || f.type !== 'bool') add(`${path}.item.check`, `"${b.item.check}" must be a bool field of "${b.collection}"`);
        }
        if (b.item.open) {
          const target = screenById.get(b.item.open);
          if (!target || target.kind !== 'detail') add(`${path}.item.open`, `"${b.item.open}" must be a detail screen`);
          else if (target.collection !== b.collection) add(`${path}.item.open`, `Detail screen "${b.item.open}" shows "${target.collection}", not "${b.collection}"`);
        }
        if (b.item.button) {
          checkTemplate(`${path}.item.button.label`, b.item.button.label);
          if (!actions.has(b.item.button.action)) add(`${path}.item.button.action`, `Unknown action "${b.item.button.action}"`);
          if (b.item.button.visible) checkExpr(`${path}.item.button.visible`, b.item.button.visible);
        }
        break;
      }
      case 'people':
        checkTemplate(`${path}.subtitle`, b.subtitle);
        checkTemplate(`${path}.badge`, b.badge);
        if (b.sortBy) checkExpr(`${path}.sortBy`, b.sortBy);
        break;
      case 'search':
        checkState(`${path}.state`, sc, b.state, ['text']);
        break;
      case 'segmented':
        checkState(`${path}.state`, sc, b.state, ['choice', 'text']);
        break;
      case 'toggle':
        checkState(`${path}.state`, sc, b.state, ['bool']);
        checkTemplate(`${path}.label`, b.label);
        break;
      case 'field':
        if (!detail) add(path, 'Field editors only work on detail screens');
        else if (!bp.collections[sc.collection ?? '']?.fields[b.field]) add(`${path}.field`, `"${b.field}" is not a field of "${sc.collection}"`);
        checkTemplate(`${path}.label`, b.label);
        break;
      case 'buttons':
        b.items.forEach((it, i) => {
          checkTemplate(`${path}.items.${i}.label`, it.label);
          if (!actions.has(it.action)) add(`${path}.items.${i}.action`, `Unknown action "${it.action}"`);
          if (it.visible) checkExpr(`${path}.items.${i}.visible`, it.visible);
        });
        break;
      case 'addButton':
        if (!actions.has(b.action)) add(`${path}.action`, `Unknown action "${b.action}"`);
        break;
    }
  }

  // Actions
  for (const [aName, a] of Object.entries(bp.actions)) {
    a.steps.forEach((s, i) => checkStep(s, `actions.${aName}.steps.${i}`));
    checkTemplate(`actions.${aName}.confirm`, a.confirm);
  }
  function checkStep(s: Step, path: string) {
    if ('update' in s || 'create' in s) {
      for (const [k, src] of Object.entries(s.set)) checkExpr(`${path}.set.${k}`, src);
    }
    if ('create' in s && !collections.has(s.create)) add(`${path}.create`, `Unknown collection "${s.create}"`);
    if ('navigate' in s) {
      const target = screenById.get(s.navigate);
      if (!target) add(`${path}.navigate`, `Unknown screen "${s.navigate}"`);
      else if (target.kind === 'detail') add(`${path}.navigate`, 'Open detail screens from a list (item.open), not with navigate');
    }
    if ('toast' in s) checkTemplate(`${path}.toast`, s.toast);
    if ('notify' in s) {
      checkExpr(`${path}.notify.to`, s.notify.to);
      checkTemplate(`${path}.notify.text`, s.notify.text);
    }
  }

  // Notifications
  bp.notifications.forEach((n, i) => {
    const path = `notifications.${i}`;
    if (!collections.has(n.collection)) add(`${path}.collection`, `Unknown collection "${n.collection}"`);
    checkExpr(`${path}.when`, n.when);
    checkExpr(`${path}.to`, n.to);
    checkTemplate(`${path}.text`, n.text);
  });

  // Sample data
  if (!people.has(bp.sample.me)) add('sample.me', 'sample.me must be one of sample.people');
  for (const [cName, rows] of Object.entries(bp.sample.records)) {
    const c = bp.collections[cName];
    if (!c) {
      add(`sample.records.${cName}`, `Unknown collection "${cName}"`);
      continue;
    }
    rows.forEach((row, i) => {
      for (const [k, v] of Object.entries(row)) {
        const f = c.fields[k];
        if (k === 'id') continue;
        if (!f) add(`sample.records.${cName}.${i}.${k}`, `Unknown field "${k}"`);
        else if (f.type === 'member' && v !== null && !people.has(String(v))) {
          add(`sample.records.${cName}.${i}.${k}`, `Unknown person "${String(v)}"`);
        }
      }
    });
  }

  return issues.length ? { ok: false, issues } : { ok: true, blueprint: bp, issues: [] };
}

function zodIssues(err: z.ZodError): Issue[] {
  return err.issues.map((i) => ({ path: i.path.join('.') || '(root)', message: i.message }));
}
