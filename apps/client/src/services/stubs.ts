/**
 * Typed stubs for services that come in later phases. The screens call these, so
 * swapping in the real implementation doesn't touch the UI.
 *
 * - voice:      phase 4 (on-device speech recognition)
 * - payments:   phase 5 (RevenueCat in-app purchase / Stripe on web)
 * - delivery:   phase 6–7 (review gate, home screen, web link, stores)
 */
import type { PlanId, RouteId } from '../data/mock';

// Generation is real: see ./api.ts and ../data/useBuild.ts (demo mode without EXPO_PUBLIC_API_URL).

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
