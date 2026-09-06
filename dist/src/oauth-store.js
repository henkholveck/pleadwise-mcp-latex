import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { config } from "./config.js";
const memory = new Map();
const encryptionKey = createHash("sha256").update(config.PLUGIN_JWT_SECRET).digest();
let database = null;
let diskQueue = Promise.resolve();
function databaseClient() {
    if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_ROLE_KEY)
        return null;
    database ??= createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
    });
    return database;
}
function storageId(kind, id) {
    return `${kind}:${id}`;
}
async function readDiskState() {
    if (!config.OAUTH_STATE_FILE)
        return {};
    try {
        return JSON.parse(await readFile(config.OAUTH_STATE_FILE, "utf8"));
    }
    catch (error) {
        if (error.code === "ENOENT")
            return {};
        throw error;
    }
}
async function updateDiskState(update) {
    if (!config.OAUTH_STATE_FILE)
        throw new Error("OAuth state file is not configured");
    const operation = diskQueue.then(async () => {
        const state = await readDiskState();
        update(state);
        await mkdir(dirname(config.OAUTH_STATE_FILE), { recursive: true });
        const temporary = `${config.OAUTH_STATE_FILE}.${process.pid}.tmp`;
        await writeFile(temporary, JSON.stringify(state), { mode: 0o600 });
        await rename(temporary, config.OAUTH_STATE_FILE);
    });
    diskQueue = operation.catch(() => undefined);
    return operation;
}
function seal(value) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", encryptionKey, iv);
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
    return `${iv.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${ciphertext.toString("base64url")}`;
}
function open(sealed) {
    const [ivValue, tagValue, ciphertextValue] = sealed.split(".");
    if (!ivValue || !tagValue || !ciphertextValue)
        throw new Error("Invalid OAuth state record");
    const decipher = createDecipheriv("aes-256-gcm", encryptionKey, Buffer.from(ivValue, "base64url"));
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextValue, "base64url")), decipher.final()]);
    return JSON.parse(plaintext.toString("utf8"));
}
export async function putOAuthState(kind, id, value, ttlMilliseconds) {
    const expiresAt = Date.now() + ttlMilliseconds;
    const client = databaseClient();
    if (!client && config.OAUTH_STATE_FILE) {
        await updateDiskState((state) => {
            state[storageId(kind, id)] = { kind, sealedPayload: seal(value), expiresAt };
        });
        return;
    }
    if (!client) {
        memory.set(storageId(kind, id), { value, expiresAt });
        return;
    }
    const { error } = await client.from("pleadwise_plugin_oauth_state").upsert({
        id: storageId(kind, id),
        kind,
        sealed_payload: seal(value),
        expires_at: new Date(expiresAt).toISOString(),
    });
    if (error)
        throw new Error(`OAuth state write failed: ${error.message}`);
}
export async function getOAuthState(kind, id) {
    const key = storageId(kind, id);
    const client = databaseClient();
    if (!client && config.OAUTH_STATE_FILE) {
        await diskQueue;
        const entry = (await readDiskState())[key];
        return entry && entry.kind === kind && entry.expiresAt >= Date.now() ? open(entry.sealedPayload) : null;
    }
    if (!client) {
        const entry = memory.get(key);
        if (!entry || entry.expiresAt < Date.now()) {
            memory.delete(key);
            return null;
        }
        return entry.value;
    }
    const { data, error } = await client.from("pleadwise_plugin_oauth_state")
        .select("sealed_payload").eq("id", key).eq("kind", kind)
        .gt("expires_at", new Date().toISOString()).maybeSingle();
    if (error)
        throw new Error(`OAuth state read failed: ${error.message}`);
    return data ? open(data.sealed_payload) : null;
}
export async function takeOAuthState(kind, id) {
    const key = storageId(kind, id);
    const client = databaseClient();
    if (!client && config.OAUTH_STATE_FILE) {
        let result = null;
        await updateDiskState((state) => {
            const entry = state[key];
            delete state[key];
            if (entry && entry.kind === kind && entry.expiresAt >= Date.now())
                result = open(entry.sealedPayload);
        });
        return result;
    }
    if (!client) {
        const entry = memory.get(key);
        memory.delete(key);
        return entry && entry.expiresAt >= Date.now() ? entry.value : null;
    }
    const { data, error } = await client.from("pleadwise_plugin_oauth_state")
        .delete().eq("id", key).eq("kind", kind)
        .gt("expires_at", new Date().toISOString()).select("sealed_payload").maybeSingle();
    if (error)
        throw new Error(`OAuth state consume failed: ${error.message}`);
    return data ? open(data.sealed_payload) : null;
}
//# sourceMappingURL=oauth-store.js.map