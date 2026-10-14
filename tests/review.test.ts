import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { savedSnapshotState } from "../src/domain/editor-save.ts";
const harness = createRequire(import.meta.url)("./review-harness.cjs");
test("check-in does not dispatch when backgrounded during credential renewal", harness.checkinWhileBackground);
test("stale unlock cannot check in after background and foreground without reauthentication", harness.staleUnlockAfterRelock);
test("template insertion is blocked during message save, including stale click handlers", harness.templateDuringSave);
test("message editor keeps the save acknowledgement version when another writer advances me", harness.adoptsOtherWriterVersion);
test("changed content is never marked clean or eligible for draft deletion by an older save", () => {
  assert.deepEqual(savedSnapshotState({ title: "a", body: "A" }, { title: "a", body: "B" }, 6), { baseVersion: 6, clearDraft: false });
});
