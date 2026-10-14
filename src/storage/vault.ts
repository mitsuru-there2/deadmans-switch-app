import * as SQLite from "expo-sqlite";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { getInfoAsync } from "expo-file-system/legacy";
import { AppError } from "../api/errors";
import { mode } from "../api/config";

// A separate namespace is used only by the development storage diagnostic.
export function createPrivateStore(namespace: string) {
  if (!/^[a-z0-9-]+$/.test(namespace)) throw new AppError("STORAGE_LOCKED");
  let opening: Promise<SQLite.SQLiteDatabase> | undefined;
  const keyName = `draft-key-${namespace}-v1`;
  async function open() {
    const db = await SQLite.openDatabaseAsync(`private-${namespace}-v1.db`);
    try {
      const cipher = await db.getFirstAsync<Record<string, string>>("PRAGMA cipher_version");
      if (!cipher || !Object.values(cipher).some(Boolean)) throw new AppError("STORAGE_LOCKED");
      let key = await SecureStore.getItemAsync(keyName);
      if (!key) {
        // Inspect file metadata before the first schema read. SQLCipher's key must
        // be set before touching database pages; a nonempty file never gets a new key.
        const uri = db.databasePath.startsWith("file:")
          ? db.databasePath
          : new URL(`file://${db.databasePath}`).href;
        const info = await getInfoAsync(uri);
        if (info.exists && info.size > 0) throw new AppError("STORAGE_LOCKED");
        key = Array.from(await Crypto.getRandomBytesAsync(32), (v) =>
          v.toString(16).padStart(2, "0"),
        ).join("");
        await SecureStore.setItemAsync(keyName, key, {
          keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
        });
      }
      if (!/^[a-f0-9]{64}$/.test(key)) throw new AppError("STORAGE_LOCKED");
      await db.execAsync(`PRAGMA key = "x'${key}'";`);
      await db.execAsync(
        "PRAGMA journal_mode = DELETE; PRAGMA secure_delete = ON; CREATE TABLE IF NOT EXISTS private_values (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);",
      );
      return db;
    } catch {
      await db.closeAsync();
      throw new AppError("STORAGE_LOCKED");
    }
  }
  function database() {
    return (opening ??= open().catch((e) => {
      opening = undefined;
      throw e;
    }));
  }
  async function readPrivate<T>(key: string): Promise<T | null> {
    const row = await (
      await database()
    ).getFirstAsync<{ value: string }>("SELECT value FROM private_values WHERE key = ?", key);
    return row ? (JSON.parse(row.value) as T) : null;
  }
  async function writePrivate(key: string, value: unknown) {
    await (
      await database()
    ).runAsync(
      "INSERT INTO private_values (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
      key,
      JSON.stringify(value),
    );
  }
  async function removePrivate(key: string) {
    await (await database()).runAsync("DELETE FROM private_values WHERE key = ?", key);
  }
  async function clearPrivate() {
    await (
      await database()
    ).execAsync(
      namespace === "api"
        ? "DELETE FROM private_values WHERE key LIKE 'draft:%'; VACUUM;"
        : "DELETE FROM private_values; VACUUM;",
    );
  }
  async function close() {
    const previous = opening;
    opening = undefined;
    if (previous) await (await previous).closeAsync();
  }
  return { readPrivate, writePrivate, removePrivate, clearPrivate, close };
}
const store = createPrivateStore(mode);
export const { readPrivate, writePrivate, removePrivate, clearPrivate } = store;
export const storageDescription =
  "この端末に暗号化して保存されます。端末や鍵を失うと、未同期の下書きは復元できません。";
