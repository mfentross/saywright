/**
 * Minimal JSON Patch (RFC 6902 subset: add, replace, remove) for blueprint edits.
 * Works on a copy; never touches prototype keys.
 */
export interface PatchOp {
  op: 'add' | 'replace' | 'remove';
  path: string;
  value?: unknown;
}

const BLOCKED = new Set(['__proto__', 'prototype', 'constructor']);
export const MAX_PATCH_OPS = 60;

export class PatchError extends Error {}

function parsePath(path: string): string[] {
  if (path === '') return [];
  if (!path.startsWith('/')) throw new PatchError(`Path must start with "/": ${path}`);
  return path
    .slice(1)
    .split('/')
    .map((seg) => seg.replace(/~1/g, '/').replace(/~0/g, '~'))
    .map((seg) => {
      if (BLOCKED.has(seg)) throw new PatchError(`Path segment "${seg}" is not allowed`);
      return seg;
    });
}

export function isPatch(v: unknown): v is PatchOp[] {
  return (
    Array.isArray(v) &&
    v.every((o) => o && typeof o === 'object' && ['add', 'replace', 'remove'].includes((o as PatchOp).op) && typeof (o as PatchOp).path === 'string')
  );
}

export function applyPatch<T>(doc: T, ops: PatchOp[]): T {
  if (ops.length > MAX_PATCH_OPS) throw new PatchError(`At most ${MAX_PATCH_OPS} edits per change`);
  const root = structuredClone(doc) as unknown;
  let out = root;
  ops.forEach((op, i) => {
    const segs = parsePath(op.path);
    if (segs.length === 0) {
      if (op.op === 'remove') throw new PatchError(`Edit ${i}: cannot remove the whole blueprint`);
      out = structuredClone(op.value);
      return;
    }
    let parent: unknown = out;
    for (const seg of segs.slice(0, -1)) {
      if (Array.isArray(parent)) parent = parent[Number(seg)];
      else if (parent && typeof parent === 'object' && Object.prototype.hasOwnProperty.call(parent, seg)) parent = (parent as Record<string, unknown>)[seg];
      else throw new PatchError(`Edit ${i}: path ${op.path} does not exist`);
      if (parent === undefined) throw new PatchError(`Edit ${i}: path ${op.path} does not exist`);
    }
    const key = segs[segs.length - 1]!;
    if (Array.isArray(parent)) {
      const idx = key === '-' ? parent.length : Number(key);
      if (!Number.isInteger(idx) || idx < 0 || idx > parent.length) throw new PatchError(`Edit ${i}: bad array index in ${op.path}`);
      if (op.op === 'add') parent.splice(idx, 0, structuredClone(op.value));
      else if (idx >= parent.length) throw new PatchError(`Edit ${i}: ${op.path} does not exist`);
      else if (op.op === 'replace') parent[idx] = structuredClone(op.value);
      else parent.splice(idx, 1);
    } else if (parent && typeof parent === 'object') {
      const obj = parent as Record<string, unknown>;
      const exists = Object.prototype.hasOwnProperty.call(obj, key);
      if ((op.op === 'replace' || op.op === 'remove') && !exists) throw new PatchError(`Edit ${i}: ${op.path} does not exist`);
      if (op.op === 'remove') delete obj[key];
      else obj[key] = structuredClone(op.value);
    } else {
      throw new PatchError(`Edit ${i}: ${op.path} does not point into an object or list`);
    }
  });
  return out as T;
}
