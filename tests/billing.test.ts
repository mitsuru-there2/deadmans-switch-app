import { test } from "node:test";
import assert from "node:assert/strict";
import { createSessionManager, SessionRequestRejected } from "../src/api/session-core.ts";
import { completePurchase, purchaseProof, allowedCandidates } from "../src/billing/core.ts";
import { createLiveGateway } from "../src/api/live.ts";
const accountToken = "11111111-1111-4111-8111-111111111111";
const old = {
  token: "o".repeat(40),
  expiresAt: 180 * 86400000,
  userId: "old",
  accountToken,
};
const temporary = { ...old, token: "f".repeat(40), userId: "fresh" };
const restored = { ...old, token: "r".repeat(40) };
const proof = {
  store: "google" as const,
  purchaseToken: "test-purchase-token",
};
function fixture() {
  let raw = JSON.stringify({
    origin: "https://mock.invalid",
    pending: false,
    session: old,
  });
  const calls: { path: string; token?: string; body?: unknown }[] = [];
  let failure: Error | undefined;
  let failFinalWrite = false;
  let changes = 0;
  const manager = createSessionManager({
    origin: "https://mock.invalid",
    now: () => 0,
    makeOperationSecret: async () => "S".repeat(43),
    read: async () => raw,
    write: async (value) => {
      if (failFinalWrite && JSON.parse(value).session?.token === restored.token)
        throw new Error("keychain unavailable");
      raw = value;
    },
    request: async (path, token, body) => {
      calls.push({ path, token, body });
      if (path.endsWith("bootstrap")) return temporary;
      assert.equal(JSON.parse(raw).operation, "restore", "pending record must precede HTTP");
      if (failure) throw failure;
      return restored;
    },
    changed: () => {
      assert.equal(JSON.parse(raw).session.token, restored.token);
      changes++;
    },
  });
  return {
    manager,
    calls,
    raw: () => raw,
    changes: () => changes,
    fail: (error: Error) => {
      failure = error;
    },
    failWrite: () => {
      failFinalWrite = true;
    },
  };
}
test("restoration uses a fresh bearer and atomically commits all server credentials before identity change", async () => {
  const f = fixture();
  await f.manager.prepareRecovery();
  await f.manager.prepareRecovery();
  await assert.rejects(f.manager.get(), /RECOVERY_REQUIRED/);
  assert.equal(f.calls.length, 1, "do not issue another recovery bootstrap");
  assert.equal((await f.manager.restore(proof)).token, restored.token);
  assert.equal((await f.manager.get()).accountToken, accountToken);
  assert.deepEqual(
    f.calls.map((c) => c.path),
    ["/v1/auth/bootstrap", "/v1/auth/restore"],
  );
  assert.equal(f.calls[1]?.token, temporary.token);
  assert.equal(f.changes(), 1);
  assert.ok(!f.raw().includes(proof.purchaseToken), "purchase proof is not persisted");
});
test("lost restore response and final Keychain write failure never reuse old bearer, bootstrap or retry", async () => {
  for (const failure of ["response", "write"]) {
    const f = fixture();
    await f.manager.prepareRecovery();
    if (failure === "response") f.fail(new Error("lost response"));
    else f.failWrite();
    await assert.rejects(f.manager.restore(proof));
    await assert.rejects(f.manager.get(), /RECOVERY_REQUIRED/);
    await assert.rejects(f.manager.prepareRecovery(), /RESTORE_OUTCOME_UNKNOWN/);
    await assert.rejects(f.manager.restore(proof), /RESTORE_OUTCOME_UNKNOWN/);
    assert.equal(f.calls.length, 2);
    assert.equal(f.changes(), 0);
    assert.equal(JSON.parse(f.raw()).operation, "restore");
  }
});
test("definitive restore rejection stays bound to its original operation and fresh identity", async () => {
  const f = fixture();
  await f.manager.prepareRecovery();
  f.fail(new SessionRequestRejected("PURCHASE_NOT_REGISTERED"));
  await assert.rejects(f.manager.restore(proof), /PURCHASE_NOT_REGISTERED/);
  await assert.rejects(f.manager.prepareRecovery(), /RESTORE_OUTCOME_UNKNOWN/);
  assert.equal(f.calls.length, 2);
  await assert.rejects(f.manager.get(), /RECOVERY_REQUIRED/);
});
test("lost recovery bootstrap stays blocked across manager reload", async () => {
  let raw: string | null = null;
  let calls = 0;
  const deps = {
    origin: "https://mock.invalid",
    read: async () => raw,
    write: async (value: string) => {
      raw = value;
    },
    now: () => 0,
    makeOperationSecret: async () => "S".repeat(43),
    changed() {},
    request: async () => {
      calls++;
      throw new Error("lost");
    },
  };
  await assert.rejects(createSessionManager(deps).prepareRecovery());
  await assert.rejects(createSessionManager(deps).prepareRecovery(), /RESTORE_OUTCOME_UNKNOWN/);
  await assert.rejects(createSessionManager(deps).get(), /RECOVERY_REQUIRED/);
  assert.equal(calls, 1);
});
test("purchase grants no client entitlement and refreshes only after actual server verification", async () => {
  const calls: string[] = [];
  await completePurchase(
    {
      purchase: async () => {
        calls.push("store");
        return { transactionIdentifier: "123" };
      },
      verify: async (value) => {
        calls.push("verify");
        assert.deepEqual(value, { store: "apple", transactionId: "123" });
      },
      refresh: async () => {
        calls.push("refresh");
      },
    },
    "apple",
  );
  assert.deepEqual(calls, ["store", "verify", "refresh"]);
  calls.length = 0;
  await assert.rejects(
    completePurchase(
      {
        purchase: async () => ({ transactionIdentifier: "123" }),
        verify: async () => {
          throw new Error("server rejected");
        },
        refresh: async () => {
          calls.push("refresh");
        },
      },
      "apple",
    ),
  );
  assert.equal(calls.length, 0);
  assert.throws(
    () =>
      purchaseProof("google", {
        transactionIdentifier: "GPA.order-number",
        purchaseToken: null,
      }),
    /PURCHASE_PROOF_MISSING/,
  );
});
test("multiple proofs remain separate, wrong platform and unconfigured products are excluded", () => {
  const input = [
    { productIds: ["annual"], proof },
    {
      productIds: ["annual"],
      proof: { ...proof, purchaseToken: "other-owner-token" },
    },
    { productIds: ["unknown"], proof },
    {
      productIds: ["annual"],
      proof: { store: "apple" as const, signedTransaction: "fake-jws" },
    },
  ];
  assert.equal(allowedCandidates(input, ["annual"], "google").length, 2);
});
test("billing uses actual Hono routes; received acknowledgement still requires subscription reread", async () => {
  const calls: string[] = [];
  const api = createLiveGateway("https://mock.invalid", {
    headers: { Authorization: "Bearer MOCK" },
    fetch: async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(input)).pathname;
      calls.push(path);
      if (path.endsWith("account"))
        return Response.json({
          accountToken,
          products: { apple: { annual: "basic" }, google: {} },
        });
      if (path.endsWith("verify")) {
        assert.deepEqual(JSON.parse(String(init?.body)), {
          store: "apple",
          transactionId: "123",
        });
        return Response.json({ received: true });
      }
      return Response.json({ subscriptions: [] });
    },
  });
  await api.billingAccount();
  await api.verifyPurchase({ store: "apple", transactionId: "123" });
  await api.subscriptions();
  assert.deepEqual(calls, [
    "/v1/billing/account",
    "/v1/billing/verify",
    "/v1/billing/subscriptions",
  ]);
});
test("recovery can be cancelled only before an ambiguous restore and only to a known usable prior identity", async () => {
  const f = fixture();
  await f.manager.prepareRecovery();
  await f.manager.cancelRecovery();
  assert.equal((await f.manager.get()).token, old.token);
  await f.manager.prepareRecovery();
  f.fail(new Error("lost"));
  await assert.rejects(f.manager.restore(proof));
  await assert.rejects(f.manager.cancelRecovery(), /RESTORE_OUTCOME_UNKNOWN/);
});
test("background invalidation during the pending Keychain write discards an unsent restoration", async () => {
  const f = fixture();
  await f.manager.prepareRecovery();
  let checks = 0;
  await assert.rejects(
    f.manager.restore(proof, () => {
      if (++checks === 2) throw new Error("locked");
    }),
    /locked/,
  );
  assert.equal(f.calls.length, 1, "no restore HTTP dispatched");
  assert.equal(JSON.parse(f.raw()).operation, "recovery-ready");
});
