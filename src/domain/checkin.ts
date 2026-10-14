// A check-in is a fresh foreground intent, never a persisted/background job.
export function mayCheckIn(input: {
  mode: string;
  appState: string;
  authenticated: boolean;
  intent:
    | "unlock"
    | "button"
    | "notification_action"
    | "notification_received"
    | "background"
    | "purchase_restore";
}) {
  return (
    input.mode === "api" &&
    input.appState === "active" &&
    input.authenticated &&
    ["unlock", "button", "notification_action"].includes(input.intent)
  );
}
