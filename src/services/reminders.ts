import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import { mode } from "../api/config";
import { AppError } from "../api/errors";
import type { Switch } from "../domain/models";
import { createReminderController, createReminderIntent } from "./reminder-controller";

export const REMINDER_ID = "dms-local-check-in-v1";
const PREFERENCE = "local-reminders-enabled-v1";
const intent = createReminderIntent();
let snapshot: Switch | null = null;
let problem = "";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function owned() {
  return (await Notifications.getAllScheduledNotificationsAsync()).filter(
    (request) => request.identifier === REMINDER_ID,
  );
}
async function channel() {
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync("check-in-reminders", {
      name: "生存確認のリマインド",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
}
const controller = createReminderController({
  list: async () => (await owned()).map((request) => request.identifier),
  cancel: async (id) => {
    await Notifications.cancelScheduledNotificationAsync(id);
    await Notifications.dismissNotificationAsync(id);
  },
  allowed: async () =>
    mode === "api" &&
    (await SecureStore.getItemAsync(PREFERENCE)) !== "false" &&
    (await Notifications.getPermissionsAsync()).granted,
  schedule: async () => {
    await channel();
    return Notifications.scheduleNotificationAsync({
      identifier: REMINDER_ID,
      content: {
        title: "今の状態を知らせてください",
        body: "アプリを開いて生存確認を行ってください。確認の完了には通信が必要です。",
        data: { type: REMINDER_ID },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
        seconds: 24 * 60 * 60,
        repeats: true,
        channelId: "check-in-reminders",
      },
    });
  },
});

export async function syncReminders(value: Switch | null) {
  // Ignore a delayed status response superseded by a newer server version.
  if (value && snapshot?.userId === value.userId && value.version < snapshot.version) return;
  snapshot = value;
  const active =
    value &&
    ["active", "grace"].includes(value.state) &&
    value.lastCheckInAt !== null &&
    value.entitlement &&
    ["active", "grace"].includes(value.entitlement.status) &&
    value.entitlement.validUntil > value.serverTime;
  try {
    await controller.replace(
      mode === "api" && active ? `${value.userId}:${value.lastCheckInAt}` : null,
    );
    problem = "";
  } catch (error) {
    problem = "端末内のリマインド予約を更新できませんでした。通知設定を確認してください。";
    throw error;
  }
}
export async function cancelReminders() {
  intent.clear();
  await syncReminders(null);
}
export async function enableReminders() {
  if (mode !== "api") throw new AppError("UNCONFIGURED");
  await channel();
  const permission = await Notifications.requestPermissionsAsync();
  if (!permission.granted) throw new AppError("NOTIFICATIONS_DENIED");
  await SecureStore.setItemAsync(PREFERENCE, "true");
  await syncReminders(snapshot);
}
export async function disableReminders() {
  await SecureStore.setItemAsync(PREFERENCE, "false");
  await controller.replace(null);
}
export async function reminderStatus() {
  return {
    permission: (await Notifications.getPermissionsAsync()).status,
    enabled: (await SecureStore.getItemAsync(PREFERENCE)) !== "false",
    scheduled: (await owned()).length > 0,
    problem,
  };
}

// Receipt never sends a check-in. PrivacyGate consumes an explicit tap only
// after a fresh foreground unlock, or while already unlocked in the foreground.
export function observeReminderActions(action: () => void) {
  const receive = (response: Notifications.NotificationResponse | null) => {
    if (
      !response ||
      response.notification.request.identifier !== REMINDER_ID ||
      response.notification.request.content.data?.type !== REMINDER_ID ||
      response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER
    )
      return;
    Notifications.clearLastNotificationResponse();
    const key = `${response.notification.request.identifier}:${response.notification.date}:${response.actionIdentifier}`;
    if (intent.receive(key)) action();
  };
  const listener = Notifications.addNotificationResponseReceivedListener(receive);
  receive(Notifications.getLastNotificationResponse());
  return () => listener.remove();
}
export const takeReminderIntent = () => intent.take();
