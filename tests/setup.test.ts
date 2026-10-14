import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createLiveGateway } from "../src/api/live.ts";
import { contactToken, testSucceeded, canActivate, canInvite } from "../src/domain/setup.ts";
import type { Switch, Recipient } from "../src/domain/models.ts";
const now = Date.now();
const state: Switch = {
  id: "p",
  userId: "u",
  state: "paused",
  version: 5,
  inactivityDays: 30,
  graceDays: 7,
  lastCheckInAt: null,
  confirmationDueAt: null,
  earliestReleaseAt: null,
  holdReason: null,
  consentVersion: "v2",
  serverTime: now,
  activationBlockers: [],
  entitlement: { plan: "basic", status: "active", validUntil: now + 86400000 },
};
const recipient: Recipient = {
  id: "r",
  name: "Test",
  email: "family@example.com",
  status: "pending",
  channel: "email",
  acceptedAt: null,
  invitationExpiresAt: null,
  nextInvitationAt: now,
};
test("owner setup follows actual Hono client routes without sending any network request", async () => {
  const calls: { path: string; method: string; json?: Record<string, unknown> }[] = [];
  let activated = false;
  const gateway = createLiveGateway("https://mock.invalid", {
    headers: { Authorization: "Bearer mock-only" },
    fetch: async (input, init) => {
      const path = new URL(String(input)).pathname;
      const method = init?.method ?? "GET";
      const json = init?.body ? JSON.parse(String(init.body)) : undefined;
      calls.push({ path, method, json });
      assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer mock-only");
      if (method === "DELETE") return new Response(null, { status: 204 });
      const values: Record<string, unknown> = {
        "/v1/me": {
          user: { id: "u", email: "me@example.com", emailVerified: true },
          switch: { ...state, state: activated ? "active" : "paused" },
        },
        "/v1/contact-email": { queued: true },
        "/v1/contact-email/confirm": { verified: true },
        "/v1/recipients/r/invite": { queued: true },
        "/v1/self-test": { queued: true, deliveryId: "d" },
        "/v1/deliveries": {
          deliveries: [
            { id: "d", recipientId: null, kind: "self_test", state: "pending", createdAt: now },
          ],
        },
        "/v1/devices":
          method === "POST" ? { id: "device" } : { devices: [{ id: "device", createdAt: now }] },
        "/v1/consents/current": {
          version: "v2",
          language: "ja",
          effectiveAt: now,
          title: "確認",
          body: "全文の同意文",
        },
        "/v1/switch/activate": { version: 6 },
        "/v1/switch/pause": { version: 7 },
      };
      assert.ok(path in values, path);
      if (path === "/v1/switch/activate") activated = true;
      return Response.json(values[path]);
    },
  });
  await gateway.requestContact({ name: "Test", email: "me@example.com" });
  await gateway.confirmContact("a".repeat(32));
  await gateway.invite("r");
  const queued = await gateway.selfTest();
  const deliveries = await gateway.deliveries();
  assert.equal(queued.deliveryId, deliveries[0]?.id);
  assert.equal(testSucceeded(deliveries[0]), false, "202/pending must not become test success");
  assert.equal(testSucceeded({ ...deliveries[0]!, state: "accepted" }), true);
  const consent = await gateway.consent();
  await gateway.activate(state.version, consent.version);
  assert.equal((await gateway.me()).switch.state, "active");
  await gateway.pause();
  const device = await gateway.registerDevice("ExpoPushToken[mock]");
  assert.equal((await gateway.devices())[0]?.id, device.id);
  await gateway.removeDevice(device.id);
  assert.deepEqual(calls.find((c) => c.path === "/v1/switch/activate")?.json, {
    version: 5,
    consentVersion: "v2",
    confirmed: true,
  });
  assert.equal(
    calls.some((c) => c.path.includes("check-ins")),
    false,
    "reads, activation, notifications never implicitly check in",
  );
  assert.ok(
    calls.every((c) => !c.path.includes("a".repeat(32))),
    "proof never enters a URL",
  );
});
test("lost mutation responses and stale consent/conflict errors are not retried", async () => {
  for (const code of ["VERSION_CONFLICT", "CONSENT_VERSION_REQUIRED"]) {
    let calls = 0;
    const gateway = createLiveGateway("https://mock.invalid", {
      fetch: async () => {
        calls++;
        return Response.json({ error: { code } }, { status: 409 });
      },
    });
    await assert.rejects(gateway.activate(5, "old"), { code });
    assert.equal(calls, 1);
  }
  let calls = 0;
  const gateway = createLiveGateway("https://mock.invalid", {
    fetch: async () => {
      calls++;
      throw new Error("connection lost");
    },
  });
  await assert.rejects(gateway.selfTest());
  assert.equal(calls, 1);
});
test("invitation and activation require server readiness, explicit stopped state, and cooldown", () => {
  assert.equal(canActivate(state), true);
  for (const status of ["active", "grace", "released"] as const)
    assert.equal(canActivate({ ...state, state: status }), false);
  assert.equal(canActivate({ ...state, activationBlockers: ["SELF_TEST_REQUIRED"] }), false);
  assert.equal(canInvite(recipient, state), true);
  assert.equal(canInvite({ ...recipient, nextInvitationAt: now + 1 }, state), false);
  for (const status of ["accepted", "declined", "reported"] as const)
    assert.equal(canInvite({ ...recipient, status }, state), false);
});
test("contact confirmation accepts only a bounded token or correct fragment link", () => {
  const token = "a".repeat(32);
  assert.equal(contactToken(`https://example.com/confirm-contact#${token}`), token);
  for (const input of [
    `https://example.com/confirm-contact?token=${token}`,
    `https://example.com/receive#${token}`,
    `javascript:${token}`,
    "short",
    "a".repeat(257),
  ])
    assert.equal(contactToken(input), null);
});
test("patched decoder preserves CommonJS and query-string semantics without exponential fallback", async () => {
  const require = createRequire(import.meta.url);
  const query = require("query-string");
  const decoder = require("../vendor/decode-uri-component");
  const vectors = [
    "%E3%81%82",
    "%41%FF%42",
    "%FE%FF",
    "hello+world",
    "%C2",
    "100%",
    "%F0%9F%92%A9",
  ];
  for (const vector of vectors) assert.equal(typeof decoder(vector), "string");
  assert.equal(decoder("hello+world"), "hello world");
  assert.deepEqual(
    { ...query.parse("name=%E3%81%82&space=a+b&bad=%41%FF%42") },
    { name: "あ", space: "a b", bad: "A%FFB" },
  );
  const start = performance.now();
  decoder("%FF".repeat(20000));
  assert.ok(performance.now() - start < 1000);
  const xcode = require("xcode");
  const project = xcode.project("unused");
  project.hash = { project: { objects: {} } };
  assert.match(project.generateUuid(), /^[A-F0-9]{24}$/);
});

test("scene migration is idempotent and preserves Expo event forwarding", () => {
  const require = createRequire(import.meta.url);
  const { migrate } = require("../plugins/with-scene-lifecycle.cjs");
  const before = `class AppDelegate: ExpoAppDelegate {
#if os(iOS) || os(tvOS)
    window = UIWindow(frame: UIScreen.main.bounds)
    factory.startReactNative(withModuleName: "main", in: window, launchOptions: launchOptions)
#endif
return super.application(application, didFinishLaunchingWithOptions: launchOptions)
}`;
  const after = migrate(before);
  assert.equal(migrate(after), after);
  assert.match(after, /ExpoReactNativeFactoryProvider/);
  assert.match(after, /super.application/);
  assert.equal(after.includes("factory.startReactNative("), false);
  assert.throws(() => migrate("unexpected template"));
});
