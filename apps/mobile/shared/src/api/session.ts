import { useSyncExternalStore } from "react";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { apiPortal } from "./config";

/**
 * The signed-in session: tokens in the phone's keychain/keystore.
 *
 * The website reads localStorage synchronously on first render. SecureStore is
 * async, so the app calls `hydrateSession()` once while the splash screen is
 * still up; after that every read is from memory and synchronous.
 */
export interface Session {
  accessToken: string;
  refreshToken: string;
  deviceId: string;
}

const DEVICE_KEY = "retromobi_device_id";
const sessionKey = () => `retromobi_${apiPortal()}_session`;

let current: Session | null = null;
let deviceId = "";
let hydrated = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export async function hydrateSession(): Promise<void> {
  try {
    deviceId = (await SecureStore.getItemAsync(DEVICE_KEY)) ?? "";
    if (!deviceId) {
      deviceId = Crypto.randomUUID();
      await SecureStore.setItemAsync(DEVICE_KEY, deviceId);
    }
    const raw = await SecureStore.getItemAsync(sessionKey());
    current = raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    // A keystore that can't be read (restored backup, cleared credentials)
    // means signed out, not a crash.
    current = null;
    if (!deviceId) deviceId = Crypto.randomUUID();
  }
  hydrated = true;
  emit();
}

export function getSession(): Session | null {
  return current;
}

export function getDeviceId(): string {
  return deviceId;
}

export function isSessionHydrated(): boolean {
  return hydrated;
}

/** Sign in (tokens) or sign out locally (null). Persisting is best-effort. */
export function setSession(tokens: { accessToken: string; refreshToken: string } | null) {
  current = tokens ? { accessToken: tokens.accessToken, refreshToken: tokens.refreshToken, deviceId } : null;
  emit();
  const key = sessionKey();
  (current ? SecureStore.setItemAsync(key, JSON.stringify(current)) : SecureStore.deleteItemAsync(key)).catch(() => {});
}

/** Re-renders when the session changes, including a silent token refresh. */
export function useSession(): Session | null {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => current,
  );
}

export { decodeJwtSubject } from "../lib/jwt";
