import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { buildTexModel, renderTex } from "./latex.js";

// Reuse the parser from the patched documents.js without importing it
// (that module pulls in docx/pdf-lib, which aren't installed here).
let code = fs.readFileSync(path.join(process.env.HOME, "pleadwise-mcp-patch/new_format.js"), "utf8")
    .replace(/^export /gm, "");
code += `
function escapeHtml(value) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
`;
const { parseDocument } = new Function(code + "\nreturn { parseDocument };")();

const MOTION = [
  "SUPERIOR COURT OF THE STATE OF CALIFORNIA",
  "FOR THE COUNTY OF LOS ANGELES",
  "Dana Whitfield, Plaintiff v. Ridgeline Property Management LLC, Defendant",
  "Case No. 26-2-00001-1",
  "MOTION TO COMPEL DISCOVERY RESPONSES",
  "INTRODUCTION",
  "Plaintiff moves this Court for an order compelling Defendant to produce documents responsive to Plaintiff's First Requests for Production, served on March 4, 2026. Costs of 50% & more are sought under Rule 37(a)(5).",
  "STATEMENT OF FACTS",
  "Plaintiff served her First Requests for Production on March 4, 2026. Defendant's responses were due April 3, 2026. Defendant served no response and requested no extension.",
  "ARGUMENT",
  "A party may move for an order compelling production when a party fails to produce documents requested under Rule 34. Defendant's failure to serve any response waived its objections.",
  "CONCLUSION",
  "Plaintiff requests an order compelling production within fourteen days.",
  "Respectfully submitted,\nDated this 5th day of September, 2026.\n\n/s/ Dana Whitfield\nDana Whitfield\nPlaintiff Pro Se",
  "CERTIFICATE OF SERVICE\nI certify that on September 5, 2026 I served a copy of the foregoing on counsel of record by electronic mail.",
].join("\n\n");

const court = {
  name: "California Superior Court (general civil baseline)",
  fontFamily: "Times New Roman", fontSizePt: 12, lineSpacing: 1.5,
  marginsInches: { top: 1, right: 0.5, bottom: 1, left: 1 },
  pleadingPaper: "28-line pleading paper commonly required",
};

const blocks = parseDocument(MOTION);
const model = buildTexModel(blocks, { title: "Motion to Compel Discovery Responses", court });
console.log("--- model ---");
console.log("  court      :", model.courtLines.join(" / "));
console.log("  first party:", model.firstPartyCaption, "|", model.firstPartyTitle);
console.log("  second     :", model.secondPartyCaption, "|", model.secondPartyTitle);
console.log("  case no    :", model.caseNumber);
console.log("  title      :", model.motionTitle);
console.log("  sections   :", model.sections.map((s) => s.heading).join(", "));
console.log("  signature  :", !!model.signature, "| certificate:", !!model.certificate);

const tex = renderTex(model);
const build = path.join(process.env.HOME, "pleadwise-mcp-latex/build");
fs.rmSync(build, { recursive: true, force: true });
fs.mkdirSync(build, { recursive: true });

const assets = path.join(process.env.HOME, ".claude/plugins/meyers-legal-skills/skills/format/legal-pleading-formatter/assets");
for (const f of ["camotionblue.cls", "bluebook.sty", "multind.sty", "pstricks.sty"]) {
  fs.copyFileSync(path.join(assets, f), path.join(build, f));
}
fs.writeFileSync(path.join(build, "filing.tex"), tex);
console.log("\n--- wrote filing.tex,", tex.length, "bytes ---");

const env = { ...process.env, PATH: "/usr/local/bin:/Library/TeX/texbin:" + process.env.PATH };
for (let pass = 1; pass <= 2; pass++) {
  try {
    execFileSync("pdflatex", ["-interaction=nonstopmode", "-halt-on-error", "filing.tex"],
      { cwd: build, env, stdio: "pipe", timeout: 120000 });
    console.log(`  pass ${pass}: ok`);
  } catch (e) {
    const log = fs.existsSync(path.join(build, "filing.log")) ? fs.readFileSync(path.join(build, "filing.log"), "utf8") : "";
    const errs = log.split("\n").filter((l) => l.startsWith("!")).slice(0, 8);
    console.log(`  pass ${pass}: FAILED`);
    console.log(errs.join("\n") || String(e.message).slice(0, 400));
    process.exit(1);
  }
}

const pdf = path.join(build, "filing.pdf");
const bytes = fs.statSync(pdf).size;
const pages = (fs.readFileSync(pdf).toString("latin1").match(/\/Type\s*\/Page[^s]/g) || []).length;
console.log(`\nPDF OK: ${bytes} bytes, ~${pages} page(s) -> ${pdf}`);
