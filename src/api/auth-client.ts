import { createApiClient } from "deadmans-switch-api/client";
import { z } from "zod";
import { AppError } from "./errors.ts";
export type AuthPath =
  | "/v1/auth/bootstrap"
  | "/v1/auth/device-session"
  | "/v1/auth/restore"
  | "/v1/auth/restore/result"
  | "/v1/auth/device-sessions";
const secret = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const proof = z.discriminatedUnion("store", [
  z.object({ store: z.literal("apple"), signedTransaction: z.string(), operationSecret: secret }),
  z.object({ store: z.literal("google"), purchaseToken: z.string(), operationSecret: secret }),
]);
export function createAuthRequest(origin: string, fetcher: typeof fetch = fetch) {
  return async (path: AuthPath, token?: string, body: unknown = {}): Promise<unknown> => {
    const client = createApiClient(origin, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      fetch: fetcher,
    });
    let response: { status: number; ok: boolean; json(): Promise<unknown> };
    try {
      switch (path) {
        case "/v1/auth/bootstrap":
          response = await client.v1.auth.bootstrap.$post({ json: {} });
          break;
        case "/v1/auth/device-session":
          response = await client.v1.auth["device-session"].$post();
          break;
        case "/v1/auth/restore":
          response = await client.v1.auth.restore.$post({ json: proof.parse(body) });
          break;
        case "/v1/auth/restore/result":
          response = await client.v1.auth.restore.result.$post({
            json: z.object({ operationSecret: secret }).parse(body),
          });
          break;
        case "/v1/auth/device-sessions":
          response = await client.v1.auth["device-sessions"].$delete();
          break;
      }
    } catch {
      throw new AppError("NETWORK");
    }
    // Only this explicit abandonment route treats revoked source auth as success.
    if (path === "/v1/auth/device-sessions" && [204, 401].includes(response.status))
      return { revoked: true };
    if (!response.ok) {
      const error = z
        .object({ error: z.object({ code: z.string() }) })
        .safeParse(await response.json().catch(() => null));
      throw new AppError(
        response.status === 401
          ? "UNAUTHORIZED"
          : error.success
            ? error.data.error.code
            : "NETWORK",
      );
    }
    return response.json();
  };
}
