import * as SecureStore from "expo-secure-store";
import { z } from "zod";
import { AppError } from "./errors";
import { apiUrl } from "./config";
import { createSessionManager, SessionRequestRejected } from "./session-core";
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
  request: async (path, token, body = {}) => {
    let response: Response;
    try {
      response = await fetch(`${apiUrl}${path}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new AppError("NETWORK");
    }
    if (!response.ok) {
      const error = z
        .object({ error: z.object({ code: z.string() }) })
        .safeParse(await response.json().catch(() => null));
      if (
        response.status >= 400 &&
        response.status < 500 &&
        response.status !== 401 &&
        error.success
      )
        throw new SessionRequestRejected(error.data.error.code);
      throw new AppError(
        response.status === 401
          ? "UNAUTHORIZED"
          : error.success
            ? error.data.error.code
            : "NETWORK",
      );
    }
    return response.json();
  },
});
export const getSession = manager.get;
export const prepareRecovery = manager.prepareRecovery;
export const restoreSession = manager.restore;

export const cancelRecoverySession = manager.cancelRecovery;
