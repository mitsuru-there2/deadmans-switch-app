// An unlock and its unsent intentions belong to one foreground generation.
export function createForegroundAuthority(isForeground: () => boolean) {
  let generation = 0;
  let unlocked = false;
  return {
    beginUnlock() { unlocked = false; return ++generation; },
    completeUnlock(value: number) {
      if (value !== generation || !isForeground()) return false;
      unlocked = true; return true;
    },
    lock() { generation++; unlocked = false; },
    current: () => generation,
    valid: (value: number) => value === generation && unlocked && isForeground(),
  };
}
