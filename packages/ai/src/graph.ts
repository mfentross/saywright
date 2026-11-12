import { Annotation, Command, END, interrupt, MemorySaver, START, StateGraph, type BaseCheckpointSaver } from '@langchain/langgraph';
import { AIMessage, HumanMessage, SystemMessage, type BaseMessage } from '@langchain/core/messages';
import { smokeTest, validateBlueprint, type Issue } from '@saywright/blueprint';
import { createModel, modelSpec, type ModelFactory, type Role } from './models';
import { PLAN_SYSTEM, repairUserMessage, SCREEN_SYSTEM, WRITE_SYSTEM, writeUserMessage } from './prompts';
import { parseJsonObject, textOf } from './json';

/**
 * Generation pipeline:
 *
 *   idea → screen ─(declined)→ end
 *            └→ planner → ask? ─(interrupt: wait for the person's answer)→ write ⇄ check (repair ≤ MAX_REPAIRS)
 *                                                                           └→ review (safety screen on the result) → end
 *
 * The model never gets tools; it can only return text, which is parsed and validated.
 */

export const MAX_REPAIRS = 3;

export interface Verdict {
  allowed: boolean;
  category: string;
  reason: string;
}

export interface Plan {
  name: string;
  tagline: string;
  peopleLabel: string;
  screens: string[];
  remembers: string;
  notifies: string;
  question: null | { text: string; options: string[] };
}

export interface UsageEntry {
  role: Role | 'review';
  model: string;
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export type Status = 'running' | 'declined' | 'ready' | 'failed';

const State = Annotation.Root({
  idea: Annotation<string>(),
  answer: Annotation<string | null>({ reducer: (_, b) => b, default: () => null }),
  verdict: Annotation<Verdict | null>({ reducer: (_, b) => b, default: () => null }),
  plan: Annotation<Plan | null>({ reducer: (_, b) => b, default: () => null }),
  messages: Annotation<BaseMessage[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
  blueprint: Annotation<unknown>({ reducer: (_, b) => b, default: () => null }),
  issues: Annotation<Issue[]>({ reducer: (_, b) => b, default: () => [] }),
  attempts: Annotation<number>({ reducer: (_, b) => b, default: () => 0 }),
  status: Annotation<Status>({ reducer: (_, b) => b, default: () => 'running' as Status }),
  error: Annotation<string | null>({ reducer: (_, b) => b, default: () => null }),
  usage: Annotation<UsageEntry[]>({ reducer: (a, b) => a.concat(b), default: () => [] }),
});

export type GenerationState = typeof State.State;

function usageOf(role: UsageEntry['role'], msg: AIMessage): UsageEntry {
  const u = msg.usage_metadata;
  const details = (u?.input_token_details ?? {}) as { cache_read?: number; cache_creation?: number };
  const meta = (msg.response_metadata ?? {}) as { model?: string; model_name?: string };
  return {
    role,
    model: meta.model ?? meta.model_name ?? modelSpec(role === 'review' ? 'screen' : role).id.split(':').pop()!,
    input: u?.input_tokens ?? 0,
    output: u?.output_tokens ?? 0,
    cacheRead: details.cache_read ?? 0,
    cacheWrite: details.cache_creation ?? 0,
  };
}

function refused(msg: AIMessage): Verdict | null {
  const meta = (msg.response_metadata ?? {}) as { stop_reason?: string; stop_details?: { category?: string | null } };
  if (meta.stop_reason !== 'refusal') return null;
  return {
    allowed: false,
    category: meta.stop_details?.category ?? 'refusal',
    reason: 'Saywright can’t build this app.',
  };
}

function parseVerdict(text: string): Verdict {
  const v = parseJsonObject(text) as Partial<Verdict> | null;
  // Fail closed: anything unparseable counts as declined.
  if (!v || typeof v.allowed !== 'boolean') {
    return { allowed: false, category: 'unclear', reason: 'Saywright couldn’t check this idea. Please rephrase it.' };
  }
  return {
    allowed: v.allowed,
    category: String(v.category ?? (v.allowed ? 'ok' : 'declined')),
    reason: String(v.reason ?? ''),
  };
}

/** Text of a blueprint the safety review looks at: every name, label, template and sample value. */
export function blueprintText(bp: unknown): string {
  const out: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === 'string') out.push(v);
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(bp);
  return out.join('\n').slice(0, 20_000);
}

export function buildGenerationGraph(opts: { models?: ModelFactory; checkpointer?: BaseCheckpointSaver } = {}) {
  const models = opts.models ?? createModel;

  const screen = async (s: GenerationState) => {
    const m = await models('screen');
    const msg = (await m.invoke([new SystemMessage(SCREEN_SYSTEM), new HumanMessage(`<idea>\n${s.idea}\n</idea>`)])) as AIMessage;
    const verdict = refused(msg) ?? parseVerdict(textOf(msg));
    return { verdict, status: verdict.allowed ? ('running' as Status) : ('declined' as Status), usage: [usageOf('screen', msg)] };
  };

  const plan = async (s: GenerationState) => {
    const m = await models('plan');
    const msg = (await m.invoke([new SystemMessage(PLAN_SYSTEM), new HumanMessage(`<idea>\n${s.idea}\n</idea>`)])) as AIMessage;
    const r = refused(msg);
    if (r) return { verdict: r, status: 'declined' as Status, usage: [usageOf('plan', msg)] };
    const p = parseJsonObject(textOf(msg)) as Plan | null;
    if (!p || typeof p.name !== 'string') {
      return { status: 'failed' as Status, error: 'Could not plan this app', usage: [usageOf('plan', msg)] };
    }
    const question =
      p.question && typeof p.question.text === 'string' && Array.isArray(p.question.options) && p.question.options.length >= 2
        ? { text: p.question.text, options: p.question.options.slice(0, 3).map(String) }
        : null;
    return { plan: { ...p, question }, usage: [usageOf('plan', msg)] };
  };

  /** Pauses the graph until the person answers the plan's question (LangGraph interrupt). */
  const ask = async (s: GenerationState) => {
    if (!s.plan?.question || s.answer) return {};
    const answer = interrupt({ question: s.plan.question }) as string;
    return { answer: String(answer).slice(0, 200) };
  };

  const write = async (s: GenerationState) => {
    const m = await models('write');
    const first = s.messages.length === 0;
    const turn = first
      ? [new SystemMessage(WRITE_SYSTEM), new HumanMessage(writeUserMessage({ idea: s.idea, plan: s.plan, answer: s.answer }))]
      : [new HumanMessage(repairUserMessage(s.issues))];
    // The whole conversation (including the model's own earlier replies, unchanged) is replayed.
    const msg = (await m.invoke([...s.messages, ...turn])) as AIMessage;
    const r = refused(msg);
    if (r) return { verdict: r, status: 'declined' as Status, messages: [...turn, msg], usage: [usageOf('write', msg)] };
    const blueprint = parseJsonObject(textOf(msg));
    return { blueprint, messages: [...turn, msg], attempts: s.attempts + 1, usage: [usageOf('write', msg)] };
  };

  const check = async (s: GenerationState) => {
    if (s.blueprint === null) {
      return { issues: [{ path: '(root)', message: 'The reply was not a single valid JSON object' }] };
    }
    const r = validateBlueprint(s.blueprint);
    if (!r.ok) return { issues: r.issues };
    // Valid on paper: now run it in a throwaway sandbox and press every button.
    return { issues: smokeTest(r.blueprint) };
  };

  const review = async (s: GenerationState) => {
    const m = await models('screen');
    const msg = (await m.invoke([
      new SystemMessage(SCREEN_SYSTEM),
      new HumanMessage(`The following is the text content of an app that was generated from a description. Judge the app itself.\n<idea>\n${blueprintText(s.blueprint)}\n</idea>`),
    ])) as AIMessage;
    const verdict = refused(msg) ?? parseVerdict(textOf(msg));
    return { verdict, status: verdict.allowed ? ('ready' as Status) : ('declined' as Status), usage: [usageOf('review', msg)] };
  };

  const graph = new StateGraph(State)
    .addNode('screen', screen)
    .addNode('planner', plan)
    .addNode('ask', ask)
    .addNode('write', write)
    .addNode('check', check)
    .addNode('review', review)
    .addEdge(START, 'screen')
    .addConditionalEdges('screen', (s) => (s.status === 'declined' ? END : 'planner'))
    .addConditionalEdges('planner', (s) => (s.status === 'running' ? 'ask' : END))
    .addEdge('ask', 'write')
    .addConditionalEdges('write', (s) => (s.status === 'declined' ? END : 'check'))
    .addConditionalEdges('check', (s) => {
      if (s.issues.length === 0) return 'review';
      return s.attempts <= MAX_REPAIRS ? 'write' : 'giveUp';
    })
    .addNode('giveUp', (s: GenerationState) => ({ status: 'failed' as Status, error: `Blueprint still invalid after ${s.attempts} attempts` }))
    .addEdge('giveUp', END)
    .addEdge('review', END);

  return graph.compile({ checkpointer: opts.checkpointer ?? new MemorySaver() });
}

export type GenerationGraph = ReturnType<typeof buildGenerationGraph>;

/** Friendly progress labels for the Building screen. */
export const STEP_LABELS: Record<string, string> = {
  screen: 'Checked the idea',
  planner: 'Planned the screens',
  ask: 'Got your answer',
  write: 'Wrote the app',
  check: 'Checked the app',
  review: 'Final safety check',
  giveUp: 'Couldn’t finish the app',
};

export type ProgressEvent =
  | { type: 'step'; node: string; label: string }
  | { type: 'question'; text: string; options: string[] }
  | { type: 'done'; state: GenerationState };

/**
 * Runs (or resumes) a generation for one thread. Yields progress, a question when the
 * graph pauses for the person's answer, and the final state.
 */
export async function* runGeneration(
  graph: GenerationGraph,
  threadId: string,
  input: { idea: string } | { answer: string },
): AsyncGenerator<ProgressEvent> {
  const config = { configurable: { thread_id: threadId }, streamMode: 'updates' as const, recursionLimit: 40 };
  const payload = 'idea' in input ? { idea: input.idea } : new Command({ resume: input.answer });
  for await (const chunk of await graph.stream(payload as never, config)) {
    for (const node of Object.keys(chunk as Record<string, unknown>)) {
      if (node === '__interrupt__') {
        const intr = (chunk as Record<string, Array<{ value: { question: { text: string; options: string[] } } }>>).__interrupt__?.[0];
        if (intr) yield { type: 'question', ...intr.value.question };
      } else {
        yield { type: 'step', node, label: STEP_LABELS[node] ?? node };
      }
    }
  }
  const snapshot = await graph.getState({ configurable: { thread_id: threadId } });
  if (snapshot.next.length === 0) yield { type: 'done', state: snapshot.values as GenerationState };
}
