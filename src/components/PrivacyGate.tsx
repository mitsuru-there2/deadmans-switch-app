import { foregroundAuthority } from "../services/foreground";
import { suppressBillingCheckIn } from "../billing/service";
import { useEffect, useState, type PropsWithChildren } from "react";
import { AppState, Platform, View, StyleSheet } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { usePreventScreenCapture } from "expo-screen-capture";
import { mode } from "../api/config";
import { errorText } from "../api/errors";
import { gateway } from "../api/adapter";
import { entitled } from "../domain/models";
import { foregroundCheckIn } from "../services/checkin";
import { unlock } from "../services/privacy";
import { Action, Body, Notice, Title, usePalette } from "./ui";
export function PrivacyGate({ children }: PropsWithChildren) {
  usePreventScreenCapture();
  const p = usePalette();
  const client = useQueryClient();
  const [opened, setOpened] = useState(mode === "demo" || mode === "unconfigured");
  const [mounted, setMounted] = useState(opened);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active" && mode === "api") setOpened(false);
    });
    return () => {
      sub.remove();
      foregroundAuthority.lock();
    };
  }, []);
  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      {mounted && (
        <View
          style={{ flex: 1, opacity: opened ? 1 : 0 }}
          pointerEvents={opened ? "auto" : "none"}
          accessibilityElementsHidden={!opened}
          importantForAccessibility={opened ? "auto" : "no-hide-descendants"}
        >
          {children}
        </View>
      )}
      {!opened && (
        <View
          style={[
            StyleSheet.absoluteFill,
            {
              justifyContent: "center",
              padding: 28,
              gap: 24,
              backgroundColor: p.bg,
            },
          ]}
        >
          <Title>私に何かあったら</Title>
          <Body>この端末の認証で、あなたの伝言を開きます。</Body>
          <Notice>
            端末のロック解除はサーバーの本人確認とは別です。認証後、接続できた場合に今の確認を送ります。
          </Notice>
          {message ? <Notice error>{message}</Notice> : null}
          <Action
            label={busy ? "確認中…" : "ロックを解除"}
            disabled={busy || Platform.OS === "web"}
            onPress={async () => {
              setBusy(true);
              const generation = foregroundAuthority.beginUnlock();
              try {
                if ((await unlock()) && foregroundAuthority.completeUnlock(generation)) {
                  setMounted(true);
                  setOpened(true);
                  try {
                    const me = await gateway.me();
                    if (
                      !suppressBillingCheckIn() &&
                      foregroundAuthority.valid(generation) &&
                      entitled(me.switch)
                    )
                      await foregroundCheckIn("unlock", generation);
                    client.setQueryData(["foreground-error"], "");
                    await client.invalidateQueries();
                  } catch (e) {
                    client.setQueryData(["foreground-error"], errorText(e));
                  }
                }
              } catch (e) {
                setMessage(errorText(e));
              } finally {
                setBusy(false);
              }
            }}
          />
          {Platform.OS === "web" && (
            <Notice>API 接続は iOS / Android の開発ビルドで利用してください。</Notice>
          )}
        </View>
      )}
    </View>
  );
}
