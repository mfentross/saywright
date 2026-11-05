/**
 * The blueprint expression language.
 *
 * Deliberately small and NOT Turing-complete: no loops, no recursion, no assignment,
 * no user-defined functions, no access to host objects. Every evaluation runs on a
 * fixed step budget, so a blueprint can never burn CPU (e.g. crypto mining) or hang.
 */

export type Node =
  | { k: 'lit'; v: string | number | boolean | null }
  | { k: 'id'; name: string }
  | { k: 'get'; obj: Node; prop: string }
  | { k: 'un'; op: '!' | '-'; arg: Node }
  | { k: 'bin'; op: BinOp; l: Node; r: Node }
  | { k: 'cond'; test: Node; then: Node; else: Node }
  | { k: 'call'; fn: string; args: Node[] };

type BinOp = '+' | '-' | '*' | '/' | '%' | '<' | '<=' | '>' | '>=' | '==' | '!=' | '&&' | '||';

export const LIMITS = {
  maxExpressionLength: 600,
  maxDepth: 40,
  stepBudget: 5_000,
  maxStringLength: 2_000,
  maxListLength: 5_000,
} as const;

export class ExprError extends Error {
  constructor(
    message: string,
    readonly pos?: number,
  ) {
    super(message);
    this.name = 'ExprError';
  }
}

export class BudgetExceeded extends ExprError {
  constructor() {
    super('Expression ran out of its step budget');
    this.name = 'BudgetExceeded';
  }
}

// ---------------------------------------------------------------- tokenizer

type Tok =
  | { t: 'num'; v: number; p: number }
  | { t: 'str'; v: string; p: number }
  | { t: 'id'; v: string; p: number }
  | { t: 'op'; v: string; p: number }
  | { t: 'end'; p: number };

const OPS = ['<=', '>=', '==', '!=', '&&', '||', '+', '-', '*', '/', '%', '<', '>', '!', '?', ':', '(', ')', ',', '.'];

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i]!;
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9]/.test(c)) {
      const m = /^[0-9]+(\.[0-9]+)?/.exec(src.slice(i))!;
      out.push({ t: 'num', v: Number(m[0]), p: i });
      i += m[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      const m = /^[A-Za-z_][A-Za-z0-9_]*/.exec(src.slice(i))!;
      out.push({ t: 'id', v: m[0], p: i });
      i += m[0].length;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      let s = '';
      while (j < src.length && src[j] !== c) {
        if (src[j] === '\\' && j + 1 < src.length) {
          j++;
          s += src[j] === 'n' ? '\n' : src[j];
        } else s += src[j];
        j++;
      }
      if (j >= src.length) throw new ExprError('Unterminated string', i);
      out.push({ t: 'str', v: s, p: i });
      i = j + 1;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new ExprError(`Unexpected character "${c}"`, i);
    out.push({ t: 'op', v: op, p: i });
    i += op.length;
  }
  out.push({ t: 'end', p: src.length });
  return out;
}

// ---------------------------------------------------------------- parser

const PRECEDENCE: Record<string, number> = {
  '||': 1,
  '&&': 2,
  '==': 3,
  '!=': 3,
  '<': 4,
  '<=': 4,
  '>': 4,
  '>=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
};

const RESERVED = new Set(['true', 'false', 'null']);

export function parse(src: string): Node {
  if (src.length > LIMITS.maxExpressionLength) {
    throw new ExprError(`Expression is longer than ${LIMITS.maxExpressionLength} characters`);
  }
  const toks = tokenize(src);
  let i = 0;
  let depth = 0;
  const peek = () => toks[i]!;
  const next = () => toks[i++]!;
  const isOp = (v: string) => {
    const t = peek();
    return t.t === 'op' && t.v === v;
  };
  const expect = (v: string) => {
    if (!isOp(v)) throw new ExprError(`Expected "${v}"`, peek().p);
    i++;
  };
  const enter = () => {
    if (++depth > LIMITS.maxDepth) throw new ExprError('Expression is nested too deeply', peek().p);
  };

  function ternary(): Node {
    enter();
    const test = binary(0);
    let node = test;
    if (isOp('?')) {
      i++;
      const then = ternary();
      expect(':');
      node = { k: 'cond', test, then, else: ternary() };
    }
    depth--;
    return node;
  }

  function binary(minPrec: number): Node {
    let left = unary();
    for (;;) {
      const t = peek();
      if (t.t !== 'op') break;
      const prec = PRECEDENCE[t.v];
      if (prec === undefined || prec <= minPrec) break;
      i++;
      enter();
      const right = binary(prec);
      depth--;
      left = { k: 'bin', op: t.v as BinOp, l: left, r: right };
    }
    return left;
  }

  function unary(): Node {
    if (isOp('!') || isOp('-')) {
      const op = (next() as { v: string }).v as '!' | '-';
      enter();
      const arg = unary();
      depth--;
      return { k: 'un', op, arg };
    }
    return postfix();
  }

  function postfix(): Node {
    let node = primary();
    while (isOp('.')) {
      i++;
      const t = next();
      if (t.t !== 'id') throw new ExprError('Expected a property name after "."', t.p);
      node = { k: 'get', obj: node, prop: t.v };
    }
    return node;
  }

  function primary(): Node {
    const t = next();
    if (t.t === 'num' || t.t === 'str') return { k: 'lit', v: t.v };
    if (t.t === 'id') {
      if (t.v === 'true') return { k: 'lit', v: true };
      if (t.v === 'false') return { k: 'lit', v: false };
      if (t.v === 'null') return { k: 'lit', v: null };
      if (isOp('(')) {
        i++;
        const args: Node[] = [];
        if (!isOp(')')) {
          do {
            args.push(ternary());
          } while (isOp(',') && ++i);
        }
        expect(')');
        return { k: 'call', fn: t.v, args };
      }
      return { k: 'id', name: t.v };
    }
    if (t.t === 'op' && t.v === '(') {
      const inner = ternary();
      expect(')');
      return inner;
    }
    throw new ExprError(t.t === 'end' ? 'Unexpected end of expression' : 'Unexpected token', t.p);
  }

  const node = ternary();
  if (peek().t !== 'end') throw new ExprError('Unexpected text after expression', peek().p);
  return node;
}

// ---------------------------------------------------------------- evaluator

export type Value = string | number | boolean | null | Value[] | { [k: string]: Value };

export interface EvalHost {
  /** Resolve a top-level identifier (item, me, form, collection names…). */
  resolve(name: string): Value | undefined;
  /** Current time in ms, possibly simulated. */
  now(): number;
  /** Member helpers. */
  memberName(id: Value): string;
  meId(): string;
  nextMember(id: Value): string | null;
}

interface Ctx {
  host: EvalHost;
  steps: number;
  locals: Record<string, Value>;
}

const DAY = 86_400_000;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function tick(ctx: Ctx) {
  if (++ctx.steps > LIMITS.stepBudget) throw new BudgetExceeded();
}

function truthy(v: Value | undefined): boolean {
  if (Array.isArray(v)) return v.length > 0;
  return !!v;
}

function num(v: Value | undefined): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (typeof v === 'string' && v.trim() !== '' && !Number.isNaN(Number(v))) return Number(v);
  return 0;
}

function str(v: Value | undefined): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  return '';
}

function capStr(s: string): string {
  if (s.length > LIMITS.maxStringLength) throw new ExprError('Text result is too long');
  return s;
}

function list(v: Value | undefined): Value[] {
  return Array.isArray(v) ? v : [];
}

function date(v: Value | undefined): number | null {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return Number.isNaN(t) ? null : t;
  }
  return null;
}

function startOfDay(ms: number) {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Functions whose arguments are evaluated per list element, with `it` bound. */
const LAZY = new Set(['count', 'filter', 'find', 'map', 'any', 'all', 'sortBy']);

/** All function names a blueprint may use. Anything else is rejected at validation. */
export const FUNCTIONS = [
  ...LAZY,
  'now',
  'daysSince',
  'minutesSince',
  'addDays',
  'weekday',
  'isToday',
  'join',
  'length',
  'first',
  'plural',
  'memberName',
  'isMe',
  'nextMember',
  'lower',
  'upper',
  'contains',
  'min',
  'max',
  'round',
  'coalesce',
] as const;

const FUNCTION_SET = new Set<string>(FUNCTIONS);

function evalNode(n: Node, ctx: Ctx): Value {
  tick(ctx);
  switch (n.k) {
    case 'lit':
      return n.v;
    case 'id': {
      if (Object.prototype.hasOwnProperty.call(ctx.locals, n.name)) return ctx.locals[n.name]!;
      const v = ctx.host.resolve(n.name);
      if (v === undefined) throw new ExprError(`Unknown name "${n.name}"`);
      return v;
    }
    case 'get': {
      const o = evalNode(n.obj, ctx);
      if (o && typeof o === 'object' && !Array.isArray(o) && Object.prototype.hasOwnProperty.call(o, n.prop)) {
        return o[n.prop] ?? null;
      }
      if (Array.isArray(o) && n.prop === 'length') return o.length;
      return null;
    }
    case 'un': {
      const a = evalNode(n.arg, ctx);
      return n.op === '!' ? !truthy(a) : -num(a);
    }
    case 'bin': {
      if (n.op === '&&') return truthy(evalNode(n.l, ctx)) ? evalNode(n.r, ctx) : false;
      if (n.op === '||') {
        const l = evalNode(n.l, ctx);
        return truthy(l) ? l : evalNode(n.r, ctx);
      }
      const l = evalNode(n.l, ctx);
      const r = evalNode(n.r, ctx);
      switch (n.op) {
        case '+':
          if (typeof l === 'string' || typeof r === 'string') return capStr(str(l) + str(r));
          return num(l) + num(r);
        case '-':
          return num(l) - num(r);
        case '*':
          return num(l) * num(r);
        case '/':
          return num(r) === 0 ? 0 : num(l) / num(r);
        case '%':
          return num(r) === 0 ? 0 : num(l) % num(r);
        case '<':
          return num(l) < num(r);
        case '<=':
          return num(l) <= num(r);
        case '>':
          return num(l) > num(r);
        case '>=':
          return num(l) >= num(r);
        case '==':
          return l === r;
        case '!=':
          return l !== r;
      }
      return null;
    }
    case 'cond':
      return truthy(evalNode(n.test, ctx)) ? evalNode(n.then, ctx) : evalNode(n.else, ctx);
    case 'call':
      return call(n, ctx);
  }
}

function withIt(ctx: Ctx, it: Value, body: Node): Value {
  const saved = ctx.locals;
  ctx.locals = { ...saved, it };
  try {
    return evalNode(body, ctx);
  } finally {
    ctx.locals = saved;
  }
}

function call(n: Extract<Node, { k: 'call' }>, ctx: Ctx): Value {
  if (!FUNCTION_SET.has(n.fn)) throw new ExprError(`Unknown function "${n.fn}"`);
  const host = ctx.host;

  if (LAZY.has(n.fn)) {
    const [srcNode, body] = n.args;
    if (!srcNode) throw new ExprError(`${n.fn}() needs a list`);
    const src = list(evalNode(srcNode, ctx));
    if (src.length > LIMITS.maxListLength) throw new ExprError('List is too long');
    const each = (it: Value) => (body ? withIt(ctx, it, body) : it);
    switch (n.fn) {
      case 'count':
        return body ? src.filter((it) => truthy(each(it))).length : src.length;
      case 'filter':
        return src.filter((it) => truthy(each(it)));
      case 'find':
        return src.find((it) => truthy(each(it))) ?? null;
      case 'map':
        return src.map(each);
      case 'any':
        return src.some((it) => truthy(each(it)));
      case 'all':
        return src.every((it) => truthy(each(it)));
      case 'sortBy': {
        const keyed = src.map((it) => ({ it, key: each(it) }));
        keyed.sort((a, b) => {
          const x = a.key;
          const y = b.key;
          if (typeof x === 'string' && typeof y === 'string') return x.localeCompare(y);
          return num(x) - num(y);
        });
        return keyed.map((k) => k.it);
      }
    }
  }

  const a = n.args.map((x) => evalNode(x, ctx));
  switch (n.fn) {
    case 'now':
      return host.now();
    case 'daysSince': {
      const d = date(a[0]);
      if (d === null) return 9999;
      return Math.floor((startOfDay(host.now()) - startOfDay(d)) / DAY);
    }
    case 'minutesSince': {
      const d = date(a[0]);
      return d === null ? 999_999 : Math.floor((host.now() - d) / 60_000);
    }
    case 'addDays': {
      const d = date(a[0]);
      return d === null ? null : d + num(a[1]) * DAY;
    }
    case 'weekday': {
      const d = date(a[0] ?? host.now());
      return d === null ? '' : WEEKDAYS[new Date(d).getDay()]!;
    }
    case 'isToday': {
      const d = date(a[0]);
      return d !== null && startOfDay(d) === startOfDay(host.now());
    }
    case 'join':
      return capStr(list(a[0]).map(str).join(a[1] === undefined ? ', ' : str(a[1])));
    case 'length':
      return Array.isArray(a[0]) ? a[0].length : str(a[0]).length;
    case 'first':
      return list(a[0])[0] ?? null;
    case 'plural': {
      const count = num(a[0]);
      const word = str(a[1]);
      const many = a[2] === undefined ? `${word}s` : str(a[2]);
      return `${str(count)} ${count === 1 ? word : many}`;
    }
    case 'memberName':
      return host.memberName(a[0] ?? null);
    case 'isMe':
      return a[0] === host.meId();
    case 'nextMember':
      return host.nextMember(a[0] ?? null);
    case 'lower':
      return str(a[0]).toLowerCase();
    case 'upper':
      return str(a[0]).toUpperCase();
    case 'contains':
      return Array.isArray(a[0]) ? a[0].includes(a[1] ?? null) : str(a[0]).includes(str(a[1]));
    case 'min':
      return Math.min(...a.map(num));
    case 'max':
      return Math.max(...a.map(num));
    case 'round':
      return Math.round(num(a[0]));
    case 'coalesce':
      return a.find((v) => v !== null && v !== '') ?? null;
  }
  throw new ExprError(`Unknown function "${n.fn}"`);
}

const cache = new Map<string, Node>();

export function compile(src: string): Node {
  let node = cache.get(src);
  if (!node) {
    node = parse(src);
    if (cache.size > 2_000) cache.clear();
    cache.set(src, node);
  }
  return node;
}

export function evaluate(src: string, host: EvalHost, locals: Record<string, Value> = {}): Value {
  const ctx: Ctx = { host, steps: 0, locals };
  return evalNode(compile(src), ctx);
}

export function toText(v: Value): string {
  return str(v);
}

export function isTruthy(v: Value): boolean {
  return truthy(v);
}

// ---------------------------------------------------------------- templates

/** Splits "Hello {{name}}!" into literal text and expression parts. */
export function parseTemplate(tpl: string): Array<{ text: string } | { expr: string }> {
  const parts: Array<{ text: string } | { expr: string }> = [];
  let i = 0;
  while (i < tpl.length) {
    const open = tpl.indexOf('{{', i);
    if (open === -1) {
      parts.push({ text: tpl.slice(i) });
      break;
    }
    if (open > i) parts.push({ text: tpl.slice(i, open) });
    const close = tpl.indexOf('}}', open + 2);
    if (close === -1) throw new ExprError('Template is missing "}}"', open);
    parts.push({ expr: tpl.slice(open + 2, close).trim() });
    i = close + 2;
  }
  return parts;
}

export function renderTemplate(tpl: string, host: EvalHost, locals: Record<string, Value> = {}): string {
  return parseTemplate(tpl)
    .map((p) => ('text' in p ? p.text : str(evaluate(p.expr, host, locals))))
    .join('');
}

/** Collects every function and top-level identifier an expression uses (for validation). */
export function collectRefs(node: Node, out = { fns: new Set<string>(), ids: new Set<string>() }) {
  switch (node.k) {
    case 'id':
      if (!RESERVED.has(node.name)) out.ids.add(node.name);
      break;
    case 'get':
      collectRefs(node.obj, out);
      break;
    case 'un':
      collectRefs(node.arg, out);
      break;
    case 'bin':
      collectRefs(node.l, out);
      collectRefs(node.r, out);
      break;
    case 'cond':
      collectRefs(node.test, out);
      collectRefs(node.then, out);
      collectRefs(node.else, out);
      break;
    case 'call':
      out.fns.add(node.fn);
      node.args.forEach((a) => collectRefs(a, out));
      break;
  }
  return out;
}
