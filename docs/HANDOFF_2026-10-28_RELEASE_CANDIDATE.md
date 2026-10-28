# Release Candidate Handoff: 2026-10-28

## Candidate

- Source commit: `97a86157ce87ec0bc544b570b23deb34e470b669`
- Target: `https://demo.orithos.com.au`
- Deployment database names: `ODOO_DATABASE=aipos_uat`, `ODOO_DATABASE_UAT=aipos_uat`, `ISOLATION_ODOO_DATABASE=aipos_uat`
- Scope: controlled demo/UAT transactions and release verification

## Verification

- Java 21 `mvn -B clean verify`: 442 tests passed.
- Frontend typecheck, webpack production build, and unit tests passed on the corresponding local candidate.
- The authenticated parked-sale read was previously verified as HTTP 200 on the deployed predecessor.

## Open release conditions

- The shared `aipos_uat` database does not prove customer tenant isolation.
- Printer, cash drawer, scanner, EFTPOS, and offline POS remain unverified on customer hardware.
- AI production cost, rate limits, provider fallback, and real invoice/label accuracy need field measurements.
- After this commit deploys, verify both service runtime SHAs through `/api/public/version` before calling the candidate live.
