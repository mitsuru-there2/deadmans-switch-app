import { AppState } from "react-native";
import { createForegroundAuthority } from "../domain/foreground-authority";
export const foregroundAuthority = createForegroundAuthority(() => AppState.currentState === "active");
AppState.addEventListener("change", (state) => { if (state !== "active") foregroundAuthority.lock(); });
