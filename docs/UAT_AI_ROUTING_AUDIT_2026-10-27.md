# AI Routing Audit - 2026-10-27

## Current runtime

- Target: `https://demo.orithos.com.au`
- Runtime frontend/backend SHA: `49935042be85f24f0b8e4f7296b4dad976f24304`
- `/api/public/version`: HTTP 200; frontend and backend report the same SHA.
- `/api/sell/parked` without authentication: HTTP 401.

## Candidate fix

Commit `7fb89037` routes DashScope requests by the model used for that request:

- classifier model options select the compatible endpoint;
- the primary response model selects the multimodal endpoint when required;
- the global client remains on the text endpoint so mixed model deployments do not misroute every request.

The candidate changes only these backend files:

- `pos-api/src/main/java/com/orithos/modules/ai/DashScopeEnvironmentPostProcessor.java`
- `pos-api/src/main/java/com/orithos/modules/ai/config/PosAssistantGraphConfig.java`
- `pos-api/src/main/java/com/orithos/modules/ai/node/GenerateResponseNode.java`
- `pos-api/src/test/java/com/orithos/modules/ai/DashScopeModelRoutingTest.java`

## Release status

This candidate is **not deployed**. The local machine has Java 8 and no Docker. The repository release gate requires `mvn -B clean verify` in Java 21 on the exact candidate SHA before pushing a `pos-api` change. Until that remote build is available and green, the live AI failure remains unresolved and the customer trial stays NO-GO.

## Database mode

Deployment, debugging, and UAT intentionally use the same configured database name:

```text
ODOO_DATABASE=aipos_uat
ODOO_DATABASE_UAT=aipos_uat
ISOLATION_ODOO_DATABASE=aipos_uat
```

This is controlled shared UAT mode. It does not satisfy an independent customer production isolation gate.
