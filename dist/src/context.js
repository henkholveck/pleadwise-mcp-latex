import { AsyncLocalStorage } from "node:async_hooks";
const storage = new AsyncLocalStorage();
export function withUser(user, fn) {
    return storage.run(user, fn);
}
export function currentUser() {
    return storage.getStore() ?? null;
}
//# sourceMappingURL=context.js.map