export declare const config: {
    NODE_ENV: "development" | "production" | "test";
    PORT: number;
    PUBLIC_BASE_URL: string;
    PLEADWISE_WEB_URL: string;
    PLEADWISE_API_BASE_URL: string;
    SUPABASE_URL?: string | undefined;
    SUPABASE_ANON_KEY?: string | undefined;
    SUPABASE_SERVICE_ROLE_KEY?: string | undefined;
    OAUTH_STATE_FILE?: string | undefined;
    OPENAI_APPS_CHALLENGE?: string | undefined;
    PLUGIN_JWT_SECRET: string;
    DEV_BEARER_TOKEN?: string | undefined;
    DEV_USER_ID: string;
    DEV_USER_EMAIL: string;
    DEV_ENTITLEMENT: "free" | "paid";
    ARTIFACT_TTL_SECONDS: number;
    MAX_DOCUMENT_CHARACTERS: number;
};
