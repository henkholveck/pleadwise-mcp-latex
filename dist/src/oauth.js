import { createHash, randomUUID } from "node:crypto";
import { authenticateBearer, issuePluginToken } from "./auth.js";
import { config } from "./config.js";
import { getOAuthState, putOAuthState, takeOAuthState } from "./oauth-store.js";
const supportedScopes = ["openid", "email", "pleadwise:read", "pleadwise:format"];
export function registerOAuthRoutes(app) {
    app.get("/.well-known/oauth-protected-resource", (_req, res) => res.json({
        resource: config.PUBLIC_BASE_URL,
        authorization_servers: [config.PUBLIC_BASE_URL],
        scopes_supported: supportedScopes,
        resource_documentation: `${config.PUBLIC_BASE_URL}/docs`,
        resource_policy_uri: `${config.PLEADWISE_WEB_URL}/privacy`,
        resource_tos_uri: `${config.PLEADWISE_WEB_URL}/terms`,
    }));
    const metadata = {
        issuer: config.PUBLIC_BASE_URL,
        authorization_endpoint: `${config.PUBLIC_BASE_URL}/oauth/authorize`,
        token_endpoint: `${config.PUBLIC_BASE_URL}/oauth/token`,
        userinfo_endpoint: `${config.PUBLIC_BASE_URL}/oauth/userinfo`,
        registration_endpoint: `${config.PUBLIC_BASE_URL}/oauth/register`,
        response_types_supported: ["code"],
        grant_types_supported: ["authorization_code"],
        code_challenge_methods_supported: ["S256"],
        token_endpoint_auth_methods_supported: ["none"],
        scopes_supported: supportedScopes,
    };
    app.get("/.well-known/oauth-authorization-server", (_req, res) => res.json(metadata));
    app.get("/.well-known/openid-configuration", (_req, res) => res.json(metadata));
    app.post("/oauth/register", async (req, res) => {
        const redirectUris = Array.isArray(req.body?.redirect_uris) ? req.body.redirect_uris.filter(validRedirectUri) : [];
        if (!redirectUris.length)
            return oauthError(res, 400, "invalid_redirect_uri");
        const clientId = randomUUID();
        await putOAuthState("client", clientId, { clientId, redirectUris, name: String(req.body?.client_name || "OpenAI MCP client").slice(0, 120) }, 180 * 24 * 60 * 60_000);
        res.status(201).json({ client_id: clientId, client_name: req.body?.client_name, redirect_uris: redirectUris, token_endpoint_auth_method: "none", grant_types: ["authorization_code"], response_types: ["code"] });
    });
    app.get("/oauth/authorize", async (req, res) => {
        const q = req.query;
        const clientId = String(q.client_id || "");
        const redirectUri = String(q.redirect_uri || "");
        const client = await getOAuthState("client", clientId);
        if (!client || !client.redirectUris.includes(redirectUri))
            return oauthError(res, 400, "invalid_client");
        if (q.response_type !== "code" || q.code_challenge_method !== "S256" || !q.code_challenge)
            return oauthError(res, 400, "invalid_request");
        const requestId = randomUUID();
        const scope = typeof q.scope === "string" ? q.scope : supportedScopes.join(" ");
        if (!scope.split(/\s+/).every((value) => supportedScopes.includes(value)))
            return oauthError(res, 400, "invalid_scope");
        await putOAuthState("pending", requestId, {
            clientId,
            redirectUri,
            state: typeof q.state === "string" ? q.state : undefined,
            scope,
            codeChallenge: String(q.code_challenge),
            resource: typeof q.resource === "string" ? q.resource : config.PUBLIC_BASE_URL,
        }, 10 * 60_000);
        res.type("html").send(loginPage(requestId));
    });
    app.post("/oauth/complete", async (req, res) => {
        const requestId = String(req.body?.request_id || "");
        const accessToken = String(req.body?.access_token || "");
        const request = await takeOAuthState("pending", requestId);
        if (!request)
            return oauthError(res, 400, "invalid_request");
        const user = await authenticateBearer(`Bearer ${accessToken}`);
        if (!user?.supabaseAccessToken)
            return oauthError(res, 401, "access_denied");
        const code = randomUUID();
        await putOAuthState("code", code, { ...request, userId: user.id, email: user.email, emailVerified: user.emailVerified === true, supabaseAccessToken: user.supabaseAccessToken, expiresAt: Date.now() + 5 * 60_000 }, 5 * 60_000);
        const target = new URL(request.redirectUri);
        target.searchParams.set("code", code);
        if (request.state)
            target.searchParams.set("state", request.state);
        res.json({ redirect_to: target.toString() });
    });
    app.post("/oauth/token", async (req, res) => {
        if (req.body?.grant_type !== "authorization_code")
            return oauthError(res, 400, "unsupported_grant_type");
        const codeValue = String(req.body?.code || "");
        const entry = await takeOAuthState("code", codeValue);
        if (!entry || entry.expiresAt < Date.now())
            return oauthError(res, 400, "invalid_grant");
        if (String(req.body?.client_id || "") !== entry.clientId || String(req.body?.redirect_uri || "") !== entry.redirectUri)
            return oauthError(res, 400, "invalid_grant");
        const verifier = String(req.body?.code_verifier || "");
        const challenge = createHash("sha256").update(verifier).digest("base64url");
        if (challenge !== entry.codeChallenge)
            return oauthError(res, 400, "invalid_grant");
        if (entry.resource !== config.PUBLIC_BASE_URL)
            return oauthError(res, 400, "invalid_target");
        const accessToken = await issuePluginToken({ userId: entry.userId, email: entry.email, emailVerified: entry.emailVerified, supabaseAccessToken: entry.supabaseAccessToken, scope: entry.scope });
        res.set("Cache-Control", "no-store").json({ access_token: accessToken, token_type: "Bearer", expires_in: 3600, scope: entry.scope });
    });
    app.get("/oauth/userinfo", async (req, res) => {
        const user = await authenticateBearer(req.header("authorization"));
        if (!user?.email || user.emailVerified !== true) {
            res.set("WWW-Authenticate", "Bearer");
            return oauthError(res, 401, "invalid_token");
        }
        res.set("Cache-Control", "no-store").json({ sub: user.id, email: user.email, email_verified: true });
    });
}
function validRedirectUri(value) {
    if (typeof value !== "string")
        return false;
    try {
        const url = new URL(value);
        return url.protocol === "https:" || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname));
    }
    catch {
        return false;
    }
}
function oauthError(res, status, error) {
    return res.status(status).json({ error });
}
function loginPage(requestId) {
    const supabaseUrl = JSON.stringify(config.SUPABASE_URL ?? "");
    const supabaseKey = JSON.stringify(config.SUPABASE_ANON_KEY ?? "");
    const signUp = JSON.stringify(`${config.PLEADWISE_WEB_URL}/signup`);
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Connect Pleadwise</title><style>body{margin:0;background:#f3efe7;color:#17221c;font:16px Inter,system-ui}.card{max-width:420px;margin:9vh auto;background:#fff;padding:32px;border-radius:18px;box-shadow:0 16px 60px #18221d20}.brand{letter-spacing:.16em;font-weight:800;color:#9a6b30}h1{font-family:Georgia,serif}label{display:block;margin:16px 0 6px}input,button{box-sizing:border-box;width:100%;padding:12px;border-radius:9px;border:1px solid #c8c2b7}button{margin-top:20px;background:#17221c;color:#fff;font-weight:700;cursor:pointer}.small{font-size:13px;color:#665f55}.error{color:#9b2226;min-height:20px}</style></head><body><main class="card"><div class="brand">PLEADWISE</div><h1>Connect your account</h1><p>Sign in with your existing Pleadwise account. Billing remains on Pleadwise.</p><form id="f"><label>Email</label><input id="email" type="email" required autocomplete="email"><label>Password</label><input id="password" type="password" required autocomplete="current-password"><button>Continue to ChatGPT</button><p id="error" class="error"></p></form><p class="small">Credentials are sent directly from this page to Pleadwise's existing Supabase authentication service and are not logged by the plugin server. <a id="signup">Create an account</a>.</p></main><script>const SUPABASE_URL=${supabaseUrl};const SUPABASE_KEY=${supabaseKey};document.querySelector('#signup').href=${signUp};document.querySelector('#f').addEventListener('submit',async(e)=>{e.preventDefault();const error=document.querySelector('#error');error.textContent='';try{if(!SUPABASE_URL||!SUPABASE_KEY)throw new Error('Pleadwise authentication is not configured.');const r=await fetch(SUPABASE_URL+'/auth/v1/token?grant_type=password',{method:'POST',headers:{'apikey':SUPABASE_KEY,'content-type':'application/json'},body:JSON.stringify({email:document.querySelector('#email').value,password:document.querySelector('#password').value})});const auth=await r.json();if(!r.ok)throw new Error(auth.error_description||auth.msg||'Sign-in failed');const c=await fetch('/oauth/complete',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({request_id:${JSON.stringify(requestId)},access_token:auth.access_token})});const done=await c.json();if(!c.ok)throw new Error(done.error||'Connection failed');location.assign(done.redirect_to)}catch(err){error.textContent=err.message||'Connection failed'}});</script></body></html>`;
}
//# sourceMappingURL=oauth.js.map