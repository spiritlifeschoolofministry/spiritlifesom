import { initAuthCreds, BufferJSON, proto } from "@whiskeysockets/baileys";
import type {
  AuthenticationCreds,
  AuthenticationState,
  SignalDataTypeMap,
} from "@whiskeysockets/baileys";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Baileys auth state backed by Postgres instead of a folder.
 *
 * This is the Supabase equivalent of Baileys' own useMultiFileAuthState, whose
 * documentation tells you not to use it in production and which would in any
 * case be wiped by every Render deploy. The shape it returns is identical, so
 * the socket cannot tell the difference: `creds` plus a key store with get/set,
 * and a saveCreds to call on the creds.update event.
 *
 * Two details are carried over from the reference implementation because
 * getting them wrong breaks the session in ways that only show up later:
 *
 *   - 'app-state-sync-key' values must be rehydrated through the protobuf type.
 *     A plain object survives the round trip through JSON looking correct, then
 *     fails during app state sync with an opaque decryption error.
 *   - A null value in a set() is a *deletion*, not a write of null. Storing the
 *     null instead leaves a tombstone that reads back as a key that exists and
 *     decrypts to nothing.
 */

/** Postgres primary keys, unlike filenames, tolerate '/' and ':' -- but the
 *  prefix still matters: it keeps the single creds row from ever colliding with
 *  a key row, whatever WhatsApp decides to call a key type in future. */
const credsId = "creds";
const keyId = (type: string, id: string) => `key-${type}-${id}`;

/** Round-trips a value through BufferJSON so binary key material survives.
 *  jsonb cannot hold a Buffer; BufferJSON's replacer turns one into a tagged
 *  object and its reviver turns it back. */
const encode = (value: unknown) =>
  JSON.parse(JSON.stringify(value, BufferJSON.replacer));
const decode = (value: unknown) =>
  JSON.parse(JSON.stringify(value), BufferJSON.reviver);

export async function useSupabaseAuthState(
  supabase: SupabaseClient,
): Promise<{ state: AuthenticationState; saveCreds: () => Promise<void> }> {
  const table = () => supabase.from("whatsapp_auth_state");

  async function read(id: string): Promise<any | null> {
    const { data, error } = await table()
      .select("value")
      .eq("id", id)
      .maybeSingle();

    // A read failure is not the same as "no session". If the database is
    // unreachable we must not fall through to initAuthCreds(), because that
    // silently discards a perfectly good pairing and asks for a new QR. Throw
    // instead and let the process crash-loop until the database comes back.
    if (error) {
      throw new Error(`Reading auth state ${id} failed: ${error.message}`);
    }
    return data ? decode(data.value) : null;
  }

  async function write(id: string, value: unknown): Promise<void> {
    const { error } = await table().upsert(
      { id, value: encode(value), updated_at: new Date().toISOString() },
      { onConflict: "id" },
    );
    if (error) {
      throw new Error(`Writing auth state ${id} failed: ${error.message}`);
    }
  }

  async function remove(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    const { error } = await table().delete().in("id", ids);
    if (error) {
      throw new Error(`Deleting auth state failed: ${error.message}`);
    }
  }

  const creds: AuthenticationCreds = (await read(credsId)) || initAuthCreds();

  return {
    state: {
      creds,
      keys: {
        get: async (type, ids) => {
          const result: { [id: string]: SignalDataTypeMap[typeof type] } = {};
          if (ids.length === 0) return result;

          // One query for the whole batch. Baileys asks for many keys at once
          // when decrypting a busy chat, and a per-id round trip to Supabase
          // would turn a single message into dozens of network calls.
          const wanted = ids.map((id) => keyId(type, id));
          const { data, error } = await table()
            .select("id, value")
            .in("id", wanted);
          if (error) {
            throw new Error(`Reading ${type} keys failed: ${error.message}`);
          }

          for (const row of data ?? []) {
            const id = ids.find((candidate) => keyId(type, candidate) === row.id);
            if (!id) continue;
            let value = decode(row.value);
            if (type === "app-state-sync-key" && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(value);
            }
            result[id] = value;
          }
          return result;
        },

        set: async (data) => {
          const writes: Promise<void>[] = [];
          const deletions: string[] = [];

          for (const category in data) {
            const entries = data[category as keyof SignalDataTypeMap];
            for (const id in entries) {
              const value = (entries as Record<string, unknown>)[id];
              if (value) {
                writes.push(write(keyId(category, id), value));
              } else {
                deletions.push(keyId(category, id));
              }
            }
          }

          await Promise.all([...writes, remove(deletions)]);
        },
      },
    },

    saveCreds: async () => {
      await write(credsId, creds);
    },
  };
}

/**
 * Forget the pairing entirely.
 *
 * Called only when WhatsApp itself reports the device was logged out -- the one
 * case where reconnecting is pointless, because the credentials no longer refer
 * to anything. Leaving them in place would produce an endless reconnect loop
 * against a session that has already been revoked, which is exactly the
 * behaviour WhatsApp bans numbers for.
 */
export async function clearAuthState(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase
    .from("whatsapp_auth_state")
    .delete()
    .not("id", "is", null);
  if (error) {
    throw new Error(`Clearing auth state failed: ${error.message}`);
  }
}
