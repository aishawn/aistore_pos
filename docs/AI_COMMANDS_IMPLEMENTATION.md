# AI command implementation status

The first implementation slice adds controlled AI command drafts under
the /api/ai/commands endpoints. UAT enables command parsing and preview with
AI_COMMANDS_ENABLED=true; execution remains disabled with
AI_COMMANDS_EXECUTION_ENABLED=false.

Implemented:

- authenticated administrator-only command parsing;
- persisted command drafts and immutable audit events;
- ten-minute expiry, ownership checks, version checks and confirmation-only execution;
- exact-name product display-name changes;
- exact-name customer name, phone and email changes;
- exact-name percentage price previews;
- replenishment preview responses that remain non-writable;
- frontend command preview, confirm and cancel card.

The command layer deliberately does not accept tenant, outlet, SQL, model or API
path values from the model. The current product/customer adapters reuse the
existing application services and must be replaced or wrapped by an Odoo-backed
adapter before enabling this feature for a production Odoo tenant. Price
execution is also subject to that source-of-truth review. Enable the flag only
in an isolated UAT environment after the exact-SHA Java 21 gate and write
reconciliation pass.

Unsupported fields and ambiguous entities fail closed with a business error;
they are not guessed or silently modified.
