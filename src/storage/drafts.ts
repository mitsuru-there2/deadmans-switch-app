import type { Draft } from "../domain/models";
import { readPrivate, writePrivate, removePrivate } from "./vault";
// Scope draft keys to API origin + user ID to prevent cross-account drafts after recovery.
const key = (scope: string, recipientId: string) => `draft:${scope}:${recipientId}`;
export const getDraft = (scope: string, recipientId: string) =>
  readPrivate<Draft>(key(scope, recipientId));
export const saveDraft = (scope: string, draft: Draft) =>
  writePrivate(key(scope, draft.recipientId), draft);
export const deleteDraft = (scope: string, recipientId: string) =>
  removePrivate(key(scope, recipientId));
