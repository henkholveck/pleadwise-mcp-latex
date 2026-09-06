import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { formatDocument } from "./format_document.mjs";
import fs from "node:fs";
import path from "node:path";

const app = express();
app.disable("x-powered-by");

app.get("/health", (_req, res) => res.json({ ok: true, service: "pleadwise-mcp-latex", version: "0.2.0" }));

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

function createFormatterServer() {
  const server = new McpServer(
    { name: "pleadwise-camotionblue", version: "0.2.0" },
    { instructions: "Format user-provided legal filing text with camotionblue and return a compiled PDF download URL. Preserve the user's legal substance." },
  );

  server.registerTool("format_document", {
    title: "Format legal filing as PDF",
    description: "Format the complete filing with camotionblue and pdflatex, preserving the user's wording, and return a downloadable PDF.",
    inputSchema: {
      document_text: z.string().min(1).describe("Complete legal filing text to format."),
      court_id: z.string().optional().describe("Optional court identifier used in the filing heading."),
      title: z.string().max(200).optional().describe("Optional filing title."),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  }, async (input) => {
    const output = formatDocument(input);
    if (!output.success) {
      return { isError: true, content: [{ type: "text", text: output.error || "PDF formatting failed." }] };
    }
    return {
      structuredContent: output,
      content: [{ type: "text", text: `The formatted PDF is ready: ${output.downloadUrl}` }],
    };
  });

  return server;
}

app.all("/mcp", async (req, res) => {
  const server = createFormatterServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on("close", () => { void transport.close(); void server.close(); });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});

app.listen(process.env.PORT || 8080, "0.0.0.0", () => console.log("MCP server on 0.0.0.0:" + (process.env.PORT || 8080)));
