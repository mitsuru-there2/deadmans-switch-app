import type { Switch } from "../domain/models";
export async function syncReminders(_value: Switch | null) {}
export async function cancelReminders() {}
export async function enableReminders() {}
export async function disableReminders() {}
export async function reminderStatus() {
  return { permission: "unavailable", enabled: false, scheduled: false, problem: "" };
}
export function observeReminderActions(_action: () => void) {
  return () => {};
}
export const takeReminderIntent = () => false;
