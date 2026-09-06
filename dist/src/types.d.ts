export type UserContext = {
    id: string;
    email?: string;
    emailVerified?: boolean;
    supabaseAccessToken?: string;
    development?: boolean;
};
export type Entitlement = {
    tier: "free" | "paid";
    plan: string;
    product: string | null;
    status: string;
    canFormat: boolean;
    canExport: boolean;
    canUseAI: boolean;
    docsRemaining: number | null;
    source: "pleadwise" | "development" | "anonymous";
};
export type CourtRule = {
    id: string;
    name: string;
    jurisdiction: string;
    fontFamily: string;
    fontSizePt: number;
    lineSpacing: number;
    marginsInches: {
        top: number;
        right: number;
        bottom: number;
        left: number;
    };
    pageNumbers: string;
    pleadingPaper: string;
    sourceUrl?: string;
    verifiedAt?: string;
    notes: string[];
};
export type FormattedDocument = {
    id: string;
    userId: string;
    title: string;
    text: string;
    court: CourtRule;
    createdAt: number;
};
export type StoredArtifact = {
    id: string;
    userId: string;
    filename: string;
    mimeType: string;
    bytes: Uint8Array;
    expiresAt: number;
};
