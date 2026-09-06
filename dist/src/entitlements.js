import { config } from "./config.js";
const free = (source = "anonymous") => ({
    tier: "free",
    plan: "free",
    product: null,
    status: "free",
    canFormat: false,
    canExport: false,
    canUseAI: false,
    docsRemaining: 0,
    source,
});
export async function getEntitlement(user) {
    if (!user)
        return free();
    if (user.development) {
        return config.DEV_ENTITLEMENT === "paid"
            ? { tier: "paid", plan: "development", product: "development", status: "active", canFormat: true, canExport: true, canUseAI: true, docsRemaining: null, source: "development" }
            : free("development");
    }
    if (!user.supabaseAccessToken)
        return free();
    const response = await fetch(`${config.PLEADWISE_API_BASE_URL}/api/check-subscription`, {
        method: "POST",
        headers: { authorization: `Bearer ${user.supabaseAccessToken}`, "content-type": "application/json" },
        body: "{}",
        signal: AbortSignal.timeout(8000),
    });
    if (!response.ok)
        throw new Error(`Pleadwise entitlement check failed (${response.status})`);
    const body = await response.json();
    const paid = body.subscribed === true && body.canGenerate === true;
    return {
        tier: paid ? "paid" : "free",
        plan: typeof body.plan === "string" ? body.plan : "free",
        product: typeof body.product === "string" ? body.product : null,
        status: typeof body.status === "string" ? body.status : "free",
        canFormat: paid,
        canExport: paid,
        canUseAI: body.canUseAI === true,
        docsRemaining: typeof body.docsRemaining === "number" ? body.docsRemaining : null,
        source: "pleadwise",
    };
}
export class UpgradeRequiredError extends Error {
    constructor(action) {
        super(`${action} requires an active Pleadwise entitlement. Billing stays on Pleadwise.`);
        this.name = "UpgradeRequiredError";
    }
}
//# sourceMappingURL=entitlements.js.map