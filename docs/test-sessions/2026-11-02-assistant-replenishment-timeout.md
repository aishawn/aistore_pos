# Assistant replenishment timeout and snapshot diagnostics

- Source SHA: `860c1d2ebfc21f6f3d3a55f0ee73794c698ee3f0`.
- Integration SHA: `ca9dfec324c6bd53d8069986c56e2f789c7ee472`, merged current main `5e9ff0c3`; post-merge typecheck and 18 relevant Node regressions PASS. Remote changes to forecast-confidence gating and Demo session opening were retained.
- Runtime SHA: **BLOCKED / not authenticated or verified**. These results do not establish deployment or live SKR acceptance.
- Environment: Windows, Node 24.19.0, Python local fixtures. No local production build.
- Real Odoo business writes: **0**.

## Findings and changes

The reported 45005ms matches the panel's shared 45-second abort. Even the deterministic replenishment preview performs complete catalogue and 56-day sales-history reads on a cold cache. The client also silently replayed HTTP 404/502/503/504 responses, potentially repeating the entire calculation. These are source-level findings; the failing deployed runtime SHA was unavailable.

- Replenishment previews now have a separate bounded 120-second budget. Other assistant requests retain 45 seconds. Progress and timeout messages describe the business-data read, do not suggest shortening an already fixed question, and provide a link to Replenishment.
- Explicit user Retry controls transient replenishment retries. Normal reads and existing authentication recovery retain their behavior.
- Catalogue/supplier page size increases from 1,000 to 5,000 with the same 25,000-record limit, monotonic ID checks and before/after counts. A 10,013-row fixture needs three page reads instead of eleven. This is a round-trip reduction, **not measured live latency improvement**.
- Added `scripts/ai-eval/diagnose-odoo-snapshot.py`: single-row, company/warehouse-scoped schema/access probes for the three snapshot sources. Fixed diagnostic categories only; no RPC messages, tracebacks, credentials or business rows are output. An inaccessible company never falls back to another company.

## Checks

| Check | Result | Limits |
|---|---|---|
| Node tests: operations preview, pagination, cards, chat history | PASS, 28/28 | Local fixtures |
| Real API client retry policy, transpiled with browser dependencies stubbed | PASS, 1/1 | Covers HTTP 404/502/503/504; replenishment one request vs ordinary reads two |
| Python diagnostic integration/unit tests | PASS, 4/4 | Local HTTP server; access refusal, tenant context, no writes and redaction |
| `tsc --noEmit` | PASS | Static only |
| Targeted ESLint | PASS, zero errors | Three pre-existing unused purity-disable warnings |
| `git diff --check` | PASS | Source hygiene only |
| Configured Odoo account, company 137 single-row probes | PASS | Products returned one row, suppliers/purchase lines empty. Not verified as SKR or vendor 141/142; no warehouse supplied; does not prove full sync |
| First probe attempt without application User-Agent | BLOCKED, HTTP 403 | Added explicit application User-Agent, then the above probe passed |
| Live SKR runtime identity and exact vendor 141/142 bindings | BLOCKED | Version endpoint requires authentication; one login attempt did not authenticate. No repeated credential attempts |
| Remote backend builder discovery | BLOCKED | Configured SSH timed out; Dokploy server terminal reported authentication failure. No backend source changed; no backend gate bypass |

## Unresolved snapshot failure

The supplied Java exception discards Odoo's error category. It is insufficient to distinguish access denial, stale company/warehouse binding, schema mismatch or a session failure. The successful sample probe does **not** resolve those specific scheduled failures.

An operator with current deployment access should first read the POS binding metadata:

```sql
SELECT id, outlet_id, odoo_company_id, odoo_warehouse_id, odoo_provision_status
FROM vendor WHERE id IN (141, 142);
```

Then run the diagnostic with the **deployed** service configuration and each bound company/warehouse:

```powershell
python scripts/ai-eval/diagnose-odoo-snapshot.py --company-id <odoo_company_id> --warehouse-id <odoo_warehouse_id>
```

Use process environment variables, or an ignored file through `--env-file`. Omit the warehouse argument only if the binding has no warehouse. Vendor IDs 141/142 and outlet IDs 186/188 are **not** Odoo company IDs. Do not broaden permissions or rebind to another store to make the probe pass.

`ACCESS_DENIED` / `COMPANY_NOT_ACCESSIBLE_OR_BINDING_STALE` requires checking the binding and service-account access. `INVALID_REQUEST_OR_SCHEMA` requires inspecting the deployed Odoo model fields. Empty results are not full snapshot acceptance. After resolving the diagnosed cause, rerun the full read-only snapshot and validate row coverage/source version.

Future backend diagnostic logging must use allowlisted categories and model/method identifiers without raw Odoo errors. Any `pos-api/` change still requires exact-candidate remote Java 21 `mvn -B clean verify` before push.

## Remaining product limits

- A longer bounded wait is a mitigation, not an asynchronous forecasting job architecture or a production latency guarantee.
- UI operational previews still do not persist into Spring AI history/memory; model/provider health remains unverified.
- No settings were changed: command execution and purchase draft/confirmation gates remain closed.
- After deployment, verify runtime SHA and authenticated read-only SKR replenishment latency/results before accepting the reported issue as resolved online.
