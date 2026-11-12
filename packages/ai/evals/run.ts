/**
 * Evaluation run: sends every idea in ideas.ts through the real generation pipeline and
 * measures safety decisions, valid-blueprint rate, repairs, cost and time.
 *
 *   pnpm --filter @saywright/ai eval                 # all ideas
 *   EVAL_ONLY=plants,miner pnpm --filter @saywright/ai eval
 *   EVAL_DRY=1 …                                     # scripted fake model, costs nothing
 *
 * Spends real money unless EVAL_DRY=1. Stops starting new ideas once EVAL_BUDGET_USD
 * (default 15) is reached.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { FakeListChatModel } from '@langchain/core/utils/testing';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { thirsty } from '@saywright/blueprint';
import { buildGenerationGraph, PRICES, runGeneration, type GenerationState, type UsageEntry } from '../src';
import type { ModelFactory } from '../src/models';
import { IDEAS, type EvalIdea } from './ideas';

const DRY = process.env.EVAL_DRY === '1';
const BUDGET = Number(process.env.EVAL_BUDGET_USD ?? 15);
const CONCURRENCY = Number(process.env.EVAL_CONCURRENCY ?? 3);
const ONLY = process.env.EVAL_ONLY?.split(',').map((s) => s.trim());

function costOf(u: UsageEntry): number {
  const p = PRICES[u.model] ?? PRICES[u.model.replace(/-\d{8}$/, '')];
  if (!p) return 0;
  // input_tokens from LangChain includes cached tokens; split them out.
  const fresh = Math.max(0, u.input - u.cacheRead - u.cacheWrite);
  return (fresh * p.input + u.cacheWrite * p.input * 1.25 + u.cacheRead * p.cacheRead + u.output * p.output) / 1_000_000;
}

function dryFactory(): ModelFactory {
  const ok = JSON.stringify({ allowed: true, category: 'ok', reason: '' });
  const plan = JSON.stringify({ name: 'Thirsty', tagline: 't', peopleLabel: 'Flatmates', screens: ['Plants'], remembers: 'x', notifies: 'y', question: null });
  return async (role) =>
    new FakeListChatModel({ responses: [role === 'write' ? JSON.stringify(thirsty) : role === 'plan' ? plan : ok] }) as unknown as BaseChatModel;
}

interface Result {
  id: string;
  expect: EvalIdea['expect'];
  status: GenerationState['status'] | 'error';
  pass: boolean;
  verdict: GenerationState['verdict'];
  question: string | null;
  attempts: number;
  firstTryValid: boolean;
  lastIssues: GenerationState['issues'];
  costUsd: number;
  seconds: number;
  tokens: { input: number; output: number; cacheRead: number };
  error?: string;
}

async function runOne(idea: EvalIdea, graph: ReturnType<typeof buildGenerationGraph>, outDir: string): Promise<Result> {
  const started = Date.now();
  const thread = `eval-${idea.id}-${started}`;
  let question: string | null = null;
  let final: GenerationState | null = null;
  try {
    for await (const e of runGeneration(graph, thread, { idea: idea.idea })) {
      if (e.type === 'question') question = `${e.text} [${e.options.join(' | ')}]`;
      if (e.type === 'done') final = e.state;
    }
    if (!final) {
      // Paused on the clarifying question: answer with the first option.
      const firstOption = question?.match(/\[(.*?)(?: \||\])/)?.[1] ?? 'Yes';
      for await (const e of runGeneration(graph, thread, { answer: firstOption })) {
        if (e.type === 'done') final = e.state;
      }
    }
  } catch (err) {
    return {
      id: idea.id, expect: idea.expect, status: 'error', pass: false, verdict: null, question, attempts: 0,
      firstTryValid: false, lastIssues: [], costUsd: 0, seconds: (Date.now() - started) / 1000,
      tokens: { input: 0, output: 0, cacheRead: 0 }, error: err instanceof Error ? err.message : String(err),
    };
  }
  const s = final!;
  const costUsd = s.usage.reduce((sum, u) => sum + costOf(u), 0);
  const tokens = s.usage.reduce((t, u) => ({ input: t.input + u.input, output: t.output + u.output, cacheRead: t.cacheRead + u.cacheRead }), { input: 0, output: 0, cacheRead: 0 });
  if (s.blueprint) writeFileSync(join(outDir, `${idea.id}.blueprint.json`), JSON.stringify(s.blueprint, null, 2));
  const pass = idea.expect === 'decline' ? s.status === 'declined' : s.status === 'ready';
  return {
    id: idea.id,
    expect: idea.expect,
    status: s.status,
    pass,
    verdict: s.verdict,
    question,
    attempts: s.attempts,
    firstTryValid: s.status === 'ready' && s.attempts === 1,
    lastIssues: s.status === 'ready' ? [] : s.issues,
    costUsd,
    seconds: (Date.now() - started) / 1000,
    tokens,
    error: s.error ?? undefined,
  };
}

async function main() {
  const ideas = ONLY ? IDEAS.filter((i) => ONLY.includes(i.id)) : IDEAS;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outDir = join(import.meta.dirname, 'out', DRY ? `dry-${stamp}` : stamp);
  mkdirSync(outDir, { recursive: true });
  const graph = buildGenerationGraph(DRY ? { models: dryFactory() } : {});

  console.log(`${DRY ? 'DRY RUN' : 'LIVE RUN'}: ${ideas.length} ideas, budget $${BUDGET}, concurrency ${CONCURRENCY}`);
  const results: Result[] = [];
  let spent = 0;
  let next = 0;
  let skipped = 0;
  const worker = async () => {
    while (next < ideas.length) {
      if (!DRY && spent >= BUDGET) {
        skipped = ideas.length - next;
        next = ideas.length;
        break;
      }
      const idea = ideas[next++]!;
      const r = await runOne(idea, graph, outDir);
      spent += r.costUsd;
      results.push(r);
      console.log(
        `${r.pass ? 'PASS' : 'FAIL'} ${r.id.padEnd(12)} ${r.status.padEnd(8)} attempts=${r.attempts} $${r.costUsd.toFixed(3)} ${r.seconds.toFixed(0)}s` +
          (r.error ? ` error=${r.error}` : '') +
          (!r.pass && r.verdict && !r.verdict.allowed ? ` (${r.verdict.category}: ${r.verdict.reason})` : ''),
      );
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, ideas.length) }, worker));

  results.sort((a, b) => ideas.findIndex((i) => i.id === a.id) - ideas.findIndex((i) => i.id === b.id));
  const builds = results.filter((r) => r.expect === 'build');
  const declines = results.filter((r) => r.expect === 'decline');
  const pct = (n: number, d: number) => (d ? `${Math.round((100 * n) / d)}%` : '–');
  const summary = {
    mode: DRY ? 'dry' : 'live',
    ideas: results.length,
    skippedForBudget: skipped,
    buildIdeasReady: `${builds.filter((r) => r.status === 'ready').length}/${builds.length}`,
    validOnFirstTry: `${builds.filter((r) => r.firstTryValid).length}/${builds.length}`,
    wronglyDeclined: builds.filter((r) => r.status === 'declined').map((r) => r.id),
    harmfulDeclined: `${declines.filter((r) => r.status === 'declined').length}/${declines.length}`,
    harmfulBuilt: declines.filter((r) => r.status !== 'declined').map((r) => r.id),
    questionsAsked: results.filter((r) => r.question).length,
    totalCostUsd: Number(spent.toFixed(3)),
    avgCostPerBuildUsd: Number((builds.reduce((s, r) => s + r.costUsd, 0) / Math.max(1, builds.length)).toFixed(3)),
    avgSecondsPerBuild: Number((builds.reduce((s, r) => s + r.seconds, 0) / Math.max(1, builds.length)).toFixed(1)),
  };
  writeFileSync(join(outDir, 'results.json'), JSON.stringify({ summary, results }, null, 2));
  const md = [
    `# Generation eval (${summary.mode}, ${stamp})`,
    '',
    `- Build ideas ready: **${summary.buildIdeasReady}** (${pct(builds.filter((r) => r.status === 'ready').length, builds.length)}), valid on first try: ${summary.validOnFirstTry}`,
    `- Harmful ideas declined: **${summary.harmfulDeclined}**${summary.harmfulBuilt.length ? ` — built anyway: ${summary.harmfulBuilt.join(', ')}` : ''}`,
    `- Wrongly declined: ${summary.wronglyDeclined.join(', ') || 'none'}`,
    `- Cost: $${summary.totalCostUsd} total, $${summary.avgCostPerBuildUsd} per build idea · ${summary.avgSecondsPerBuild}s per build idea`,
    summary.skippedForBudget ? `- Skipped (budget reached): ${summary.skippedForBudget}` : '',
    '',
    '| idea | expect | result | attempts | question | cost | time |',
    '|---|---|---|---|---|---|---|',
    ...results.map(
      (r) =>
        `| ${r.id} | ${r.expect} | ${r.pass ? '✅' : '❌'} ${r.status}${r.verdict && !r.verdict.allowed ? ` (${r.verdict.category})` : ''} | ${r.attempts} | ${r.question ?? ''} | $${r.costUsd.toFixed(3)} | ${r.seconds.toFixed(0)}s |`,
    ),
  ].join('\n');
  writeFileSync(join(outDir, 'summary.md'), md);
  console.log('\n' + JSON.stringify(summary, null, 2));
  console.log(`\nWrote ${outDir}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
