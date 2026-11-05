import { useSyncExternalStore } from 'react';
import type { PlanId, RouteId } from './mock';

/** Tiny app-wide state for the click-through flow (replaced by server state in phase 2). */
interface FlowState {
  idea: string;
  frequency: string;
  plan: PlanId;
  routes: Record<RouteId, boolean>;
}

let state: FlowState = {
  idea: '',
  frequency: 'plant',
  plan: 'own',
  routes: { phone: true, store: true, link: false },
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
