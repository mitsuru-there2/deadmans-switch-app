import * as LocalAuthentication from "expo-local-authentication";
import { AppError } from "../api/errors";
export async function unlock() {
  if (
    (await LocalAuthentication.getEnrolledLevelAsync()) === LocalAuthentication.SecurityLevel.NONE
  )
    throw new AppError("LOCK_REQUIRED");
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: "伝言を開く",
    cancelLabel: "キャンセル",
    disableDeviceFallback: false,
  });
  return result.success;
}
