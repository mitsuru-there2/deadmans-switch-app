import type { Delivery } from "deadmans-switch-api/responses";
import type { Recipient, Switch } from "./models.ts";
import { editable, entitled } from "./models.ts";

export const deliveryCopy: Record<Delivery["state"], string> = {
  pending: "送信待ち",
  sending: "送信処理中",
  accepted: "配信サービスが受付済み",
  delivered: "配信完了",
  failed: "配信失敗",
  uncertain: "結果不明 · 再送前に確認",
  cancelled: "取消済み",
};
export const testSucceeded = (delivery?: Delivery) =>
  delivery?.kind === "self_test" && ["accepted", "delivered"].includes(delivery.state);
export const canInvite = (recipient: Recipient, state: Switch) =>
  editable(state) &&
  entitled(state) &&
  recipient.status === "pending" &&
  recipient.nextInvitationAt !== null &&
  recipient.nextInvitationAt <= state.serverTime;
export const canActivate = (state: Switch) =>
  editable(state) && entitled(state) && state.activationBlockers.length === 0;
// Pasted links stay in memory, never navigate or transmit to their origin.
export function contactToken(input: string): string | null {
  const raw = input.trim();
  let token = raw;
  if (raw.includes("://")) {
    try {
      const url = new URL(raw);
      if (
        !["https:", "http:"].includes(url.protocol) ||
        url.pathname !== "/confirm-contact" ||
        url.search ||
        url.username ||
        url.password
      )
        return null;
      token = url.hash.slice(1);
    } catch {
      return null;
    }
  }
  return /^[A-Za-z0-9_-]{32,256}$/.test(token) ? token : null;
}
