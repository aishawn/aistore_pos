# Orithos POS CLI

`tools/orithos-pos` is a thin Python client for `/api/pos/v1`. It stores only the API URL and token in `~/.orithos-pos.json` (override with `ORITHOS_POS_CONFIG`), and also accepts `ORITHOS_POS_API_URL` and `ORITHOS_POS_TOKEN`. Writes require `--confirm` and automatically send an idempotency key.

Read commands: `products|customers|suppliers|orders|sales|purchases|inventory list|get`. `sales quote --file quote.json` requests a current Odoo quote. `sync batch --resource sales|inventory|purchases --file records.json --confirm` submits JSON arrays or JSONL records and returns an operation ID; poll it with `operations get <id>`. Webhooks support `webhooks list`, `webhooks create --url URL --event operation.completed --confirm`, and `webhooks revoke <id> --confirm`. Refunds and purchase receipts are not implemented. Sale, inventory, and purchase writes are disabled by default in the server and require isolated UAT acceptance before an administrator enables their corresponding Dokploy flags.

API documentation is served inside the POS at `/api-docs`; the OpenAPI asset is `/api/pos/v1/openapi.yaml`. No separate service needs to be deployed.
