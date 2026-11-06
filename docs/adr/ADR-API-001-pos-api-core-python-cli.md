# ADR-API-001: POS API core with Python CLI

Date: 2026-11-06

Decision: keep the versioned REST API inside the existing Spring `pos-api` deployment and implement the Python CLI as a thin client. Odoo remains the sole business source of truth. Do not add a service, GraphQL compatibility layer, direct database client, or crawler changes in this phase.

Reason: one authorization, tenant boundary, audit and Odoo isolation gate avoids the reconciliation errors caused by independent mirrors. A thin CLI keeps business rules in the server and makes later crawler migration a client replacement.
