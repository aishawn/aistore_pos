# Orithos release audit handoff (2026-10-28)

## Runtime

- Pilot target: `https://demo.orithos.com.au`
- Deployment SHA verified on frontend and backend: `dc3d4d8e9ad2f18bab2e8f0c796298addcd6a5dc`
- Dokploy Compose deployment: Done
- Odoo database variables intentionally unified for this UAT phase: `aipos_uat`
- Java 21 local verification: `mvn -B clean verify`, 442 tests, 0 failures/errors

## Passed on the matching runtime

- Synthetic Australian tax invoice OCR: all 9 field checks passed, 0 business writes. Evidence: `docs/UAT_AI_INVOICE_RUNTIME-dc3d4d8e.json`.
- Odoo-backed Sommelier read-only regression: 10 checks passed, including price/free-stock parity and anonymous 401 guard. Evidence: `docs/UAT_SOMMELIER_RUNTIME-dc3d4d8e.json`.
- Synthetic wine-label image recognition: brand, varietal, vintage and search queries returned, 0 business writes. Evidence: `docs/UAT_AI_WINE_LABEL_RUNTIME-dc3d4d8e.json`.
- Hardware status page and offline simulation: devices remain explicitly unverified; offline checkout is blocked with a reconnect message; offline numbering is explicitly unsupported. Evidence: `docs/UAT_HARDWARE_OFFLINE_RUNTIME-dc3d4d8e.json`.
- AI feature matrix: login, client capability config, assistant, ASR empty-input guard, Sommelier endpoints, label empty-input guard, read-only price suggestions and anonymous guard passed. Evidence: `docs/UAT_AI_FEATURES_RUNTIME-dc3d4d8e.json`.

## Remaining blockers

- AI audit metrics still returns HTTP 200 with `paths=0`; assistant intent coverage fails. Two PostgreSQL legacy-column migrations were deployed, but the audit INSERT issue remains unresolved. Direct database access from this workstation timed out, so the runtime PostgreSQL error still needs container-side log or database inspection.
- AI provider degradation, quota/429 behavior, Redis fallback and cost telemetry have code-level tests but no complete live fault-injection evidence.
- Synthetic wine-label OCR is not a substitute for a public real-label accuracy matrix; no suitable public label image was available in this run.
- Printer, cash drawer, barcode scanner and EFTPOS have not had physical terminal acceptance. The UI correctly shows `Not verified` / `Not tested`.
- Offline POS remains unsupported for sales and must stay documented as such.
- Real sales, refunds, GST, stock, cash close, purchasing and receiving reconciliation are not accepted as production evidence in the shared `aipos_uat` environment.

## Release decision

`NO-GO` for unrestricted customer production until audit metrics, isolated business reconciliation, physical hardware acceptance and remaining AI fault/accuracy evidence are complete. Controlled UAT remains possible with the explicit `aipos_uat` limitation.
