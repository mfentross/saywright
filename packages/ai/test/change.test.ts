import { describe, expect, it } from 'vitest';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { thirsty } from '@saywright/blueprint';
import { applyPatch, buildChangeGraph, PatchError, runChange, type ChangeEvent } from '../src';
import type { ModelFactory, Role } from '../src/models';

const ok = JSON.stringify({ allowed: true, category: 'ok', reason: '' });
function scripted(replies: Partial<Record<Role, string[]>>): ModelFactory {
  const m = new Map<Role, BaseChatModel>();
  return async (role) => {
    if (!m.has(role)) m.set(role, new FakeListChatModel({ responses: replies[role] ?? ['{}'] }) as unknown as BaseChatModel);
    return m.get(role)!;
  };
}
async function done(gen: AsyncGenerator<ChangeEvent>) {
  let last: ChangeEvent | undefined;
  for await (const e of gen) last = e;
  if (last?.type !== 'done') throw new Error('no result');
  return last.state;
}
const darker = JSON.stringify({ summary: 'Darker look', patch: [{ op: 'replace', path: '/theme/background', value: '#1B2A21' }] });

describe('applyPatch', () => {
  it('adds, replaces and removes without touching the original', () => {
    const doc = { a: { b: 1 }, list: [1, 2] };
    const out = applyPatch(doc, [
      { op: 'replace', path: '/a/b', value: 2 },
      { op: 'add', path: '/list/-', value: 3 },
      { op: 'remove', path: '/list/0' },
      { op: 'add', path: '/a/c', value: 'x' },
    ]);
    expect(out).toEqual({ a: { b: 2, c: 'x' }, list: [2, 3] });
    expect(doc).toEqual({ a: { b: 1 }, list: [1, 2] });
  });

  it('refuses prototype keys and missing paths', () => {
    expect(() => applyPatch({}, [{ op: 'add', path: '/__proto__/polluted', value: true }])).toThrow(PatchError);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(() => applyPatch({ a: 1 }, [{ op: 'replace', path: '/missing', value: 1 }])).toThrow(PatchError);
    expect(() => applyPatch({ a: [] }, [{ op: 'remove', path: '/a/3' }])).toThrow(PatchError);
  });
});

describe('change graph', () => {
  it('applies a requested change and keeps the rest', async () => {
    const g = buildChangeGraph({ models: scripted({ screen: [ok, ok], write: [darker] }) });
    const s = await done(runChange(g, 'c1', { base: thirsty, request: 'Darker look' }));
    expect(s.status).toBe('ready');
    expect(s.summary).toBe('Darker look');
    expect((s.blueprint as typeof thirsty).theme.background).toBe('#1B2A21');
    expect((s.blueprint as typeof thirsty).screens).toEqual(thirsty.screens);
  });

  it('repairs a patch that breaks the blueprint', async () => {
    const broken = JSON.stringify({ summary: 'x', patch: [{ op: 'add', path: '/collections/plants/fields/password', value: { type: 'text' } }] });
    const badPath = JSON.stringify({ summary: 'x', patch: [{ op: 'replace', path: '/nope/deep', value: 1 }] });
    const g = buildChangeGraph({ models: scripted({ screen: [ok, ok], write: [broken, badPath, darker] }) });
    const s = await done(runChange(g, 'c2', { base: thirsty, request: 'Darker look' }));
    expect(s.status).toBe('ready');
    expect(s.attempts).toBe(3);
  });

  it('declines a harmful change', async () => {
    const no = JSON.stringify({ allowed: false, category: 'phishing', reason: 'No login copies.' });
    const g = buildChangeGraph({ models: scripted({ screen: [no] }) });
    const s = await done(runChange(g, 'c3', { base: thirsty, request: 'Make it look like the PayPal login' }));
    expect(s.status).toBe('declined');
    expect(s.blueprint).toBeNull();
  });
});
