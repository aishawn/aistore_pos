# POS Checkout Quote Follow-up — 2026-10-26

- Code candidate: `a93cffb841f825206df8ca910101bdfb40aa5c7f` (POS UI only; no `pos-api` changes).
- Checkout quote requests now abort after 45 seconds and show an actionable retry message. Finalise remains blocked until a fresh quote succeeds.
- Node 24 unit tests: **32/32 PASS**. TypeScript no-emit and targeted ESLint passed.
- Playwright fixture: **10/10 PASS**, using intercepted APIs only. It covers quote failure/retry, cash shortfall and change, external terminal confirmation, unknown checkout recovery without replay, duplicate submission protection, and receipt layout at 320/390/768/1024/1440px. Browser errors: 0. The only intercepted sale write was the expected success fixture; the quote retry produced 0 sale writes.
- Evidence: [UAT_POS_CHECKOUT_QUOTE_LOCAL_2026-10-26.json](UAT_POS_CHECKOUT_QUOTE_LOCAL_2026-10-26.json) and screenshots under `screenshots/2026-10-26-pos-checkout-quote/`.
- This is UI/fixture verification, not live Odoo pricing or business-flow acceptance. No production sale, payment, stock, cash, or register-close writes were made.
- Deployment and post-deploy runtime SHA must be recorded after Dokploy completes. Broader isolated Odoo workflow acceptance remains outstanding; pilot remains **NO-GO**.
