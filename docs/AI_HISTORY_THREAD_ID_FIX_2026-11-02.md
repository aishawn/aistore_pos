# AI History Thread ID Fix

The read-only history check found that Demo's `GET /api/ai/threads` returned valid titles and session keys but `id: null`. Opening the first row consequently called `/api/ai/threads/null` and returned HTTP 400. This was a real list-to-detail contract failure, not a missing test credential.

The mapper already selected the database `id`, but relied on implicit MyBatis property mapping. `AiChatHistoryMapper` now declares explicit `@Results` mappings for `id`, tenant/user IDs, session key, title, and timestamps on list, owned-detail, and session-key queries.

Verification:

- `mvn -q -f pos-api/pom.xml -DskipTests compile`: passed
- `mvn -q -f pos-api/pom.xml -Dtest=AiChatHistoryServiceTest test`: passed
- No database or business writes were made while diagnosing the issue.

The fix is committed locally as `3730b38d`. The public runtime must be redeployed and rechecked before claiming the online history detail path is fixed.
