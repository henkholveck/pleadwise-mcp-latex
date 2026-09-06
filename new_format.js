// --- Document structure model -------------------------------------------
// Parses a filing into typed blocks so the renderer can apply real pleading
// typography instead of dumping raw text at a chosen font size.

const TITLE_WORDS = /\b(MOTION|OPPOSITION|REPLY|DECLARATION|COMPLAINT|ANSWER|PETITION|BRIEF|MEMORANDUM|NOTICE|ORDER|STIPULATION)\b/;
const HEADING_WORDS = /^(INTRODUCTION|STATEMENT OF FACTS|FACTUAL BACKGROUND|BACKGROUND|ARGUMENT|LEGAL STANDARD|DISCUSSION|ANALYSIS|CONCLUSION|RELIEF REQUESTED|PRAYER FOR RELIEF)\b/;
const COURT_LINE = /\b(SUPERIOR COURT|DISTRICT COURT|COURT OF APPEALS|SUPREME COURT|CIRCUIT COURT)\b/i;
const COUNTY_LINE = /^(FOR|IN AND FOR|COUNTY OF)\b/i;
const CASE_NO = /\bcase\s*(?:no\.?|number|#)\s*[:.]?\s*\S+/i;
const PARTY_LINE = /\b(plaintiff|defendant|petitioner|respondent|appellant|appellee)\b/i;
const SIG_LINE = /(respectfully submitted|\/s\/|^dated\b|^date[d]?\s*:)/i;
const CERT_LINE = /^(certificate of service|proof of service)\b/i;

export function parseDocument(text) {
    const rawBlocks = text.split(/\n{2,}/).map((b) => b.replace(/\s+$/, "")).filter((b) => b.trim().length > 0);
    const blocks = [];
    let titleTaken = false;
    let inCaption = true;

    for (let i = 0; i < rawBlocks.length; i++) {
        const raw = rawBlocks[i];
        const line = raw.trim();
        const first = line.split("\n")[0].trim();
        const isShort = line.length <= 90 && !line.includes("\n");
        const isUpper = line === line.toUpperCase() && /[A-Z]/.test(line);

        if (CERT_LINE.test(first)) {
            blocks.push({ kind: "certificate", text: line });
            inCaption = false;
            continue;
        }
        if (SIG_LINE.test(first) || SIG_LINE.test(line)) {
            blocks.push({ kind: "signature", text: line });
            inCaption = false;
            continue;
        }
        if (inCaption && (COURT_LINE.test(line) || COUNTY_LINE.test(first)) && isShort) {
            blocks.push({ kind: "court", text: line });
            continue;
        }
        if (inCaption && CASE_NO.test(line)) {
            blocks.push({ kind: "caseno", text: line });
            continue;
        }
        if (inCaption && PARTY_LINE.test(line) && !TITLE_WORDS.test(line)) {
            blocks.push({ kind: "parties", text: line });
            continue;
        }
        if (!titleTaken && isUpper && isShort && TITLE_WORDS.test(line)) {
            blocks.push({ kind: "title", text: line });
            titleTaken = true;
            inCaption = false;
            continue;
        }
        if (HEADING_WORDS.test(first.toUpperCase()) || (isUpper && isShort) || /^[IVXLC]+\.\s/.test(first) || /^[A-Z]\.\s/.test(first)) {
            blocks.push({ kind: "heading", text: line });
            inCaption = false;
            continue;
        }
        blocks.push({ kind: "body", text: line });
        inCaption = false;
    }
    return blocks;
}

export function previewHtml(record, basic) {
    const source = basic ? record.text.slice(0, 6000) : record.text;
    const blocks = parseDocument(source);
    const court = record.court;
    const m = court.marginsInches;
    const font = JSON.stringify(court.fontFamily);
    // Pleading paper is a jurisdictional convention, not a house style. Render it
    // only where the court profile calls for it (California Superior); the federal
    // and Washington profiles say "Not generally required".
    const pleading = !/not generally required/i.test(String(court.pleadingPaper || ""));
    const LINES = 28;
    const lineHeightPt = court.fontSizePt * court.lineSpacing;
    const bodyHeightIn = (LINES * lineHeightPt) / 72;

    const esc = (v) => escapeHtml(v).replace(/\n/g, "<br>");
    const html = blocks.map((b) => {
        switch (b.kind) {
            case "court": return `<p class="court">${esc(b.text)}</p>`;
            case "parties": return `<p class="parties">${esc(b.text)}</p>`;
            case "caseno": return `<p class="caseno">${esc(b.text)}</p>`;
            case "title": return `<h1 class="doctitle">${esc(b.text)}</h1>`;
            case "heading": return `<h2 class="secheading">${esc(b.text)}</h2>`;
            case "signature": return `<div class="sigblock">${esc(b.text)}</div>`;
            case "certificate": return `<div class="certblock">${esc(b.text)}</div>`;
            default: return `<p class="body">${esc(b.text)}</p>`;
        }
    }).join("");

    const numbers = pleading
        ? `<div class="lines">${Array.from({ length: LINES }, (_, i) => `<span>${i + 1}</span>`).join("")}</div>`
        : "";
    const rules = pleading ? '<div class="rule-left"></div><div class="rule-right"></div>' : "";
    const badge = pleading ? ` · <span class="tag">28-line pleading paper</span>` : "";
    const pleadingCss = pleading ? `
.sheet{padding-left:1.45in;padding-right:${m.right}in;min-height:${(bodyHeightIn + m.top + m.bottom).toFixed(2)}in}
.lines{position:absolute;top:${m.top}in;left:0.62in;width:0.4in;text-align:right;font-family:${font},serif;font-size:${court.fontSizePt}pt;line-height:${lineHeightPt}pt;color:#8d8f8a;-webkit-user-select:none;user-select:none}
.lines span{display:block}
.rule-left{position:absolute;top:0;bottom:0;left:1.14in;width:4px;border-left:1px solid #9c3f37;border-right:1px solid #9c3f37}
.rule-right{position:absolute;top:0;bottom:0;right:0.42in;border-left:1px solid #9c3f37}
` : "";

    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(record.title)}</title><style>
body{margin:0;background:#e8e4dc;color:#171717;font-family:Inter,system-ui,sans-serif}
.bar{background:#17221c;color:#fff;padding:16px 24px}
.bar strong{color:#d8bd75}
.bar .tag{color:#d8bd75;font-size:12px;letter-spacing:.04em;text-transform:uppercase}
.sheet{position:relative;box-sizing:border-box;max-width:816px;min-height:1056px;margin:28px auto;padding:${m.top}in ${m.right}in ${m.bottom}in ${m.left}in;background:#fff;box-shadow:0 8px 28px #0002;font-family:${font},serif;font-size:${court.fontSizePt}pt;line-height:${court.lineSpacing}}
.court{text-align:center;text-transform:uppercase;margin:0 0 .35em;line-height:1.4}
.parties{margin:1.1em 0 .2em;line-height:1.5;border-top:1px solid #111;border-bottom:1px solid #111;padding:.5em 0}
.caseno{margin:.2em 0 1.1em;text-align:right;line-height:1.4}
.doctitle{text-align:center;text-transform:uppercase;font-size:${court.fontSizePt}pt;font-weight:700;text-decoration:underline;margin:1.4em 0 1.2em;line-height:1.4}
.secheading{text-align:center;text-transform:uppercase;font-size:${court.fontSizePt}pt;font-weight:700;margin:1.3em 0 .7em;line-height:1.4}
.body{margin:0 0 1em;text-indent:0.5in;text-align:left}
.sigblock{margin:1.6em 0 0 3.2in;white-space:pre-wrap;line-height:1.5}
.certblock{margin:2em 0 0;white-space:pre-wrap;line-height:1.5;border-top:1px solid #ccc;padding-top:1em}
.watermark{position:fixed;top:52%;left:50%;transform:translate(-50%,-50%) rotate(-28deg);font:700 64px system-ui;color:#9a6b301f;pointer-events:none}
.note{max-width:816px;margin:0 auto 30px;font-size:13px;color:#555}
${pleadingCss}</style></head><body><div class="bar"><strong>PLEADWISE</strong> · ${escapeHtml(court.name)}${badge}</div><main class="sheet">${rules}${numbers}${basic ? '<div class="watermark">BASIC PREVIEW</div>' : ""}${html}</main><div class="note">Formatting preview only. Not legal advice. Confirm current local rules before filing.${basic ? " Basic preview is truncated; full formatting and export require an active Pleadwise entitlement." : ""}</div></body></html>`;
}
