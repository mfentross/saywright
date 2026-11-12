import { describe, expect, it } from 'vitest';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { thirsty } from '@saywright/blueprint';
import { buildGenerationGraph, runGeneration, type ProgressEvent } from '../src';
import type { ModelFactory, Role } from '../src/models';

const ok = JSON.stringify({ allowed: true, category: 'ok', reason: '' });
const plan = (question: unknown = null) =>
  JSON.stringify({
    name: 'Thirsty',
    tagline: 'Plant care for a shared flat',
    peopleLabel: 'Flatmates',
    screens: ['Plants', 'Schedule', 'Flatmates'],
    remembers: 'Plants and turns',
    notifies: 'Whoever’s turn it is',
    question,
  });
const valid = JSON.stringify(thirsty);
const invalid = (() => {
  const bad = structuredClone(thirsty) as any;
  bad.collections.plants.fields.password = { type: 'text' };
  return JSON.stringify(bad);
})();

/** One scripted model per role; calls consume the role's replies in order. */
function scripted(replies: Partial<Record<Role, string[]>>) {
  const calls: Record<string, number> = {};
  const instances = new Map<Role, BaseChatModel>();
  const factory: ModelFactory = async (role) => {
    calls[role] = (calls[role] ?? 0) + 1;
    if (!instances.has(role)) instances.set(role, new FakeListChatModel({ responses: replies[role] ?? ['{}'] }) as unknown as BaseChatModel);
    return instances.get(role)!;
  };
  return { factory, calls };
}

async function collect(gen: AsyncGenerator<ProgressEvent>) {
  const out: ProgressEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

describe('generation graph', () => {
  it('declines a harmful idea at the screen and stops', async () => {
    const m = scripted({ screen: [JSON.stringify({ allowed: false, category: 'phishing', reason: 'Saywright can’t build login pages for banks.' })] });
    const g = buildGenerationGraph({ models: m.factory });
    const events = await collect(runGeneration(g, 't1', { idea: 'Copy my bank’s login page' }));
    const done = events.at(-1);
    expect(done?.type).toBe('done');
    if (done?.type !== 'done') return;
    expect(done.state.status).toBe('declined');
    expect(done.state.verdict?.category).toBe('phishing');
    expect(m.calls.plan).toBeUndefined();
  });

  it('fails closed when the safety screen reply is unreadable', async () => {
    const m = scripted({ screen: ['I think this is fine!'] });
    const g = buildGenerationGraph({ models: m.factory });
    const events = await collect(runGeneration(g, 't2', { idea: 'A shopping list' }));
    const done = events.at(-1);
    expect(done?.type === 'done' && done.state.status).toBe('declined');
  });

  it('asks the clarifying question, waits, and resumes with the answer', async () => {
    const m = scripted({
      screen: [ok, ok],
      plan: [plan({ text: 'How often should it remind?', options: ['Per plant', 'Daily', 'Every 2 days'] })],
      write: [valid],
    });
    const g = buildGenerationGraph({ models: m.factory });
    const first = await collect(runGeneration(g, 't3', { idea: 'Plant watering for my flat' }));
    expect(first.find((e) => e.type === 'question')).toEqual({
      type: 'question',
      text: 'How often should it remind?',
      options: ['Per plant', 'Daily', 'Every 2 days'],
    });
    expect(first.some((e) => e.type === 'done')).toBe(false);
    expect(m.calls.write).toBeUndefined();

    const second = await collect(runGeneration(g, 't3', { answer: 'Daily' }));
    const done = second.at(-1);
    expect(done?.type).toBe('done');
    if (done?.type !== 'done') return;
    expect(done.state.answer).toBe('Daily');
    expect(done.state.status).toBe('ready');
    expect(done.state.attempts).toBe(1);
    expect((done.state.blueprint as { name: string }).name).toBe('Thirsty');
  });

  it('repairs an invalid blueprint using the validator’s issues', async () => {
    const m = scripted({ screen: [ok, ok], plan: [plan()], write: [invalid, valid] });
    const g = buildGenerationGraph({ models: m.factory });
    const events = await collect(runGeneration(g, 't4', { idea: 'Plant watering for my flat' }));
    const done = events.at(-1);
    if (done?.type !== 'done') throw new Error('not done');
    expect(done.state.status).toBe('ready');
    expect(done.state.attempts).toBe(2);
    // The repair turn told the model exactly what was wrong.
    const repairTurn = done.state.messages.find((msg) => String(msg.content).includes('The blueprint has problems'));
    expect(String(repairTurn?.content)).toContain('collections.plants.fields.password');
  });

  it('gives up after the repair limit', async () => {
    const m = scripted({ screen: [ok], plan: [plan()], write: [invalid, invalid, invalid, invalid, invalid] });
    const g = buildGenerationGraph({ models: m.factory });
    const events = await collect(runGeneration(g, 't5', { idea: 'Plant watering for my flat' }));
    const done = events.at(-1);
    if (done?.type !== 'done') throw new Error('not done');
    expect(done.state.status).toBe('failed');
    expect(done.state.attempts).toBe(4);
  });

  it('declines when the final review rejects the generated app', async () => {
    const m = scripted({
      screen: [ok, JSON.stringify({ allowed: false, category: 'impersonation', reason: 'Looks like a bank.' })],
      plan: [plan()],
      write: [valid],
    });
    const g = buildGenerationGraph({ models: m.factory });
    const events = await collect(runGeneration(g, 't6', { idea: 'Plant watering for my flat' }));
    const done = events.at(-1);
    if (done?.type !== 'done') throw new Error('not done');
    expect(done.state.status).toBe('declined');
  });
});
