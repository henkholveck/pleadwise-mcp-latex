import { createClient } from "@supabase/supabase-js";
import { jwtVerify, SignJWT } from "jose";
import { config } from "./config.js";
const secret = new TextEncoder().encode(config.PLUGIN_JWT_SECRET);
export async function authenticateBearer(header) {
    const token = header?.startsWith("Bearer ") ? header.slice(7) : null;
    if (!token)
        return null;
    if (config.DEV_BEARER_TOKEN && token === config.DEV_BEARER_TOKEN) {
        return { id: config.DEV_USER_ID, email: config.DEV_USER_EMAIL, emailVerified: true, development: true };
    }
    try {
        const { payload } = await jwtVerify(token, secret, {
            audience: config.PUBLIC_BASE_URL,
            issuer: config.PUBLIC_BASE_URL,
        });
        if (typeof payload.sub !== "string" || typeof payload.supabase_token !== "string")
            return null;
        return {
            id: payload.sub,
            email: typeof payload.email === "string" ? payload.email : undefined,
            emailVerified: payload.email_verified === true,
            supabaseAccessToken: payload.supabase_token,
        };
    }
    catch {
        // During migration, accept an existing Pleadwise Supabase JWT directly.
        if (!config.SUPABASE_URL || !config.SUPABASE_ANON_KEY)
            return null;
        const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data, error } = await supabase.auth.getUser(token);
        if (error || !data.user)
            return null;
        return {
            id: data.user.id,
            email: data.user.email,
            emailVerified: Boolean(data.user.email_confirmed_at),
            supabaseAccessToken: token,
        };
    }
}
export async function issuePluginToken(input) {
    return new SignJWT({
        email: input.email,
        email_verified: input.emailVerified === true,
        scope: input.scope,
        supabase_token: input.supabaseAccessToken,
    })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(input.userId)
        .setIssuer(config.PUBLIC_BASE_URL)
        .setAudience(config.PUBLIC_BASE_URL)
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(secret);
}
export const authChallenge = `Bearer resource_metadata="${config.PUBLIC_BASE_URL}/.well-known/oauth-protected-resource", scope="openid email pleadwise:read pleadwise:format"`;
//# sourceMappingURL=auth.js.map