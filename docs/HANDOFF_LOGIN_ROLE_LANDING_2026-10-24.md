# Role-based login landing

- Store web login defaults: ADMIN / legacy isAdmin and MANAGER open `/dashboard`; CLERK opens Sell (`/`). Bare `next=/` also uses this default so opening the store root before sign-in does not override the manager destination.
- Explicit return paths (including checkout query strings), mobile workspace, and control-plane login retain their behavior. Store bootstrap uses the same role-based helper.
- Local verification: Node 24 role-landing regression passed; TypeScript `tsc --noEmit` passed; targeted ESLint passed with one existing bootstrap effect warning. No local application build or business-data writes.
- Implemented locally; deployment and live role-login verification are pending. The shared branch already contains an unrelated unpushed backend commit; do not push it without its required exact-SHA remote Java 21 verification.
