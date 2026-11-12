import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createClient } from '@libsql/client';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { thirsty } from '@saywright/blueprint';
import { buildGenerationGraph, LibsqlSaver, runGeneration, type ProgressEvent } from '../src';
import type { ModelFactory } from '../src/models';

const ok = JSON.stringify({ allowed: true, category: 'ok', reason: '' });
const plan = JSON.stringify({
  name: 'Thirsty', tagline: 't', peopleLabel: 'Flatmates', screens: ['Plants'], remembers: 'x', notifies: 'y',
  question: { text: 'How often should it remind?', options: ['Daily', 'Weekly'] },
});
const factory = (): ModelFactory => {
  const byRole = { screen: [ok, ok], plan: [plan], write: [JSON.stringify(thirsty)] };
  const models = new Map<string, BaseChatModel>();
  return async (role) => {
    if (!models.has(role)) models.set(role, new FakeListChatModel({ responses: byRole[role] }) as unknown as BaseChatModel);
    return models.get(role)!;
  };
};
async function collect(gen: AsyncGenerator<ProgressEvent>) {
  const out: ProgressEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

describe('LibsqlSaver', () => {
  it('keeps a paused generation across a restart and resumes it', async () => {
    const url = `file:${join(mkdtempSync(join(tmpdir(), 'sw-')), 'test.db')}`;

    // Process 1: start, pause on the question.
    const g1 = buildGenerationGraph({ models: factory(), checkpointer: new LibsqlSaver(createClient({ url })) });
    const first = await collect(runGeneration(g1, 'thread-1', { idea: 'Plant watering' }));
    expect(first.some((e) => e.type === 'question')).toBe(true);

    // Process 2: a fresh client + graph on the same database picks up where it stopped.
    const g2 = buildGenerationGraph({ models: factory(), checkpointer: new LibsqlSaver(createClient({ url })) });
    const state = await g2.getState({ configurable: { thread_id: 'thread-1' } });
    expect(state.next).toEqual(['ask']);
    const second = await collect(runGeneration(g2, 'thread-1', { answer: 'Daily' }));
    const done = second.at(-1);
    expect(done?.type).toBe('done');
    if (done?.type !== 'done') return;
    expect(done.state.status).toBe('ready');
    expect(done.state.answer).toBe('Daily');
  });

  it('lists history and deletes a thread', async () => {
    const saver = new LibsqlSaver(createClient({ url: ':memory:' }));
    const g = buildGenerationGraph({ models: factory(), checkpointer: saver });
    await collect(runGeneration(g, 't', { idea: 'Plant watering' }));
    const history = [];
    for await (const c of saver.list({ configurable: { thread_id: 't' } })) history.push(c);
    expect(history.length).toBeGreaterThan(2);
    await saver.deleteThread('t');
    expect(await saver.getTuple({ configurable: { thread_id: 't' } })).toBeUndefined();
  });
});
