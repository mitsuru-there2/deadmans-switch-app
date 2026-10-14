export function resolveMode(dev: boolean, mode: string | undefined, url: string | undefined) {
  if (dev && mode === "demo") return "demo" as const;
  if (mode === "api" && url) {
    try {
      const u = new URL(url);
      if (
        u.protocol === "https:" ||
        (dev &&
          u.protocol === "http:" &&
          ["localhost", "127.0.0.1", "10.0.2.2"].includes(u.hostname))
      )
        return "api" as const;
    } catch {
      /* Invalid URLs stay unavailable. */
    }
  }
  return "unconfigured" as const;
}
export const apiUrl = process.env.EXPO_PUBLIC_API_URL;
export const mode = resolveMode(
  typeof __DEV__ !== "undefined" && __DEV__,
  process.env.EXPO_PUBLIC_APP_MODE,
  apiUrl,
);
