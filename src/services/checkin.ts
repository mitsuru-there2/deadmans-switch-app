import { AppState } from "react-native";
import { gateway } from "../api/adapter";
import { mode } from "../api/config";
import { AppError } from "../api/errors";
import { mayCheckIn } from "../domain/checkin";
import { foregroundAuthority } from "./foreground";
let current: { generation: number; promise: Promise<void> } | undefined;
export function foregroundCheckIn(
  intent: "unlock" | "button" | "notification_action",
  generation = foregroundAuthority.current(),
) {
  const authorizeSend = () => {
    if (
      !mayCheckIn({
        mode,
        appState: AppState.currentState,
        authenticated: foregroundAuthority.valid(generation),
        intent,
      })
    )
      throw new AppError("STALE_CHECKIN_INTENT");
  };
  try {
    authorizeSend();
  } catch (e) {
    return Promise.reject(e);
  }
  if (current?.generation === generation) return current.promise;
  // The gateway checks again after async auth-header resolution, immediately
  // before dispatch. Already dispatched HTTP requests cannot be recalled.
  const promise = gateway
    .checkIn(intent === "notification_action" ? "notification_action" : "foreground", authorizeSend)
    .finally(() => {
      if (current?.promise === promise) current = undefined;
    });
  current = { generation, promise };
  return promise;
}
