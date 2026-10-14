import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { encodeOperationSecret } from "./operation-secret";
import { createAuthRequest } from "./auth-client";
import { apiUrl } from "./config";
import { createSessionManager } from "./session-core";
export type { Session } from "./session-core";
let revision = 0;
const listeners = new Set<() => void>();
export const identityRevision = () => revision;
export const subscribeIdentity = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
const manager = createSessionManager({
  origin: apiUrl ?? "unconfigured",
  read: () => SecureStore.getItemAsync("device-session-v1"),
  write: (value) =>
    SecureStore.setItemAsync("device-session-v1", value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
  now: Date.now,
  changed: () => {
    revision++;
    listeners.forEach((listener) => listener());
  },
  makeOperationSecret: async () => encodeOperationSecret(await Crypto.getRandomBytesAsync(32)),
  request: createAuthRequest(apiUrl ?? "https://unconfigured.invalid", (input, init) =>
    fetch(input, { ...init, signal: AbortSignal.timeout(15000) }),
  ),
});
export const getSession = manager.get;
export const prepareRecovery = manager.prepareRecovery;
export const restoreSession = manager.restore;

export const cancelRecoverySession = manager.cancelRecovery;

export const getRecoveryState = manager.recoveryState;
export const retrieveRecoveryResult = manager.retrieveResult;
export const abandonRecoverySession = manager.abandonRecovery;
