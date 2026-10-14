import { AppError } from "../api/errors";
export const notificationConfigured = false;
export async function notificationPermission() {
  return "unavailable";
}
export async function requestNotificationPermission() {
  return "unavailable";
}
export async function currentPushToken(): Promise<string> {
  throw new AppError("NOTIFICATIONS_UNCONFIGURED");
}
export function observeTokenChange(_changed: () => void) {
  return () => {};
}
export const notificationSetup = "ブラウザの開発プレビューでは通知を登録しません。";
