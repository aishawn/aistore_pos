# Shopfront Settings GraphQL contract (Wave 0)

Captured 2026-11-10 from live SKR `/settings` UI + [developer docs Query roots](https://developer.onshopfront.com/documentation/General/About).

## Company settings (browser UI keys)

Observed on `https://skr.onshopfront.com/settings` (read-only):

- General: Use Quantity Rate, Family Price Distribution, Price Rounding Mode, Cost Calculation Method, Profitability Display, Components/Packages, Weight, Barcode Templates, Sell Cases, Cross promotion count, Team Message, Price Activation Time
- Display: Single/Case text
- Login: Login Type, Mask Username, Require Password, Auto logout timers
- Sell Screen: product/customer add behaviour, blur, select popup, reason gates, invoice length
- Outlets: share parked sales / gift cards
- Date & Time / Currency / Search / Integrations / Miscellaneous (as listed in feature design)

Orithos maps these to `company.*` vendor settings via `CompanySettingsKeys`.

## Catalogue Query roots (crawler collectors)

| Entity type | GraphQL root | Notes |
|-------------|--------------|-------|
| tax_rates | taxRates | thin id/name until scopes allow more fields |
| payment_methods | paymentMethods | |
| sale_keys | saleKeys | |
| receipts | receipts | |
| users | users | staff import is optional; Orithos users remain authoritative after edit |
| roles | roles | |
| page_rules | pageRules | |
| barcode_templates | barcodeTemplates | |
| price_sets | priceSets | |
| promotion_categories | promotionCategories | |
| statements | statements | |
| transferees | transferees | |
| customer_displays | customerDisplays | |
| outlets / registers | outlets / registers | already in extended |

Missing OAuth scopes → entity error in job payload; does not block Orithos UI CRUD.
