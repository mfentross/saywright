import type { Blueprint } from './schema';
import { evaluate, isTruthy, LIMITS, renderTemplate, type Budget, type EvalHost, type Value } from './expr';

/**
 * The sandbox: an in-memory, sample-data-only runtime for a blueprint.
 * Nothing is saved or sent anywhere. Time can be fast-forwarded and you can
 * look at the app as any of the sample people.
 */

export type RecordValue = string | number | boolean | null;
export type Row = { id: string } & Record<string, RecordValue>;

export interface SandboxNotice {
  id: number;
  to: string;
  text: string;
  at: number;
}

export interface SandboxState {
  records: Record<string, Row[]>;
  /** Simulated clock offset in ms. */
  clockOffset: number;
  viewAs: string;
  notices: SandboxNotice[];
  version: number;
}

const own = (o: object, k: string) => Object.prototype.hasOwnProperty.call(o, k);

const UNIT: Record<string, number> = { m: 60_000, h: 3_600_000, d: 86_400_000 };

export function resolveRelative(v: RecordValue, now: number): RecordValue {
  if (typeof v !== 'string' || !v.startsWith('@now')) return v;
  const m = /^@now(?:([+-])(\d+)([mhd]))?$/.exec(v);
  if (!m) return v;
  if (!m[1]) return now;
  const delta = Number(m[2]) * UNIT[m[3]!]!;
  return m[1] === '+' ? now + delta : now - delta;
}

export interface Sandbox {
  readonly blueprint: Blueprint;
  getState(): SandboxState;
  subscribe(fn: () => void): () => void;
  now(): number;
  host(locals?: Record<string, Value>): EvalHost;
  /** Records of a collection with computed values attached. */
  rows(collection: string): Array<Record<string, Value>>;
  text(tpl: string, locals?: Record<string, Value>): string;
  value(expr: string, locals?: Record<string, Value>): Value;
  run(action: string, opts?: { itemId?: string; collection?: string; form?: Record<string, RecordValue> }): RunResult;
  reset(): void;
  advance(ms: number): void;
  setViewAs(personId: string): void;
  dismissNotice(id: number): void;
}

export type RunResult = { ok: true; navigate?: string } | { ok: false; error: string };

export function createSandbox(bp: Blueprint, opts: { now?: () => number } = {}): Sandbox {
  const realNow = opts.now ?? (() => Date.now());
  let state: SandboxState;
  let noticeSeq = 1;
  const listeners = new Set<() => void>();

  function seed(): SandboxState {
    const t = realNow();
    const records: Record<string, Row[]> = {};
    for (const name of Object.keys(bp.collections)) {
      records[name] = (bp.sample.records[name] ?? []).map((r, i) => {
        const row: Row = { id: String(r.id ?? `${name}-${i + 1}`) };
        for (const [k, v] of Object.entries(r)) if (k !== 'id') row[k] = resolveRelative(v, t);
        return row;
      });
    }
    return { records, clockOffset: 0, viewAs: bp.sample.me, notices: [], version: 0 };
  }
  state = seed();

  const now = () => realNow() + state.clockOffset;
  const person = (pid: Value) => bp.sample.people.find((p) => p.id === pid);
  const order = bp.sample.people.map((p) => p.id);

  function commit(next: Partial<SandboxState>) {
    state = { ...state, ...next, version: state.version + 1 };
    listeners.forEach((l) => l());
  }

  function makeHost(locals: Record<string, Value> = {}): EvalHost {
    return {
      now,
      meId: () => state.viewAs,
      memberName: (pid) => {
        if (pid === state.viewAs) return 'You';
        return person(pid)?.name ?? '';
      },
      nextMember: (pid) => {
        const i = order.indexOf(String(pid));
        if (i === -1) return order[0] ?? null;
        return order[(i + 1) % order.length] ?? null;
      },
      resolve: (name) => {
        if (own(locals, name)) return locals[name];
        if (name === 'me') {
          const p = person(state.viewAs);
          return { id: state.viewAs, name: 'You', realName: p?.name ?? '' };
        }
        if (name === 'people') return bp.sample.people.map((p) => ({ id: p.id, name: p.name }));
        if (own(bp.collections, name)) return rows(name);
        return undefined;
      },
    };
  }

  // Computed values may refer to other collections; guard against cycles.
  const computing = new Set<string>();
  // Computed rows are cached per data state and clock second, so references to a list
  // inside expressions don't recompute it (which would multiply the work).
  let cacheState: SandboxState | null = null;
  let cacheSecond = -1;
  const cache = new Map<string, Array<Record<string, Value>>>();
  function rows(collection: string): Array<Record<string, Value>> {
    const second = Math.floor(now() / 1000);
    if (cacheState !== state || cacheSecond !== second) {
      cache.clear();
      cacheState = state;
      cacheSecond = second;
    }
    const hit = cache.get(collection);
    if (hit) return hit;
    const c = bp.collections[collection];
    const list = state.records[collection] ?? [];
    if (!c?.computed || computing.has(collection)) return list.map((r) => ({ ...r }));
    computing.add(collection);
    // One budget for all computed values of this list.
    const budget: Budget = { steps: 0, limit: LIMITS.collectionBudget };
    try {
      const out = list.map((r) => {
        const item: Record<string, Value> = { ...r };
        for (const [k, src] of Object.entries(c.computed!)) {
          item[k] = budget.steps >= budget.limit ? null : safeEval(src, { item }, budget);
        }
        return item;
      });
      cache.set(collection, out);
      return out;
    } finally {
      computing.delete(collection);
    }
  }

  function safeEval(src: string, locals: Record<string, Value>, budget?: Budget): Value {
    try {
      return evaluate(src, makeHost(locals), locals, budget);
    } catch {
      return null;
    }
  }

  function toRecordValue(v: Value): RecordValue {
    if (v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return v;
    return null;
  }

  function run(
    actionName: string,
    o: { itemId?: string; collection?: string; form?: Record<string, RecordValue> } = {},
  ): RunResult {
    const action = bp.actions[actionName];
    if (!action) return { ok: false, error: `Unknown action "${actionName}"` };
    let records = { ...state.records };
    const notices = [...state.notices];
    let navigate: string | undefined;
    const itemRow = o.collection && o.itemId ? rows(o.collection).find((r) => r.id === o.itemId) : undefined;
    const locals: Record<string, Value> = { form: (o.form ?? {}) as Value };
    if (itemRow) locals.item = itemRow;

    try {
      for (const step of action.steps) {
        if ('update' in step) {
          if (!o.collection || !o.itemId) throw new Error('This action needs an item');
          const col = o.collection;
          const values: Record<string, RecordValue> = {};
          for (const [k, src] of Object.entries(step.set)) values[k] = toRecordValue(evaluate(src, makeHost(locals), locals));
          records = {
            ...records,
            [col]: (records[col] ?? []).map((r) => (r.id === o.itemId ? { ...r, ...values } : r)),
          };
        } else if ('create' in step) {
          const values: Record<string, RecordValue> = {};
          for (const [k, src] of Object.entries(step.set)) values[k] = toRecordValue(evaluate(src, makeHost(locals), locals));
          const list = records[step.create] ?? [];
          if (list.length >= 200) throw new Error('The sandbox holds at most 200 records per list');
          const row: Row = { ...values, id: `${step.create}-${Date.now().toString(36)}-${list.length}` };
          records = { ...records, [step.create]: [...list, row] };
        } else if ('remove' in step) {
          if (!o.collection || !o.itemId) throw new Error('This action needs an item');
          records = { ...records, [o.collection]: (records[o.collection] ?? []).filter((r) => r.id !== o.itemId) };
        } else if ('navigate' in step) {
          navigate = step.navigate;
        } else if ('notify' in step) {
          const to = String(evaluate(step.notify.to, makeHost(locals), locals) ?? '');
          notices.push({ id: noticeSeq++, to, text: renderTemplate(step.notify.text, makeHost(locals), locals), at: now() });
        }
      }
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Action failed' };
    }
    commit({ records, notices: notices.slice(-5) });
    return { ok: true, navigate };
  }

  /** Fires scheduled notifications that fall between `from` and `to` (simulated time). */
  function fireSchedules(from: number, to: number) {
    const notices = [...state.notices];
    for (const n of bp.notifications) {
      const [hh, mm] = n.at.split(':').map(Number);
      const day = new Date(from);
      day.setHours(hh!, mm!, 0, 0);
      for (let t = day.getTime(); t <= to; t += 86_400_000) {
        if (t <= from) continue;
        const saved = state.clockOffset;
        state = { ...state, clockOffset: t - realNow() };
        for (const item of rows(n.collection)) {
          const locals = { item };
          if (isTruthy(safeEval(n.when, locals))) {
            const who = String(safeEval(n.to, locals) ?? '');
            let text = '';
            try {
              text = renderTemplate(n.text, makeHost(locals), locals);
            } catch {
              continue;
            }
            notices.push({ id: noticeSeq++, to: who, text, at: t });
          }
        }
        state = { ...state, clockOffset: saved };
      }
    }
    return notices.slice(-5);
  }

  return {
    blueprint: bp,
    getState: () => state,
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    now,
    host: makeHost,
    rows,
    text(tpl, locals = {}) {
      try {
        return renderTemplate(tpl, makeHost(locals), locals);
      } catch {
        return '';
      }
    },
    value: (src, locals = {}) => safeEval(src, locals),
    run,
    reset() {
      state = { ...seed(), viewAs: state.viewAs, version: state.version + 1 };
      listeners.forEach((l) => l());
    },
    advance(ms) {
      const from = now();
      const notices = fireSchedules(from, from + ms);
      commit({ clockOffset: state.clockOffset + ms, notices });
    },
    setViewAs(personId) {
      if (bp.sample.people.some((p) => p.id === personId)) commit({ viewAs: personId });
    },
    dismissNotice(nid) {
      commit({ notices: state.notices.filter((n) => n.id !== nid) });
    },
  };
}
