\set ON_ERROR_STOP on
\if :{?shard_key}
\else
  \echo "Required: -v shard_key=shard_01"
  \quit 2
\endif
\if :{?shard_slot}
\else
  \echo "Required: -v shard_slot=1 (stable slot 1 through 100)"
  \quit 2
\endif
\if :{?global_id_floor}
\else
  \echo "Required: -v global_id_floor=<source-wide maximum ID/sequence value>"
  \quit 2
\endif
\if :{?dry_run}
\else
  \echo "Required: -v dry_run=true|false"
  \quit 2
\endif

SELECT set_config('app.shard_key', :'shard_key', false);
SELECT set_config('app.shard_slot', :'shard_slot', false);
SELECT set_config('app.global_id_floor', :'global_id_floor', false);
SELECT set_config('app.dry_run', :'dry_run', false);

CREATE TEMP TABLE shard_sequence_plan (
  sequence_schema TEXT NOT NULL,
  sequence_name TEXT NOT NULL,
  table_schema TEXT NOT NULL,
  table_name TEXT NOT NULL,
  column_name TEXT NOT NULL,
  existing_max_id BIGINT NULL,
  sequence_last_value BIGINT NOT NULL,
  sequence_is_called BOOLEAN NOT NULL,
  next_value BIGINT NOT NULL,
  issue TEXT NULL
) ON COMMIT PRESERVE ROWS;

DO $preflight$
DECLARE
  v_key TEXT := current_setting('app.shard_key');
  v_slot INTEGER := current_setting('app.shard_slot')::INTEGER;
  v_floor BIGINT := current_setting('app.global_id_floor')::BIGINT;
  v_expected_key TEXT;
  v_residue INTEGER;
  v_max_id BIGINT;
  v_last_value BIGINT;
  v_is_called BOOLEAN;
  v_next_value BIGINT;
  v_issue TEXT;
  v_seq RECORD;
  v_found INTEGER := 0;
  v_issues TEXT;
BEGIN
  IF v_slot < 1 OR v_slot > 100 THEN
    RAISE EXCEPTION 'shard_slot must be between 1 and 100';
  END IF;
  IF v_floor < 1 OR v_floor > 9223372036854775707 THEN
    RAISE EXCEPTION 'global_id_floor must leave room for BIGINT sequence allocation';
  END IF;

  v_expected_key := 'shard_' || lpad(v_slot::TEXT, 2, '0');
  IF v_key <> v_expected_key THEN
    RAISE EXCEPTION 'shard_key % does not match stable slot % (expected %)',
      v_key, v_slot, v_expected_key;
  END IF;
  v_residue := v_slot % 100;

  FOR v_seq IN
    SELECT sn.nspname AS sequence_schema,
           s.relname AS sequence_name,
           tn.nspname AS table_schema,
           t.relname AS table_name,
           a.attname AS column_name,
           a.atttypid AS column_type_oid,
           s.oid AS sequence_oid,
           s.relowner AS sequence_owner_oid,
           t.oid AS table_oid,
           p.seqincrement
      FROM pg_class s
      JOIN pg_namespace sn ON sn.oid = s.relnamespace
      JOIN pg_depend d ON d.objid = s.oid
                      AND d.classid = 'pg_class'::regclass
                      AND d.refclassid = 'pg_class'::regclass
                      AND d.deptype IN ('a', 'i')
      JOIN pg_class t ON t.oid = d.refobjid
      JOIN pg_namespace tn ON tn.oid = t.relnamespace
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid
      JOIN pg_sequence p ON p.seqrelid = s.oid
     WHERE s.relkind = 'S'
       AND sn.nspname = 'public'
       AND tn.nspname = 'public'
     ORDER BY tn.nspname, t.relname, a.attname
  LOOP
    v_found := v_found + 1;
    v_issue := NULL;
    v_max_id := NULL;

    IF v_seq.column_type_oid <> 'bigint'::regtype THEN
      v_issue := 'owned ID column must be BIGINT';
    ELSIF NOT has_table_privilege(current_user, v_seq.table_oid, 'SELECT') THEN
      v_issue := 'missing SELECT privilege on owning table';
    ELSIF NOT has_sequence_privilege(current_user, v_seq.sequence_oid, 'SELECT') THEN
      v_issue := 'missing SELECT privilege on sequence';
    ELSIF NOT has_sequence_privilege(current_user, v_seq.sequence_oid, 'UPDATE') THEN
      v_issue := 'missing UPDATE privilege on sequence';
    ELSIF NOT pg_has_role(current_user, v_seq.sequence_owner_oid, 'MEMBER') THEN
      v_issue := 'must own the sequence or be a member of its owner role';
    ELSIF v_seq.seqincrement NOT IN (1, 100) THEN
      v_issue := 'sequence increment must be 1 (source) or 100 (already allocated)';
    END IF;

    IF v_issue IS NULL THEN
      EXECUTE format('SELECT max(%I)::BIGINT FROM %I.%I',
        v_seq.column_name, v_seq.table_schema, v_seq.table_name)
        INTO v_max_id;
      EXECUTE format('SELECT last_value, is_called FROM %I.%I',
        v_seq.sequence_schema, v_seq.sequence_name)
        INTO v_last_value, v_is_called;

      IF v_max_id IS NOT NULL AND v_max_id > v_floor THEN
        v_issue := format('local max ID %s exceeds the supplied source-wide floor %s',
          v_max_id, v_floor);
      ELSIF v_seq.seqincrement = 1 AND v_last_value > v_floor THEN
        v_issue := format('source sequence value %s exceeds the supplied floor %s',
          v_last_value, v_floor);
      ELSIF v_seq.seqincrement = 100 AND v_is_called THEN
        v_issue := 'sequence has generated IDs after allocation; run this only before writes resume';
      ELSIF v_seq.seqincrement = 100 AND v_last_value % 100 <> v_residue THEN
        v_issue := format('allocated sequence residue %s does not match slot residue %s',
          v_last_value % 100, v_residue);
      END IF;
    ELSE
      v_last_value := 0;
      v_is_called := FALSE;
    END IF;

    v_next_value := v_floor + 1;
    v_next_value := v_next_value + ((v_residue - (v_next_value % 100) + 100) % 100);
    IF v_seq.seqincrement = 100 AND v_issue IS NULL AND v_last_value > v_next_value THEN
      v_next_value := v_last_value;
    END IF;
    IF v_next_value > 9223372036854775707 AND v_issue IS NULL THEN
      v_issue := 'not enough BIGINT headroom for all shard sequence ranges';
    END IF;

    INSERT INTO shard_sequence_plan (
      sequence_schema, sequence_name, table_schema, table_name, column_name,
      existing_max_id, sequence_last_value, sequence_is_called, next_value, issue
    ) VALUES (
      v_seq.sequence_schema, v_seq.sequence_name,
      v_seq.table_schema, v_seq.table_name, v_seq.column_name,
      v_max_id, v_last_value, v_is_called, v_next_value, v_issue
    );
  END LOOP;

  IF v_found = 0 THEN
    RAISE EXCEPTION 'no owned sequences found in public schema; refusing to continue';
  END IF;

  SELECT string_agg(format('%I.%I (%I.%I.%I): %s',
           sequence_schema, sequence_name, table_schema, table_name, column_name, issue), E'\n')
    INTO v_issues
    FROM shard_sequence_plan
   WHERE issue IS NOT NULL;

  IF v_issues IS NOT NULL THEN
    RAISE EXCEPTION E'Shard sequence preflight failed; no sequence was changed:\n%', v_issues;
  END IF;

  RAISE NOTICE 'Preflight passed for % owned sequences; shard %, slot %, global floor %, mode %',
    v_found, v_key, v_slot, v_floor,
    CASE WHEN current_setting('app.dry_run')::BOOLEAN THEN 'report only' ELSE 'apply' END;
END
$preflight$;

SELECT sequence_schema || '.' || sequence_name AS sequence_name,
       table_schema || '.' || table_name || '.' || column_name AS owned_column,
       existing_max_id,
       sequence_last_value,
       sequence_is_called,
       next_value
  FROM shard_sequence_plan
 ORDER BY table_schema, table_name, column_name;

\if :dry_run
  \echo "Dry run complete; no sequence was changed."
\else
DO $apply$
DECLARE
  v_row RECORD;
BEGIN
  FOR v_row IN SELECT * FROM shard_sequence_plan ORDER BY sequence_schema, sequence_name LOOP
    EXECUTE format('ALTER SEQUENCE %I.%I AS BIGINT INCREMENT BY 100 MINVALUE 1 NO MAXVALUE NO CYCLE',
      v_row.sequence_schema, v_row.sequence_name);
  END LOOP;

  FOR v_row IN SELECT * FROM shard_sequence_plan ORDER BY sequence_schema, sequence_name LOOP
    PERFORM setval(
      format('%I.%I', v_row.sequence_schema, v_row.sequence_name)::regclass,
      v_row.next_value,
      FALSE
    );
  END LOOP;
END
$apply$;
  \echo "Sequence stride allocation applied. Verify the report before reopening writes."
\endif
