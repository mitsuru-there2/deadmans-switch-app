import { useEffect, useState } from "react";
import { AppState, Linking, Platform } from "react-native";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Action, Notice, Row, Section } from "./ui";
import { confirmAction } from "./Confirm";
import { useData } from "../services/data";
import {
  currentPushToken,
  notificationConfigured,
  notificationSetup,
  observeTokenChange,
} from "../services/notifications";
import { gateway } from "../api/adapter";
import { mode } from "../api/config";
import { errorText } from "../api/errors";
import { formatDate } from "../domain/models";
import { readPrivate, writePrivate, removePrivate } from "../storage/vault";
export function NotificationSettings() {
  const { me, ready, scope } = useData();
  const client = useQueryClient();
  const [notice, setNotice] = useState("");
  const [dirty, setDirty] = useState(false);
  const [currentId, setCurrentId] = useState<string>();
  const key = `push-device:${scope}`;
  const devices = useQuery({
    queryKey: ["devices", me.data?.user.id],
    queryFn: () => gateway.devices(),
    enabled: mode === "api" && ready,
  });
  useEffect(() => observeTokenChange(() => setDirty(true)), []);
  useEffect(() => {
    let active = true;
    if (mode === "api" && ready)
      void readPrivate<string>(key)
        .then((id) => {
          if (active) setCurrentId(id ?? undefined);
        })
        .catch(() => {
          if (active)
            setNotice("この端末の登録情報を開けません。サーバーの一覧を確認してください。");
        });
    return () => {
      active = false;
    };
  }, [key, ready]);
  const register = useMutation({
    retry: false,
    mutationFn: async () => {
      if (AppState.currentState !== "active") return;
      const token = await currentPushToken();
      if (AppState.currentState !== "active") return;
      const result = await gateway.registerDevice(token);
      await writePrivate(key, result.id); // persist only server ID, never the push token
      setCurrentId(result.id);
      setDirty(false);
      if (currentId && currentId !== result.id) await gateway.removeDevice(currentId);
      setNotice("サーバーがこの端末の通知登録を受け付けました。配信の到達確認とは別です。");
    },
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: ["devices"] });
    },
  });
  const remove = useMutation({
    retry: false,
    mutationFn: async (id: string) => {
      await gateway.removeDevice(id);
      if (id === currentId) {
        await removePrivate(key);
        setCurrentId(undefined);
      }
      setNotice("サーバーの通知登録を削除しました。OS の通知許可と見守り状態は変わりません。");
    },
    onSettled: async () => {
      await client.invalidateQueries({ queryKey: ["devices"] });
    },
  });
  return (
    <Section title="端末の通知">
      <Notice>{notificationSetup}</Notice>
      {dirty && <Notice>通知トークンが変更されました。この端末を再登録してください。</Notice>}
      <Action
        label={register.isPending ? "登録中…" : "通知を許可してこの端末を登録・更新"}
        disabled={!ready || !notificationConfigured || register.isPending || remove.isPending}
        onPress={() => {
          setNotice("");
          register.mutate();
        }}
      />
      {devices.data?.map((d, i) => (
        <Section key={d.id} title={d.id === currentId ? "この端末" : `登録端末 ${i + 1}`}>
          <Row title="登録日時" detail={formatDate(d.createdAt)} />
          <Action
            label="この通知登録を解除"
            secondary
            disabled={remove.isPending || register.isPending}
            onPress={() =>
              confirmAction(
                "この端末への通知を止めます",
                "見守りは停止しません。通知登録だけを削除します。",
                () => remove.mutate(d.id),
              )
            }
          />
        </Section>
      ))}
      <Action
        label="サーバーの登録一覧を更新"
        secondary
        disabled={!ready || mode !== "api" || register.isPending || remove.isPending}
        onPress={() => void devices.refetch()}
      />
      <Action
        label="OS の設定を開く"
        secondary
        disabled={Platform.OS === "web"}
        onPress={() =>
          void Linking.openSettings().catch(() => setNotice("OS の設定を開けませんでした。"))
        }
      />
      {register.error && <Notice error>{errorText(register.error)}</Notice>}
      {remove.error && <Notice error>{errorText(remove.error)}</Notice>}
      {devices.error && <Notice error>{errorText(devices.error)}</Notice>}
      {!!notice && <Notice>{notice}</Notice>}
      <Notice>
        最大5端末。登録解除の結果が不明な場合は、一覧を更新して確認してください。通知受信やバックグラウンド処理ではチェックインしません。
      </Notice>
    </Section>
  );
}
