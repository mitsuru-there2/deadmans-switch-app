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
    .enum(["bootstrap", "renew", "recovery-bootstrap", "recovery-ready", "restore"])
    .optional(),
  recovery: sessionSchema.optional(),
  canCancelRecovery: z.boolean().optional(),
});
type Envelope = z.infer<typeof envelopeSchema>;
export function createSessionManager(deps: {
  origin: string;
  read(): Promise<string | null>;
  write(value: string): Promise<void>;
  request(path: string, token?: string, body?: unknown): Promise<unknown>;
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
        if (saved?.operation?.startsWith("recovery") || saved?.operation === "restore")
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
        await save({ ...saved, operation: "restore", pending: true });
        try {
          authorize();
        } catch (error) {
          await save(saved);
          throw error;
        }
        // Unknown outcomes remain pending, including a failed final
        // Keychain write. Do not reuse the old bearer or replay a possibly successful restore.
        let response: unknown;
        try {
          response = await deps.request("/v1/auth/restore", saved.recovery.token, proof);
        } catch (error) {
          // A structured 4xx rejection (except revoked auth) confirms no new session
          // was issued. Keep only the fresh recovery identity for manual selection.
          if (error instanceof SessionRequestRejected) await save(saved);
          throw error;
        }
        const session = sessionSchema.required({ accountToken: true }).parse(response);
        await save({ origin: deps.origin, pending: false, session });
        deps.changed();
        return session;
      }),
  };
}
