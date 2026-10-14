import * as SQLite from "expo-sqlite";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
import { AppError } from "../api/errors";
import { mode } from "../api/config";

let opening: Promise<SQLite.SQLiteDatabase> | undefined;
const keyName = `draft-key-${mode}-v1`;
async function open() {
  const db = await SQLite.openDatabaseAsync(`private-${mode}-v1.db`);
  try {
    const cipher = await db.getFirstAsync<Record<string, string>>("PRAGMA cipher_version");
    if (!cipher || !Object.values(cipher).some(Boolean)) throw new AppError("STORAGE_LOCKED");
    let key = await SecureStore.getItemAsync(keyName);
    if (!key) {
      // Never replace a lost key for an existing encrypted database.
      // SQLCipher throws here when the existing file is encrypted.
      const tables = await db.getAllAsync("SELECT name FROM sqlite_master WHERE type = 'table'");
      if (tables.length > 0) throw new AppError("STORAGE_LOCKED");
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
export async function readPrivate<T>(key: string): Promise<T | null> {
  const row = await (
    await database()
  ).getFirstAsync<{ value: string }>("SELECT value FROM private_values WHERE key = ?", key);
  return row ? (JSON.parse(row.value) as T) : null;
}
export async function writePrivate(key: string, value: unknown) {
  await (
    await database()
  ).runAsync(
    "INSERT INTO private_values (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    key,
    JSON.stringify(value),
  );
}
export async function removePrivate(key: string) {
  await (await database()).runAsync("DELETE FROM private_values WHERE key = ?", key);
}
export async function clearPrivate() {
  await (await database()).execAsync("DELETE FROM private_values; VACUUM;");
}
export const storageDescription =
  "この端末に暗号化して保存されます。端末や鍵を失うと、未同期の下書きは復元できません。";
