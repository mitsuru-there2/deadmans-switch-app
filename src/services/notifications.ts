import * as Notifications from "expo-notifications";
// Receiving a push must never authenticate, check in, or update a deadline.
// Registration with the server stays disabled until project credentials are configured.
export async function notificationPermission() {
  return (await Notifications.getPermissionsAsync()).status;
}
export async function requestNotificationPermission() {
  return (await Notifications.requestPermissionsAsync()).status;
}
export const notificationSetup =
  "通知の配信設定は未完了です。許可だけではサーバーへ端末登録されません。";
