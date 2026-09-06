import type { UserContext } from "./types.js";
export declare function withUser<T>(user: UserContext | null, fn: () => T): T;
export declare function currentUser(): UserContext | null;
