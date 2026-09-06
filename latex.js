// camotionblue .tex emitter.
// Consumes the block model from parseDocument() and produces a document that
// compiles with: pdflatex -interaction=nonstopmode -shell-escape file.tex (twice)
//
// Macro usage follows the camotionblue reference exactly. There are no \cm*
// commands in this class; the real ones are \addmarginlineandnumbers,
// \setupcaformating, \startcourtname, the tightcenter environment and
// \blockquote. Do not invent others.

const TEX_ESCAPES = {
    "\\": "\\textbackslash{}",
    "&": "\\&",
    "%": "\\%",
    $: "\\$",
    "#": "\\#",
    _: "\\_",
    "{": "\\{",
    "}": "\\}",
    "~": "\\textasciitilde{}",
    "^": "\\textasciicircum{}",
};

export function escapeTex(value) {
    return String(value ?? "").replace(/[\\&%$#_{}~^]/g, (c) => TEX_ESCAPES[c]);
}

// Multi-line field -> LaTeX line breaks, for caption minipages.
function texLines(value) {
    return String(value ?? "")
        .split("\n")
        .map((l) => escapeTex(l.trim()))
        .filter(Boolean)
        .join("\\\\\n  ");
}

const ROLE = /\b(plaintiffs?|defendants?|petitioners?|respondents?|appellants?|appellees?)\b/i;

function titleCaseRole(role) {
    if (!role) return null;
    const r = role.toLowerCase();
    return r.charAt(0).toUpperCase() + r.slice(1);
}

// "Dana Whitfield, Plaintiff v. Ridgeline Property Management LLC, Defendant"
function splitParties(text) {
    const flat = String(text ?? "").replace(/\s+/g, " ").trim();
    const halves = flat.split(/\s+v\.?s?\.?\s+/i);
    const take = (half) => {
        if (!half) return { name: null, role: null };
        const roleMatch = half.match(ROLE);
        const role = roleMatch ? titleCaseRole(roleMatch[1]) : null;
        const name = half.replace(ROLE, "").replace(/[,;]\s*$/, "").replace(/^[,;]\s*/, "").trim();
        return { name: name || null, role };
    };
    return { first: take(halves[0]), second: take(halves[1]) };
}

export function buildTexModel(blocks, record, options = {}) {
    const courtLines = blocks.filter((b) => b.kind === "court").map((b) => b.text);
    const partiesBlock = blocks.find((b) => b.kind === "parties");
    const caseBlock = blocks.find((b) => b.kind === "caseno");
    const titleBlock = blocks.find((b) => b.kind === "title");
    const signatureBlock = blocks.find((b) => b.kind === "signature");
    const certificateBlock = blocks.find((b) => b.kind === "certificate");

    const parties = splitParties(partiesBlock?.text ?? "");
    const caseNumber = (caseBlock?.text ?? "").replace(/^.*?case\s*(?:no\.?|number|#)\s*[:.]?\s*/i, "").trim();

    // Body: everything between the title and the signature, as heading/paragraph runs.
    const sections = [];
    let current = null;
    for (const b of blocks) {
        if (b.kind === "heading") {
            current = { heading: b.text.replace(/\s+/g, " ").trim(), paragraphs: [] };
            sections.push(current);
        } else if (b.kind === "body") {
            if (!current) {
                current = { heading: null, paragraphs: [] };
                sections.push(current);
            }
            current.paragraphs.push(b.text.replace(/\n/g, " ").replace(/\s+/g, " ").trim());
        }
    }

    return {
        courtLines: courtLines.length ? courtLines : [record.court?.name ?? "COURT"],
        firstPartyCaption: parties.first.name ?? "PLAINTIFF",
        firstPartyTitle: parties.first.role ?? "Plaintiff",
        secondPartyCaption: parties.second.name ?? "DEFENDANT",
        secondPartyTitle: parties.second.role ?? "Defendant",
        caseNumber: caseNumber || "[CASE NUMBER]",
        motionTitle: (titleBlock?.text ?? record.title ?? "MOTION").replace(/\s+/g, " ").trim(),
        sections,
        signature: signatureBlock?.text ?? null,
        certificate: certificateBlock?.text ?? null,
        filer: options.filer ?? null,
    };
}

export function renderTex(model) {
    const preamble = `\\documentclass[letter]{camotionblue}
\\usepackage[english]{babel}
\\geometry{letterpaper}
\\usepackage{pstricks}
\\usepackage[T1]{fontenc}
\\usepackage[normalem]{ulem}
\\usepackage{fancyhdr}
\\usepackage{titlesec}
\\usepackage{setspace}
\\usepackage{tgtermes}
\\usepackage{mathptmx}
\\usepackage{enumitem}
\\usepackage{eso-pic}
\\usepackage{calc}
\\usepackage{xspace}
\\usepackage{fmtcount}
\\usepackage{ragged2e}
\\usepackage{changepage}
\\usepackage{float}
\\usepackage{ifthen}
\\usepackage{xstring}
\\usepackage{graphicx}
\\setlength{\\footskip}{15pt}
\\renewcommand{\\normalsize}{\\fontsize{12}{12}\\selectfont}
\\doublespacing
\\setlength{\\parskip}{0mm}
\\newcommand{\\tab}{\\hspace*{8.5mm}}
\\addmarginlineandnumbers
\\setupcaformating

\\renewcommand\\firstpartytitle{${escapeTex(model.firstPartyTitle)}\\xspace}
\\newcommand\\firstpartycaption{${texLines(model.firstPartyCaption.toUpperCase())}}
\\renewcommand\\secondpartytitle{${escapeTex(model.secondPartyTitle)}\\xspace}
\\newcommand\\secondpartycaption{${texLines(model.secondPartyCaption.toUpperCase())}}
\\newcommand\\motiontitle{${escapeTex(model.motionTitle)}\\xspace}
\\newcommand\\casenumber{${escapeTex(model.caseNumber)}\\xspace}

\\pagestyle{fancy}
\\fancyhf{}
\\renewcommand{\\footrulewidth}{0.4pt}
\\renewcommand{\\headrulewidth}{0pt}
\\fancyfoot[C]{\\thepage}`;

    const filerBlock = model.filer
        ? `\\begin{singlespace}
\\singlespacing
${texLines(model.filer)}\\\\
\\phantom{placeholder}
\\end{singlespace}
\\doublespacing
`
        : "";

    const courtBlock = `\\startcourtname
\\begin{tightcenter}
\\textbf{${model.courtLines.map((l) => escapeTex(l.toUpperCase())).join("\\\\\n  ")}}
\\end{tightcenter}
\\vspace{4pt}`;

    const caption = `\\noindent
\\begin{figure}[H]
\\begin{tabular}{p{\\dimexpr.5\\linewidth-2\\tabcolsep}@{\\hspace{5pt}}|@{\\hspace{0pt}}p{\\dimexpr.5\\linewidth-2\\tabcolsep}}
\\begin{minipage}[t]{\\dimexpr.5\\linewidth-2\\tabcolsep\\relax}
  \\singlespacing\\raggedright
  \\firstpartycaption,\\newline
  \\tab\\tab\\tab\\firstpartytitle,\\newline
  \\tab\\tab v.\\newline
  \\secondpartycaption\\newline
  \\tab\\tab\\tab\\secondpartytitle.
\\end{minipage}
&
\\hspace{1em}
\\begin{minipage}[t]{\\dimexpr.5\\linewidth-3\\tabcolsep-1em\\relax}
  \\singlespacing\\raggedright
  Case No.: \\casenumber
  \\newline\\newline
  \\textbf{\\MakeUppercase\\motiontitle}
\\end{minipage}\\\\
\\cline{1-1}
\\end{tabular}
\\end{figure}

\\setcounter{page}{1}
\\justifying
\\setlength{\\parindent}{2em}

\\begin{center}
\\large\\textbf{\\uline{${escapeTex(model.motionTitle.toUpperCase())}}}
\\end{center}`;

    const body = model.sections
        .map((s) => {
            const head = s.heading ? `\\section{${escapeTex(s.heading.toUpperCase())}}\n\n` : "";
            const paras = s.paragraphs.map((p) => escapeTex(p)).join("\n\n");
            return head + paras;
        })
        .join("\n\n");

    const signature = `\\vspace{1em}
\\noindent DATED: \\today

\\vspace{2em}
\\begin{singlespace}
\\noindent
\\IfFileExists{signature.png}{%
  \\includegraphics[width=2.5in]{signature.png}\\\\[0.25em]%
}{%
  \\vspace{2em}\\\\%
}
${model.signature ? texLines(stripSignatureNoise(model.signature)) : texLines(model.firstPartyCaption)}\\\\
\\end{singlespace}`;

    const certificate = model.certificate
        ? `
\\newpage
\\section*{CERTIFICATE OF SERVICE}

\\begin{singlespace}
${texLines(model.certificate.replace(/^(certificate|proof) of service\s*/i, ""))}

\\vspace{2em}
\\noindent
\\IfFileExists{signature.png}{%
  \\includegraphics[width=2.5in]{signature.png}\\\\[0.25em]%
}{%
  \\vspace{2em}\\\\%
}
${texLines(model.firstPartyCaption)}\\\\
\\end{singlespace}
`
        : "";

    return `${preamble}

\\begin{document}

${filerBlock}${courtBlock}

${caption}

${body}

${signature}
${certificate}
\\end{document}
`;
}

// "Respectfully submitted, / Dated ... / /s/ Name / Name, Role" -> keep the names,
// drop the boilerplate the class already emits (DATED line, /s/ rule).
function stripSignatureNoise(text) {
    return String(text)
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !/^respectfully submitted/i.test(l) && !/^dated\b/i.test(l) && !/^\/s\//.test(l))
        .join("\n");
}
