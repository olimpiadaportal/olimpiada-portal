// Session storage for supabase-js, backed ENTIRELY by the OS keystore
// (expo-secure-store). Tokens never touch plain AsyncStorage or MMKV.
//
// SecureStore values are capped (~2KB on some platforms) and a Supabase session
// JSON can exceed that, so values are CHUNKED: `${key}.meta` holds the chunk
// count, `${key}.0..n` hold the pieces. Everything stays inside the keystore,
// which is why chunking was chosen over the encrypt-then-cache-elsewhere
// adapter — fewer moving parts, no hand-rolled crypto.
import * as SecureStore from "expo-secure-store";

const CHUNK = 1800;

function sanitize(key: string): string {
  // SecureStore keys allow [A-Za-z0-9._-]; supabase's default storage key does
  // too, but stay defensive.
  return key.replace(/[^A-Za-z0-9._-]/g, "_");
}

export const secureSessionStorage = {
  async getItem(rawKey: string): Promise<string | null> {
    const key = sanitize(rawKey);
    try {
      const meta = await SecureStore.getItemAsync(`${key}.meta`);
      if (!meta) return null;
      const count = Number.parseInt(meta, 10);
      if (!Number.isFinite(count) || count <= 0) return null;
      const parts: string[] = [];
      for (let i = 0; i < count; i++) {
        const part = await SecureStore.getItemAsync(`${key}.${i}`);
        if (part === null) return null;
        parts.push(part);
      }
      return parts.join("");
    } catch {
      return null;
    }
  },

  async setItem(rawKey: string, value: string): Promise<void> {
    const key = sanitize(rawKey);
    try {
      const chunks: string[] = [];
      for (let i = 0; i < value.length; i += CHUNK) {
        chunks.push(value.slice(i, i + CHUNK));
      }
      // Write data first, meta last, so a torn write can never claim more
      // chunks than exist.
      for (let i = 0; i < chunks.length; i++) {
        await SecureStore.setItemAsync(`${key}.${i}`, chunks[i]);
      }
      const oldMeta = await SecureStore.getItemAsync(`${key}.meta`);
      await SecureStore.setItemAsync(`${key}.meta`, String(chunks.length));
      // Trim leftover chunks from a previously longer value.
      const oldCount = oldMeta ? Number.parseInt(oldMeta, 10) : 0;
      for (let i = chunks.length; i < oldCount; i++) {
        await SecureStore.deleteItemAsync(`${key}.${i}`).catch(() => {});
      }
    } catch {
      // A failed persist must not crash auth; the session just won't survive
      // a restart.
    }
  },

  async removeItem(rawKey: string): Promise<void> {
    const key = sanitize(rawKey);
    try {
      const meta = await SecureStore.getItemAsync(`${key}.meta`);
      const count = meta ? Number.parseInt(meta, 10) : 0;
      await SecureStore.deleteItemAsync(`${key}.meta`).catch(() => {});
      for (let i = 0; i < Math.max(count, 0); i++) {
        await SecureStore.deleteItemAsync(`${key}.${i}`).catch(() => {});
      }
    } catch {
      // ignore
    }
  },
};
