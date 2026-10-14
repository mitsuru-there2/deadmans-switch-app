import { createApiClient } from "deadmans-switch-api/client";
import { currentConsentSchema } from "deadmans-switch-api/responses";
import { z } from "zod";
import { Platform } from "react-native";
import { apiUrl, mode } from "./config";
import { AppError } from "./errors";
import { getSession } from "./session";
import {
  meSchema,
  recipientSchema,
  messageSchema,
  type Me,
  type Recipient,
  type Message,
  type MessageInput,
  type RecipientInput,
} from "../domain/models";
import { readPrivate, writePrivate } from "../storage/vault";

export interface Gateway {
  me(): Promise<Me>;
  recipients(): Promise<Recipient[]>;
  messages(): Promise<Message[]>;
  addRecipient(input: RecipientInput, version: number): Promise<void>;
  removeRecipient(id: string, version: number): Promise<void>;
  saveMessage(id: string, input: MessageInput, version: number): Promise<void>;
  settings(inactivityDays: number, graceDays: number, version: number): Promise<void>;
  checkIn(kind: "foreground" | "notification_action"): Promise<void>;
  pause(): Promise<void>;
  consent(): Promise<{
    version: string;
    language: "ja";
    effectiveAt: number;
    title: string;
    body: string;
  }>;
}
const rpc = createApiClient(apiUrl ?? "https://unconfigured.invalid", {
  headers: async () => {
    if (mode !== "api" || Platform.OS === "web") throw new AppError("UNCONFIGURED");
    return { Authorization: `Bearer ${(await getSession()).token}` };
  },
  fetch: async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    try {
      return await fetch(input, { ...init, signal: AbortSignal.timeout(15000) });
    } catch {
      throw new AppError("NETWORK");
    }
  },
});
async function decode(request: Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>) {
  const response = await request;
  if (!response.ok) {
    const body = z
      .object({ error: z.object({ code: z.string() }) })
      .safeParse(await response.json().catch(() => null));
    throw new AppError(
      response.status === 401 ? "UNAUTHORIZED" : body.success ? body.data.error.code : "NETWORK",
    );
  }
  return response.json() as Promise<unknown>;
}
const live: Gateway = {
  me: async () => meSchema.parse(await decode(rpc.v1.me.$get())),
  recipients: async () =>
    z.object({ recipients: z.array(recipientSchema) }).parse(await decode(rpc.v1.recipients.$get()))
      .recipients,
  messages: async () =>
    z.object({ messages: z.array(messageSchema) }).parse(await decode(rpc.v1.messages.$get()))
      .messages,
  addRecipient: async (input, version) => {
    await decode(rpc.v1.recipients.$post({ json: { ...input, channel: "email", version } }));
  },
  removeRecipient: async (id, version) => {
    await decode(rpc.v1.recipients[":id"].$delete({ param: { id }, json: { version } }));
  },
  saveMessage: async (id, input, version) => {
    await decode(
      rpc.v1.recipients[":id"].message.$put({ param: { id }, json: { ...input, version } }),
    );
  },
  settings: async (inactivityDays, graceDays, version) => {
    await decode(rpc.v1.switch.$patch({ json: { inactivityDays, graceDays, version } }));
  },
  checkIn: async (kind) => {
    await decode(rpc.v1["check-ins"].$post({ json: { kind } }));
  },
  pause: async () => {
    await decode(rpc.v1.switch.pause.$post());
  },
  consent: async () => currentConsentSchema.parse(await decode(rpc.v1.consents.current.$get())),
};
type DemoData = { me: Me; recipients: Recipient[]; messages: Message[] };
const initial = (): DemoData => ({
  me: {
    user: { id: "demo", email: null, emailVerified: false },
    switch: {
      id: "demo",
      userId: "demo",
      state: "draft",
      version: 1,
      inactivityDays: 30,
      graceDays: 7,
      lastCheckInAt: null,
      confirmationDueAt: null,
      earliestReleaseAt: null,
      holdReason: null,
      consentVersion: "unconfigured",
      entitlement: null,
      serverTime: 0,
      activationBlockers: [],
    },
  },
  recipients: [],
  messages: [],
});
let demoQueue: Promise<unknown> = Promise.resolve();
async function demoRead() {
  return (await readPrivate<DemoData>("demo-data")) ?? initial();
}
function demoChange(fn: (data: DemoData) => void, version: number) {
  const result = demoQueue.then(async () => {
    const data = await demoRead();
    if (data.me.switch.version !== version) throw new AppError("VERSION_CONFLICT");
    fn(data);
    data.me.switch.version++;
    await writePrivate("demo-data", data);
  });
  demoQueue = result.catch(() => {});
  return result;
}
const demo: Gateway = {
  me: async () => (await demoRead()).me,
  recipients: async () => (await demoRead()).recipients,
  messages: async () => (await demoRead()).messages,
  addRecipient: async (input, version) =>
    demoChange((data) => {
      if (data.recipients.length >= 10) throw new AppError("SUBSCRIPTION_REQUIRED");
      data.recipients.push({
        ...input,
        id: `demo-${Date.now()}-${data.me.switch.version}`,
        channel: "email",
        status: "pending",
        acceptedAt: null,
        invitationExpiresAt: null,
        nextInvitationAt: null,
      });
    }, version),
  removeRecipient: async (id, version) =>
    demoChange((data) => {
      data.recipients = data.recipients.filter((r) => r.id !== id);
      data.messages = data.messages.filter((m) => m.recipientId !== id);
    }, version),
  saveMessage: async (id, input, version) =>
    demoChange((data) => {
      const old = data.messages.find((m) => m.recipientId === id);
      data.messages = [
        ...data.messages.filter((m) => m.recipientId !== id),
        {
          ...input,
          id: `message-${id}`,
          recipientId: id,
          revision: (old?.revision ?? 0) + 1,
          updatedAt: Date.now(),
        },
      ];
    }, version),
  settings: async (inactivityDays, graceDays, version) =>
    demoChange((data) => {
      Object.assign(data.me.switch, { inactivityDays, graceDays });
    }, version),
  consent: async () => {
    throw new AppError("DEMO_ONLY");
  },
  checkIn: async () => {
    throw new AppError("DEMO_ONLY");
  },
  pause: async () => {
    throw new AppError("DEMO_ONLY");
  },
};
export const gateway = mode === "demo" ? demo : live;
