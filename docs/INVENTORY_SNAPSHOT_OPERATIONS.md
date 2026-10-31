# Persistent daily inventory captures

The `inventory-snapshots` Compose worker reads Odoo and saves native daily inventory observations on a named volume. The frontend mounts this volume read-only. Collection does not depend on the operator computer. It is separate from live replenishment queries and does not write purchase orders, stock or any Odoo business records.

## Configuration

Set `INVENTORY_SNAPSHOT_TARGETS` to a JSON array of explicit company IDs and IANA timezones, such as `[{"companyId":1,"timezone":"Australia/Adelaide"}]`. Empty means no scheduled companies. Use the existing `ODOO_BASE_URL`, `ODOO_DATABASE`, `ODOO_SERVICE_USERNAME` and `ODOO_SERVICE_PASSWORD` secrets. Never copy credentials into evidence. Current UAT remains shared `aipos_uat`.

Only products explicitly assigned to the selected Odoo company are included; global/shared products are outside this coverage denominator. Every active company product is paginated and counted, with a separate quantity read for every company warehouse. Coverage is catalogue/warehouse completeness, not proof that stock counts, costs or supplier lead times are correct. Negative stock is recorded as observed; recommendation safety checks remain separate.

The worker captures once per store business date at or after 02:00. It catches up on startup without fabricating past dates and retries a failed attempt hourly. Completed days survive worker/container replacements without being overwritten. Daily files and compact status use atomic replacement. Before publication the worker checks company/database scope, date/timezone, product IDs/count and each warehouse product set. Failed runs retain the previous successful metadata. Missing/nonfinite fields are counted explicitly. Older invalid files and actual missing dates cause a review status.

## Readback and interpretation

Authenticated `/api/odoo/replenishment` responses include only the resolved company's `inventoryHistory` metadata. A file with a different database/company is rejected. No product snapshot contents or credentials are exposed through this metadata. The replenishment page displays last capture time, product and warehouse coverage, observed dates/gaps, and missing field counts. Status is overdue after 36 hours, needs review for failed/incomplete captures or missing fields, and unavailable when no valid successful capture can be read. This status does not claim predictive accuracy or enable automatic orders.

Confirm configured timezones against the physical store location; defaults are not physical-location verification. UAT company 5 currently uses Adelaide and Demo company 127 uses UTC because address data is incomplete. Existing Windows-collected files remain local evidence and are not silently imported as server observations.

## Verification and operation

Use focused Python tests `python -m pytest scripts/tests/test_inventory_snapshot_worker.py scripts/tests/test_ai_inventory_snapshot.py scripts/tests/test_ai_inventory_snapshot_validation.py -q` and the Node inventory status test. Build through Dokploy, then inspect exact runtime SHA and authenticated metadata for both Demo and SKR. SKR probes must remain read-only. A second real scheduled capture on another date is required to establish daily continuity; fake-clock tests verify scheduling logic only.

Watch `status.json` on the named volume and the worker's company/status-only logs. A capture/validation error must not erase the last good daily history. Never use Fresh Volumes to repair a failed capture. After confirming the server's first successful captures, disable the Windows task `Orithos-AI-Daily-Inventory-Snapshot` to remove the laptop dependency. Historical files stay available for audit.
