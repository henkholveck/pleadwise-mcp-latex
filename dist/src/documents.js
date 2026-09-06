import { randomUUID } from "node:crypto";
import { AlignmentType, Document, Footer, Packer, PageNumber, Paragraph, TextRun, convertInchesToTwip, } from "docx";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { config } from "./config.js";
import { detectCourt, getCourt } from "./courts.js";
const formatted = new Map();
const artifacts = new Map();
function normalize(text) {
    const trimmed = text.replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").trim();
    if (!trimmed)
        throw new Error("document_text cannot be empty");
    if (trimmed.length > config.MAX_DOCUMENT_CHARACTERS)
        throw new Error(`Document exceeds ${config.MAX_DOCUMENT_CHARACTERS} characters`);
    return trimmed;
}
export function analyzeDocument(textInput) {
    const text = normalize(textInput);
    const headings = [...text.matchAll(/^(?:[IVX]+\.|[A-Z][A-Z\s]{4,}|INTRODUCTION|ARGUMENT|CONCLUSION|CERTIFICATE OF SERVICE)$/gm)].map((m) => m[0]);
    const hasCaption = /(?:UNITED STATES|SUPERIOR|DISTRICT|CIRCUIT) COURT/i.test(text) && /case\s*(?:no\.|number|#)/i.test(text);
    const hasSignature = /(?:respectfully submitted|signature|\/s\/)/i.test(text);
    const hasCertificate = /certificate of service|proof of service/i.test(text);
    const citations = text.match(/\b\d+\s+(?:U\.S\.|F\.(?:2d|3d|4th|Supp\.?\s*\d*)|P\.(?:2d|3d))\s+\d+\b/g) ?? [];
    const issues = [
        ...(!hasCaption ? ["No complete court caption and case number detected."] : []),
        ...(!hasSignature ? ["No signature block detected."] : []),
        ...(!hasCertificate ? ["No certificate/proof of service detected; confirm whether one is required."] : []),
        ...(headings.length < 2 ? ["The filing has little detectable heading structure."] : []),
    ];
    return {
        characterCount: text.length,
        wordCount: text.split(/\s+/).length,
        estimatedPages: Math.max(1, Math.ceil(text.split(/\s+/).length / 500)),
        detectedCourt: detectCourt(text),
        detectedDocumentType: detectDocumentType(text),
        headings: headings.slice(0, 30),
        citationCount: citations.length,
        checks: { caption: hasCaption, signatureBlock: hasSignature, certificateOfService: hasCertificate },
        issues,
        disclaimer: "Formatting audit only. Pleadwise is not a law firm and does not provide legal advice. Verify court rules and all legal content before filing.",
    };
}
function detectDocumentType(text) {
    const upper = text.slice(0, 8000).toUpperCase();
    for (const type of ["MOTION", "OPPOSITION", "REPLY", "DECLARATION", "COMPLAINT", "ANSWER", "PETITION", "BRIEF"]) {
        if (upper.includes(type))
            return type.toLowerCase();
    }
    return "legal filing";
}
export function createFormattedDocument(input) {
    const record = buildFormattedDocument(input);
    formatted.set(record.id, record);
    return record;
}
export function buildFormattedDocument(input) {
    const text = normalize(input.documentText);
    const court = input.courtId ? getCourt(input.courtId) : detectCourt(text);
    const title = input.title?.trim() || `${detectDocumentType(text)} — formatted by Pleadwise`;
    const record = { id: randomUUID(), userId: input.userId, title, text, court, createdAt: Date.now() };
    return record;
}
export function getFormattedDocument(id, userId) {
    const record = formatted.get(id);
    if (!record || record.userId !== userId)
        throw new Error("Formatted document not found");
    return record;
}
export function previewHtml(record, basic) {
    const source = basic ? record.text.slice(0, 6000) : record.text;
    const paragraphs = source.split(/\n{2,}/).map((part) => `<p>${escapeHtml(part).replace(/\n/g, "<br>")}</p>`).join("");
    const watermark = basic ? '<div class="watermark">BASIC PREVIEW</div>' : "";
    const court = record.court;
    const m = court.marginsInches;
    const font = JSON.stringify(court.fontFamily);
    // Pleading paper is a jurisdictional convention, not a house style. Render it
    // only where the court profile actually calls for it (California Superior);
    // federal and Washington profiles say "Not generally required".
    const pleading = !/not generally required/i.test(String(court.pleadingPaper || ""));
    const LINES = 28;
    const lineHeightPt = court.fontSizePt * court.lineSpacing;
    const bodyHeightIn = (LINES * lineHeightPt) / 72;
    const numbers = pleading
        ? `<div class="lines">${Array.from({ length: LINES }, (_, i) => `<span>${i + 1}</span>`).join("")}</div>`
        : "";
    const rules = pleading ? '<div class="rule-left"></div><div class="rule-right"></div>' : "";
    const badge = pleading ? ` · <span class="tag">28-line pleading paper</span>` : "";
    const pleadingCss = pleading ? `
.sheet{padding-left:1.45in;padding-right:${m.right}in;min-height:${(bodyHeightIn + m.top + m.bottom).toFixed(2)}in;line-height:${lineHeightPt}pt}
.lines{position:absolute;top:${m.top}in;left:0.62in;width:0.4in;text-align:right;font-family:${font},serif;font-size:${court.fontSizePt}pt;line-height:${lineHeightPt}pt;color:#8d8f8a;-webkit-user-select:none;user-select:none}
.lines span{display:block}
.rule-left{position:absolute;top:0;bottom:0;left:1.14in;width:4px;border-left:1px solid #9c3f37;border-right:1px solid #9c3f37}
.rule-right{position:absolute;top:0;bottom:0;right:0.42in;border-left:1px solid #9c3f37}
.sheet p:first-of-type{margin-top:0}
` : "";
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(record.title)}</title><style>body{margin:0;background:#e8e4dc;color:#171717;font-family:Inter,system-ui,sans-serif}.bar{background:#17221c;color:#fff;padding:16px 24px}.bar strong{color:#d8bd75}.bar .tag{color:#d8bd75;font-size:12px;letter-spacing:.04em;text-transform:uppercase}.sheet{position:relative;box-sizing:border-box;max-width:816px;min-height:1056px;margin:28px auto;padding:${m.top}in ${m.right}in ${m.bottom}in ${m.left}in;background:#fff;box-shadow:0 8px 28px #0002;font-family:${font},serif;font-size:${court.fontSizePt}pt;line-height:${court.lineSpacing}}p{white-space:normal;margin:0 0 1em}.watermark{position:fixed;top:52%;left:50%;transform:translate(-50%,-50%) rotate(-28deg);font:700 64px system-ui;color:#9a6b301f;pointer-events:none}.note{max-width:816px;margin:0 auto 30px;font-size:13px;color:#555}${pleadingCss}</style></head><body><div class="bar"><strong>PLEADWISE</strong> · ${escapeHtml(court.name)}${badge}</div><main class="sheet">${rules}${numbers}${watermark}${paragraphs}</main><div class="note">Formatting preview only. Not legal advice. Confirm current local rules before filing.${basic ? " Basic preview is truncated; full formatting and export require an active Pleadwise entitlement." : ""}</div></body></html>`;
}
function escapeHtml(value) {
    return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
export async function createExport(record, format) {
    const bytes = format === "docx" ? await makeDocx(record) : await makePdf(record);
    const id = randomUUID();
    const artifact = {
        id,
        userId: record.userId,
        filename: `${slug(record.title)}.${format}`,
        mimeType: format === "docx" ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document" : "application/pdf",
        bytes,
        expiresAt: Date.now() + config.ARTIFACT_TTL_SECONDS * 1000,
    };
    artifacts.set(id, artifact);
    return artifact;
}
export function getArtifact(id, userId) {
    const value = artifacts.get(id);
    if (!value || value.userId !== userId || value.expiresAt < Date.now()) {
        artifacts.delete(id);
        return null;
    }
    return value;
}
export function getArtifactByCapability(id) {
    const value = artifacts.get(id);
    if (!value || value.expiresAt < Date.now()) {
        artifacts.delete(id);
        return null;
    }
    return value;
}
async function makeDocx(record) {
    const { court } = record;
    const body = record.text.split(/\n{2,}/).map((part) => new Paragraph({
        alignment: /^(?:[A-Z][A-Z\s]{4,}|[IVX]+\.)$/.test(part.trim()) ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
        spacing: { line: Math.round(240 * court.lineSpacing), after: 120 },
        children: [new TextRun({ text: part.replace(/\n/g, " "), font: court.fontFamily, size: court.fontSizePt * 2 })],
    }));
    const doc = new Document({ sections: [{
                properties: { page: { margin: {
                            top: convertInchesToTwip(court.marginsInches.top), right: convertInchesToTwip(court.marginsInches.right),
                            bottom: convertInchesToTwip(court.marginsInches.bottom), left: convertInchesToTwip(court.marginsInches.left),
                        } } },
                footers: { default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT] })] })] }) },
                children: body,
            }] });
    return new Uint8Array(await Packer.toBuffer(doc));
}
async function makePdf(record) {
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.TimesRoman);
    const size = record.court.fontSizePt;
    const pageWidth = 612;
    const pageHeight = 792;
    const left = record.court.marginsInches.left * 72;
    const right = record.court.marginsInches.right * 72;
    const top = record.court.marginsInches.top * 72;
    const bottom = record.court.marginsInches.bottom * 72;
    const maxWidth = pageWidth - left - right;
    const lineHeight = size * record.court.lineSpacing;
    const lines = wrapText(record.text, font, size, maxWidth);
    let page = pdf.addPage([pageWidth, pageHeight]);
    let y = pageHeight - top;
    let pageNumber = 1;
    for (const line of lines) {
        if (y < bottom + lineHeight) {
            page.drawText(String(pageNumber++), { x: pageWidth / 2, y: 24, size: 9, font });
            page = pdf.addPage([pageWidth, pageHeight]);
            y = pageHeight - top;
        }
        page.drawText(line, { x: left, y, size, font, color: rgb(0.08, 0.08, 0.08) });
        y -= lineHeight;
    }
    page.drawText(String(pageNumber), { x: pageWidth / 2, y: 24, size: 9, font });
    return pdf.save();
}
function wrapText(text, font, size, maxWidth) {
    const output = [];
    for (const paragraph of text.split("\n")) {
        if (!paragraph.trim()) {
            output.push("");
            continue;
        }
        let line = "";
        for (const word of paragraph.split(/\s+/)) {
            const candidate = line ? `${line} ${word}` : word;
            if (font.widthOfTextAtSize(candidate, size) <= maxWidth)
                line = candidate;
            else {
                if (line)
                    output.push(line);
                line = word;
            }
        }
        if (line)
            output.push(line);
    }
    return output;
}
function slug(value) {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "pleadwise-document";
}
export function checkFilingPackage(input) {
    const audit = analyzeDocument(input.documentText);
    const attachments = input.attachments ?? [];
    const mentionsExhibits = /\bexhibit\s+[a-z0-9]+/i.test(input.documentText);
    const items = [
        { item: "Main filing", status: "present", detail: `${audit.wordCount} words` },
        { item: "Caption and case number", status: audit.checks.caption ? "present" : "review", detail: audit.checks.caption ? "Detected" : "Not confidently detected" },
        { item: "Signature block", status: audit.checks.signatureBlock ? "present" : "review", detail: audit.checks.signatureBlock ? "Detected" : "Not detected" },
        { item: "Certificate/proof of service", status: audit.checks.certificateOfService ? "present" : "review", detail: audit.checks.certificateOfService ? "Detected" : "Confirm whether required" },
        { item: "Referenced exhibits", status: !mentionsExhibits || attachments.length ? "present" : "review", detail: mentionsExhibits ? `${attachments.length} attachment name(s) supplied` : "No exhibit references detected" },
    ];
    return { ready: items.every((item) => item.status === "present"), items, disclaimer: audit.disclaimer };
}
//# sourceMappingURL=documents.js.map