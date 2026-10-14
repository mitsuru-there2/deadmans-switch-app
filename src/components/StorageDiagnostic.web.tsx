import { Notice, Screen } from "./ui";
export function StorageDiagnostic() {
  return (
    <Screen>
      <Notice>SQLCipher の診断にはネイティブ開発ビルドが必要です。</Notice>
    </Screen>
  );
}
