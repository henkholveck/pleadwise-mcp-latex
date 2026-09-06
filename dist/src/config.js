import { z } from "zod";
const schema = z.object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3000),
    PUBLIC_BASE_URL: z.string().url().default("http://localhost:3000"),
    PLEADWISE_WEB_URL: z.string().url().default("https://pleadwise.com"),
    PLEADWISE_API_BASE_URL: z.string().url().default("https://pleadwise.com"),
    SUPABASE_URL: z.string().url().optional(),
    SUPABASE_ANON_KEY: z.string().min(1).optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
    OAUTH_STATE_FILE: z.string().min(1).optional(),
    OPENAI_APPS_CHALLENGE: z.string().min(1).optional(),
    PLUGIN_JWT_SECRET: z.string().min(32).default("local-development-secret-change-me-now"),
    DEV_BEARER_TOKEN: z.string().optional(),
    DEV_USER_ID: z.string().default("00000000-0000-0000-0000-000000000001"),
    DEV_USER_EMAIL: z.string().email().default("developer@example.com"),
    DEV_ENTITLEMENT: z.enum(["free", "paid"]).default("free"),
    ARTIFACT_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    MAX_DOCUMENT_CHARACTERS: z.coerce.number().int().positive().max(500000).default(200000),
});
export const config = schema.parse(process.env);
if (config.NODE_ENV === "production") {
    if (config.PLUGIN_JWT_SECRET === "local-development-secret-change-me-now") {
        throw new Error("PLUGIN_JWT_SECRET must be set to a unique production secret");
    }
    if (config.DEV_BEARER_TOKEN)
        throw new Error("DEV_BEARER_TOKEN must not be set in production");
    if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY) {
        throw new Error("SUPABASE_URL and SUPABASE_ANON_KEY are required in production");
    }
    if (!config.SUPABASE_SERVICE_ROLE_KEY && !config.OAUTH_STATE_FILE) {
        throw new Error("SUPABASE_SERVICE_ROLE_KEY or OAUTH_STATE_FILE is required for production OAuth state storage");
    }
    if (!config.PUBLIC_BASE_URL.startsWith("https://"))
        throw new Error("PUBLIC_BASE_URL must use HTTPS in production");
}
//# sourceMappingURL=config.js.map