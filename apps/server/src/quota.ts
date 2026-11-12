import type { Client } from '@libsql/client';
import { PRICES } from '@saywright/ai';

/**
 * Free-tier limits (docs/PLAN.md §9) and a hard daily AI cost cap per account, so
 * testing stays free for people and affordable for Saywright.
 */
export interface Limits {
  appsPerMonth: number;
  changesPerMonth: number;
  dailyAiCapUsd: number;
}

export function limitsFromEnv(env: Record<string, string | undefined> = process.env): Limits {
  return {
    appsPerMonth: Number(env.SAYWRIGHT_FREE_APPS_PER_MONTH ?? 3),
    changesPerMonth: Number(env.SAYWRIGHT_FREE_CHANGES_PER_MONTH ?? 30),
    dailyAiCapUsd: Number(env.SAYWRIGHT_DAILY_AI_CAP_USD ?? 3),
  };
}

export interface UsageSummary {
  appsThisMonth: number;
  changesThisMonth: number;
  aiCostTodayUsd: number;
  limits: Limits;
}

function startOfMonth(now = new Date()) {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1);
}
function startOfDay(now = new Date()) {
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

export class QuotaService {
  constructor(
    private readonly db: Client,
    readonly limits: Limits,
  ) {}

  async usage(userId: string): Promise<UsageSummary> {
    const month = startOfMonth();
    const [apps, changes, ai] = await Promise.all([
      this.db.execute({ sql: 'SELECT COUNT(*) AS n FROM projects WHERE owner_id = ? AND created_at >= ?', args: [userId, month] }),
      this.db.execute({
        sql: "SELECT COUNT(*) AS n FROM jobs j JOIN projects p ON p.id = j.project_id WHERE p.owner_id = ? AND j.type = 'change' AND j.created_at >= ?",
        args: [userId, month],
      }),
      this.db.execute({
        sql: `SELECT a.model, SUM(a.input_tokens) AS input, SUM(a.output_tokens) AS output, SUM(a.cache_read_tokens) AS cr, SUM(a.cache_write_tokens) AS cw
              FROM ai_usage a JOIN projects p ON p.id = a.project_id
              WHERE p.owner_id = ? AND a.created_at >= ? GROUP BY a.model`,
        args: [userId, startOfDay()],
      }),
    ]);
    let cost = 0;
    for (const row of ai.rows) {
      const p = PRICES[String(row.model)] ?? { input: 20, output: 100, cacheRead: 2 }; // unknown model: assume expensive
      const input = Number(row.input ?? 0);
      const cr = Number(row.cr ?? 0);
      const cw = Number(row.cw ?? 0);
      cost += (Math.max(0, input - cr - cw) * p.input + cw * p.input * 1.25 + cr * p.cacheRead + Number(row.output ?? 0) * p.output) / 1_000_000;
    }
    return {
      appsThisMonth: Number(apps.rows[0]?.n ?? 0),
      changesThisMonth: Number(changes.rows[0]?.n ?? 0),
      aiCostTodayUsd: Math.round(cost * 1000) / 1000,
      limits: this.limits,
    };
  }

  /** Returns a reason the person sees, or null when the action is allowed. */
  async check(userId: string, action: 'app' | 'change'): Promise<string | null> {
    const u = await this.usage(userId);
    if (u.aiCostTodayUsd >= this.limits.dailyAiCapUsd) return 'You’ve reached today’s building limit. Try again tomorrow.';
    if (action === 'app' && u.appsThisMonth >= this.limits.appsPerMonth) {
      return `Free testing includes ${this.limits.appsPerMonth} new apps a month. Keep an app to build more.`;
    }
    if (action === 'change' && u.changesThisMonth >= this.limits.changesPerMonth) {
      return `Free testing includes ${this.limits.changesPerMonth} changes a month. Keep an app to change it more.`;
    }
    return null;
  }
}
