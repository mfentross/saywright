import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { ChatAnthropic } from '@langchain/anthropic';
import { initChatModel } from 'langchain/chat_models/universal';

/**
 * Which model runs each pipeline step. Picked by configuration, not code, so any
 * step can move to another provider: set e.g. SAYWRIGHT_MODEL_WRITE="openai:gpt-…".
 *
 * Default for every step: Claude Opus 5.5. The safety screen runs at low effort.
 */
export type Role = 'screen' | 'plan' | 'write';

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface ModelSpec {
  /** "provider:model", e.g. "anthropic:claude-opus-5-5". */
  id: string;
  /** Anthropic only: reasoning effort. */
  effort?: Effort;
  maxTokens: number;
}

export const DEFAULT_MODELS: Record<Role, ModelSpec> = {
  screen: { id: 'anthropic:claude-opus-5-5', effort: 'low', maxTokens: 2_000 },
  plan: { id: 'anthropic:claude-opus-5-5', effort: 'medium', maxTokens: 8_000 },
  write: { id: 'anthropic:claude-opus-5-5', effort: 'medium', maxTokens: 32_000 },
};

export function modelSpec(role: Role, env: Record<string, string | undefined> = process.env): ModelSpec {
  const base = DEFAULT_MODELS[role];
  const id = env[`SAYWRIGHT_MODEL_${role.toUpperCase()}`] ?? base.id;
  const effort = (env[`SAYWRIGHT_EFFORT_${role.toUpperCase()}`] as Effort | undefined) ?? base.effort;
  return { ...base, id, effort };
}

export type ModelFactory = (role: Role) => Promise<BaseChatModel>;

/** Builds real provider models. Tests pass their own factory with fake models. */
export const createModel: ModelFactory = async (role) => {
  const spec = modelSpec(role);
  const [provider, ...rest] = spec.id.split(':');
  const model = rest.join(':');
  if (provider === 'anthropic') {
    return new ChatAnthropic({
      model,
      maxTokens: spec.maxTokens,
      // Thinking stays at its default (adaptive): it can't be turned off on
      // current models. Effort is the lever for depth and cost.
      outputConfig: spec.effort ? { effort: spec.effort } : undefined,
      // Long outputs: stream so large responses don't hit HTTP timeouts.
      streaming: role === 'write',
      // If a safety classifier declines, the API retries on a suitable fallback model.
      betas: ['server-side-fallback-2026-07-01'],
      invocationKwargs: { fallbacks: 'default' },
    }) as unknown as BaseChatModel;
  }
  return (await initChatModel(spec.id, { maxTokens: spec.maxTokens })) as unknown as BaseChatModel;
};

/** USD per million tokens, for cost tracking in evals. Unknown models count as 0. */
export const PRICES: Record<string, { input: number; output: number; cacheRead: number }> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheRead: 0.2 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheRead: 0.1 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheRead: 0.01 },
};
