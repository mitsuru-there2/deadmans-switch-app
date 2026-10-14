import { AppState } from "react-native";
import { gateway } from "../api/adapter";
import { mode } from "../api/config";
import { AppError } from "../api/errors";
import { mayCheckIn } from "../domain/checkin";
let current: Promise<void> | undefined;
export function foregroundCheckIn(intent: "unlock" | "button") {
  if (!mayCheckIn({ mode, appState: AppState.currentState, authenticated: true, intent }))
    return Promise.reject(new AppError("DEMO_ONLY"));
  // Deduplicate simultaneous foreground events. No queue or retry survives this promise.
  return (current ??= gateway.checkIn("foreground").finally(() => {
    current = undefined;
  }));
}
