import type { AIMessage } from '@langchain/core/messages';

/** The visible text of a model reply (thinking and other blocks are skipped). */
export function textOf(msg: AIMessage): string {
  if (typeof msg.content === 'string') return msg.content;
  return msg.content
    .map((b) => (typeof b === 'string' ? b : b.type === 'text' && 'text' in b ? String(b.text) : ''))
    .join('');
}

/** Parses the single JSON object in a reply; tolerates code fences and stray text around it. */
export function parseJsonObject(text: string): unknown {
  const stripped = text.replace(/```(?:json)?/gi, '');
  const start = stripped.indexOf('{');
  const end = stripped.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    const v: unknown = JSON.parse(stripped.slice(start, end + 1));
    return v && typeof v === 'object' && !Array.isArray(v) ? v : null;
  } catch {
    return null;
  }
}
