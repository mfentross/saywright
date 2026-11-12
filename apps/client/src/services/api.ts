import { fetch as streamingFetch } from 'expo/fetch';

/**
 * Client for sw-api. Set EXPO_PUBLIC_API_URL (e.g. http://localhost:8080) to use the
 * real server; without it the app runs in demo mode with the hand-written Thirsty.
 */
export const API_URL: string | null = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') || null;

export type ServerEvent =
  | { type: 'step'; label: string }
  | { type: 'plan'; name: string; tagline: string; screens: string[]; remembers: string; notifies: string }
  | { type: 'question'; text: string; options: string[] }
  | { type: 'ready'; version: number; name: string }
  | { type: 'declined'; reason: string }
  | { type: 'failed'; message: string };

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
  return (await res.json()) as T;
}

export async function createProject(idea: string): Promise<string> {
  const res = await fetch(`${API_URL}/projects`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idea }),
  });
  return (await json<{ id: string }>(res)).id;
}

export async function answerQuestion(id: string, answer: string): Promise<void> {
  const res = await fetch(`${API_URL}/projects/${id}/answer`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ answer }),
  });
  if (!res.ok) throw new Error(`Request failed (${res.status})`);
}

export async function fetchBlueprint(id: string): Promise<{ version: number; blueprint: unknown }> {
  return json(await fetch(`${API_URL}/projects/${id}/blueprint`));
}

/** Server-Sent Events from /projects/:id/events, read from a streamed response. */
export async function* projectEvents(id: string, after = 0): AsyncGenerator<{ seq: number; event: ServerEvent }> {
  const res = await streamingFetch(`${API_URL}/projects/${id}/events?after=${after}`, {
    headers: { accept: 'text/event-stream' },
  });
  if (!res.ok || !res.body) throw new Error(`Request failed (${res.status})`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut: number;
    while ((cut = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      let seq = 0;
      let data = '';
      for (const line of chunk.split('\n')) {
        if (line.startsWith('id: ')) seq = Number(line.slice(4));
        else if (line.startsWith('data: ')) data += line.slice(6);
      }
      if (data) yield { seq, event: JSON.parse(data) as ServerEvent };
    }
  }
}
