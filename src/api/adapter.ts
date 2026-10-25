import { Platform } from "react-native";
import { apiUrl, mode } from "./config";
import { AppError } from "./errors";
import { getSession, identityRevision, subscribeIdentity } from "./session";
import { createLiveGateway, type Gateway } from "./live";
import type { Me, Recipient, Message } from "../domain/models";
import { cancelReminders, syncReminders } from "../services/reminders";
import { readPrivate, writePrivate } from "../storage/vault";
const remote = createLiveGateway(apiUrl ?? "https://unconfigured.invalid", {
  headers: async () => {
    if (mode !== "api" || Platform.OS === "web") throw new AppError("UNCONFIGURED");
    return { Authorization: `Bearer ${(await getSession()).token}` };
  },
  fetch: async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    try {
      const revision = identityRevision();
      const response = await fetch(input, {
        ...init,
        signal: AbortSignal.timeout(15000),
      });
      if (revision !== identityRevision()) throw new AppError("UNAUTHORIZED");
      return response;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("NETWORK");
    }
  },
});
// Status snapshots drive local reminders; local scheduling never calls check-in.
let reminderEpoch = 0;
subscribeIdentity(() => {
  reminderEpoch++;
  void cancelReminders().catch(() => {});
});
async function observeStatus(epoch = reminderEpoch) {
  const me = await remote.me();
  if (epoch === reminderEpoch) await syncReminders(me.switch).catch(() => {});
  return me;
}
async function authenticationFailed(error: unknown) {
  if (
    error instanceof AppError &&
    ["UNAUTHORIZED", "RECOVERY_REQUIRED", "SUBSCRIPTION_REQUIRED"].includes(error.code)
  ) {
    reminderEpoch++;
    await cancelReminders().catch(() => {});
  }
}
async function changeMonitoring(operation: () => Promise<void>, stop = false) {
  const epoch = ++reminderEpoch;
  try {
    await operation();
    if (stop && epoch === reminderEpoch) await cancelReminders().catch(() => {});
    // A successful operation stays successful even if the follow-up read or
    // OS scheduler fails. The server remains authoritative for check-in.
    if (epoch === reminderEpoch) await observeStatus(epoch).catch(authenticationFailed);
  } catch (error) {
    await authenticationFailed(error);
    throw error;
  }
}
const live: Gateway = {
  ...remote,
  me: async () => {
    try {
      return await observeStatus();
    } catch (error) {
      await authenticationFailed(error);
      throw error;
    }
  },
  checkIn: (kind, authorizeSend) => changeMonitoring(() => remote.checkIn(kind, authorizeSend)),
  activate: (version, consentVersion) =>
    changeMonitoring(() => remote.activate(version, consentVersion)),
  pause: () => changeMonitoring(() => remote.pause(), true),
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
    return { version: data.me.switch.version };
  });
  demoQueue = result.catch(() => {});
  return result;
}
const demoUnavailable = async (): Promise<never> => {
  throw new AppError("DEMO_ONLY");
};
const demo: Gateway = {
  billingAccount: demoUnavailable,
  subscriptions: demoUnavailable,
  verifyPurchase: demoUnavailable,
  requestContact: demoUnavailable,
  confirmContact: demoUnavailable,
  invite: demoUnavailable,
  deliveries: async () => [],
  selfTest: demoUnavailable,
  activate: demoUnavailable,
  devices: async () => [],
  registerDevice: demoUnavailable,
  removeDevice: demoUnavailable,

  me: async () => (await demoRead()).me,
  recipients: async () => (await demoRead()).recipients,
  messages: async () => (await demoRead()).messages,
  addRecipient: async (input, version) => {
    await demoChange((data) => {
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
    }, version);
  },
  removeRecipient: async (id, version) => {
    await demoChange((data) => {
      data.recipients = data.recipients.filter((r) => r.id !== id);
      data.messages = data.messages.filter((m) => m.recipientId !== id);
    }, version);
  },
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
  settings: async (inactivityDays, graceDays, version) => {
    await demoChange((data) => {
      Object.assign(data.me.switch, { inactivityDays, graceDays });
    }, version);
  },
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
