import { fetch as streamingFetch } from 'expo/fetch';
import { session } from './session';

/**
 * Client for sw-api. Set EXPO_PUBLIC_API_URL (e.g. http://localhost:8080) to use the
 * real server; without it the app runs in demo mode with the hand-written Thirsty.
 */
export const API_URL: string | null = process.env.EXPO_PUBLIC_API_URL?.replace(/\/$/, '') || null;

/** Error with the message the server wants the person to see. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  const t = session.token();
  return { ...(t ? { authorization: `Bearer ${t}` } : {}), ...extra };
}

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: headers(body === undefined ? {} : { 'content-type': 'application/json' }),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) await session.clear();
  if (!res.ok) {
    const msg = await res
      .json()
      .then((j: { error?: string }) => j.error)
      .catch(() => undefined);
    throw new ApiError(res.status, msg ?? `Request failed (${res.status})`);
  }
  return res.status === 204 ? (undefined as T) : ((await res.json()) as T);
}

export type ServerEvent =
  | { type: 'step'; label: string }
  | { type: 'plan'; name: string; tagline: string; screens: string[]; remembers: string; notifies: string }
  | { type: 'question'; text: string; options: string[] }
  | { type: 'ready'; version: number; name: string }
  | { type: 'declined'; reason: string }
  | { type: 'failed'; message: string }
  | { type: 'changed'; version: number; summary: string }
  | { type: 'change_declined'; reason: string }
  | { type: 'change_failed'; message: string };

export const requestSignInLink = (email: string) => call<{ ok: true; devToken?: string }>('POST', '/auth/link', { email });
export const verifySignIn = (token: string) => call<{ token: string; user: { id: string; email: string } }>('POST', '/auth/verify', { token });
export const signOut = () => call<void>('POST', '/auth/sign-out');
export const fetchMe = () =>
  call<{
    user: { id: string; email: string };
    usage: { appsThisMonth: number; changesThisMonth: number; limits: { appsPerMonth: number; changesPerMonth: number } };
  }>('GET', '/me');

export const createProject = async (idea: string) => (await call<{ id: string }>('POST', '/projects', { idea })).id;
export const answerQuestion = (id: string, answer: string) => call<void>('POST', `/projects/${id}/answer`, { answer });
export const requestChange = (id: string, request: string) => call<void>('POST', `/projects/${id}/changes`, { request });
export const fetchBlueprint = (id: string) => call<{ version: number; blueprint: unknown }>('GET', `/projects/${id}/blueprint`);

/** Server-Sent Events from /projects/:id/events, read from a streamed response. */
export async function* projectEvents(id: string, after = 0): AsyncGenerator<{ seq: number; event: ServerEvent }> {
  const res = await streamingFetch(`${API_URL}/projects/${id}/events?after=${after}`, {
    headers: headers({ accept: 'text/event-stream' }),
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
