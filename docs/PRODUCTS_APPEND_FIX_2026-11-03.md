# Products append regression repair — 2026-11-03

The shared catalogue loader required snapshotId for every append. Only inventoryReport requests receive that field; ordinary /products returns items, offset, limit, hasNext and total. Consequently automatic scrolling and the visible Load more button both returned before issuing offset 40. The old UI fixture incorrectly supplied report snapshot fields even for ordinary product requests, masking the defect.

The snapshot prerequisite now applies only to inventory reports. Ordinary product append retries also retain the failed next offset instead of replacing the list with the first batch. Request locking, stale response protection and inventory snapshot expiry behavior remain in place.

The existing footer fixture now respects the two response contracts. scripts/pilot-products-append-local.cjs additionally tests automatic append without snapshots, end-of-results request suppression, preserved rows after append failure and retry at offset 40, at 390/1024/1440px. Evidence: UAT_PRODUCTS_APPEND_LOCAL_2026-11-03.json. Fixtures do not prove live Odoo acceptance.

SKR public frontend identity before this fix: 7b6106669c4c0e0f7daaafbaa6ada05f1388fd0b. Available local credentials do not authenticate the SKR tenant (browser shows Invalid username or password), so authenticated live scroll verification is unavailable. No business writes. No local production build or Maven.

Local result: 54/54 PASS, browser errors 0, business writes 0. TypeScript and targeted ESLint PASS.
