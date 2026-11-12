import { Annotation, END, MemorySaver, START, StateGraph, type BaseCheckpointSaver } from '@langchain/langgraph';
import { HumanMessage, SystemMessage, type AIMessage, type BaseMessage } from '@langchain/core/messages';
import { smokeTest, validateBlueprint, type Issue } from '@saywright/blueprint';
import { createModel, systemFor, type ModelFactory } from './models';
import { CHANGE_SYSTEM, changeRepairMessage, changeUserMessage, SCREEN_SYSTEM } from './prompts';
import { parseJsonObject, textOf } from './json';
import { applyPatch, isPatch, PatchError } from './patch';
import { blueprintText, MAX_REPAIRS, parseVerdict, refused, STEP_LABELS, usageOf, type Status, type UsageEntry, type Verdict } from './graph';

/**
 * Change-request pipeline:
 *
 *   request → screen ─(declined)→ end
 *               └→ edit (JSON Patch on the current blueprint) ⇄ check (validate + smoke test, ≤ MAX_REPAIRS)
 *                                                                  └→ review → end
 */

const ChangeState = Annotation.Root({
  request: Annotation<string>(),
  base: Annotation<unknown>(),
  blueprint: Annotation<unknown>({ reducer: (_, b) => b, default: () => null }),
  summary: Annotation<string>({ reducer: (_, b) => b, default: () => '' }),
  verdict: Annotation<Verdict | null>({ reducer: (_, b) => b, default: () => null }),
  messages: Annotation<BaseMessage[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  issues: Annotation<Issue[]>({ reducer: (_, b) => b, default: () => [] }),
  attempts: Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),
  status: Annotation<Status>({ reducer: (_, b) => b, default: () => 'running' as Status }),
  error: Annotation<string | null>({ reducer: (_, b) => b, default: () => null }),
  usage: Annotation<UsageEntry[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
});

export type ChangeState = typeof ChangeState.State;

export const CHANGE_STEP_LABELS: Record<string, string> = {
  screen: 'Checked your request',
  edit: 'Made the change',
  check: 'Checked the app',
  review: 'Final safety check',
  giveUp: STEP_LABELS.giveUp!,
};

export function buildChangeGraph(opts: { models?: ModelFactory; checkpointer?: BaseCheckpointSaver } = {}) {
  const models = opts.models ?? createModel;

  const screen = async (s: ChangeState) => {
    const m = await models('screen');
    const name = (s.base as { name?: string })?.name ?? 'the app';
    const msg = (await m.invoke([
      new SystemMessage(SCREEN_SYSTEM),
      new HumanMessage(`The person wants to change their existing app "${name}". Judge what the app would become.\n<idea>\n${s.request}\n</idea>`),
    ])) as AIMessage;
    const verdict = refused(msg) ?? parseVerdict(textOf(msg));
    return { verdict, status: verdict.allowed ? ('running' as Status) : ('declined' as Status), usage: [usageOf('screen', msg)] };
  };

  const edit = async (s: ChangeState) => {
    const m = await models('write');
    const turn =
      s.messages.length === 0
        ? [systemFor('write', CHANGE_SYSTEM), new HumanMessage(changeUserMessage({ blueprint: s.base, request: s.request }))]
        : [new HumanMessage(changeRepairMessage(s.issues))];
    const msg = (await m.invoke([...s.messages, ...turn])) as AIMessage;
    const r = refused(msg);
    if (r) return { verdict: r, status: 'declined' as Status, messages: [...turn, msg], usage: [usageOf('write', msg)] };
    const reply = parseJsonObject(textOf(msg)) as { summary?: unknown; patch?: unknown } | null;
    const base = { messages: [...turn, msg], attempts: s.attempts + 1, usage: [usageOf('write', msg)] };
    if (!reply || !isPatch(reply.patch)) {
      return { ...base, blueprint: null, issues: [{ path: '(reply)', message: 'Reply must be {"summary": string, "patch": [JSON Patch operations]}' }] };
    }
    try {
      return { ...base, blueprint: applyPatch(s.base, reply.patch), summary: String(reply.summary ?? '').slice(0, 120), issues: [] };
    } catch (e) {
      return { ...base, blueprint: null, issues: [{ path: '(patch)', message: e instanceof PatchError ? e.message : 'Patch could not be applied' }] };
    }
  };

  const check = async (s: ChangeState) => {
    if (s.blueprint === null) return {}; // issues were set by edit
    const r = validateBlueprint(s.blueprint);
    if (!r.ok) return { issues: r.issues };
    return { issues: smokeTest(r.blueprint) };
  };

  const review = async (s: ChangeState) => {
    const m = await models('screen');
    const msg = (await m.invoke([
      new SystemMessage(SCREEN_SYSTEM),
      new HumanMessage(`The following is the text content of an app after a change. Judge the app itself.\n<idea>\n${blueprintText(s.blueprint)}\n</idea>`),
    ])) as AIMessage;
    const verdict = refused(msg) ?? parseVerdict(textOf(msg));
    return { verdict, status: verdict.allowed ? ('ready' as Status) : ('declined' as Status), usage: [usageOf('review', msg)] };
  };

  return new StateGraph(ChangeState)
    .addNode('screen', screen)
    .addNode('edit', edit)
    .addNode('check', check)
    .addNode('review', review)
    .addNode('giveUp', (s: ChangeState) => ({ status: 'failed' as Status, error: `Change still invalid after ${s.attempts} attempts` }))
    .addEdge(START, 'screen')
    .addConditionalEdges('screen', (s) => (s.status === 'declined' ? END : 'edit'))
    .addConditionalEdges('edit', (s) => (s.status === 'declined' ? END : 'check'))
    .addConditionalEdges('check', (s) => (s.issues.length === 0 ? 'review' : s.attempts <= MAX_REPAIRS ? 'edit' : 'giveUp'))
    .addEdge('giveUp', END)
    .addEdge('review', END)
    .compile({ checkpointer: opts.checkpointer ?? new MemorySaver() });
}

export type ChangeGraph = ReturnType<typeof buildChangeGraph>;

export type ChangeEvent = { type: 'step'; node: string; label: string } | { type: 'done'; state: ChangeState };

export async function* runChange(graph: ChangeGraph, threadId: string, input: { base: unknown; request: string }): AsyncGenerator<ChangeEvent> {
  const config = { configurable: { thread_id: threadId }, streamMode: 'updates' as const, recursionLimit: 30 };
  for await (const chunk of await graph.stream({ base: input.base, request: input.request } as never, config)) {
    for (const node of Object.keys(chunk as Record<string, unknown>)) {
      yield { type: 'step', node, label: CHANGE_STEP_LABELS[node] ?? node };
    }
  }
  const snapshot = await graph.getState({ configurable: { thread_id: threadId } });
  yield { type: 'done', state: snapshot.values as ChangeState };
}
