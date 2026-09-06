export type OAuthStateKind = "client" | "pending" | "code";
export declare function putOAuthState(kind: OAuthStateKind, id: string, value: unknown, ttlMilliseconds: number): Promise<void>;
export declare function getOAuthState<T>(kind: OAuthStateKind, id: string): Promise<T | null>;
export declare function takeOAuthState<T>(kind: OAuthStateKind, id: string): Promise<T | null>;
