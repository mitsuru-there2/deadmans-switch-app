// Native I/O is injected so schedule/stop races can be tested without an OS.
export function createReminderController(io: {
  list(): Promise<string[]>;
  cancel(id: string): Promise<void>;
  allowed(): Promise<boolean>;
  schedule(): Promise<string>;
}) {
  let generation = 0;
  let applied: string | null = null;
  let queue: Promise<void> = Promise.resolve();
  return {
    replace(key: string | null) {
      const intent = ++generation;
      const operation = queue
        .catch(() => {})
        .then(async () => {
          if (intent !== generation) return;
          const ids = await io.list();
          const enabled = key !== null && (await io.allowed());
          if (intent !== generation) return;
          if (enabled && applied === key && ids.length === 1) return;
          for (const id of ids) await io.cancel(id);
          applied = null;
          if (!enabled || intent !== generation) return;
          const id = await io.schedule();
          if (intent !== generation) {
            await io.cancel(id);
            return;
          }
          applied = key;
        });
      queue = operation;
      return operation;
    },
  };
}

export function createReminderIntent(now = Date.now) {
  let pendingUntil = 0;
  let previous = "";
  return {
    receive(key: string) {
      if (key === previous) return false;
      previous = key;
      pendingUntil = now() + 120_000;
      return true;
    },
    take() {
      const fresh = pendingUntil > now();
      pendingUntil = 0;
      return fresh;
    },
    clear() {
      pendingUntil = 0;
    },
  };
}
