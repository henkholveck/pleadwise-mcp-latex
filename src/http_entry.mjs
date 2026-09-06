import { createMcpServer } from "/app/dist/src/mcp.js";
import express from "express";
import fs from "node:fs";
import path from "node:path";
const server = createMcpServer();
const app = express();
app.get("/files/:file.pdf", (req, res) => {
  const id = path.basename(req.params.file.replace(".pdf", ""));
  if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) return res.status(404).send("invalid id");
  const p = path.resolve("/app/build", id + ".pdf");
  const base = path.resolve("/app/build");
  if (!p.startsWith(base) || !fs.existsSync(p)) return res.status(404).send("not found");
  res.writeHead(200, { "Content-Type": "application/pdf", "Content-Disposition": "attachment; filename=" + path.basename(p), "Content-Length": fs.statSync(p).size });
  fs.createReadStream(p).pipe(res);
});
app.listen(process.env.PORT || 8080, "0.0.0.0", () => console.log("MCP server on 0.0.0.0:" + (process.env.PORT || 8080)));
