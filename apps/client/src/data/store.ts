import { useSyncExternalStore } from 'react';
import type { PlanId, RouteId } from './mock';

/** Tiny app-wide state for the click-through flow (replaced by server state in phase 2). */
interface FlowState {
  idea: string;
  /** The idea came from the Voice screen (shows the voice label in Building). */
  fromVoice: boolean;
  frequency: string;
  plan: PlanId;
  routes: Record<RouteId, boolean>;
  /** The live project being tested (server mode). */
  project: { id: string; version: number; seq: number } | null;
}

let state: FlowState = {
  idea: '',
  fromVoice: false,
  frequency: 'Per plant',
  plan: 'own',
  routes: { phone: true, store: true, link: false },
  project: null,
};
const listeners = new Set<() => void>();

export const flow = {
  get: () => state,
  set(patch: Partial<FlowState>) {
    state = { ...state, ...patch };
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};

export function useFlow() {
  return useSyncExternalStore(flow.subscribe, flow.get, flow.get);
}
