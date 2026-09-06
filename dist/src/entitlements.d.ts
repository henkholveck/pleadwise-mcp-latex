import type { Entitlement, UserContext } from "./types.js";
export declare function getEntitlement(user: UserContext | null): Promise<Entitlement>;
export declare class UpgradeRequiredError extends Error {
    constructor(action: string);
}
