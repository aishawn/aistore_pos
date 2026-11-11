# PostgreSQL Sharding Operations

## Topology

- At cutover, create a new `pos_control` database and three new business databases (`pos_shard_01` through `pos_shard_03`). The existing shared database remains the read-only `pos_legacy` rollback source during the cutover window; it must not double as `pos_control`, or its old business tables would keep consuming space and receive writes.
- Copy canonical vendor identity, subdomain, lifecycle status, and required platform-control records into `pos_control`. `tenant_shard_registry` maps each `vendor_id` to one `shard_key`.
- Keep each vendor's outlets and business data together in one business shard. Copy the vendor row into that shard as well; current business services use `VendorMapper` after routing.
- Start with three logical business databases (`shard_01` through `shard_03`). Databases on the same PostgreSQL server still share CPU, memory, disk I/O, WAL, and failure domain. Move shards to separate PostgreSQL hosts when measured load or capacity requires resource isolation.
- Every business shard uses a permanent sequence slot from 1–100. New IDs use a shard-specific remainder modulo 100, beginning above the source-wide high-water mark. This keeps existing IDs unchanged while making future sequence-generated IDs distinct across shards. Never reassign a slot to another shard, even after retirement.
- At 100 outlets x 5 GB, budget for at least 500 GB of logical data plus measured indexes, WAL, backup retention, and temporary migration space. Do not infer host capacity from database count.

Capacity estimates must use measured tenant-level data, not multiply the current database size by the tenant count. The 2026-11-11 source inventory measured about 5.03 GB for the entire database; it did not establish 5 GB per vendor or outlet. Keep the 500 GB figure only as a stress-planning scenario until per-vendor measurements prove that assumption.

## Configuration

Set secrets in Dokploy, never in source control:

- `CONTROL_POSTGRESQL_URL`: JDBC URL for the control database.
- `SHARD_DATABASE_URLS`: JSON object mapping stable shard keys to JDBC URLs, for example `{"shard_01":"jdbc:postgresql://dbhost:5432/pos_shard_01","shard_02":"jdbc:postgresql://dbhost:5432/pos_shard_02","shard_03":"jdbc:postgresql://dbhost:5432/pos_shard_03"}`.
- `DB_USER` and `DB_PASSWORD`: credentials applied to each configured pool.
- Keep `POSTGRESQL_URL` only for backward-compatible single-database bootstrap; explicitly configure the control and shard URLs before enabling sharding.

The database role used by the application should have only the required privileges. Database creation remains an operator action; signup must not create databases.

## Control Schema Migration

The migration is intentionally operator-run. The repository does not currently have a Flyway or Liquibase runtime, and the application must not silently apply this control-plane change at startup.

1. Create `pos_control` and take and verify a fresh backup of the current shared source database.
2. Confirm the control database contains the canonical `vendor` table and the same vendor IDs/subdomains expected by the application.
3. Compute the lowercase SHA-256 of the exact migration file, then apply it with `psql` and stop on the first SQL error:

   ```sh
   migration_checksum=$(sha256sum pos-api/src/main/resources/db/migration/V2026111101__tenant_shard_registry.sql | cut -d ' ' -f 1)
   psql "$CONTROL_POSTGRESQL_URL" -v ON_ERROR_STOP=1 \
     -v "migration_checksum=$migration_checksum" \
     -f pos-api/src/main/resources/db/migration/V2026111101__tenant_shard_registry.sql
   ```

4. Verify `schema_migration_history` records version `V2026111101` and the expected checksum; verify the route table foreign key targets `vendor(id)` and a known vendor can be mapped to an allowed shard key.
5. A rerun with the same version and checksum is idempotent; a different checksum for an applied version is fatal. Do not edit an applied migration; add a later version for changes. Every later operator-run migration must use the same history table and checksum check.

## Existing-Data Cutover

Do not switch production traffic until the application routing code, all three shard schemas, and a repeatable vendor-scoped migration utility have been verified together. `pg_dump` does not provide a reliable per-vendor export for this schema: tenant ownership is not uniform across tables, and relationships, shared reference data, generated IDs, and sequences need coordinated handling.

### Observed Source Baseline (2026-11-11)

A read-only inspection of the current source database measured 5,031,745,215 bytes total across 170 public tables. It contained 150 vendor records and 203 outlets: 2 active vendors, 7 trial vendors, and 141 deleted vendors. The enabled Shopfront mappings resolve `demo` to vendor 1 (outlets 1 and 203) and `skr` to vendor 55 (outlet 87); the source currently has no shard routes. Treat deleted/trial tenants as retained data until an explicit retention policy says otherwise.

The largest relations were `shopfront_import_run` (~1,432 MiB), `shopfront_sale_item` (~1,392 MiB), and `shopfront_sale` (~926 MiB). Shopfront sales mirror rows are duplicated into both store keys for the same source feed. New `shopfront_import_run` rows now keep metadata only; this stops that audit table growing with full request payloads, but does not reclaim its historical payloads. These measurements show the current database is about 5 GB total, not 5 GB per active store. Re-measure after import-audit compaction and before sizing production shards.

Before the maintenance window:

1. Run the read-only schema and size inventory from a host that can connect to the source database:

   ```sh
   python pos-api/scripts/inventory_tenant_data.py \
     --output .local/tenant-data-inventory.json
   ```

   This default pass reports planner row estimates, relation/index sizes, direct `vendor_id`/`tenant_id`/`company_id`/`outlet_id`/`store_key` columns, declared foreign keys, vendor/outlet catalog, Shopfront store mappings, and any existing shard routes. It does not scan business rows and is not a row-copy map. Use `--tables table_a,table_b` to narrow an exact scan and `--group-by store_key,import_type` for additional dimensions on a selected table. `--exact-counts` can scan large tables; run it only after reviewing sizes and choosing an acceptable maintenance/read-load window. `--import-audit-after-id N` checks only newer audit rows by primary key without reading the retained historical payloads. Review indirect ownership, polymorphic references, shared reference data, large objects, and orphan rows separately. Confirm every vendor and outlet has exactly one destination shard.
   The committed classification rules and validator currently cover all 170 inventoried tables, but the result is `TABLES_CLASSIFIED` with `migration_ready=false`. This is an inventory completeness gate only. `vendor_id` classifications move a vendor and all its outlets together; `outlet_id` classifications must resolve through the canonical `outlet.vendor_id`; `store_key` classifications must resolve through the enabled Shopfront mapping; indirect children follow their declared parent. These rules do not yet constitute an executable row-copy plan. Do not run a production copy until a migration utility validates these joins, external/polymorphic references, shared rows, large objects, orphan handling, and per-tenant checksums against a restored rehearsal database.
2. Measure disk headroom for the source plus all three copied shards, control data, indexes, WAL, backups, and temporary files. The source remains present during rehearsal and rollback, so plan for close to the full source plus a full copy at peak. Measure IOPS and restore duration; use another host/storage location if the current server cannot hold that peak. Rehearse the full operation against a production-sized restored copy.
3. Provision three databases and install the exact production schema and migration version in each. Do not rely on the base `schema.sql` alone; it may not include later production migrations.
4. Take a recoverable backup of the source database and test restoring it. Prepare a route snapshot and a written rollback owner/checklist.

During cutover:

1. Enter maintenance mode and stop all POS writes, scheduled writers, and Shopfront sync jobs.
2. Copy canonical vendor/platform-control records into `pos_control`. Copy each vendor's complete business data and all related outlets to exactly one destination shard. Copy that vendor's row into the destination shard and register the route only after data validation succeeds.
3. Preserve all existing IDs and references. The current single database allocated BIGINT IDs globally, but future shard-local sequences must not collide. Keep all outlets for a Retailer together.
4. Compare per-table counts and business checksums, including sales totals by period, refunds, stock balances, products, users, outlets, and key configuration. Check orphan references and sequence values.
5. Enable routes for a small pilot vendor, run login/read/write/readback checks, then validate remaining vendors. Resume scheduled sync jobs only after ordinary writes pass.

## Sequence Allocation

Reserve a stable sequence slot for every business shard, up to 100. New IDs use a different remainder modulo 100 per slot, while all existing IDs remain unchanged. Before the cutover, with writes stopped, compute one source-wide high-water mark covering every owned BIGINT ID and every owned sequence's `last_value`:

```sh
psql "$SOURCE_POSTGRESQL_URL" -v ON_ERROR_STOP=1 \
  -f pos-api/scripts/report_shard_sequence_floor.sql
```

Capture the reported `global_id_floor` as a shell variable named `global_id_floor` and use it unchanged for all business shards. The allocator verifies each shard's local IDs and sequence values do not exceed that source floor, then plans the first value above it with the shard's stable modulo-100 slot. It preserves existing IDs and rejects unsupported column types, sequence increments, slot/key mismatches, insufficient BIGINT headroom, or missing sequence privileges.

Run a report-only pass against each restored/rehearsal business database first:

```sh
psql "$SHARD_DATABASE_URL" -v shard_key=shard_01 -v shard_slot=1 \
  -v "global_id_floor=$global_id_floor" -v dry_run=true \
  -f pos-api/scripts/allocate_shard_sequences.sql
```

Review every reported table/sequence and its `next_value`. Only after the report passes and the migration has been rehearsed, run apply mode during cutover by changing `dry_run=true` to `dry_run=false`. Repeat with the matching stable key and slot for each shard. Run report-only mode again before allowing writes. `setval` changes are not transactional; take a verified backup first. Do not rerun after writes resume: allocated sequences must retain their shard residue and current high-water state.

The script inspects owned sequences in the `public` schema. Any application-generated IDs stored outside owned BIGINT sequences (for example UUIDs, external IDs, or IDs embedded in JSON) need separate migration rules and verification.

Rollback:

1. If any route or business validation fails, stop writes again and restore the previous route snapshot (or disable sharding and return to the source database using the previously deployed compatibility configuration).
2. Because writes may have reached a new shard after cutover, do not point back to the source without reconciling those writes. Preserve both copies, identify the last consistent write boundary, and replay or restore before reopening traffic.
3. Keep `pos_legacy` read-only for a seven-day rollback window. Before cleanup, create a separate retained backup, restore it in isolation, confirm the agreed retention period, then have an operator explicitly approve dropping the legacy database. Never remove the only recoverable copy.

## Ongoing Operations

- New vendor provisioning must create the control record, business-shard vendor/outlet/user/configuration data, and route as a retryable workflow. A partially provisioned tenant must remain unavailable until every step succeeds.
- Sharding remains disabled until provisioning and recovery flows are retryable across the control database and a shard, startup schema migrations are versioned for every shard, scheduled writers explicitly iterate or enter a shard context, and Shopfront mapping writes cannot diverge from import routing.
- In the current routing foundation, Shopfront mapping reads are allowed from the control database, while mapping writes are rejected in sharding mode until they can update the canonical mapping and target shard consistently.
- `shopfront_import_run.payload_json` is an audit envelope, not an import replay source. New imports retain metadata and counts only; source rows are not copied into this history table. Existing payloads are preserved until a separately backed-up and reviewed compaction operation is approved.
- Route changes are maintenance operations: move the entire vendor, verify it, then update the route. Never move a single outlet independently.
- Track per-shard database size, table and index growth, connection-pool usage, query latency, lock waits, WAL volume, backup age, and restore results. Alert before storage reaches 70% and begin capacity planning before the limit is approached.
- Back up the control database and every business shard. The initial recovery objective is RPO 15 minutes and RTO 4 hours; validate these with scheduled PITR restore exercises and adjust to business requirements.
- Platform-wide metrics should be asynchronously aggregated. Do not implement cross-database transactional joins for dashboards or exports.
