import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Action, Notice, Row, Screen, Section, Title } from "../src/components/ui";
import { confirmAction } from "../src/components/Confirm";
import { gateway } from "../src/api/adapter";
import { mode } from "../src/api/config";
import { errorText } from "../src/api/errors";
import { useData } from "../src/services/data";
import { formatDate } from "../src/domain/models";
import { deliveryCopy, testSucceeded } from "../src/domain/setup";
export default function Deliveries() {
  const { me, ready } = useData();
  const client = useQueryClient();
  const [requestedId, setRequestedId] = useState<string>();
  const [attempted, setAttempted] = useState(false);
  const [requested, setRequested] = useState(false);
  const deliveries = useQuery({
    queryKey: ["deliveries", me.data?.user.id],
    queryFn: () => gateway.deliveries(),
    enabled: ready && mode === "api",
  });
  const test = useMutation({
    mutationFn: () => {
      setRequested(true);
      setRequestedId(undefined);
      return gateway.selfTest();
    },
    retry: false,
    onSuccess: (data) => setRequestedId(data.deliveryId),
    onSettled: async () => {
      setAttempted(true);
      await client.invalidateQueries();
    },
  });
  const current = requestedId
    ? deliveries.data?.find((d) => d.id === requestedId)
    : requested
      ? undefined
      : deliveries.data?.find((d) => d.kind === "self_test");
  return (
    <Screen>
      <Title>自分宛の通知テスト</Title>
      <Notice>
        確認済みの本人メールに固定のテスト通知を送ります。伝言の本文や件名は含めません。1日3回までです。
      </Notice>
      <Row title="送信先" detail={me.data?.user.email ?? "本人メールの確認が必要です"} />
      <Action
        label={test.isPending ? "依頼中…" : "本人メールにテストを送る"}
        disabled={
          !ready || mode !== "api" || !me.data?.user.emailVerified || test.isPending || attempted
        }
        onPress={() =>
          confirmAction("自分宛にテストを送ります", "確認済みの本人メールへ送信します。", () =>
            test.mutate(),
          )
        }
      />
      {requested && !requestedId && !test.isPending && (
        <Notice>今回の依頼の結果は確認できません。履歴を更新し、再送前に確認してください。</Notice>
      )}
      {!!requestedId && !current && (
        <Notice>サーバーが依頼を受け付けました。結果はまだ確認できません。</Notice>
      )}
      {current && (
        <Notice>
          {testSucceeded(current)
            ? "テスト通知は配信サービスで受付済みです。受信箱でも確認してください。"
            : `テストは未完了です: ${deliveryCopy[current.state]}`}
        </Notice>
      )}
      <Action
        label="配信結果と条件を更新"
        secondary
        disabled={!ready || mode !== "api" || test.isPending}
        onPress={async () => {
          const r = await deliveries.refetch();
          await me.refetch();
          if (r.isSuccess) setAttempted(false);
        }}
      />
      {test.error && <Notice error>{errorText(test.error)}</Notice>}
      {deliveries.error && <Notice error>{errorText(deliveries.error)}</Notice>}
      <Section title="最近の配信状態">
        {deliveries.data?.map((d) => (
          <Row
            key={d.id}
            title={
              {
                auth: "本人確認",
                invitation: "受取承諾の招待",
                reminder: "確認のお願い",
                warning: "期限の警告",
                final: "伝言リンクの通知",
                self_test: "本人宛テスト",
              }[d.kind]
            }
            detail={formatDate(d.createdAt)}
            trailing={deliveryCopy[d.state]}
          />
        ))}
        {!deliveries.data?.length && <Notice>配信履歴はありません。</Notice>}
      </Section>
      <Notice>
        依頼受付・配信完了・相手の受取承諾は、それぞれ別の状態です。結果不明の場合は、再送する前に状態を確認してください。
      </Notice>
    </Screen>
  );
}
