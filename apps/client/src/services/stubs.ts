/**
 * Typed stubs for services that come in later phases. The screens call these, so
 * swapping in the real implementation doesn't touch the UI.
 *
 * - generation: phase 3 (LangGraph pipeline in sw-worker, progress via SSE)
 * - voice:      phase 4 (on-device speech recognition)
 * - payments:   phase 5 (RevenueCat in-app purchase / Stripe on web)
 * - delivery:   phase 6–7 (review gate, home screen, web link, stores)
 */
import { thirsty, type BlueprintInput } from '@saywright/blueprint';
import type { PlanId, RouteId } from '../data/mock';

// ---------------------------------------------------------------- generation

export type BuildEvent =
  | { type: 'step'; index: number; label: string; done: boolean }
  | { type: 'question'; id: string; text: string; options: Array<{ id: string; label: string }> }
  | { type: 'ready'; projectId: string; version: number };

export interface GenerationService {
  /** Starts building from an idea; yields progress for the Building screen. */
  build(idea: string): AsyncIterable<BuildEvent>;
  answer(questionId: string, optionId: string): Promise<void>;
  requestChange(projectId: string, request: string): Promise<{ version: number }>;
  blueprint(projectId: string, version?: number): Promise<BlueprintInput>;
}

export const generation: GenerationService = {
  async *build() {
    // STUB: replaced by POST /projects + SSE /projects/:id/events (apps/server).
    yield { type: 'ready', projectId: 'thirsty', version: 1 };
  },
  async answer() {
    // STUB
  },
  async requestChange() {
    // STUB
    return { version: 2 };
  },
  async blueprint() {
    return thirsty;
  },
};

// ---------------------------------------------------------------- voice

export interface VoiceSession {
  onTranscript(cb: (text: string, final: boolean) => void): void;
  pause(): void;
  resume(): void;
  stop(): Promise<string>;
}

export interface VoiceService {
  start(lang?: string): Promise<VoiceSession>;
}

export const voice: VoiceService = {
  async start() {
    // STUB: expo-speech-recognition (iOS Speech, Android SpeechRecognizer, Web Speech API).
    let cb: ((t: string, f: boolean) => void) | undefined;
    const text = 'An app where my flatmates and I can see which plants need water, and it pings whoever’s turn it is…';
    return {
      onTranscript: (fn) => {
        cb = fn;
        cb(text, false);
      },
      pause() {},
      resume() {},
      stop: async () => text,
    };
  },
};

// ---------------------------------------------------------------- payments

export interface PaymentsService {
  subscribe(projectId: string, plan: PlanId): Promise<{ ok: true } | { ok: false; reason: 'cancelled' | 'failed' }>;
}

export const payments: PaymentsService = {
  async subscribe() {
    // STUB: RevenueCat (iOS/Android) or Stripe Checkout (web).
    return { ok: true };
  },
};

// ---------------------------------------------------------------- delivery

export interface DeliveryService {
  /** Sends the version to Saywright review, then to the chosen routes. */
  request(projectId: string, routes: RouteId[]): Promise<{ reviewId: string }>;
}

export const delivery: DeliveryService = {
  async request() {
    // STUB: POST /projects/:id/deliveries
    return { reviewId: 'review-1' };
  },
};
