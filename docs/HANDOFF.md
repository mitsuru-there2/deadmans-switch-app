# 初期アプリの引き継ぎ

2026-10-14。変更は app リポジトリのみ。Pages の状況表は更新していません。

## 契約と未完了事項

- API `client` export を file 依存で利用。`src/api/adapter.ts` の Gateway が画面との境界。API 購読は TanStack Query、本文/宛先の入力は TanStack Form + Zod。新規のテストフレームワーク、Sentry は追加していません。
- 最新 API 契約の serverTime / activationBlockers、招待期限、GET consents/current に対応。同意本文を読む画面はあり、明示同意の保持と activate は未接続です。監視有効化は UI で無効です。
- 本人メール登録・確認リンク、招待、本人宛テスト、通知操作チェックイン、通知 token 登録/更新/削除、購入と同一ストア復元、履歴、サーバー export/アカウント削除は今後の接続作業です。準備中のボタンや説明を置き、成功を偽装しません。
- Self-test を接続する場合は 202 の deliveryId を記録し、accepted/delivered まで成功扱いしないこと。invitation の queued も配信/承諾とは別です。
- RevenueCat SDK は導入しましたが configure/purchase/restore は実行しません。API の `accountToken` 結合、Android の SHA-256 obfuscatedAccountId 差、Apple signedTransaction JWS 取得を設計する必要があります。CustomerInfo / appUserID / transactionIdentifier だけで旧アカウント復旧を許しません。API 担当の docs/app-contract.md を継続参照してください。
- Universal Links / App Links の許可ドメインは未設定です。現在は開発用 scheme のみ。秘密トークンを URL query やログへ転記する復旧処理はありません。
- app.json の bundleIdentifier / package は **開発用仮値** `jp.example.watashini.dev`。ストア登録済み ID、EAS projectId、通知 credential、ストア商品、RevenueCat 公開 SDK key と native proof bridge は公開前に設定が必要です。秘密 API キーを EXPO_PUBLIC_* に入れないこと。
- 未契約のローカル試し書き許可が未確定のため、API モードの未契約アカウントは宛先/本文作成を止めます。試し書きは開発デモで可能です。
- 端末暗号化は SQLCipher を採用。OS のファイル保護のみより秘密内容の DB 抽出に強く、項目ごとの自前暗号より nonce/暗号化漏れを減らせます。Expo Go 非対応で dev build 必須。鍵紛失時は DB を読みません。iOS バックアップの明示除外、Android 実機での鍵失効、再インストール/復元の検証は未完了です。

## 検証済み

- npm の公式 registry から Expo 57.0.28、@expo/ui 57.0.23、React Native 0.86.3 / React 19.2.3 を解決。`expo install --check` 一致。
- TypeScript `tsc --noEmit` 成功（API 共有型を含む）。
- Node 組み込みテスト 5 件成功: release demo 遮断、通信先制約、foreground intent 制約、編集状態/権利期限、入力上限、7 分類の生成。
- `expo prebuild --no-install` 成功。SQLCipher 有効を ios/Podfile.properties.json で確認。
- `pod install` 成功。環境 Ruby の `filter_map` 未対応により precompiled module の警告あり、ソースビルドにフォールバック。
- Xcode 27.0 / Simulator SDK 27.0 / Debug / CODE_SIGNING_ALLOWED=NO のビルドで `BUILD SUCCEEDED`。生成物 `/tmp/deadmans-derived/Build/Products/Debug-iphonesimulator/app.app`。証拠ログ `/tmp/deadmans-ios-build.log`。
- `expo export --platform ios --platform android` 成功。両 OS の Hermes bundle 生成。Android のネイティブ Gradle ビルド・実機確認は未実施です。
- Web dev preview を localhost:8082 で起動。架空の family@example.com を使用し、宛先追加 → 秘密の依頼を選択 → 質問に回答 → 本文追加 → 端末下書き保存 → 下書き一覧 → 再編集 → デモ保存を確認。実 API 呼出し・メール送信なし。
- iOS Simulator への install / launch のプロセス起動は成功。詳細な画面検証の結果は以下に追記します。

## 依存監査

`npm audit --omit=dev` は 29 件（high 19 / moderate 10、依存元への波及を含む）を報告。直接の原因は braces <=3.0.3、node-forge <=1.4.0、decode-uri-component <=0.4.2、uuid <11.1.1。多くは Metro / Expo CLI の依存ですが、query-string の decoder は Router の依存です。提示された自動修正には Expo 44、RN 0.72 等への非互換変更が含まれるため `audit fix --force` は行っていません。SDK 互換性を保つ patch / upstream 更新の調査が公開前に必要です。未審査の override は追加していません。

## 次の検証

iOS/Android 実機で、文字拡大、VoiceOver/TalkBack、戻る操作、画面ロック、バックアップ、SQLCipher の鍵紛失、通知拒否、通信断、認証更新の応答喪失、409 競合、released→paused と held/paused の非再開を確認してください。ライブ API 統合・実ストア購入は今回実行していません。

## 起動確認の制約

iOS のネイティブ install / launch は成功しましたが、URL を開く OS 確認の画面に留まりました。XcodeBuildMCP の `snapshot_ui` は 2 回とも Simulator remote automation session の作成でタイムアウトしました。スクリーンショットでも OS 確認が表示されており、**アプリ本体の iOS 画面・SQLCipher 実行時保存は未検証**です。ビルド成功とは分けて扱ってください。ブラウザでも画像キャプチャ機能は利用できませんでしたが、DOM による操作結果・保存本文・下書き一覧は確認しました。
