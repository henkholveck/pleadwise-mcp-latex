import type { UserContext } from "./types.js";
export declare function authenticateBearer(header?: string): Promise<UserContext | null>;
export declare function issuePluginToken(input: {
    userId: string;
    email?: string;
    emailVerified?: boolean;
    supabaseAccessToken: string;
    scope: string;
}): Promise<string>;
export declare const authChallenge: string;
