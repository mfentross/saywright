import { useSyncExternalStore } from 'react';
import { Blueprint, createSandbox, runclub, thirsty, validateBlueprint, type Sandbox } from '@saywright/blueprint';

/**
 * The sandbox for the app currently being tested. Shared by the inline preview
 * (Test drive) and the fullscreen test, so both show the same sample data.
 * Sample data only: nothing is saved or sent anywhere.
 */
let current: Sandbox = createSandbox(Blueprint.parse(thirsty));
let generation = 0;
const listeners = new Set<() => void>();

/** Loads a generated blueprint into a fresh sandbox. Rejects anything that doesn't validate. */
export function loadBlueprint(input: unknown): void {
  const r = validateBlueprint(input);
  if (!r.ok) throw new Error(`Blueprint is invalid: ${r.issues[0]?.path} ${r.issues[0]?.message}`);
  current = createSandbox(r.blueprint);
  generation++;
  listeners.forEach((l) => l());
}

/** Demo apps that ship with the client (no server needed). */
export function loadExample(name: 'thirsty' | 'runclub'): void {
  loadBlueprint(name === 'runclub' ? runclub : thirsty);
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

/** The current sandbox, plus a key that changes whenever a new app is loaded. */
export function useCurrentSandbox(): { sandbox: Sandbox; key: string } {
  const sandbox = useSyncExternalStore(subscribe, () => current, () => current);
  return { sandbox, key: `app-${generation}` };
}
