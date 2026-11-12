import { Platform } from 'react-native';
import { useSyncExternalStore } from 'react';
import * as SecureStore from 'expo-secure-store';

/**
 * The signed-in session token. Native: Keychain / Keystore via expo-secure-store.
 * Web: localStorage (the web app renders no user HTML and runs a strict CSP; moving
 * to an httpOnly cookie is on the hardening list).
 */
const KEY = 'saywright.session';
let token: string | null = null;
let email: string | null = null;
let loaded = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

async function read(): Promise<string | null> {
  try {
    if (Platform.OS === 'web') return globalThis.localStorage?.getItem(KEY) ?? null;
    return await SecureStore.getItemAsync(KEY);
  } catch {
    return null;
  }
}

async function write(value: string | null) {
  try {
    if (Platform.OS === 'web') {
      if (value) globalThis.localStorage?.setItem(KEY, value);
      else globalThis.localStorage?.removeItem(KEY);
    } else if (value) await SecureStore.setItemAsync(KEY, value);
    else await SecureStore.deleteItemAsync(KEY);
  } catch {
    // Storage unavailable (private mode): the session lasts until the app closes.
  }
}

export const session = {
  async load() {
    if (loaded) return;
    token = await read();
    loaded = true;
    notify();
  },
  token: () => token,
  async set(t: string, e: string) {
    token = t;
    email = e;
    await write(t);
    notify();
  },
  async clear() {
    token = null;
    email = null;
    await write(null);
    notify();
  },
  setEmail(e: string | null) {
    email = e;
    notify();
  },
};

let snapshot: { token: string | null; email: string | null; loaded: boolean } = { token, email, loaded };
function getSnapshot() {
  if (snapshot.token !== token || snapshot.email !== email || snapshot.loaded !== loaded) snapshot = { token, email, loaded };
  return snapshot;
}
function subscribe(l: () => void) {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

export function useSession() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
