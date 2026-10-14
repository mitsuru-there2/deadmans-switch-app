const values = new Map<string, string>();
export async function readPrivate<T>(key: string): Promise<T | null> {
  const value = values.get(key);
  return value ? (JSON.parse(value) as T) : null;
}
export async function writePrivate(key: string, value: unknown) {
  values.set(key, JSON.stringify(value));
}
export async function removePrivate(key: string) {
  values.delete(key);
}
export async function clearPrivate() {
  values.clear();
}
export const storageDescription =
  "ブラウザの開発プレビューです。下書きはメモリ内だけに保存され、再読み込みで消えます。";
