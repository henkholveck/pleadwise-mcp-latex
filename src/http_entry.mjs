import express from "express";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "/app/dist/src/mcp.js";
import fs from "node:fs";
import path from "node:path";

const app = express();
app.disable("x-powered-by");

app.get("/health", (_req, res) => res.json({ ok: true, service: "pleadwise-mcp", version: "0.1.0" }));

// Narrow PDF download route (strict basename, no traversal)
app.get("/files/:file.pdf", (req, res) => {
  const id = path.basename(req.params.file.replace(".pdf", ""));
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) return res.status(404).send("invalid id");
  const p = path.resolve("/app/build", id + ".pdf");
  const base = path.resolve("/app/build");
  if (!p.startsWith(base) || !fs.existsSync(p)) return res.status(404).send("not found");
  res.writeHead(200, { "Content-Type": "application/pdf", "Content-Disposition": "attachment; filename=" + path.basename(p), "Content-Length": fs.statSync(p).size });
  fs.createReadStream(p).pipe(res);
});

app.use(express.json({ limit: "1mb" }));

// MCP Streamable HTTP transport wired to real createMcpServer (format_document included)
app.all("/mcp", async (req, res) => {
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => { void transport.close(); void server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(process.env.PORT || 8080, "0.0.0.0", () => console.log("MCP server on 0.0.0.0:" + (process.env.PORT || 8080)));
