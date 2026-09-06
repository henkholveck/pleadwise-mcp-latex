import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { authenticateBearer } from "./auth.js";
import { config } from "./config.js";
import { withUser } from "./context.js";
import { getArtifact, getArtifactByCapability } from "./documents.js";
import { createMcpServer } from "./mcp.js";
import { registerOAuthRoutes } from "./oauth.js";
const app = express();
app.disable("x-powered-by");
// Hosting health checks address the Machine by its private IP, so they must run
// before public Host-header validation.
app.get("/health", (_req, res) => res.json({ ok: true, service: "pleadwise-mcp", version: "0.1.0" }));
const allowedHosts = new Set([new URL(config.PUBLIC_BASE_URL).hostname, "localhost", "127.0.0.1", "[::1]"]);
app.use((req, res, next) => {
    try {
        const hostname = new URL(`http://${req.headers.host}`).hostname;
        if (!allowedHosts.has(hostname))
            return res.status(403).json({ error: "invalid_host" });
        next();
    }
    catch {
        return res.status(403).json({ error: "invalid_host" });
    }
});
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false }));
registerOAuthRoutes(app);
app.get("/.well-known/openai-apps-challenge", (_req, res) => {
    if (!config.OPENAI_APPS_CHALLENGE)
        return res.status(404).type("text/plain").send("not configured");
    return res.set("Cache-Control", "no-store").type("text/plain").send(config.OPENAI_APPS_CHALLENGE);
});
app.get("/docs", (_req, res) => res.redirect("https://developers.openai.com/plugins/"));
app.all("/mcp", async (req, res) => {
    const user = await authenticateBearer(req.header("authorization"));
    const server = createMcpServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => { void transport.close(); void server.close(); });
    await withUser(user, async () => {
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
    });
});
app.get("/artifacts/:id", async (req, res) => {
    // The UUID is a short-lived capability URL returned only to the authenticated user.
    // Do not log query strings or this path at the hosting layer.
    const id = String(req.params.id);
    const candidates = await Promise.all([
        authenticateBearer(req.header("authorization")),
    ]);
    const user = candidates[0];
    // ChatGPT's download navigation may omit Authorization, so allow the unguessable,
    // 15-minute capability URL. getArtifact still applies expiry.
    const artifact = user ? getArtifact(id, user.id) : findArtifactByCapability(id);
    if (!artifact)
        return res.status(404).send("Export expired or not found");
    res.set({ "Content-Type": artifact.mimeType, "Content-Disposition": `attachment; filename="${artifact.filename}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" });
    res.send(Buffer.from(artifact.bytes));
});
// This is intentionally assigned below by documents.ts during lookup. Keeping it
// local makes capability access explicit and easy to replace with object storage.
function findArtifactByCapability(id) {
    return getArtifactByCapability(id);
}
app.use((_req, res) => res.status(404).json({ error: "not_found" }));
if (!process.env.VERCEL) {
    app.listen(config.PORT, "0.0.0.0", () => console.log(`Pleadwise MCP listening at ${config.PUBLIC_BASE_URL}/mcp`));
}
export default app;
//# sourceMappingURL=http.js.map