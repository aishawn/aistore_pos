# AI Assistant Function-Spec Coverage

This mapping turns the product function description into executable acceptance areas. Live checks are read-only unless an isolated Odoo test company is explicitly approved. A `PASS` means the routing/UI contract is covered; it does not claim provider quality or production deployment. The 2026-10-21 Demo run expanded the natural-language matrix to 49 cases.

| Function area | Representative user questions | Automated coverage | Current status |
|---|---|---|---|
| Store assistant and sales | `Today's sales`, `Show me today's sales`, `How did we do today?`, `昨天营业额` | `AssistantFastPathRouterTest`, workflow and report read-only UAT | PASS locally and 49/49 online utterances; runtime SHA requires verification |
| Date and period reports | `14/10/2026 sales`, `最近7天销售额`, `And yesterday?` | `ReportPeriodResolver` tests, `pilot-ai-report-readonly-uat.mjs` | PASS in recorded read-only evidence |
| Quantity and average ticket | `How many tickets yesterday?`, `本月客单价`, `最近7天销量` | report router/service tests | PASS locally; live data depends on Odoo |
| Product and stock lookup | `Is VB Cans in stock?`, `What is the inventory level for VB Cans?`, `店里还有 VB Cans 吗？` | `AssistantFastPathRouterTest`, stock RPC fixture, read-only Odoo diagnostic | PASS routing and direct Odoo RPC (`7 PASS / 1 INFO`); live AI report path remains BLOCKED and returns an honest retry/list instruction |
| Replenishment | `Which products need reordering?`, `哪些商品库存低`, `What should I reorder today?` | `WorkflowRouteRouterTest`, workflow utterance UAT | PASS locally and online; suggestions remain drafts |
| Pricing suggestions | `Which prices should I review?`, `哪些商品需要调价` | workflow route tests and pricing read-only UAT | PASS locally; no automatic price writes |
| Wine recommendations | `Find me a wine for steak`, `Recommend a red wine under $30` | workflow route tests, Sommelier read-only UAT | PASS routing and online; catalogue/stock scope required |
| Supplier invoice OCR | `Scan this supplier invoice`, `识别这张发票` | feature/OCR fixture and online probe | INFO/BLOCKED when provider or model is unavailable; preview-only |
| Voice input | spoken sales/stock questions, cancel and provider failure | voice fixture UAT | PASS in local fixture; live ASR is capability-gated |
| History and platform metrics | conversation history, store usage and platform audit | history/metrics UAT scripts | PARTIAL; second-store and operator credentials required for cross-tenant checks |
| Permissions and tenant isolation | restricted report role, missing store binding, forged `/admin/secret` route | admin guard, tenant, sanitizer tests | PASS fail-closed locally |

## Required negative cases

`How much red wine sold this week?`, `How many invoices did we receive?`, and `How much did we pay suppliers this month?` must remain report questions. They must not open the wine or invoice workflow merely because they contain those nouns. `Compare sales on 14 Oct with 15 Oct` is an unsupported custom comparison and must receive an honest limitation. Prompt injection, unsupported entity operations, and unknown text must produce no navigation or business write.

## Evidence rules

- Record the exact source commit and runtime SHA separately.
- `HTTP 200` with a business error is not a pass.
- A webhook response or a reachable page is not deployment proof.
- Never log API keys, passwords, tokens, or full provider response bodies.
