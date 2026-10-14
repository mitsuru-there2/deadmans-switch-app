import { useState } from "react";
import { Alert, Platform } from "react-native";
import { router } from "expo-router";
import { Action, Body, Input, Notice, Row, Screen, Section, Title } from "../../src/components/ui";
import { useData } from "../../src/services/data";
import { gateway } from "../../src/api/adapter";
import { mode } from "../../src/api/config";
import { errorText } from "../../src/api/errors";
import { editable, formatDate, settingsInputSchema, type Switch } from "../../src/domain/models";
import { NotificationSettings } from "../../src/components/NotificationSettings";
import { storageDescription, clearPrivate } from "../../src/storage/vault";
import { useQueryClient } from "@tanstack/react-query";
export default function Settings() {
  const { me, ready } = useData();
  const [notice, setNotice] = useState("");
  const client = useQueryClient();
  const localDataName = mode === "demo" ? "端末のデモデータ" : "端末内の下書き";
  const clear = () => {
    const run = async () => {
      try {
        await clearPrivate();
        await client.invalidateQueries();
        setNotice(
          `${localDataName}を削除しました。サーバーのデータやストア契約は変更していません。`,
        );
      } catch (e) {
        setNotice(errorText(e));
      }
    };
    if (Platform.OS === "web") {
      if (window.confirm(`${localDataName}をすべて削除しますか？`)) void run();
    } else
      Alert.alert(
        `${localDataName}を削除`,
        "未同期の内容は復元できません。サーバーのデータやストア契約は変更しません。",
        [
          { text: "戻る", style: "cancel" },
          {
            text: "削除",
            style: "destructive",
            onPress: () => {
              void run();
            },
          },
        ],
      );
  };
  return (
    <Screen>
      <Title>設定</Title>
      <Section title="見守りの条件">
        {me.data ? (
          <Schedule key={me.data.switch.version} state={me.data.switch} enabled={ready} />
        ) : (
          <Notice>接続後に設定を確認できます。</Notice>
        )}
      </Section>
      <Section title="本人の連絡先">
        <Row
          title="本人メール"
          detail={me.data?.user.emailVerified ? (me.data.user.email ?? "確認済み") : "未確認"}
        />
        <Action label="本人メールを確認する" secondary onPress={() => router.push("/contact")} />
        <Row title="自分宛の通知テスト・配信状態" onPress={() => router.push("/deliveries")} />
      </Section>
      <NotificationSettings />
      <Section title="年間プラン">
        <Body>
          {me.data?.switch.entitlement
            ? `${me.data.switch.entitlement.plan === "basic" ? "基本" : "拡張"} · ${me.data.switch.entitlement.status}`
            : "契約を確認できていません"}
        </Body>
        {me.data?.switch.entitlement && (
          <Notice>内部権利期限: {formatDate(me.data.switch.entitlement.validUntil)}</Notice>
        )}
        <Notice>基本 10 宛先 / 拡張 50 宛先。価格・更新条件はストアでの設定後に表示します。</Notice>
        <Action label="購入・同じストアの復元 · 接続準備中" disabled onPress={() => {}} />
        <Notice>
          課金失敗では伝言を送りません。購入復元だけではチェックインや監視再開になりません。
        </Notice>
      </Section>
      <Section title="プライバシー">
        <Notice>{storageDescription}</Notice>
        <Notice>
          API
          モードでは起動時とバックグラウンドから戻ったときに端末認証が必要です。デモでは端末認証を省略します。
        </Notice>
        <Action label={`${localDataName}をすべて削除`} secondary onPress={clear} />
        <Notice>
          アカウントの書き出し・削除は接続準備中です。ストア契約の解約とは別の操作です。
        </Notice>
      </Section>
      {!!notice && <Notice>{notice}</Notice>}
      <Row title="仕組みと大切なこと" onPress={() => router.push("/about")} />
    </Screen>
  );
}
function Schedule({ state, enabled }: { state: Switch; enabled: boolean }) {
  const [inactivity, setInactivity] = useState(String(state.inactivityDays));
  const [grace, setGrace] = useState(String(state.graceDays));
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const client = useQueryClient();
  return (
    <>
      <Input
        label="確認がない期間（日）"
        value={inactivity}
        keyboardType="number-pad"
        maxLength={3}
        onChangeText={setInactivity}
        editable={enabled && editable(state)}
      />
      <Input
        label="警告後の猶予（日）"
        value={grace}
        keyboardType="number-pad"
        maxLength={2}
        onChangeText={setGrace}
        editable={enabled && editable(state)}
      />
      <Notice>
        無反応 7〜365 日、猶予 3〜30 日。1 日は 24
        時間です。猶予は本人への警告が受け付けられた時点から始まります。
      </Notice>
      <Action
        label={busy ? "保存中…" : "条件を保存"}
        secondary
        disabled={!enabled || !editable(state) || busy}
        onPress={async () => {
          const parsed = settingsInputSchema.safeParse({
            inactivityDays: Number(inactivity),
            graceDays: Number(grace),
          });
          if (!parsed.success) {
            setMessage("無反応は7〜365日、猶予は3〜30日の整数で入力してください。");
            return;
          }
          setBusy(true);
          try {
            await gateway.settings(
              parsed.data.inactivityDays,
              parsed.data.graceDays,
              state.version,
            );
            await client.invalidateQueries();
          } catch (e) {
            setMessage(errorText(e));
          } finally {
            setBusy(false);
          }
        }}
      />
      {!!message && <Notice error>{message}</Notice>}
    </>
  );
}
