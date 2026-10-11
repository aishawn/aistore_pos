-- Step 1: Enable AUTO_INCREMENT on columns that lacked it.
-- Step 2: Run migration_renumber_ids.sql to renumber existing rows to 1, 2, 3, ...
--
-- Usage (backup first):
--   mysql -u root -p orithos < migration_auto_increment.sql
--   mysql -u root -p orithos < migration_renumber_ids.sql

SET NAMES utf8mb4;

ALTER TABLE customer_revision MODIFY id BIGINT NOT NULL AUTO_INCREMENT;
ALTER TABLE customer_group_revision MODIFY id BIGINT NOT NULL AUTO_INCREMENT;
ALTER TABLE notification MODIFY id BIGINT NOT NULL AUTO_INCREMENT;

-- After renumbering, AUTO_INCREMENT is set per table in migration_renumber_ids.sql.
-- Do NOT preserve old timestamp-based counters here.
