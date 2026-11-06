# Orithos POS CLI

`tools/orithos-pos` is a thin Python client for `/api/pos/v1`. It stores only the API URL and token in `~/.orithos-pos.json` (override with `ORITHOS_POS_CONFIG`), and also accepts `ORITHOS_POS_API_URL` and `ORITHOS_POS_TOKEN`. Writes require `--confirm` and automatically send an idempotency key.
