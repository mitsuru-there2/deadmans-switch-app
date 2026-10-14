import * as SecureStore from "expo-secure-store";
import { z } from "zod";
import { AppError } from "./errors";
import { apiUrl } from "./config";
const sessionSchema = z.object({
  token: z.string().min(32),
  expiresAt: z.number(),
  userId: z.string(),
});
export type Session = z.infer<typeof sessionSchema>;
const envelopeSchema = z.object({
  origin: z.string(),
  pending: z.boolean().default(false),
  session: sessionSchema.nullable(),
});
const key = "device-session-v1";
let inFlight: Promise<Session> | undefined;
const save = (session: Session | null, pending: boolean) =>
  SecureStore.setItemAsync(key, JSON.stringify({ origin: apiUrl, session, pending }), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
async function request(path: string, token?: string) {
  let response: Response;
  try {
    response = await fetch(`${apiUrl}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: "{}",
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    throw new AppError("NETWORK");
  }
  if (!response.ok) throw new AppError(response.status === 401 ? "UNAUTHORIZED" : "NETWORK");
  return response.json() as Promise<unknown>;
}
async function loadOrRenew(): Promise<Session> {
  const raw = await SecureStore.getItemAsync(key);
  const saved = raw ? envelopeSchema.parse(JSON.parse(raw)) : null;
  // Ambiguous bootstrap/rotation cannot safely be replayed. Preserve identity for recovery.
  if (saved && (saved.origin !== apiUrl || saved.pending || !saved.session))
    throw new AppError("UNAUTHORIZED");
  let session = saved?.session;
  if (session && session.expiresAt <= Date.now()) throw new AppError("UNAUTHORIZED");
  if (!session) {
    await save(null, true);
    session = sessionSchema.parse(await request("/v1/auth/bootstrap"));
    await save(session, false);
  } else if (session.expiresAt - Date.now() < 7 * 86400000) {
    await save(session, true);
    const renewed = z
      .object({ token: z.string().min(32), expiresAt: z.number() })
      .parse(await request("/v1/auth/device-session", session.token));
    session = { ...session, ...renewed };
    await save(session, false);
  }
  return session;
}
export const getSession = () =>
  (inFlight ??= loadOrRenew().finally(() => {
    inFlight = undefined;
  }));
