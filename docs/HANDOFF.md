# 初期アプリの引き継ぎ

2026-10-14。変更は app リポジトリのみ。Pages の状況表は更新していません。

## 契約と未完了事項

- API `client` export を file 依存で利用。`src/api/adapter.ts` の Gateway が画面との境界。API 購読は TanStack Query、本文/宛先の入力は TanStack Form + Zod。新規のテストフレームワーク、Sentry は追加していません。
- 最新 API `b52e61a` の serverTime / activationBlockers、招待期限、GET consents/current / GET devices に対応。全文同意とversion付きactivate（開始/再開）、明示停止まで接続済みです。表示・チェックイン・課金復元だけでは再開しません。
- 本人メール登録・確認リンクの手動貼付、招待/再招待/状態、本人宛テストと配信履歴、通知 token 登録/更新/削除を接続済み。本人操作だけで許可を要求。EAS/APNs/FCM未設定時は無効。購入と同一ストア復元は後述の第3区切りでコード接続済みです。通知アクション、アカウントexport/削除、検証済みメール変更、監査履歴は未接続です。
- Self-test を接続する場合は 202 の deliveryId を記録し、accepted/delivered まで成功扱いしないこと。invitation の queued も配信/承諾とは別です。
- RevenueCat＋読み取り専用Expo local moduleをコード接続済みです。実SDKのconfigure/purchase/restore操作は未実施です。API側はAndroidのBase64(SHA-256(UUID))とUUIDの厳格照合に対応。`docs/NATIVE-PROOF-PLAN.md` を参照。CustomerInfo / appUserID / transactionIdentifier だけで旧アカウント復旧を許しません。API 担当の docs/app-contract.md を継続参照してください。
- Universal Links / App Links の許可ドメインは未設定です。現在は開発用 scheme のみ。秘密トークンを URL query やログへ転記する復旧処理はありません。
- app.json の bundleIdentifier / package は **開発用仮値** `jp.example.watashini.dev`。ストア登録済み ID、EAS projectId、通知 credential、ストア商品、RevenueCat 公開 SDK key は公開前に設定が必要です。秘密 API キーを EXPO_PUBLIC_* に入れないこと。
- 未契約のローカル試し書き許可が未確定のため、API モードの未契約アカウントは宛先/本文作成を止めます。試し書きは開発デモで可能です。
- 端末暗号化は SQLCipher を採用。OS のファイル保護のみより秘密内容の DB 抽出に強く、項目ごとの自前暗号より nonce/暗号化漏れを減らせます。Expo Go 非対応で dev build 必須。鍵紛失時は DB を読みません。iOS バックアップの明示除外、Android 実機での鍵失効、再インストール/復元の検証は未完了です。

## 初期区切りの検証

- npm の公式 registry から Expo 57.0.28、@expo/ui 57.0.23、React Native 0.86.3 / React 19.2.3 を解決。`expo install --check` 一致。
- TypeScript `tsc --noEmit` 成功（API 共有型を含む）。
- Node 組み込みテスト 5 件成功: release demo 遮断、通信先制約、foreground intent 制約、編集状態/権利期限、入力上限、7 分類の生成。
- `expo prebuild --no-install` 成功。SQLCipher 有効を ios/Podfile.properties.json で確認。
- `pod install` 成功。環境 Ruby の `filter_map` 未対応により precompiled module の警告あり、ソースビルドにフォールバック。
- Xcode 27.0 / Simulator SDK 27.0 / Debug / CODE_SIGNING_ALLOWED=NO のビルドで `BUILD SUCCEEDED`。生成物 `/tmp/deadmans-derived/Build/Products/Debug-iphonesimulator/app.app`。証拠ログ `/tmp/deadmans-ios-build.log`。
- `expo export --platform ios --platform android` 成功。両 OS の Hermes bundle 生成。この時点ではAndroidのネイティブ検証は未実施でした（後述の第2区切りでGradleビルド成功）。
- Web dev preview を localhost:8082 で起動。架空の family@example.com を使用し、宛先追加 → 秘密の依頼を選択 → 質問に回答 → 本文追加 → 端末下書き保存 → 下書き一覧 → 再編集 → デモ保存を確認。実 API 呼出し・メール送信なし。
- iOS Simulator への install / launch のプロセス起動は成功。詳細な画面検証の結果は以下に追記します。

## 依存監査

互換修正で29件→19件（high19、開発依存元への波及込み）。実ランタイムのURI decoderは公式0.5.0の互換CJSコピー、xcodeのUUIDはscope overrideで修正。残りは修正版のないbraces/node-forgeで、今回のrelease source mapには含まれません。条件と出所は[依存監査](DEPENDENCY-AUDIT.md)。

## 次の検証

iOS/Android 実機で、文字拡大、VoiceOver/TalkBack、戻る操作、画面ロック、バックアップ、SQLCipher の鍵紛失（iOS Simulatorでは上記検証済み）、通知拒否、通信断、認証更新の応答喪失、409 競合、released→paused と held/paused の非再開を確認してください。ライブ API 統合・実ストア購入は今回実行していません。

## ネイティブの起動・保存検証

iOS27 Simulatorで通常ホームを描画し、NativeTabsとExpo UIボタン、デモの未確定期限・チェックイン無効表示を確認しました。専用診断DBではSQLCipher保存→接続を閉じて再読込（PHASE 1）、アプリのプロセスを終了して再起動→復元→鍵を一時削除→STORAGE_LOCKEDで拒否→鍵の自動再発行なし→元の鍵を復元して同じデータを読込（PHASE 2）まで成功しました。DBファイルは12,288 bytesで、平文SQLiteヘッダーと架空fixture文字列は含まれていませんでした。通常の下書き、認証情報、実APIには触れていません。

検証にはXcodeのローカルad-hoc Simulator署名を使用しました。`CODE_SIGNING_ALLOWED=NO`ではKeychainが動かず、署名だけでもentitlementsが空になるため、`CODE_SIGN_ENTITLEMENTS`に開発専用のapplication-identifier・keychain-access-groupsを与えてXcodeで再ビルドしました。外部証明書・Appleチーム・新規認証情報は発行していません。この一時設定は本番署名やアプリ設定に含めません。

証拠: [通常ホーム](evidence/ios-home.png)、[保存と再接続](evidence/ios-storage-phase1.png)、[プロセス再起動と鍵喪失](evidence/ios-storage-phase2.png)。ビルドログは `/tmp/deadmans-entitled-simulator.log`（BUILD SUCCEEDED）。SimulatorのAX自動操作とブラウザ画像キャプチャには制約が残り、ネイティブ全画面の操作は未検証です。画像は公式の `simctl io screenshot` で取得しました。

## 第2区切りの実装・検証

- 実Hono Clientをfetch差し替えしたローカル試験で、本人メール確認→招待→テストのdeliveryId照合→同意→開始/停止→通知登録一覧/解除を確認。外部HTTPリクエストなし。409/同意版不一致/応答喪失時に再送なし。
- Node組み込みテスト11件。型検査成功。3プラットフォームexport成功。`npm ci --dry-run --ignore-scripts --offline`でlock整合を確認。
- Webの本人確認画面・開始同意画面・テスト配信画面を描画し、架空入力でもデモの送信・同意確定が無効なことを確認。
- 確認リンクはTanStack mutation variablesに入れず、画面離脱・背景化・送信時にメモリから消去。Universal Links / App LinksのOS配線は未設定で、確認メールのリンクは明示的な貼付で確認します。
- 同意は画面離脱・背景化・設定version/同意版更新で解除。送信結果が不明な場合、配信履歴を照合してから再操作。本人宛テストの新しい依頼を過去の成功と混同しません。
- Android SDK/Java17/Pixel_10 AVDは存在。Gradleが必要なSDK36/NDK/CMakeを解決し、`:app:assembleDebug` が25分11秒で BUILD SUCCESSFUL。APKは `android/app/build/outputs/apk/debug/app-debug.apk`、ログは `/tmp/deadmans-android-build.log`。adb接続端末は0件で、Androidエミュレータ上の操作は未実施です。
- iOS起動の再調査で、旧生成AppDelegateはiOS27のScene要件によりJS起動前にSIGTRAPすることをcrash reportから確認。`plugins/with-scene-lifecycle.cjs`でインストール済みExpoの公式SceneDelegate/イベント転送を使うよう修正し、冪等性テストを追加。再ビルド成功後、上記の通常ホーム描画と保存診断を確認済みです。
- 独立した診断DBでSQLCipher保存/再接続/再起動/鍵喪失拒否を検証するdev-only画面を追加。リリース/demo以外では作動しません。通常の本文/認証鍵とは別の名前空間です。

主要フローのコミット: `e91ceda`（main）。APIの追加修正45e56ac/e087a7aについては、次の購入ブリッジ接続時に契約を再確認してください。


## 第3区切り: 購入連携と独立レビュー修正

- `8417655`: 認証/チェックインの世代を背景化で失効し、auth header解決後・送信直前に再検査。伝言保存は保存APIの返却versionを採用。保存中の全編集入口を止め、送信snapshotが現在内容と一致した場合だけdirty解除・下書き削除。4再現シナリオとsnapshot保持を回帰テスト化。
- 購入・同一ストア復元を実装。最新API基準 `e087a7a`。StoreKit2 JWS/BillingClient purchaseToken、RevenueCatのUUID連携、サーバー再検証と状態再取得、結果不明時の重複購入防止、fresh復元認証、SecureStore一括切替、古い画面/キャッシュ破棄を実装。実購入・新規認証情報発行・外部設定は未実施。
- ローカル型検査、29件のNodeテスト、3プラットフォームexport成功。iOS/Androidのnative module込みビルド成功。Web DOMで未設定状態と購入/復元操作無効を確認。iOSは通常ホーム起動成功、購入画面へのOSリンク確認のAX取得が失敗して同画面は未検証。
- 復元の結果再取得契約は不足しており、応答喪失/最終Keychain書込失敗では安全側に停止します。別bootstrap・旧Bearer再利用で回避しません。RevenueCatの購入移転設定・実挙動、実機sandboxの署名/所有者照合は未検証です。
- 実装詳細は[購入証明](NATIVE-PROOF-PLAN.md)、外部設定と実機試験の最小手順は[公開前検証](RELEASE-VALIDATION.md)。


## 第4区切り: 復元結果再取得

API `45dc01e` の契約に接続。256bit操作秘密を元fresh Bearerと同一SecureStore envelopeへ送信前保存し、結果APIで最大15分同じ新sessionを再取得します。結果の原子的保存後にだけ旧秘密を除去しcache/画面切替とRevenueCat連携へ進みます。pending/failed/404では旧認証へ戻りません。別復元は元fresh BearerのDELETEが204/401となった後に、別の明示操作で開始します。遅れた旧操作応答を破棄し、通常API・トークン更新・チェックインの自動実行はありません。

型検査・39テスト・3プラットフォームexport成功。native依存/ソース/設定は変更なく、既存expo-cryptoの暗号学的乱数を使用するためnative再ビルドは省略。実機での今回画面操作とsandboxストアは未検証。fresh bootstrapの応答喪失は引き続き対象外です。以前の「結果再取得契約不足」はこの区切りで解消しました。

必要なユーザー設定は[公開前検証の3段階](RELEASE-VALIDATION.md)へ集約しました。外部設定、新しいサーバーキー、稼働DB更新、実購入・送信は行っていません。

## 2026-10-24 ローカルリマインド変更

日次リモートPushを端末内の24時間繰り返し通知へ変更。監視状態取得・開始・チェックイン成功に合わせて予約し、停止・保留・認証失効の検知時に取り消します。通知操作はロック解除後に送信し、受信ではチェックインしません。API更新とアプリ更新を併せて適用してください。詳細と実機未検証事項は[仕様](LOCAL-REMINDERS.md)を参照。
