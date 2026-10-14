import { useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import { createPrivateStore } from "../storage/vault";
import { AppError } from "../api/errors";
import { mode } from "../api/config";
import { Body, Notice, Screen, Title } from "./ui";
let run: Promise<string> | undefined;
async function diagnose() {
  if (!__DEV__ || mode !== "demo") return "診断は開発デモだけで利用できます。";
  const store = createPrivateStore("diagnostic-v1");
  const keyName = "draft-key-diagnostic-v1-v1";
  const marker = await store.readPrivate<string>("fixture");
  if (!marker) {
    await store.writePrivate("fixture", "LOCAL TEST ONLY");
    await store.close();
    if ((await store.readPrivate("fixture")) !== "LOCAL TEST ONLY") throw new Error("read failed");
    await store.close();
    return "PHASE 1 PASS · SQLCipher 保存と再接続読込。アプリのプロセスを終了して再起動してください。";
  }
  if (marker !== "LOCAL TEST ONLY") throw new Error("fixture mismatch");
  await store.close();
  const key = await SecureStore.getItemAsync(keyName);
  if (!key) throw new Error("key missing before test");
  try {
    await SecureStore.deleteItemAsync(keyName); // only this disposable diagnostic key
    let rejected = false;
    try {
      await store.readPrivate("fixture");
    } catch (e) {
      rejected = e instanceof AppError && e.code === "STORAGE_LOCKED";
    }
    if (!rejected || (await SecureStore.getItemAsync(keyName)) !== null)
      throw new Error("failed open");
  } finally {
    await SecureStore.setItemAsync(keyName, key, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    });
  }
  if ((await store.readPrivate("fixture")) !== marker) throw new Error("fixture modified");
  await store.close();
  return "PHASE 2 PASS · 再起動後の復元、鍵喪失時の読込拒否・鍵再発行なし、暗号化DBの内容維持。";
}
export function StorageDiagnostic() {
  const [result, setResult] = useState("検証中…");
  useEffect(() => {
    let active = true;
    run ??= diagnose();
    void run
      .then((value) => {
        if (active) setResult(value);
      })
      .catch(() => {
        if (active) setResult("FAIL · 端末の保存診断は完了していません。");
      });
    return () => {
      active = false;
    };
  }, []);
  return (
    <Screen>
      <Title>暗号化保存の開発診断</Title>
      <Body>{result}</Body>
      <Notice>
        専用の架空データだけを使用します。利用者の下書き・認証・通知・APIには触れません。
      </Notice>
    </Screen>
  );
}
