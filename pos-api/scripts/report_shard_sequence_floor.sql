\set ON_ERROR_STOP on
CREATE TEMP TABLE source_sequence_values (value BIGINT NOT NULL) ON COMMIT PRESERVE ROWS;

DO $report$
DECLARE
  v_seq RECORD;
  v_max_id BIGINT;
  v_last_value BIGINT;
BEGIN
  FOR v_seq IN
    SELECT sn.nspname AS sequence_schema,
           s.relname AS sequence_name,
           tn.nspname AS table_schema,
           t.relname AS table_name,
           a.attname AS column_name
      FROM pg_class s
      JOIN pg_namespace sn ON sn.oid = s.relnamespace
      JOIN pg_depend d ON d.objid = s.oid
                      AND d.classid = 'pg_class'::regclass
                      AND d.refclassid = 'pg_class'::regclass
                      AND d.deptype IN ('a', 'i')
      JOIN pg_class t ON t.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = t.relnamespace
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
     WHERE s.relkind = 'S'
       AND sn.nspname = 'public'
       AND tn.nspname = 'public'
     ORDER BY tn.nspname, t.relname, a.attname
  LOOP
    EXECUTE format('SELECT max(%I)::BIGINT FROM %I.%I',
      v_seq.column_name, v_seq.table_schema, v_seq.table_name)
      INTO v_max_id;
    EXECUTE format('SELECT last_value FROM %I.%I',
      v_seq.sequence_schema, v_seq.sequence_name)
      INTO v_last_value;
    INSERT INTO source_sequence_values(value)
      VALUES (GREATEST(COALESCE(v_max_id, 0), COALESCE(v_last_value, 0)));
  END LOOP;
END
$report$;

SELECT max(value) AS global_id_floor
  FROM source_sequence_values;
