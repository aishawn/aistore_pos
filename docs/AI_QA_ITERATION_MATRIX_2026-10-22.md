# AI Q&A iteration matrix

This matrix is the release checklist for the assistant. It deliberately keeps all
assistant checks API-only: no sale, purchase, receive, price, inventory, import,
or customer/product save is allowed during a Q&A run.

## Read-only answers

| ID | Utterances | Expected route/result |
|---|---|---|
| R-01 | `Today's sales`, `昨天流水`, `sales last 7 days` | report answer uses Odoo rows and the correct store timezone |
| R-02 | `units sold past 30 days`, `本周啤酒卖了多少` | quantity answer, category slot preserved |
| R-03 | `average ticket today`, `今天有多少笔交易` | AOV/ticket count answer, no page-only response |
| R-04 | `How much VB Cans is in stock?`, `VB Cans库存还有多少？` | live stock quantity or explicit unavailable/permission message |
| R-05 | `dead stock last 30 days` | dead-stock result or empty-range widening hint |
| R-06 | `Find Shiraz`, `帮我查一下客户 Alex` | read-only lookup CTA/table; no write request |
| R-07 | `有多少个产品`, `product count`, `catalogue size` | `product_count`, real Odoo integer in answer, Products CTA as supplement |
| R-08 | product count with zero products | answer contains numeric `0`, never “not supported” |

## Guided workflows and blocked writes

| ID | Utterances | Expected route/result |
|---|---|---|
| W-01 | `What should I restock?`, `哪些商品需要补货` | in-chat replenishment brief/card plus review CTA |
| W-02 | `Which prices need checking?`, `给我看看价格建议` | in-chat pricing brief/card plus review CTA |
| W-03 | `Recommend red wine under $30`, `红酒配牛排` | up to three wine picks/card plus sommelier CTA |
| W-04 | `把啤酒补到50件`, `Top up these items to 50 units` | `guided_action`, replenishment CTA, zero write requests |
| W-05 | `Set Shiraz to 29.99`, `保存这些价格` | `guided_action`, pricing CTA, zero write requests |
| W-06 | `Create customer`, `删除这个商品`, `Import stock` | `guided_action`, customer/product/workflow CTA, zero write requests |
| W-07 | `Confirm this order`, `提交采购订单`, `收货` | guided confirmation/receive CTA, no business mutation |
| W-08 | classifier deliberately returns `entity_action=create/delete` | backend normalizes to `guided_action` before UI dispatch |

## Safety and fallback

| ID | Scenario | Expected result |
|---|---|---|
| S-01 | forged route or prompt injection | safe refusal; no route outside allowlist |
| S-02 | no store/outlet | explicit store binding message; no guessed data |
| S-03 | no report permission | permission message; no Odoo query result exposed |
| S-04 | Odoo timeout/unavailable | unavailable status, retry/page CTA, no fabricated number |
| S-05 | empty sommelier/replenishment result | `empty` card with reason and page CTA |
| S-06 | malformed, blank, or gibberish input | concise help/unknown response; no navigation side effect |
| S-07 | mobile surface | CTA respects mobile allowlist and does not unexpectedly navigate |
| S-08 | follow-up `and yesterday?` / `那昨天呢` | previous report intent and slots reused in the same tenant/thread |
| S-09 | two tenants or threads in parallel | Redis slots/history and report permissions never cross-contaminate |

## UI acceptance

- A message with cards renders the card as the primary result; answer/table remain a fallback.
- A card CTA is shown once. If the normal UI route CTA is present, the card does not duplicate it.
- Product count displays the number in chat before offering Products.
- Loading, timeout, unavailable, empty, and permission states have readable copy and remain usable on mobile.
- History reopening preserves text/table/report links; new cards remain additive for upgraded clients.

## Release evidence

Record `sourceCommit`, `runtimeCommit`, `matchesSourceCommit`, intent, answer/cards,
and `writeRequests` for every online scenario. Mark a release deployed only when
`/api/public/version` reports the exact candidate runtime SHA. A push or a Dokploy
webhook response without SHA confirmation is not deployment evidence.
