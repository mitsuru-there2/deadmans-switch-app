import { test } from "node:test";
import assert from "node:assert/strict";
import { createSessionManager } from "../src/api/session-core.ts";
import { createAuthRequest } from "../src/api/auth-client.ts";
import { encodeOperationSecret } from "../src/api/operation-secret.ts";
const old = {
  token: "o".repeat(40),
  expiresAt: 180 * 86400000,
  userId: "old",
  accountToken: "11111111-1111-4111-8111-111111111111",
};
const fresh = { ...old, token: "f".repeat(40), userId: "fresh" };
const restored = { ...old, token: "n".repeat(40) };
const proof = { store: "google" as const, purchaseToken: "MOCK_PROOF_ONLY" };
const secret = encodeOperationSecret(Uint8Array.from({ length: 32 }, (_, i) => i));
function fixture() {
  let raw = JSON.stringify({ origin: "https://mock.invalid", session: old, pending: false });
  const calls: { path: string; method: string; bearer: string | null; body: any }[] = [];
  const state = {
    loseRestore: false,
    failCommit: false,
    failPendingWrite: false,
    result: "completed",
    revoke: 204,
    now: 0,
    changes: 0,
    expiry: 900000,
    holdRestore: undefined as Promise<void> | undefined,
  };
  let secrets = 0;
  const request = createAuthRequest("https://mock.invalid", async (input, init) => {
    const path = new URL(String(input)).pathname;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    const bearer = new Headers(init?.headers).get("Authorization");
    calls.push({ path, method: init?.method ?? "GET", bearer, body });
    if (path.endsWith("bootstrap")) return Response.json(fresh, { status: 201 });
    if (path.endsWith("device-sessions")) {
      assert.equal(bearer, `Bearer ${fresh.token}`);
      if (state.revoke === 0) throw new Error("timeout");
      return new Response(null, { status: state.revoke });
    }
    assert.equal(bearer, `Bearer ${fresh.token}`, "never use old/new session bearer");
    assert.equal(JSON.parse(raw).operationSecret, secret);
    assert.equal(JSON.parse(raw).recovery.token, fresh.token);
    assert.equal(body.operationSecret, secret);
    if (path.endsWith("/restore")) {
      assert.equal(JSON.parse(raw).operation, "restore");
      assert.equal(body.purchaseToken, proof.purchaseToken);
      await state.holdRestore;
      if (state.loseRestore) throw new Error("lost");
      return Response.json(restored);
    }
    assert.equal(path, "/v1/auth/restore/result");
    assert.deepEqual(body, { operationSecret: secret }, "proof is never replayed");
    if (state.result === "timeout") throw new Error("timeout");
    if (state.result === "unavailable")
      return Response.json({ error: { code: "RESTORE_RESULT_UNAVAILABLE" } }, { status: 404 });
    if (state.result === "failed")
      return Response.json({
        status: "failed",
        error: { code: "PURCHASE_NOT_REGISTERED" },
        expiresAt: state.expiry,
      });
    if (state.result === "pending")
      return Response.json({ status: "pending", expiresAt: state.expiry });
    return Response.json({ status: "completed", session: restored, expiresAt: state.expiry });
  });
  const manager = () =>
    createSessionManager({
      origin: "https://mock.invalid",
      now: () => state.now,
      request,
      makeOperationSecret: async () => {
        secrets++;
        return secret;
      },
      read: async () => raw,
      write: async (value) => {
        const parsed = JSON.parse(value);
        if (state.failCommit && parsed.session?.token === restored.token)
          throw new Error("keychain");
        if (state.failPendingWrite && parsed.operation === "restore") throw new Error("keychain");
        raw = value;
      },
      changed: () => {
        assert.equal(JSON.parse(raw).session.token, restored.token);
        state.changes++;
      },
    });
  return { manager, calls, state, raw: () => raw, secrets: () => secrets };
}
test("operation secret encoding preserves all 32 random bytes as canonical 43-character Base64URL", () => {
  for (const bytes of [
    new Uint8Array(32),
    new Uint8Array(32).fill(255),
    Uint8Array.from({ length: 32 }, (_, i) => i),
  ]) {
    assert.equal(encodeOperationSecret(bytes), Buffer.from(bytes).toString("base64url"));
    assert.equal(encodeOperationSecret(bytes).length, 43);
  }
  assert.throws(() => encodeOperationSecret(new Uint8Array(31)));
});
test("normal restore persists both secrets before Hono dispatch and erases source credentials only on commit", async () => {
  const f = fixture(),
    manager = f.manager();
  await manager.prepareRecovery();
  await manager.restore(proof);
  assert.equal(f.secrets(), 1);
  assert.equal(f.state.changes, 1);
  assert.equal((await manager.get()).token, restored.token);
  assert.ok(
    !f.raw().includes(secret) &&
      !f.raw().includes(fresh.token) &&
      !f.raw().includes(proof.purchaseToken),
  );
  assert.equal(f.calls.length, 2);
});
test("lost response and failed final Keychain write recover the identical session after app restart", async () => {
  for (const failure of ["response", "commit"]) {
    const f = fixture(),
      original = f.manager();
    await original.prepareRecovery();
    f.state.loseRestore = failure === "response";
    f.state.failCommit = failure === "commit";
    await assert.rejects(original.restore(proof));
    f.state.failCommit = false;
    const restarted = f.manager();
    await assert.rejects(restarted.get(), /RECOVERY_REQUIRED/);
    const result = await restarted.retrieveResult();
    assert.equal(result.status, "completed");
    assert.deepEqual((result as any).session, restored);
    assert.equal(f.state.changes, 1);
    assert.equal(f.secrets(), 1);
    assert.equal(f.calls.filter((call) => call.path.endsWith("/restore")).length, 1);
    assert.equal(f.calls.at(-1)?.path, "/v1/auth/restore/result");
    assert.ok(!f.raw().includes(secret) && !f.raw().includes(fresh.token));
  }
});
test("pending, failed, timeout and 404 never unlock ordinary API or extend result expiry", async () => {
  const f = fixture(),
    manager = f.manager();
  await manager.prepareRecovery();
  f.state.loseRestore = true;
  await assert.rejects(manager.restore(proof));
  for (const status of ["pending", "timeout", "failed", "unavailable"]) {
    f.state.result = status;
    f.state.now += 500000;
    if (["timeout", "unavailable"].includes(status)) await assert.rejects(manager.retrieveResult());
    else assert.equal((await manager.retrieveResult()).status, status);
    await assert.rejects(manager.get(), /RECOVERY_REQUIRED/);
    await assert.rejects(manager.prepareRecovery(), /RESTORE_OUTCOME_UNKNOWN/);
    const display = await manager.recoveryState();
    assert.equal(display.expiresAt, 900000);
    assert.ok(
      !JSON.stringify(display).includes(secret) && !JSON.stringify(display).includes(fresh.token),
    );
  }
  assert.equal(f.state.changes, 0);
  assert.equal(f.secrets(), 1);
});
test("pending envelope write failure sends no restore, and failed result commit retains retrieval secrets", async () => {
  const f = fixture(),
    manager = f.manager();
  await manager.prepareRecovery();
  f.state.failPendingWrite = true;
  await assert.rejects(manager.restore(proof));
  assert.equal(f.calls.length, 1);
  f.state.failPendingWrite = false;
  f.state.loseRestore = true;
  await assert.rejects(manager.restore(proof));
  f.state.failCommit = true;
  await assert.rejects(manager.retrieveResult());
  assert.equal(JSON.parse(f.raw()).operationSecret, secret);
  assert.equal(f.state.changes, 0);
  f.state.failCommit = false;
  assert.equal((await manager.retrieveResult()).status, "completed");
});
test("abandonment timeout stays locked; only explicit source-bearer 204/401 permits a later fresh bootstrap", async () => {
  for (const status of [204, 401]) {
    const f = fixture(),
      manager = f.manager();
    await manager.prepareRecovery();
    f.state.loseRestore = true;
    await assert.rejects(manager.restore(proof));
    f.state.revoke = 0;
    await assert.rejects(manager.abandonRecovery());
    await assert.rejects(manager.prepareRecovery(), /RESTORE_OUTCOME_UNKNOWN/);
    assert.equal((await manager.recoveryState()).phase, "abandoning");
    f.state.revoke = status;
    await manager.abandonRecovery();
    assert.equal((await manager.recoveryState()).phase, "abandoned");
    assert.ok(
      !f.raw().includes(secret) && !f.raw().includes(fresh.token) && !f.raw().includes(old.token),
    );
    assert.equal(f.calls.filter((call) => call.path.endsWith("bootstrap")).length, 1);
    await manager.prepareRecovery();
    assert.equal(f.calls.filter((call) => call.path.endsWith("bootstrap")).length, 2);
    assert.equal(f.calls.find((call) => call.path.endsWith("device-sessions"))?.method, "DELETE");
  }
});
test("a late original restore result cannot replace an abandoned operation", async () => {
  const f = fixture();
  let finish!: () => void;
  f.state.holdRestore = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const original = f.manager();
  await original.prepareRecovery();
  const pending = original.restore(proof);
  while (!f.calls.some((call) => call.path.endsWith("/restore")))
    await new Promise((resolve) => setImmediate(resolve));
  // Simulates an old task continuation while another restored runtime abandons it.
  await f.manager().abandonRecovery();
  finish();
  await assert.rejects(pending, /RESTORE_OPERATION_CHANGED/);
  assert.equal((await f.manager().recoveryState()).phase, "abandoned");
  assert.equal(f.state.changes, 0);
});
