export type EditableMessage = { title: string; body: string };
export const matchesSnapshot = (current: EditableMessage, snapshot: EditableMessage) =>
  current.title === snapshot.title && current.body === snapshot.body;
// A save acknowledgement belongs only to the submitted snapshot. Never adopt
// a later /me version, which may already describe another writer's message.
export function savedSnapshotState(snapshot: EditableMessage, current: EditableMessage, acknowledgedVersion: number) {
  return { baseVersion: acknowledgedVersion, clearDraft: matchesSnapshot(current, snapshot) };
}
