# 私に何かあったら

Expo / React Native の本人用アプリ。2026-10-14 時点の初期実装です。監視・チェックイン・公開期限・課金権利の正はサーバーにあります。ストア公開や実送信ができる完成版ではありません。

## 起動

Node 22.15 以上（検証 Node 24.14.0）、npm 11、同じ親フォルダに `deadmans-switch-api` が必要です。API の `client` export を file 依存で使用し、API のソースを変更しません。動作確認した API 基準は `b52e61a`（後続互換コミットも許容）です。

```sh
npm ci
npm run typecheck
npm test
npm run check:expo
npm run web:demo
```

Web は開発フロー確認用です。永続保存はせず、再読み込みでデモの宛先・伝言・下書きは消えます。Web の API モードは閉じています。

ネイティブは **development build** を使います。SQLCipher を含まない Expo Go は対象外です。

```sh
# ローカル開発ビルド。署名・実鍵・EAS 登録は別途設定が必要です。
EXPO_PUBLIC_APP_MODE=demo npx expo run:ios
EXPO_PUBLIC_APP_MODE=demo npx expo run:android
npm run start:demo
```

`ios/`、`android/` は `npx expo prebuild` で生成するためコミットしません。iOS は Xcode 26.4 以上が SDK 57 の要件。検証は Xcode 27.0。Ruby/CocoaPods の古い組合せは Expo の precompiled module 読込に警告が出るため、新しい Ruby と CocoaPods を推奨します。今回の環境ではソースビルドへフォールバックしてビルドに成功しました。

## モード

- 明示した `EXPO_PUBLIC_APP_MODE=demo` **かつ** `__DEV__` の場合だけデモを使います。確認期限は未確定、見守りは準備中、チェックインと送信は無効です。デモ保存をサーバー保存とは表示しません。
- `EXPO_PUBLIC_APP_MODE=api` と `EXPO_PUBLIC_API_URL` で API に接続します。本番は HTTPS 必須。開発 HTTP は localhost / 127.0.0.1 / Android emulator の 10.0.2.2 のみです。
- 未設定・不正設定・リリースビルドの demo 指定は利用不可の表示になり、デモへ自動フォールバックしません。
- API モードでは端末認証後の初回接続が bootstrap を実行します。今回の検証では API モードを起動せず、認証情報を発行していません。

`.env.example` を参照してください。API の URL 以外の秘密情報を `EXPO_PUBLIC_*` に入れないでください。`eas.json` は設定の雛形だけです。EAS への登録・ビルド・デプロイは実行していません。

## 実装済みの初期フロー

- OS 標準の NativeTabs / Stack、Expo UI の SwiftUI / Jetpack Compose ボタン。ダークモード、読み上げラベル、文字拡大、キーボード回避、Reduce Motion に対応する構成。
- ホームで 6 状態・サーバー期限・最終取得・有効化不足条件を表示。released は配信完了としません。
- メール宛先の追加・一覧・削除、受取承諾状態、1 宛先 1 本文の編集、ローカル下書き、明示的な保存。
- 7 分類の入力支援。`src/domain/templates.ts` の定義から短い質問を表示し、回答を通常の編集可能本文へ追加。「秘密の依頼」を含みます。
- TanStack Form と Zod による件名 200 / 本文 20,000 文字、メール、30 日 + 7 日の初期条件と設定範囲の検証。
- API 型付き Hono Client、応答 Zod 検証、401/403/409/通信不明の表示。サーバー更新後は me を再取得し、Profile 応答だけで期限を計算しません。
- API モードで認証後の前面起動・明示ボタンからチェックイン。受信イベント・バックグラウンド・購入復元では発火しません。タイムアウトを成功と見なさず、Mutation は自動再送しません。
- 409 時は下書きを保持し、最新保存内容の確認と明示操作なしに上書きしません。
- 停止は明示確認を挟み、既に取得された本文を回収できないことを説明。
- 本人メールの確認依頼・届いた確認リンクの明示送信（メモリのみ）。確認済みメールの変更はAPI未定義のため提供しません。
- 宛先の招待/再招待、承諾・辞退・通報、招待期限と24時間の再招待条件を表示。
- 本人宛テストのdeliveryIdを追跡し、202/送信待ちとaccepted/deliveredを区別。配信状態を手動更新。
- 最新のサーバー同意本文を全文表示し、明示同意・version確認後に監視開始/再開。画面離脱・背景化・同意版変更でチェックを解除。
- 通知許可とExpo token取得は本人操作のみ。登録/更新/一覧/解除に対応。トークン変更は更新が必要な表示だけで、バックグラウンド自動登録/チェックインは行いません。

## 保存と秘密情報

SQLite の平文を既定にしません。`expo-sqlite` の SQLCipher を prebuild で有効化し、起動時に `cipher_version` を確認、256-bit ランダム鍵で DB 全体を暗号化します。SQLCipher がない、既存 DB の鍵が失われた、鍵の形式が不正な場合は閉じ、保存成功を表示しません。暗号鍵と端末 Bearer のみ SecureStore に保存し、本文は SecureStore に入れません。

鍵は `WHEN_UNLOCKED_THIS_DEVICE_ONLY`。Android のアプリバックアップは無効です。iOS の SQLite ファイル自体は OS バックアップ対象になる可能性があり、暗号化済みでも明示的な除外設定の実機確認が公開前の残課題です。別端末へ鍵を移行しないため、復元した下書きが読めない場合があります。未同期の下書きをサーバーから復旧できるとは表示しません。鍵のリセットや失われた DB の削除は自動実行しません。

API origin と user ID ごとに下書きを分離し、デモの DB も API モードから分離します。API モードは端末の認証が必要です。バックグラウンド時に画面を隠し、未保存の編集はロック中もメモリ上に保持します。生体認証がなくても OS のパスコードを利用でき、両方ない場合は開きません。端末認証をサーバーの本人証明とは呼びません。ScreenCapture を抑止しますが、OS ごとのスクリーンショット・アプリ切替スナップショットの保証には実機検証が必要です。

端末トークンは期限前に直列更新します。bootstrap / 更新の応答を失った場合に備え、開始前に pending を記録し、同じ操作を自動リプレイしたり別アカウントを作ったりしません。購入証明による復旧は接続済みですが、結果不明時の再取得・補助復旧は未接続です。伝言本文・メール・秘密 URL・Bearer のアプリログは追加していません。

## 未完了の機能と設定

[docs/HANDOFF.md](docs/HANDOFF.md) に契約依存、機能の未完了状態、検証結果を記載しています。購入と同一ストア復元はコード接続済みです。外部設定がない環境では無効になります。[購入証明](docs/NATIVE-PROOF-PLAN.md) と [外部設定・実機検証の最小手順](docs/RELEASE-VALIDATION.md) を参照してください。本人確認・招待・通知テスト・有効化は既存APIへ接続するコードを実装し、外部送信なしのモックで検証しました。実通知・実購入をしていません。

SDK 57 と Expo UI 57 は公式の対応バージョンを `expo install` で解決しました。

- https://docs.expo.dev/versions/latest/
- https://docs.expo.dev/versions/latest/sdk/ui/
- https://docs.expo.dev/versions/latest/sdk/sqlite/

## 追加検証と監査

[依存監査](docs/DEPENDENCY-AUDIT.md) に修正版・悪用条件・bundleへの到達性を記載しています。通常の `npm ci` で vendor デコーダーと限定UUID overrideも解決されます。

Xcode 27のScene lifecycle要件に対し、`plugins/with-scene-lifecycle.cjs` でExpo自身の `ExpoAppSceneDelegate` を使います。生成されたAppDelegateに独自のUIWindowを作らず、Expoのイベント転送を保持します。

ネイティブ保存の専用診断は `EXPO_PUBLIC_APP_MODE=demo EXPO_PUBLIC_STORAGE_DIAGNOSTIC=1 npm start -- --port 8082`。development buildでのみ有効です。Phase1の後プロセスを終了・再起動し、Phase2で鍵喪失時の拒否を確認します。専用の架空DBと鍵だけを使い、通常の下書きには触れません。診断終了後は環境変数を外して再起動してください。Webでは実行しません。

購入の明示的な有効化には `.env.example` の `EXPO_PUBLIC_BILLING_ENABLED` とOS別のRevenueCat公開SDKキー、APIの対応商品設定が必要です。`modules/store-proof` はネイティブソースとして管理し、初回追加・変更後はpod install/ネイティブ再ビルドが必要です。JWSやpurchaseTokenはログ・SQLite・URLへ保存しません。
