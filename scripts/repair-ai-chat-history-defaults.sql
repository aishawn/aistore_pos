-- Repair missing defaults left by the PostgreSQL table migration.
-- Scope: AI chat history only. No Odoo, sales, inventory or purchasing writes.
-- Run in ONE transaction; take the in-database backup before changing rows.
-- Existing orphan messages stay unlinked: their tenant/conversation cannot be inferred.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
LOCK TABLE public.ai_chat_thread, public.ai_chat_message IN ACCESS EXCLUSIVE MODE;
CREATE SCHEMA IF NOT EXISTS ai_history_repair_20261103;
CREATE TABLE IF NOT EXISTS ai_history_repair_20261103.threads_before AS TABLE public.ai_chat_thread;
CREATE TABLE IF NOT EXISTS ai_history_repair_20261103.messages_before AS TABLE public.ai_chat_message;
DO $$
DECLARE
  tab text;
  seq text;
  next_id bigint;
  existing_default text;
  duplicate_ids boolean;
  identity_kind text;
BEGIN
  FOREACH tab IN ARRAY ARRAY['ai_chat_thread', 'ai_chat_message'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=tab AND column_name='id' AND data_type <> 'bigint') THEN
      RAISE EXCEPTION 'Unexpected history ID type';
    END IF;
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE id IS NOT NULL GROUP BY id HAVING count(*) > 1)', tab) INTO STRICT duplicate_ids;
    IF duplicate_ids THEN RAISE EXCEPTION 'Duplicate history IDs; abort repair'; END IF;
    SELECT column_default, is_identity INTO existing_default, identity_kind
      FROM information_schema.columns WHERE table_schema='public' AND table_name=tab AND column_name='id';
    IF existing_default IS NULL AND identity_kind='NO' THEN
      seq := tab || '_repair_id_seq';
      EXECUTE format('CREATE SEQUENCE IF NOT EXISTS public.%I AS bigint', seq);
      EXECUTE format('SELECT COALESCE(max(id), 0) + 1 FROM public.%I', tab) INTO next_id;
      EXECUTE format('ALTER SEQUENCE public.%I RESTART WITH %s', seq, next_id);
      EXECUTE format('ALTER SEQUENCE public.%I OWNED BY public.%I.id', seq, tab);
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN id SET DEFAULT nextval(%L::regclass)', tab, 'public.' || seq);
    END IF;
    EXECUTE format('UPDATE public.%I SET id=DEFAULT WHERE id IS NULL', tab);
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN id SET NOT NULL', tab);
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid=('public.'||tab)::regclass AND contype='p') THEN
      EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I PRIMARY KEY (id)', tab, tab || '_repair_pkey');
    END IF;
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN created_at SET DEFAULT CURRENT_TIMESTAMP', tab);
  END LOOP;
END $$;
ALTER TABLE public.ai_chat_thread ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;
-- Do not invent missing historical timestamps or reassign orphan messages.
