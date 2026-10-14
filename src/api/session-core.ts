import { restoreResultResponseSchema } from "deadmans-switch-api/responses";
import type { AuthPath } from "./auth-client.ts";
import { z } from "zod";
import { AppError } from "./errors.ts";
export const sessionSchema = z.object({
  token: z.string().min(32),
  expiresAt: z.number(),
  userId: z.string(),
  accountToken: z.string().uuid().optional(),
});
export class SessionRequestRejected extends AppError {}
export type Session = z.infer<typeof sessionSchema>;
export type RestoreProof =
  { store: "apple"; signedTransaction: string } | { store: "google"; purchaseToken: string };
const envelopeSchema = z.object({
  origin: z.string(),
  pending: z.boolean().default(false),
  session: sessionSchema.nullable(),
  operation: z
    .enum([
      "bootstrap",
      "renew",
      "recovery-bootstrap",
      "recovery-ready",
      "restore",
      "restore-abandoning",
      "recovery-abandoned",
    ])
    .optional(),
  recovery: sessionSchema.optional(),
  operationSecret: z
    .string()
    .regex(/^[A-Za-z0-9_-]{43}$/)
    .optional(),
  resultStatus: z.enum(["pending", "failed", "unavailable"]).optional(),
  resultExpiresAt: z.number().optional(),
  resultError: z.string().optional(),
  canCancelRecovery: z.boolean().optional(),
});
type Envelope = z.infer<typeof envelopeSchema>;
export function createSessionManager(deps: {
  origin: string;
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  request(path: AuthPath, token?: string, body?: unknown): Promise<unknown>;
  makeOperationSecret(): Promise<string>;
  now(): number;
  changed(): void;
}) {
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(work: () => Promise<T>): Promise<T> => {
    const result = queue.then(work);
    queue = result.catch(() => {});
    return result;
  };
  async function load(): Promise<Envelope | null> {
    const raw = await deps.read();
    if (!raw) return null;
    const saved = envelopeSchema.parse(JSON.parse(raw));
    if (saved.origin !== deps.origin) throw new AppError("UNAUTHORIZED");
    return saved;
  }
  const save = (saved: Envelope) => deps.write(JSON.stringify(saved));
  const valid = (session?: Session | null): session is Session =>
    !!session && session.expiresAt > deps.now();
  async function assertSameOperation(expected: Envelope) {
    const current = await load();
    if (
      !current ||
      current.operation !== expected.operation ||
      current.operationSecret !== expected.operationSecret ||
      current.recovery?.token !== expected.recovery?.token
    )
      throw new AppError("RESTORE_OPERATION_CHANGED");
  }
  async function commitResult(expected: Envelope, response: unknown) {
    const session = sessionSchema.required({ accountToken: true }).parse(response);
    await assertSameOperation(expected);
    await save({ origin: deps.origin, pending: false, session });
    deps.changed();
    return session;
  }
  return {
    get: () =>
      serial(async () => {
        let saved = await load();
        if (saved?.pending) throw new AppError("RECOVERY_REQUIRED");
        if (saved && !valid(saved.session)) throw new AppError("UNAUTHORIZED");
        if (!saved) {
          saved = {
            origin: deps.origin,
            session: null,
            pending: true,
            operation: "bootstrap",
          };
          await save(saved);
          const session = sessionSchema.parse(await deps.request("/v1/auth/bootstrap"));
          await save({ origin: deps.origin, pending: false, session });
          return session;
        }
        let session = saved.session!;
        if (session.expiresAt - deps.now() < 7 * 86400000) {
          await save({ ...saved, pending: true, operation: "renew" });
          const renewed = z
            .object({ token: z.string().min(32), expiresAt: z.number() })
            .parse(await deps.request("/v1/auth/device-session", session.token));
          session = { ...session, ...renewed };
          await save({ origin: deps.origin, pending: false, session });
        }
        return session;
      }),
    // Explicit user recovery only. Never replaces an ambiguous recovery attempt.
    prepareRecovery: () =>
      serial(async () => {
        const saved = await load();
        if (saved?.operation === "recovery-ready" && valid(saved.recovery)) return saved.recovery;
        if (
          saved?.pending &&
          saved.operation !== "recovery-abandoned" &&
          (saved.operation === "bootstrap" ||
            saved.operation?.startsWith("recovery") ||
            saved.operation?.startsWith("restore"))
        )
          throw new AppError("RESTORE_OUTCOME_UNKNOWN");
        const pending: Envelope = {
          origin: deps.origin,
          pending: true,
          session: saved?.session ?? null,
          operation: "recovery-bootstrap",
          canCancelRecovery: !!saved && !saved.pending && valid(saved.session),
        };
        await save(pending);
        const recovery = sessionSchema
          .required({ accountToken: true })
          .parse(await deps.request("/v1/auth/bootstrap"));
        await save({ ...pending, operation: "recovery-ready", recovery });
        return recovery;
      }),
    cancelRecovery: () =>
      serial(async () => {
        const saved = await load();
        if (
          saved?.operation !== "recovery-ready" ||
          !saved.canCancelRecovery ||
          !valid(saved.session)
        )
          throw new AppError("RESTORE_OUTCOME_UNKNOWN");
        await save({
          origin: deps.origin,
          pending: false,
          session: saved.session,
        });
      }),
    restore: (proof: RestoreProof, authorize: () => void = () => {}) =>
      serial(async () => {
        const saved = await load();
        if (saved?.operation !== "recovery-ready" || !valid(saved.recovery))
          throw new AppError("RESTORE_OUTCOME_UNKNOWN");
        authorize();
        const operationSecret = z
          .string()
          .regex(/^[A-Za-z0-9_-]{43}$/)
          .parse(await deps.makeOperationSecret());
        const pending: Envelope = {
          ...saved,
          operation: "restore",
          pending: true,
          canCancelRecovery: false,
          operationSecret,
          resultStatus: "pending",
        };
        // One envelope contains the original fresh bearer and the operation secret.
        // A failed write never dispatches the request, even if the OS partially saved it.
        await save(pending);
        try {
          authorize();
        } catch (error) {
          await save(saved);
          throw error;
        }
        const response = await deps.request("/v1/auth/restore", saved.recovery.token, {
          ...proof,
          operationSecret,
        });
        return commitResult(pending, response);
      }),
    recoveryState: () =>
      serial(async () => {
        const saved = await load();
        if (!saved?.pending)
          return {
            phase: "none" as const,
            expiresAt: undefined,
            errorCode: undefined,
            canRetrieve: false,
            canAbandon: false,
          };
        const phase =
          saved.operation === "recovery-ready"
            ? "ready"
            : saved.operation === "recovery-abandoned"
              ? "abandoned"
              : saved.operation === "restore-abandoning"
                ? "abandoning"
                : saved.operation === "restore"
                  ? (saved.resultStatus ?? "pending")
                  : "bootstrap-unknown";
        return {
          phase,
          expiresAt: saved.resultExpiresAt,
          errorCode: saved.resultError,
          canRetrieve: saved.operation === "restore" && !!saved.operationSecret && !!saved.recovery,
          canAbandon:
            !!saved.recovery && ["restore", "restore-abandoning"].includes(saved.operation ?? ""),
        };
      }),
    retrieveResult: (authorize: () => void = () => {}) =>
      serial(async () => {
        const saved = await load();
        if (saved?.operation !== "restore" || !saved.operationSecret || !saved.recovery)
          throw new AppError("RESTORE_OUTCOME_UNKNOWN");
        // Local clock/expiry is display-only. The server decides whether the result
        // is still available; retrieval never renews either expiry.
        authorize();
        let response;
        try {
          response = restoreResultResponseSchema.parse(
            await deps.request("/v1/auth/restore/result", saved.recovery.token, {
              operationSecret: saved.operationSecret,
            }),
          );
        } catch (error) {
          await assertSameOperation(saved);
          if (error instanceof AppError && error.code === "RESTORE_RESULT_UNAVAILABLE")
            await save({ ...saved, resultStatus: "unavailable" });
          throw error;
        }
        await assertSameOperation(saved);
        if (response.status === "completed") {
          const session = await commitResult(saved, response.session);
          return { status: "completed" as const, session, expiresAt: response.expiresAt };
        }
        await save({
          ...saved,
          resultStatus: response.status,
          resultExpiresAt: response.expiresAt,
          resultError: response.status === "failed" ? response.error.code : undefined,
        });
        return response;
      }),
    abandonRecovery: (authorize: () => void = () => {}) =>
      serial(async () => {
        const saved = await load();
        if (!saved?.recovery || !["restore", "restore-abandoning"].includes(saved.operation ?? ""))
          throw new AppError("RESTORE_OUTCOME_UNKNOWN");
        authorize();
        const abandoning: Envelope = { ...saved, operation: "restore-abandoning" };
        await save(abandoning);
        authorize();
        const result = await deps.request("/v1/auth/device-sessions", saved.recovery.token);
        z.object({ revoked: z.literal(true) }).parse(result);
        await assertSameOperation(abandoning);
        // No old bearer fallback. A separate explicit action may now bootstrap.
        await save({
          origin: deps.origin,
          session: null,
          pending: true,
          operation: "recovery-abandoned",
        });
      }),
  };
}
