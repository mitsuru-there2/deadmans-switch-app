import assert from "node:assert/strict";
import { test } from "node:test";
import { createRequire } from "node:module";
import {
  createReminderController,
  createReminderIntent,
} from "../src/services/reminder-controller.ts";
const { loader } = createRequire(import.meta.url)("./review-harness.cjs");

test("unchanged status keeps the timer; new check-in resets it and stop cancels it", async () => {
  const pending = new Set<string>();
  let calls = 0;
  const controller = createReminderController({
    list: async () => [...pending],
    cancel: async (id) => {
      pending.delete(id);
    },
    allowed: async () => true,
    schedule: async () => {
      const id = `${++calls}`;
      pending.add(id);
      return id;
    },
  });
  await controller.replace("user:check-in-1");
  await controller.replace("user:check-in-1");
  assert.equal(calls, 1);
  await controller.replace("user:check-in-2");
  assert.deepEqual([...pending], ["2"]);
  await controller.replace(null);
  assert.equal(pending.size, 0);
});

test("stop wins when the native scheduler completes after cancellation was requested", async () => {
  let finish!: (id: string) => void;
  let started!: () => void;
  const scheduling = new Promise<void>((resolve) => {
    started = resolve;
  });
  const pending = new Set<string>();
  const controller = createReminderController({
    list: async () => [...pending],
    cancel: async (id) => {
      pending.delete(id);
    },
    allowed: async () => true,
    schedule: () => {
      started();
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
  });
  const first = controller.replace("active");
  await scheduling;
  const stop = controller.replace(null);
  pending.add("late");
  finish("late");
  await Promise.all([first, stop]);
  assert.equal(pending.size, 0);
});

test("schedule failure does not poison a later explicit retry", async () => {
  let failed = false;
  const controller = createReminderController({
    list: async () => [],
    cancel: async () => {},
    allowed: async () => true,
    schedule: async () => {
      if (!failed) {
        failed = true;
        throw Error("OS unavailable");
      }
      return "ok";
    },
  });
  await assert.rejects(controller.replace("active"), /OS unavailable/);
  await controller.replace("active");
});

test("notification intent is single use, duplicate suppressed and expires without a fresh unlock", () => {
  let now = 100;
  const intent = createReminderIntent(() => now);
  assert.equal(intent.receive("one"), true);
  assert.equal(intent.take(), true);
  assert.equal(intent.take(), false);
  assert.equal(intent.receive("one"), false);
  intent.receive("two");
  now += 120_001;
  assert.equal(intent.take(), false);
  intent.receive("three");
  intent.clear();
  assert.equal(intent.take(), false);
});

function nativeHarness() {
  const pending = new Map<string, any>();
  const prefs = new Map<string, string>();
  let allowed = true;
  let listener: (event: any) => void = () => {};
  let scheduled = 0;
  const load = loader({
    "expo-notifications": {
      setNotificationHandler() {},
      getAllScheduledNotificationsAsync: async () => [...pending.values()],
      cancelScheduledNotificationAsync: async (id: string) => {
        pending.delete(id);
      },
      dismissNotificationAsync: async () => {},
      getPermissionsAsync: async () => ({
        granted: allowed,
        status: allowed ? "granted" : "denied",
      }),
      requestPermissionsAsync: async () => ({
        granted: allowed,
        status: allowed ? "granted" : "denied",
      }),
      scheduleNotificationAsync: async (request: any) => {
        scheduled++;
        pending.set(request.identifier, request);
        return request.identifier;
      },
      SchedulableTriggerInputTypes: { TIME_INTERVAL: "timeInterval" },
      DEFAULT_ACTION_IDENTIFIER: "tap",
      clearLastNotificationResponse() {},
      getLastNotificationResponse: () => null,
      addNotificationResponseReceivedListener(callback: typeof listener) {
        listener = callback;
        return { remove() {} };
      },
    },
    "expo-secure-store": {
      getItemAsync: async (key: string) => prefs.get(key) ?? null,
      setItemAsync: async (key: string, value: string) => {
        prefs.set(key, value);
      },
    },
    "react-native": { Platform: { OS: "ios" } },
    "../api/config": { mode: "api" },
  });
  const service = load("src/services/reminders.ts");
  const snapshot = {
    userId: "owner",
    state: "active",
    version: 2,
    lastCheckInAt: 100,
    serverTime: 100,
    entitlement: { status: "active", validUntil: 10000 },
  };
  return {
    service,
    snapshot,
    pending,
    deny: () => {
      allowed = false;
    },
    scheduled: () => scheduled,
    receive: (event: any) => listener(event),
  };
}

test("native reminders need no EAS token; permission and monitoring state control only owned schedules", async () => {
  const h = nativeHarness();
  h.pending.set("unrelated", { identifier: "unrelated" });
  await h.service.syncReminders(h.snapshot);
  const request = h.pending.get(h.service.REMINDER_ID);
  assert.equal(request.trigger.seconds, 86400);
  assert.equal(request.trigger.repeats, true);
  await h.service.syncReminders(h.snapshot);
  assert.equal(h.scheduled(), 1);
  for (const state of ["paused", "held", "released", "draft"]) {
    await h.service.syncReminders({ ...h.snapshot, state });
    assert.equal(h.pending.has(h.service.REMINDER_ID), false);
    await h.service.syncReminders(h.snapshot);
  }
  h.deny();
  await h.service.syncReminders(h.snapshot);
  assert.equal(h.pending.has(h.service.REMINDER_ID), false);
  assert.equal(h.pending.has("unrelated"), true);
});

test("new server check-in resets timer; delayed old versions and inactive contracts cannot revive it", async () => {
  const h = nativeHarness();
  await h.service.syncReminders(h.snapshot);
  await h.service.syncReminders({ ...h.snapshot, version: 3, lastCheckInAt: 200 });
  assert.equal(h.scheduled(), 2);
  await h.service.syncReminders({ ...h.snapshot, version: 4, state: "held" });
  await h.service.syncReminders(h.snapshot);
  assert.equal(h.pending.size, 0);
  await h.service.syncReminders({
    ...h.snapshot,
    version: 5,
    entitlement: { status: "expired", validUntil: 10000 },
  });
  assert.equal(h.pending.size, 0);
  await h.service.syncReminders({ ...h.snapshot, version: 6 });
  await h.service.cancelReminders();
  assert.equal(h.pending.size, 0);
});

test("explicit local disable survives later status reads; a tap creates intent without a check-in", async () => {
  const h = nativeHarness();
  await h.service.syncReminders(h.snapshot);
  await h.service.disableReminders();
  await h.service.syncReminders({ ...h.snapshot, version: 3 });
  assert.equal(h.pending.size, 0);
  await h.service.enableReminders();
  assert.equal(h.pending.size, 1);
  let actions = 0;
  h.service.observeReminderActions(() => {
    actions++;
  });
  const response = {
    actionIdentifier: "tap",
    notification: {
      date: 100,
      request: {
        identifier: h.service.REMINDER_ID,
        content: { data: { type: h.service.REMINDER_ID } },
      },
    },
  };
  h.receive(response);
  h.receive(response);
  assert.equal(actions, 1);
  assert.equal(h.service.takeReminderIntent(), true);
  assert.equal(h.service.takeReminderIntent(), false);
  h.receive({ ...response, actionIdentifier: "dismiss" });
  assert.equal(actions, 1);
});

test("a delayed pre-pause status cannot reschedule reminders after server pause", async () => {
  let resolveOld!: (value: unknown) => void;
  let reads = 0;
  const observed: unknown[] = [];
  const paused = { user: { id: "u" }, switch: { state: "paused" } };
  const load = loader({
    "react-native": { Platform: { OS: "ios" } },
    "./config": { mode: "api", apiUrl: "https://example.invalid" },
    "./session": {
      identityRevision: () => 0,
      subscribeIdentity: () => () => {},
      getSession: async () => ({ token: "token" }),
    },
    "./live": {
      createLiveGateway: () => ({
        me: () =>
          ++reads === 1
            ? new Promise((resolve) => {
                resolveOld = resolve;
              })
            : Promise.resolve(paused),
        pause: async () => {},
      }),
    },
    "../services/reminders": {
      syncReminders: async (value: unknown) => {
        observed.push(value);
      },
      cancelReminders: async () => {
        observed.push(null);
      },
    },
    "../storage/vault": {},
  });
  const { gateway } = load("src/api/adapter.ts");
  const old = gateway.me();
  await gateway.pause();
  resolveOld({ switch: { state: "active" } });
  await old;
  assert.deepEqual(JSON.parse(JSON.stringify(observed)), [null, paused.switch]);
});

test("notification action remains pending while locked and is sent only after a fresh unlock", async () => {
  const states: unknown[] = [];
  let cursor = 0;
  let pending = false;
  let action!: () => void;
  const sent: string[] = [];
  const jsx = (type: unknown, props: unknown) => ({ type, props });
  const load = loader({
    react: {
      useState(initial: unknown) {
        const i = cursor++;
        if (!(i in states)) states[i] = initial;
        return [
          states[i],
          (value: unknown) => {
            states[i] = value;
          },
        ];
      },
      useEffect(fn: () => void) {
        fn();
      },
    },
    "react/jsx-runtime": { jsx, jsxs: jsx },
    "react-native": {
      AppState: { currentState: "active", addEventListener: () => ({ remove() {} }) },
      Platform: { OS: "ios" },
      View: "View",
      StyleSheet: { absoluteFill: {} },
    },
    "@tanstack/react-query": {
      useQueryClient: () => ({ setQueryData() {}, invalidateQueries: async () => {} }),
    },
    "expo-screen-capture": { usePreventScreenCapture() {} },
    "../api/config": { mode: "api" },
    "../billing/service": { suppressBillingCheckIn: () => false },
    "../api/adapter": {
      gateway: {
        me: async () => ({
          switch: { entitlement: { status: "active", validUntil: Date.now() + 86400000 } },
        }),
      },
    },
    "../services/checkin": {
      foregroundCheckIn: async (kind: string) => {
        sent.push(kind);
      },
    },
    "../services/reminders": {
      observeReminderActions(callback: () => void) {
        action = callback;
        return () => {};
      },
      takeReminderIntent() {
        const value = pending;
        pending = false;
        return value;
      },
    },
    "../services/privacy": { unlock: async () => true },
    "./ui": {
      usePalette: () => ({}),
      Action: "Action",
      Body: "Body",
      Notice: "Notice",
      Title: "Title",
    },
  });
  const { PrivacyGate } = load("src/components/PrivacyGate.tsx");
  cursor = 0;
  const tree = PrivacyGate({ children: null });
  pending = true;
  action();
  assert.equal(sent.length, 0);
  function button(node: any): any {
    if (Array.isArray(node)) return node.map(button).find(Boolean);
    if (node?.type === "Action") return node.props;
    return node?.props ? button(node.props.children) : undefined;
  }
  await button(tree).onPress();
  assert.deepEqual(sent, ["notification_action"]);
  assert.equal(pending, false);
});
