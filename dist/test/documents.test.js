import test from "node:test";
import assert from "node:assert/strict";
import { analyzeDocument, checkFilingPackage, createExport, createFormattedDocument } from "../src/documents.js";
const filing = `SUPERIOR COURT OF THE STATE OF WASHINGTON
FOR KING COUNTY

Jane Doe, Plaintiff v. Acme LLC, Defendant
Case No. 26-2-00001-1

PLAINTIFF'S MOTION

INTRODUCTION

Plaintiff respectfully moves for relief.

ARGUMENT

The requested relief is appropriate.

CONCLUSION

Respectfully submitted, /s/ Jane Doe

CERTIFICATE OF SERVICE
I certify that I served this filing.`;
test("analyze_document detects structure and court", () => {
    const audit = analyzeDocument(filing);
    assert.equal(audit.detectedCourt.id, "washington-superior-general");
    assert.equal(audit.checks.signatureBlock, true);
    assert.equal(audit.checks.certificateOfService, true);
    assert.equal(audit.detectedDocumentType, "motion");
});
test("filing package reports complete baseline", () => {
    const result = checkFilingPackage({ documentText: filing });
    assert.equal(result.ready, true);
});
test("exports DOCX and PDF", async () => {
    const record = createFormattedDocument({ userId: "user-1", documentText: filing });
    const docx = await createExport(record, "docx");
    const pdf = await createExport(record, "pdf");
    assert.ok(docx.bytes.length > 1000);
    assert.equal(Buffer.from(pdf.bytes).subarray(0, 4).toString(), "%PDF");
});
//# sourceMappingURL=documents.test.js.map