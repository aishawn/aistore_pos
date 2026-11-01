# Store-owned POS categories

The store application lists, assigns and filters only POS categories owned by its
tenant-bound Odoo company. Matching names in different stores are independent.
There is no public-category picker or cross-store category maintenance flow.
Accounting `product.category` records are outside this policy and are unchanged.

Existing global `pos.category` records must not be deleted or assigned to a single
store: another company may still reference them. Migrate each store's references
before rolling out store-only category selection to that store.

## Migrating legacy references

1. Resolve the store's exact Odoo company ID through its authenticated tenant
   binding or the platform tenant detail. Verify its name and database. Do not
   infer identity from a display name or a previous sandbox's company ID.
2. Pause category edits/imports during the migration. Use Node/API write gates as
   configured; the operator script uses explicitly supplied Odoo credentials.
3. Dry-run from the repository root (credentials remain in an ignored env file):

   ```powershell
   python scripts/migrate_store_categories.py --env-file .env --company-id COMPANY_ID --expected-company-name 'EXACT COMPANY NAME'
   ```

4. Review the count of categories to create, product templates (including archived
   products), category parents and POS configuration category fields to update.
   Apply requires `ODOO_DATABASE = ISOLATION_ODOO_DATABASE` and a new journal path:

   ```powershell
   python scripts/migrate_store_categories.py --env-file .env --company-id COMPANY_ID --expected-company-name 'EXACT COMPANY NAME' --apply --journal .local/store-category-migration.json
   ```

5. Repeat the dry run: all four change counts must be zero. Verify the store's
   category lists, product category labels and filters after deployment.

The script reuses the unique local category matching the normalized name and
parent, or creates a store-owned category under a corresponding local parent.
Missing/cyclic ancestry and ambiguous local matches stop before writes. Product
and register references use relation link/unlink commands, preserving category
paths without deleting categories, products or configurations. Only category
fields are written. A journal captures the pre-migration references and confirmed
operations; interrupted runs can be resumed with a fresh journal after reviewing
the first one. Do not blindly reverse a journal over newer category edits.

## 2026-11-02 SKR migration

Authenticated platform tenant detail identifies SKR as company **5** in
`aipos_uat`. Created **5** store categories and updated **14** product templates.
Remaining references to global categories, including archived products: **0**.
All **44** original global category records were unchanged and the migrated
products retained their category paths. No stock, price, tax, product-deletion or
other-store writes. Full journal stays under ignored `.local/`; public summary:
`UAT_STORE_CATEGORIES_MIGRATION_2026-11-02.json`.

This is a scoped taxonomy migration in shared `aipos_uat` (`isolated=false`), not
formal production acceptance. Other legacy test companies were not migrated.
Their references require the same per-store procedure before acceptance. The
legacy Java sample-data provisioner can still reuse a global category by name;
that separate onboarding path requires a company-filter fix and the repository's
exact-candidate remote Java 21 pre-push verification before it can be released.
Do not describe sample provisioning as verified under the new policy.
