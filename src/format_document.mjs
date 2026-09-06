// Real format_document — ESM (matches ~/pleadwise-mcp-latex/package.json: "type":"module")
import { buildTexModel, renderTex } from "/app/latex.js";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

export function formatDocument({ document_text, court_id, title }) {
  // Use existing parser (new_format.js) — reconstructed from the working pipeline
  const { parseDocument } = parseParser();
  const blocks = parseDocument(String(document_text || ""));
  const record = {
    id: `mcp-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
    title: String(title || "Pleadwise Filing").slice(0, 200),
    court: {
      name: court_id ? `Court: ${court_id}` : "SUPERIOR COURT OF CALIFORNIA / COUNTY OF LOS ANGELES",
      fontFamily: "Times New Roman", fontSizePt: 12, lineSpacing: 1.5,
      marginsInches: { top: 1, right: 0.84, bottom: 1, left: 1.14 },
      pleadingPaper: "28-line pleading paper",
    },
    blocks,
  };
  const model = buildTexModel(blocks, record);
  const tex = renderTex(model);
  const buildDir = path.join(process.env.HOME || "/app", "pleadwise-mcp-latex/build");
  fs.mkdirSync(buildDir, { recursive: true });
  const texPath = path.join(buildDir, `${record.id}.tex`);
  const pdfPath = path.join(buildDir, `${record.id}.pdf`);
  fs.writeFileSync(texPath, tex);
  // Invoke same proven pdflatex method used by test_latex.mjs
  try {
    execFileSync("pdflatex", ["-interaction=nonstopmode", "-halt-on-error", "-output-directory", buildDir, texPath], { stdio: "pipe", timeout: 30000 });
    execFileSync("pdflatex", ["-interaction=nonstopmode", "-halt-on-error", "-output-directory", buildDir, texPath], { stdio: "pipe", timeout: 30000 });
  } catch (e) {
    return { success: false, pdfPath: null, texPath, byteSize: 0, model: null, error: `pdflatex failed: ${e.message}` };
  }
  const exists = fs.existsSync(pdfPath);
  const stats = exists ? fs.statSync(pdfPath) : null;
  const downloadUrl = exists ? (process.env.PUBLIC_URL || "https://pleadwise-mcp-latex.fly.dev") + "/files/" + path.basename(pdfPath) : null;
  // Note: downloadUrl is constructed from deployed hostname; actual endpoint served by download_route.js
  return {
    success: exists && stats && stats.size > 0,
    downloadUrl: exists ? downloadUrl : null,
    byteSize: stats ? stats.size : 0,
    error: exists ? null : "PDF not produced after pdflatex invocation",
  };
}

function parseParser() {
  // Load the real parser from new_format.js (ESM export stripped in test harness, use same approach)
  let code = fs.readFileSync(path.join(process.env.HOME || "/app", "pleadwise-mcp-patch/new_format.js"), "utf8");
  code = code.replace(/^export /gm, "");
  const fn = new Function(code + "\nreturn { parseDocument };");
  return fn();
}
