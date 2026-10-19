# AI production enablement checklist

Use this before setting `AI_ENABLED=true` on Dokploy for `demo` / store hosts.
Do **not** put API keys or passwords in this file.

## Boundaries (product)

| Brand claim | In-product surface | Model? | Writes? |
|---|---|---|---|
| Smart buy | `/stock/replenishment` (rules) + `/invoices/scan` (OCR preview) | OCR only when AI on | Draft RFQ human-gated; invoice never receives stock |
| Smart recommend | `/sommelier`, `/sommelier/find`, `/sommelier/identify` | Pitch / ask / label photo when AI on | Feedback optional; no price invent |
| Smart pricing | `/stock/price-suggestions` | Optional explain later | **Never** writes Odoo list prices |
| Smart search | Floating Orithos AI + NLQ / voice | Chat + ASR when AI on | No sell/refund/PO from assistant without human UI |

## Pre-flight

- [ ] Monthly DashScope budget agreed; over-budget action is set `AI_ENABLED=false` (POS still works).
- [ ] Dokploy Compose env: `AI_ENABLED`, `AI_DASHSCOPE_API_KEY`, `AI_DASHSCOPE_MODEL`, `AI_DASHSCOPE_BASE_URL` (intl if needed), `AI_TRANSCRIPTION_MODEL`, `AI_VISION_MODEL`.
- [ ] Dokploy: `AI_REPORT_RO_USER` / `AI_REPORT_RO_PASSWORD` for read-only report SQL (no default password in git).
- [ ] Connectivity probe PASS for chat, ASR, and vision (no store PII) — attach `docs/UAT_AI_DASHSCOPE_PROBE_*.json`.
- [ ] Isolation UAT PASS for NLQ, voice, Find, Identify (photo), pitch/ask, invoice preview, price suggestions (0 price writes) — attach `docs/UAT_AI_ENABLED_ISOLATION_*.json`.
- [ ] Operator confirmation timestamp recorded in the current `docs/HANDOFF_*.md` snapshot.

## Known failure modes (2026-10-19)

| Symptom | Likely cause | Fix |
|---|---|---|
| Assistant `InvalidParameter: url error` with `AI_DASHSCOPE_MODEL=qwen3.8-flash` | Spring AI default path is **text-generation**; `qwen3.8-flash` only accepts **multimodal-generation**. This is not a bad `AI_DASHSCOPE_BASE_URL` when the host is correct. | Keep `AI_DASHSCOPE_BASE_URL=https://dashscope.aliyuncs.com` (host only). Deploy build that auto-sets `multi-model` / completions-path from the model id. Or set `AI_DASHSCOPE_MULTI_MODEL=true`. Or switch model to `qwen-plus` / `qwen-flash`. |
| `AI_DASHSCOPE_BASE_URL` includes `/api/v1` or `/compatible-mode/v1` | SDK appends its own path → double path / url error | Host only: `https://dashscope.aliyuncs.com` or `https://dashscope-intl.aliyuncs.com` |
| `/api/ai/config/client` `enabled=true` but `/api/ai/assistant` returns `50301` | `PosAssistantGraphService` skipped by `@ConditionalOnBean(CompiledGraph)` timing | Use `@ConditionalOnProperty(app.ai.enabled=true)` (shipped); redeploy backend |
| Pitch/ask work, chat does not | Same as above — `ChatClient` bean exists, graph service did not | Redeploy backend after the registration fix |
| Invoice / label OCR `model_not_found` / `access_denied` | DashScope key has chat but not VL entitlement, or wrong `AI_VISION_MODEL` / region | Enable VL in Model Studio; set `AI_VISION_MODEL` to an entitled id (not the chat model); keep `AI_DASHSCOPE_BASE_URL` on the key’s region (CN vs intl) |
| Price suggestions `Odoo session expired` on bare API call | Odoo cookie is minted after store shell load, not on JWT login alone | Open any store page first, or call after overview bootstrap |

## Verify script

```bash
PILOT_BASE_URL=https://demo.orithos.com.au node scripts/pilot-ai-features-verify-uat.mjs
```

Expect: NLQ `PASS` when AI is on; Sommelier text/pitch/ask/similar `PASS`; price suggestions `writeEnabled=false`; anonymous assistant `401`. Vision may stay `FAIL` until the DashScope account entitles a VL model.

## Audit / logging policy

- Prefer: intent name, thread id hash, latency, HTTP/business error code, model id, token usage if available.
- Do **not** default-log full invoice images, wine-label images, or raw audio blobs.
- Retention: align with Dokploy log retention; purge model request bodies from app logs within 30 days unless investigating an incident.
- Who may flip `AI_ENABLED`: platform operator / deploy owner only.

## Production flip

1. Set env in Dokploy; **Deploy** (never Fresh Volumes to “fix” AI).
2. Confirm `/api/ai/config/client` returns `enabled: true` for an authenticated store session.
3. Read-only smoke: floating chat accepts a sales/stock question; Find wine returns Odoo-priced stock; Identify text search works; invoice preview if using a non-production sample image; `/stock/price-suggestions` loads with `writeEnabled: false`.
4. Confirm anonymous AI routes still return `401`.
5. Confirm no automatic RFQ confirm, no list_price write from price suggestions, no invoice receive.

## Rollback

Set `AI_ENABLED=false` and redeploy. Cashiers keep sell/stock/purchase UI; OCR/voice/chat return disabled messaging.

## Brand copy alignment

- Smart buy: “Explainable replenishment; draft purchase needs approval. Invoice scan is preview only.”
- Smart recommend: “Recommend in-stock bottles; label photo needs AI on.”
- Smart pricing: “Suggested shelf prices from cost and margin — you apply changes.”
- Smart search: “Natural-language sales and stock when store AI is on.”
