import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Action, Notice, Row, Screen, Title } from "../../src/components/ui";
import { confirmAction } from "../../src/components/Confirm";
import { useData } from "../../src/services/data";
import { mode } from "../../src/api/config";
import { gateway } from "../../src/api/adapter";
import { errorText } from "../../src/api/errors";
import { canInvite } from "../../src/domain/setup";
import { consentCopy, formatDate } from "../../src/domain/models";
export default function RecipientDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, recipients } = useData();
  const r = recipients.data?.find((r) => r.id === id);
  const [attempted, setAttempted] = useState(false);
  const client = useQueryClient();
  const invite = useMutation({
    mutationFn: () => gateway.invite(id),
    retry: false,
    onSettled: async () => {
      setAttempted(true);
      await client.invalidateQueries();
    },
  });
  return (
    <Screen>
      <Title>{r?.name ?? "宛先を確認しています"}</Title>
      {r && (
        <>
          <Row title="メール" detail={r.email} />
          <Row title="受取承諾" detail={consentCopy[r.status]} />
          <Row title="招待リンクの期限" detail={formatDate(r.invitationExpiresAt)} />
          {r.status === "pending" && (
            <Row title="次に招待できる時刻" detail={formatDate(r.nextInvitationAt)} />
          )}
          <Action
            label={
              invite.isPending
                ? "招待を依頼中…"
                : r.invitationExpiresAt === null
                  ? "受取承諾の招待を送る"
                  : "受取承諾を再招待する"
            }
            disabled={
              mode !== "api" ||
              !me.data ||
              !canInvite(r, me.data.switch) ||
              invite.isPending ||
              attempted
            }
            onPress={() =>
              confirmAction(
                "招待メールを送ります",
                `${r.email} に受取承諾のリンクを送ります。伝言の本文は含めません。再招待は24時間後からです。`,
                () => invite.mutate(),
              )
            }
          />
          <Action
            label="伝言を編集する"
            secondary
            onPress={() => router.push({ pathname: "/message/[id]", params: { id } })}
          />
        </>
      )}
      {invite.isSuccess && (
        <Notice>招待の依頼を受け付けました。配信や受取承諾はまだ完了していません。</Notice>
      )}
      {invite.error && <Notice error>{errorText(invite.error)}</Notice>}
      {recipients.error && <Notice error>{errorText(recipients.error)}</Notice>}
      <Action
        label="承諾状態を更新"
        secondary
        disabled={invite.isPending}
        onPress={async () => {
          const results = await Promise.all([me.refetch(), recipients.refetch()]);
          if (results.every((r) => r.isSuccess)) setAttempted(false);
        }}
      />
      <Notice>
        辞退・通報した相手には再招待できません。登録時の受取承諾は、本文を開く前の死亡確認の明示同意とは別です。
      </Notice>
    </Screen>
  );
}
