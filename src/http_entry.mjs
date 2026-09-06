import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
import { formatDocument } from "./format_document.mjs";
import fs from "node:fs";
import path from "node:path";

const app = express();
const WIDGET_URI = "ui://pleadwise/pdf-preview-v1.html";
const PUBLIC_ORIGIN = "https://pleadwise-mcp-latex.fly.dev";
app.disable("x-powered-by");

app.get("/health", (_req, res) => res.json({ ok: true, service: "pleadwise-mcp-latex", version: "0.3.0" }));

// Narrow PDF download route (strict basename, no traversal)
app.get("/files/:file.pdf", (req, res) => {
  const id = path.basename(req.params.file.replace(".pdf", ""));
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) return res.status(404).send("invalid id");
  const p = path.resolve("/app/build", id + ".pdf");
  const base = path.resolve("/app/build");
  if (!p.startsWith(base) || !fs.existsSync(p)) return res.status(404).send("not found");
  res.writeHead(200, { "Content-Type": "application/pdf", "Content-Disposition": "inline; filename=" + path.basename(p), "Content-Length": fs.statSync(p).size });
  fs.createReadStream(p).pipe(res);
});

app.use(express.json({ limit: "1mb" }));

function createFormatterServer() {
  const server = new McpServer(
    { name: "pleadwise-camotionblue", version: "0.3.0" },
    { instructions: "Format user-provided legal filing text with camotionblue and return a compiled PDF download URL. Preserve the user's legal substance." },
  );

  server.registerResource("pleadwise-pdf-preview", WIDGET_URI, {}, async () => ({
    contents: [{
      uri: WIDGET_URI,
      mimeType: "text/html;profile=mcp-app",
      text: `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <style>
    :root { color-scheme: light dark; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    * { box-sizing: border-box; }
    body { margin: 0; background: transparent; color: CanvasText; }
    .card { overflow: hidden; border: 1px solid color-mix(in srgb, CanvasText 16%, transparent); border-radius: 16px; background: Canvas; }
    .bar { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 14px; }
    .title { min-width: 0; }
    h1 { margin: 0; font-size: 15px; font-weight: 650; }
    p { margin: 3px 0 0; font-size: 12px; opacity: .68; }
    .actions { display: flex; flex: none; gap: 8px; }
    a, button { appearance: none; border: 1px solid color-mix(in srgb, CanvasText 18%, transparent); border-radius: 9px; padding: 7px 10px; background: Canvas; color: CanvasText; font: inherit; font-size: 12px; font-weight: 600; text-decoration: none; cursor: pointer; }
    .primary { border-color: #166534; background: #166534; color: white; }
    iframe { display: block; width: 100%; height: 560px; border: 0; border-top: 1px solid color-mix(in srgb, CanvasText 12%, transparent); background: white; }
    .empty { padding: 28px 16px; text-align: center; opacity: .7; }
    @media (max-width: 520px) { .bar { align-items: flex-start; flex-direction: column; } iframe { height: 460px; } }
  </style>
</head>
<body>
  <main class="card">
    <header class="bar">
      <div class="title"><h1>Formatted filing</h1><p id="details">Preparing preview…</p></div>
      <div class="actions"><button id="open" type="button">Open PDF</button><a id="download" class="primary" download>Download</a></div>
    </header>
    <div id="empty" class="empty">The PDF preview will appear here.</div>
    <iframe id="preview" title="Pleadwise formatted PDF preview" hidden></iframe>
  </main>
  <script>
    const allowedOrigin = ${JSON.stringify(PUBLIC_ORIGIN)};
    const preview = document.getElementById("preview");
    const empty = document.getElementById("empty");
    const details = document.getElementById("details");
    const openButton = document.getElementById("open");
    const download = document.getElementById("download");
    let currentUrl = "";

    function render(value) {
      const output = value?.structuredContent || value;
      if (!output?.success || !output?.downloadUrl) return;
      try {
        const url = new URL(output.downloadUrl);
        if (url.origin !== allowedOrigin || !url.pathname.startsWith("/files/")) return;
        currentUrl = url.href;
      } catch { return; }
      preview.src = currentUrl;
      preview.hidden = false;
      empty.hidden = true;
      download.href = currentUrl;
      details.textContent = output.byteSize ? Math.max(1, Math.round(output.byteSize / 1024)) + " KB PDF" : "PDF ready";
    }

    openButton.addEventListener("click", () => {
      if (!currentUrl) return;
      if (window.openai?.openExternal) window.openai.openExternal({ href: currentUrl });
      else window.open(currentUrl, "_blank", "noopener,noreferrer");
    });
    window.addEventListener("message", (event) => {
      if (event.data?.method === "ui/notifications/tool-result") render(event.data.params);
    }, { passive: true });
    render(window.openai?.toolOutput);
  </script>
</body>
</html>`,
      _meta: {
        ui: {
          prefersBorder: true,
          domain: PUBLIC_ORIGIN,
          csp: {
            connectDomains: [PUBLIC_ORIGIN],
            resourceDomains: [PUBLIC_ORIGIN],
            frameDomains: [PUBLIC_ORIGIN],
          },
        },
        "openai/widgetDescription": "Shows the newly formatted filing as an inline PDF preview with open and download controls.",
      },
    }],
  }));

  server.registerTool("format_document", {
    title: "Format legal filing as PDF",
    description: "Format the complete filing with camotionblue and pdflatex, preserving the user's wording, and return a downloadable PDF.",
    inputSchema: {
      document_text: z.string().min(1).describe("Complete legal filing text to format."),
      court_id: z.string().optional().describe("Optional court identifier used in the filing heading."),
      title: z.string().max(200).optional().describe("Optional filing title."),
    },
    outputSchema: {
      success: z.boolean(),
      downloadUrl: z.string().url(),
      byteSize: z.number().int().nonnegative(),
      error: z.null(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    _meta: {
      ui: { resourceUri: WIDGET_URI },
      "openai/outputTemplate": WIDGET_URI,
      "openai/toolInvocation/invoking": "Formatting filing…",
      "openai/toolInvocation/invoked": "PDF ready",
    },
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
