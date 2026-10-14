import { useQuery } from "@tanstack/react-query";
import { useFocusEffect, router } from "expo-router";
import { useCallback } from "react";
import { Body, Notice, Row, Screen, Section, Title } from "../../src/components/ui";
import { useData } from "../../src/services/data";
import { getDraft } from "../../src/storage/drafts";
import { storageDescription } from "../../src/storage/vault";
import { errorText } from "../../src/api/errors";
import { mode } from "../../src/api/config";
export default function Drafts() {
  const { recipients, messages, scope } = useData();
  const drafts = useQuery({
    queryKey: ["drafts", scope, recipients.data?.map((r) => r.id)],
    queryFn: async () =>
      (await Promise.all((recipients.data ?? []).map((r) => getDraft(scope, r.id)))).filter(
        (d) => !!d,
      ),
    enabled: !!recipients.data,
  });
  useFocusEffect(
    useCallback(() => {
      if (recipients.data) void drafts.refetch();
    }, [recipients.data, scope]),
  );
  return (
    <Screen>
      <Title subtitle="書きかけの言葉を、ここから。">下書きと伝言</Title>
      <Notice>{storageDescription}</Notice>
      {drafts.error && <Notice error>{errorText(drafts.error)}</Notice>}
      <Section title="この端末の下書き">
        {drafts.data?.length ? (
          drafts.data.map((d) => (
            <Row
              key={d.recipientId}
              title={recipients.data?.find((r) => r.id === d.recipientId)?.name ?? "宛先"}
              detail={d.title || "件名未入力"}
              trailing="未同期"
              onPress={() =>
                router.push({ pathname: "/message/[id]", params: { id: d.recipientId } })
              }
            />
          ))
        ) : (
          <Body muted>端末に保存された下書きはありません。</Body>
        )}
      </Section>
      <Section
        title={mode === "demo" ? "デモで保存した伝言 · 端末内のみ" : "サーバーに保存した伝言"}
      >
        {messages.data?.length ? (
          messages.data.map((m) => (
            <Row
              key={m.id}
              title={recipients.data?.find((r) => r.id === m.recipientId)?.name ?? "宛先"}
              detail={m.title}
              trailing={`第 ${m.revision} 版`}
              onPress={() =>
                router.push({ pathname: "/message/[id]", params: { id: m.recipientId } })
              }
            />
          ))
        ) : (
          <Body muted>宛先を選んで、最初の伝言を書いてみましょう。</Body>
        )}
      </Section>
      {messages.error && <Notice error>{errorText(messages.error)}</Notice>}
      <Row title="宛先から書き始める" onPress={() => router.push("/recipients")} />
    </Screen>
  );
}
