import assert from "node:assert/strict";
import { test } from "node:test";
import { resolveMode } from "../src/api/config.ts";
import { mayCheckIn } from "../src/domain/checkin.ts";
import {
  messageInputSchema,
  recipientInputSchema,
  settingsInputSchema,
  editable,
  entitled,
  type Switch,
} from "../src/domain/models.ts";
import { templates, composeSection } from "../src/domain/templates.ts";

test("release builds cannot select demo or insecure endpoints", () => {
  assert.equal(resolveMode(false, "demo", "https://example.com"), "unconfigured");
  assert.equal(resolveMode(false, "api", "http://localhost:8787"), "unconfigured");
  assert.equal(resolveMode(true, "api", "http://untrusted.example"), "unconfigured");
  assert.equal(resolveMode(true, "demo", undefined), "demo");
  assert.equal(resolveMode(true, "api", "http://10.0.2.2:8787"), "api");
  assert.equal(resolveMode(false, "api", "https://example.com"), "api");
});
test("only fresh authenticated foreground intent may check in", () => {
  const base = { mode: "api", appState: "active", authenticated: true };
  for (const intent of ["background", "notification_received", "purchase_restore"] as const)
    assert.equal(mayCheckIn({ ...base, intent }), false);
  for (const intent of ["unlock", "button", "notification_action"] as const)
    assert.equal(mayCheckIn({ ...base, intent }), true);
  assert.equal(mayCheckIn({ ...base, intent: "button", authenticated: false }), false);
  assert.equal(mayCheckIn({ ...base, intent: "button", appState: "background" }), false);
  assert.equal(mayCheckIn({ ...base, intent: "button", mode: "demo" }), false);
});
test("server editing states and entitlement expiry are respected", () => {
  for (const state of ["active", "grace", "released"] as const)
    assert.equal(editable({ state } as Switch), false);
  for (const state of ["draft", "paused", "held"] as const)
    assert.equal(editable({ state } as Switch), true);
  assert.equal(
    entitled({ entitlement: { status: "active", validUntil: 100, plan: "basic" } } as Switch, 100),
    false,
  );
  assert.equal(
    entitled({ entitlement: { status: "expired", validUntil: 200, plan: "basic" } } as Switch, 100),
    false,
  );
});
test("message and schedule bounds match API contract", () => {
  assert.equal(messageInputSchema.safeParse({ title: " ", body: "hello" }).success, false);
  assert.equal(
    messageInputSchema.safeParse({ title: "a".repeat(201), body: "hello" }).success,
    false,
  );
  assert.equal(
    messageInputSchema.safeParse({ title: "hello", body: "a".repeat(20001) }).success,
    false,
  );
  assert.equal(
    messageInputSchema.safeParse({ title: "hello", body: "a".repeat(20000) }).success,
    true,
  );
  assert.equal(recipientInputSchema.safeParse({ name: "家族", email: "invalid" }).success, false);
  assert.equal(settingsInputSchema.safeParse({ inactivityDays: 7, graceDays: 3 }).success, true);
  assert.equal(settingsInputSchema.safeParse({ inactivityDays: 6, graceDays: 31 }).success, false);
});
test("seven editable writing definitions include private requests without inventing answers", () => {
  assert.equal(templates.length, 7);
  const t = templates.find((t) => t.id === "private")!;
  const text = composeSection(t, [" 本棚を見てください ", "", ""]);
  assert.ok(text.includes("秘密の依頼"));
  assert.ok(text.includes("本棚を見てください"));
  assert.ok(!text.includes(t.questions[1]!));
});
