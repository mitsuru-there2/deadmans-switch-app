export class AppError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.code = code;
  }
}
const copy: Record<string, string> = {
  STALE_CHECKIN_INTENT: "画面がロックされたため、未送信の確認操作を破棄しました。解除後に改めて確認してください。",
  NOTIFICATIONS_UNCONFIGURED: "通知の配信設定が未完了です。まだ登録されていません。",
  NOTIFICATIONS_DENIED: "通知は許可されていません。必要な場合は OS の設定で許可してください。",
  DEVICE_LIMIT: "通知は最大5端末です。不要な登録を解除してから登録してください。",
  DEVICE_ALREADY_REGISTERED:
    "この通知先は別のアカウントに登録されています。復旧手順を確認してください。",
  INVALID_CONTACT_LINK:
    "確認リンクは無効か期限切れです。この端末で依頼した最新のリンクを確認してください。",
  CONTACT_ALREADY_VERIFIED: "本人メールは確認済みです。状態を更新してください。",
  VERIFIED_EMAIL_REQUIRED: "本人メールの確認を先に完了してください。",
  CONSENT_VERSION_REQUIRED: "同意文が更新されました。全文を読み直してから改めて同意してください。",
  RATE_LIMITED: "操作回数の上限に達しました。時間を置いて状態を確認してください。",
  VERSION_CONFLICT:
    "別の操作で内容が更新されています。下書きは残っています。最新の内容を確認してから保存し直してください。",
  PAUSE_BEFORE_EDITING: "編集する前に見守りを停止してください。",
  SUBSCRIPTION_REQUIRED: "サーバーで確認済みの有効な契約が必要です。",
  UNAUTHORIZED: "端末認証の更新が必要です。購入復元の接続が完了するまで操作できません。",
  NETWORK:
    "通信を確認できませんでした。操作が届いた可能性もあるため、状態を更新して確認してください。チェックインは新しく操作してください。",
  UNCONFIGURED: "サービス接続は未設定です。開発用デモはリリース版では利用できません。",
  LOCK_REQUIRED: "端末のパスコードまたは生体認証を設定してから、もう一度開いてください。",
  STORAGE_LOCKED:
    "暗号化した下書きを開けません。鍵がない場合は復元できません。保存済みとして扱いません。",
  JAPAN_ONLY: "現在の接続地域では利用できません。日本国内から再度確認してください。",
  DEMO_ONLY: "デモではサーバーのチェックイン・送信・購入は行いません。",
  CONTRACT_PENDING: "この機能は接続契約の確認中です。操作は実行されていません。",
};
export const errorText = (e: unknown) =>
  e instanceof AppError
    ? (copy[e.code] ?? "操作を完了できませんでした。状態を更新して確認してください。")
    : "操作を完了できませんでした。入力と接続状態を確認してください。";
