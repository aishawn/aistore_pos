# Customer Trial Release Gate

This runbook is the release checklist for the current unified deployment. Deployment, debugging and trial traffic all target `aipos_uat` until a separate customer database is provisioned.

## Environment contract

Dokploy must set these values explicitly in every environment:

```text
RUNTIME_ENVIRONMENT=uat
ODOO_DATABASE=aipos_uat
ODOO_DATABASE_UAT=aipos_uat
ISOLATION_ODOO_DATABASE=aipos_uat
POSTGRESQL_URL=<uat POS database>
```

The three Odoo variables intentionally have the same value for this phase. This is a shared UAT configuration and cannot be treated as isolated customer production. The Compose file still fails when required database variables are missing.

UAT uses `.env.uat.example`, `RUNTIME_ENVIRONMENT=uat`, and a dedicated POS PostgreSQL database. UAT business writes are allowed only after `/api/public/uat-context` reports `isolated=true` and the release identity matches the candidate SHA.

## Candidate and deployment gate

1. Freeze one candidate SHA. Do not include unrelated dirty files or evidence artifacts.
2. For any candidate touching `pos-api`, run `mvn -B clean verify` in Java 21 and retain the complete log.
3. Push the exact candidate to `main`; let Dokploy deploy normally.
4. Run the gate below from the repository root. Passwords are read from the ignored environment or `.env`; they are never printed.

```powershell
$env:PILOT_EXPECTED_SOURCE_COMMIT = (git rev-parse HEAD).Trim()
$env:PILOT_BASE_URL = "https://customer.orithos.com.au"
node scripts/pilot-customer-trial-release-gate.mjs
Remove-Item Env:PILOT_EXPECTED_SOURCE_COMMIT, Env:PILOT_BASE_URL
```

The gate requires matching frontend/backend runtime SHA, successful admin login, a successful read-only `/api/sell/parked` request, and reports whether the configured databases are shared. A shared database keeps the customer release **NO-GO** for real customer transactions. The gate never creates sales, refunds, purchases, stock moves, payments or register closures.

For isolated UAT, set `PILOT_EXPECTED_ENVIRONMENT=uat` and `PILOT_REQUIRE_UAT=true`. The gate additionally requires `/api/public/uat-context` to report `isolated=true`.

## Business acceptance run

Run these scenarios in the isolated UAT tenant only, recording Odoo IDs and before/after values:

- Open register; cash sale with GST and rounding; card sale; receipt and report totals.
- Refund the sale; reconcile net revenue, stock, tax and cash difference.
- Correct and incorrect cash counts; verify close-register blocking, retry and final closure.
- Save a product price; verify Odoo read-back, POS quote and GST calculation.
- Confirm a purchase; receive partially, fully, repeatedly and above ordered quantity; verify stock and failure recovery.
- Apply a stocktake; repeat the request and simulate a concurrent sale; verify one effective adjustment and correct stock.
- Create two tenants and attempt cross-tenant reads by record ID for products, customers, orders, stock, reports and users; every unauthorized request must be rejected.
- Backup the POS/Odoo test data, restore it, and verify login, tenant binding and a read-only POS session after restore.

## AI and device acceptance

- Re-run the complete assistant matrix against the verified runtime SHA.
- Verify every structured CTA resolves only to an allowed internal page and never performs an implicit write.
- Test representative redacted supplier invoices and wine labels; record field accuracy, latency, failures and provider degradation.
- Record AI request counts, token cost, rate limiting and disabled-provider behavior.
- On the customer hardware, verify scanner, printer, cash drawer and EFTPOS. A missing device must show a clear unavailable state.
- State offline POS support explicitly in the customer trial limitations; do not describe it as supported without an offline test.

## Go / no-go evidence

Customer trial is **GO** only when the candidate SHA, build log and runtime SHA match; the parked-sale read is healthy; the customer tenant is isolated; transaction, purchase and stocktake reconciliations are clean; tenant and restore tests pass; and device/AI limitations are documented. Any failed item keeps the release **NO-GO**.
