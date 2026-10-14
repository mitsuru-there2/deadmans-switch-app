import { z } from "zod";

export const stateSchema = z.enum(["draft", "active", "grace", "released", "paused", "held"]);
export const switchSchema = z.object({
  id: z.string(),
  userId: z.string(),
  state: stateSchema,
  version: z.number().int().positive(),
  inactivityDays: z.number().int(),
  graceDays: z.number().int(),
  lastCheckInAt: z.number().nullable(),
  confirmationDueAt: z.number().nullable(),
  earliestReleaseAt: z.number().nullable(),
  holdReason: z.string().nullable(),
  consentVersion: z.string(),
  serverTime: z.number(),
  activationBlockers: z.array(z.string()),
  entitlement: z
    .object({
      plan: z.enum(["basic", "plus"]),
      status: z.enum(["active", "grace", "expired", "revoked"]),
      validUntil: z.number(),
    })
    .nullable(),
});
export const meSchema = z.object({
  user: z.object({ id: z.string(), email: z.string().nullable(), emailVerified: z.boolean() }),
  switch: switchSchema,
});
export const recipientSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  channel: z.literal("email"),
  status: z.enum(["pending", "accepted", "declined", "reported"]),
  acceptedAt: z.number().nullable(),
  invitationExpiresAt: z.number().nullable(),
  nextInvitationAt: z.number().nullable(),
});
export const messageSchema = z.object({
  id: z.string(),
  recipientId: z.string(),
  title: z.string(),
  body: z.string(),
  revision: z.number(),
  updatedAt: z.number(),
});
export const messageInputSchema = z.object({
  title: z.string().trim().min(1, "件名を入力してください").max(200, "件名は200文字までです"),
  body: z.string().trim().min(1, "伝言を入力してください").max(20000, "本文は20,000文字までです"),
});
export const recipientInputSchema = z.object({
  name: z.string().trim().min(1, "名前を入力してください").max(100),
  email: z.email("メールアドレスを確認してください").max(254),
});
export const settingsInputSchema = z.object({
  inactivityDays: z.number().int().min(7).max(365),
  graceDays: z.number().int().min(3).max(30),
});
export type Switch = z.infer<typeof switchSchema>;
export type Me = z.infer<typeof meSchema>;
export type Recipient = z.infer<typeof recipientSchema>;
export type Message = z.infer<typeof messageSchema>;
export type MessageInput = z.infer<typeof messageInputSchema>;
export type RecipientInput = z.infer<typeof recipientInputSchema>;
export type Draft = MessageInput & { recipientId: string; baseVersion: number; updatedAt: number };
export const editable = (s: Switch) => ["draft", "paused", "held"].includes(s.state);
export const entitled = (s: Switch, now = Date.now()) =>
  !!s.entitlement &&
  ["active", "grace"].includes(s.entitlement.status) &&
  s.entitlement.validUntil > now;
export const stateCopy: Record<Switch["state"], { title: string; detail: string }> = {
  draft: { title: "準備中", detail: "宛先と伝言を準備しましょう。監視はまだ始まっていません。" },
  active: { title: "見守り中", detail: "サーバーに記録された期限に沿って確認を続けています。" },
  grace: {
    title: "確認を待っています",
    detail: "本人への警告後の猶予期間です。今の状態を知らせてください。",
  },
  released: {
    title: "公開手続きに入りました",
    detail: "リンク通知の配信完了を意味しません。確認すると公開を停止します。",
  },
  paused: { title: "停止中", detail: "チェックインしても監視は自動で再開しません。" },
  held: {
    title: "安全のため保留中",
    detail: "問題の解消と内容の再確認が必要です。自動では再開しません。",
  },
};
export const consentCopy = {
  pending: "未承諾",
  accepted: "受取承諾済み",
  declined: "辞退",
  reported: "通報あり",
};
export const formatDate = (value: number | null) =>
  value === null
    ? "未確定"
    : new Intl.DateTimeFormat("ja-JP", {
        timeZone: "Asia/Tokyo",
        dateStyle: "medium",
        timeStyle: "short",
      }).format(value);
