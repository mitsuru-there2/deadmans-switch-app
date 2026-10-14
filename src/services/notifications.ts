import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { mode } from "../api/config";
import { AppError } from "../api/errors";
const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? Constants.easConfig?.projectId;
export const notificationConfigured = mode === "api" && !!projectId;
export const notificationSetup = projectId
  ? "通知の許可とサーバーへの登録は別です。下の操作で、この端末の登録・更新を行います。"
  : "EAS projectId と APNs / FCM の設定が必要です。現在はサーバーへの通知登録を行えません。";
export async function notificationPermission() {
  return (await Notifications.getPermissionsAsync()).status;
}
export async function requestNotificationPermission() {
  return (await Notifications.requestPermissionsAsync()).status;
}
// Only call from an explicit foreground button. No receive/background check-in.
export async function currentPushToken(): Promise<string> {
  if (!notificationConfigured || !projectId) throw new AppError("NOTIFICATIONS_UNCONFIGURED");
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync("default", {
      name: "見守りの確認",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  let permission = await Notifications.getPermissionsAsync();
  if (permission.status !== "granted") permission = await Notifications.requestPermissionsAsync();
  if (permission.status !== "granted") throw new AppError("NOTIFICATIONS_DENIED");
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}
export function observeTokenChange(changed: () => void): () => void {
  // Tokens changing only mark the UI stale; user explicitly registers the new token.
  const listener = Notifications.addPushTokenListener(() => changed());
  return () => listener.remove();
}
