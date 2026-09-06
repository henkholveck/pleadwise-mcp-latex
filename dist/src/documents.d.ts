import type { CourtRule, FormattedDocument, StoredArtifact } from "./types.js";
export declare function analyzeDocument(textInput: string): {
    characterCount: number;
    wordCount: number;
    estimatedPages: number;
    detectedCourt: CourtRule;
    detectedDocumentType: string;
    headings: string[];
    citationCount: number;
    checks: {
        caption: boolean;
        signatureBlock: boolean;
        certificateOfService: boolean;
    };
    issues: string[];
    disclaimer: string;
};
export declare function createFormattedDocument(input: {
    userId: string;
    title?: string;
    documentText: string;
    courtId?: string;
}): FormattedDocument;
export declare function buildFormattedDocument(input: {
    userId: string;
    title?: string;
    documentText: string;
    courtId?: string;
}): FormattedDocument;
export declare function getFormattedDocument(id: string, userId: string): FormattedDocument;
export declare function previewHtml(record: FormattedDocument, basic: boolean): string;
export declare function createExport(record: FormattedDocument, format: "docx" | "pdf"): Promise<StoredArtifact>;
export declare function getArtifact(id: string, userId: string): StoredArtifact | null;
export declare function getArtifactByCapability(id: string): StoredArtifact | null;
export declare function checkFilingPackage(input: {
    documentText: string;
    attachments?: string[];
}): {
    ready: boolean;
    items: {
        item: string;
        status: string;
        detail: string;
    }[];
    disclaimer: string;
};
