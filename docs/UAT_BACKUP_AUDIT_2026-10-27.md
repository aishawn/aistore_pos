# Backup Audit - 2026-10-27

## Dokploy evidence

- POS Compose service: `aistorepos`
- POS database service: PostgreSQL service `data` (`aistore-data-wvdjl9`)
- PostgreSQL service status: `done`
- PostgreSQL backup configuration: **none**
- PostgreSQL backup restore test: **not completed**

The existing backup attached to the POS Compose service is a Compose/MySQL
backup for database `orithos`. It is not a backup of the PostgreSQL database
used by the POS application. The latest two scheduled MySQL backup records
were also unsuccessful. This cannot be used as evidence that POS data can be
restored.

## Release impact

The customer trial remains **NO-GO** until a PostgreSQL backup is created,
downloaded or restored into a test target, and the application can log in and
continue a POS read/write smoke test against the restored data. No production
database or volume was changed during this audit.
