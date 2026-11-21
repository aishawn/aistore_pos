# Settings 1:1 — design

## Authority

- Orithos `settings` + native catalogue tables are writable SoT.
- Ownership marker: vendor setting `meta.owned.{name}=orithos` after UI/API save.
- Shopfront import (`settings_import` / `POST .../settings:import`) writes only empty or unowned keys/rows.

## Surfaces

1. Setup sidebar — 23 Shopfront-aligned items + Data + AI Health.
2. Company KV editor — General / Display / Login / Sell Screen / Outlets / Date&Time / Currency / Search / Integrations / Misc.
3. Catalogue CRUD — Tax, Payment, Receipts, Statements, Sale Keys, Transferees, Customer Display, Barcodes, Price Sets, Promotion Categories, Registers & Outlets.
4. Enterprise + Push — `/api/settings/enterprise`, `/api/settings/push`.
5. Integrations — on-demand promote from staged Shopfront rows.

## Engine wiring

- `CompanySettingsService.cashRoundTo()` → `CashRounding.roundTo` in `CheckoutService`.
- Checkout quote/checkout reads the company quantity-pricing, family-distribution, and price-rounding settings. Current online UAT covers three ordinary tiered products on SKR and Demo; Shopfront documents High Mix and Quantity Rate, while Orithos Low Mix/Average and family distribution modes are extensions without full source parity evidence. See `validation.md` for the tested matrix and limits.
- `company.login.require_password` is read by the store staff endpoint and login endpoint. The store login page selects a staff account and makes the password field required according to that response; control-plane login always requires a password.
- Business timezone is consumed by server business-date logic. Date/time display settings are consumed by the POS UI, and `company.start_of_week` is consumed by report query logic. A source search found no runtime consumer for cost calculation method or profitability display; these remain persistence-only until their consuming workflows are identified and verified.
- Other company KV values remain persistable, but persistence alone is not evidence of an operational consumer. See the current audit boundary in `progress.md`.

## Crawler

- Collectors added for taxRates, paymentMethods, saleKeys, receipts, users, roles, pageRules, barcodeTemplates, priceSets, promotionCategories, statements, transferees, customerDisplays.
- Job `settings_import` stages then promotes; not hooked into daily overwrite.
