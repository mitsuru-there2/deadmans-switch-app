import type { PropsWithChildren } from "react";
import { mode } from "../api/config";
import { Notice, Screen, Title } from "./ui";

export function PrivacyGate({ children }: PropsWithChildren) {
  if (mode === "api")
    return (
      <Screen>
        <Title>ネイティブアプリで開いてください</Title>
        <Notice>ブラウザは開発デモ専用です。認証情報や伝言をブラウザに永続保存しません。</Notice>
      </Screen>
    );
  return children;
}
