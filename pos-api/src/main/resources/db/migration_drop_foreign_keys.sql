-- Drop all database-level FOREIGN KEY constraints in the current database.
-- Relationships remain as logical FK columns (JOIN in queries / app layer).
-- Idempotent: only drops constraints that actually exist.

SET NAMES utf8mb4;
SET FOREIGN_KEY_CHECKS = 0;

DROP PROCEDURE IF EXISTS orithos_drop_all_fks;

DELIMITER //
CREATE PROCEDURE orithos_drop_all_fks()
BEGIN
  DECLARE done INT DEFAULT FALSE;
  DECLARE v_table VARCHAR(64);
  DECLARE v_fk VARCHAR(64);
  DECLARE cur CURSOR FOR
    SELECT TABLE_NAME, CONSTRAINT_NAME
    FROM information_schema.TABLE_CONSTRAINTS
    WHERE CONSTRAINT_SCHEMA = DATABASE()
      AND CONSTRAINT_TYPE = 'FOREIGN KEY';
  DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

  OPEN cur;
  fk_loop: LOOP
    FETCH cur INTO v_table, v_fk;
    IF done THEN
      LEAVE fk_loop;
    END IF;
    SET @sql = CONCAT('ALTER TABLE `', v_table, '` DROP FOREIGN KEY `', v_fk, '`');
    PREPARE stmt FROM @sql;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END LOOP;
  CLOSE cur;
END//
DELIMITER ;

CALL orithos_drop_all_fks();
DROP PROCEDURE orithos_drop_all_fks;

SET FOREIGN_KEY_CHECKS = 1;
