# 初期アプリの引き継ぎ

2026-10-14。変更は app リポジトリのみ。Pages の状況表は更新していません。

## 契約と未完了事項

- API `client` export を file 依存で利用。`src/api/adapter.ts` の Gateway が画面との境界。API 購読は TanStack Query、本文/宛先の入力は TanStack Form + Zod。新規のテストフレームワーク、Sentry は追加していません。
- 最新 API `b52e61a` の serverTime / activationBlockers、招待期限、GET consents/current / GET devices に対応。全文同意とversion付きactivate（開始/再開）、明示停止まで接続済みです。表示・チェックイン・課金復元だけでは再開しません。
- 本人メール登録・確認リンクの手動貼付、招待/再招待/状態、本人宛テストと配信履歴、通知 token 登録/更新/削除を接続済み。本人操作だけで許可を要求。EAS/APNs/FCM未設定時は無効。購入と同一ストア復元、通知アクション、アカウントexport/削除、検証済みメール変更、監査履歴は未接続です。
- Self-test を接続する場合は 202 の deliveryId を記録し、accepted/delivered まで成功扱いしないこと。invitation の queued も配信/承諾とは別です。
- RevenueCat SDK は導入しましたが configure/purchase/restore は実行しません。API側はAndroidのBase64(SHA-256(UUID))とUUIDの厳格照合を追加済み。Apple JWS / Google purchaseToken取得のExpo local moduleと復旧の順序を次の区切りで実装可能です。`docs/NATIVE-PROOF-PLAN.md` を参照。CustomerInfo / appUserID / transactionIdentifier だけで旧アカウント復旧を許しません。API 担当の docs/app-contract.md を継続参照してください。
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

互換修正で29件→19件（high19、開発依存元への波及込み）。実ランタイムのURI decoderは公式0.5.0の互換CJSコピー、xcodeのUUIDはscope overrideで修正。残りは修正版のないbraces/node-forgeで、今回のrelease source mapには含まれません。条件と出所は[依存監査](DEPENDENCY-AUDIT.md)。

## 次の検証

iOS/Android 実機で、文字拡大、VoiceOver/TalkBack、戻る操作、画面ロック、バックアップ、SQLCipher の鍵紛失、通知拒否、通信断、認証更新の応答喪失、409 競合、released→paused と held/paused の非再開を確認してください。ライブ API 統合・実ストア購入は今回実行していません。

## 起動確認の制約

iOS のネイティブ install / launch は成功しましたが、URL を開く OS 確認の画面に留まりました。XcodeBuildMCP の `snapshot_ui` は 2 回とも Simulator remote automation session の作成でタイムアウトしました。スクリーンショットでも OS 確認が表示されており、**アプリ本体の iOS 画面・SQLCipher 実行時保存は未検証**です。ビルド成功とは分けて扱ってください。ブラウザでも画像キャプチャ機能は利用できませんでしたが、DOM による操作結果・保存本文・下書き一覧は確認しました。

## 第2区切りの実装・検証

- 実Hono Clientをfetch差し替えしたローカル試験で、本人メール確認→招待→テストのdeliveryId照合→同意→開始/停止→通知登録一覧/解除を確認。外部HTTPリクエストなし。409/同意版不一致/応答喪失時に再送なし。
- Node組み込みテスト11件。型検査成功。3プラットフォームexport成功。`npm ci --dry-run --ignore-scripts --offline`でlock整合を確認。
- Webの本人確認画面・開始同意画面・テスト配信画面を描画し、架空入力でもデモの送信・同意確定が無効なことを確認。
- 確認リンクはTanStack mutation variablesに入れず、画面離脱・背景化・送信時にメモリから消去。Universal Links / App LinksのOS配線は未設定で、確認メールのリンクは明示的な貼付で確認します。
- 同意は画面離脱・背景化・設定version/同意版更新で解除。送信結果が不明な場合、配信履歴を照合してから再操作。本人宛テストの新しい依頼を過去の成功と混同しません。
- Android SDK/Java17/Pixel_10 AVDは存在。Gradleが必要なSDK36/NDK/CMakeを解決でき、ローカルDebugビルドを実行。最終結果は追記します。
- iOS起動の再調査で、旧生成AppDelegateはiOS27のScene要件によりJS起動前にSIGTRAPすることをcrash reportから確認。`plugins/with-scene-lifecycle.cjs`でインストール済みExpoの公式SceneDelegate/イベント転送を使うよう修正し、冪等性テストを追加。ビルドとruntime結果は追記します。
- 独立した診断DBでSQLCipher保存/再接続/再起動/鍵喪失拒否を検証するdev-only画面を追加。リリース/demo以外では作動しません。通常の本文/認証鍵とは別の名前空間です。
