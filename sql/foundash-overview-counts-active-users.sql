-- Foundash: patch foundash_overview_counts() active_users only
-- Apply in Supabase SQL editor as postgres / service role AFTER
-- the live foundash_overview_counts() RPC exists.
--
-- Why a surgical replace, not CREATE OR REPLACE of a guessed body:
--   foundash_overview_counts was created in the SQL editor and was never
--   committed to this repo. Replacing the whole function would guess
--   total_real_users / total_sessions_real / total_climbs_real / falls_logged
--   / journal_entries and could change those numbers. Those counters stay
--   "real logged climb only" and are not touched here.
--
-- Bug: Active users (30d) excluded (a) foundash_admins (John's 7 real
-- sessions in 30d counted as 0) and (b) baseline check-ins (is_checkin=true)
-- so Anna / Wes dropped out. Should be 5: Jess, John, Kellyanne Peterson,
-- Anna, Wes.
--
-- CORRECTED active_users subquery (is_checkin filter REMOVED; foundash_admins
-- exclusion REMOVED here only):
--
--   SELECT count(DISTINCT s.user_id)
--   INTO v_active_users
--   FROM public.sessions s
--   JOIN auth.users u ON u.id = s.user_id
--   WHERE s.deleted_at IS NULL
--     AND s.created_at >= now() - interval '30 days'
--     AND NOT public._foundash_is_test_email(u.email);

DO $$
DECLARE
  def text;
  patched text;
  new_block text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'foundash_overview_counts'
    AND pg_get_function_identity_arguments(p.oid) = '';

  IF def IS NULL THEN
    RAISE EXCEPTION 'public.foundash_overview_counts() not found — apply the live overview RPC before this patch';
  END IF;

  RAISE NOTICE 'foundash_overview_counts current def: %', def;

  new_block :=
    'SELECT count(DISTINCT s.user_id)' || chr(10) ||
    'INTO v_active_users' || chr(10) ||
    'FROM public.sessions s' || chr(10) ||
    'JOIN auth.users u ON u.id = s.user_id' || chr(10) ||
    'WHERE s.deleted_at IS NULL' || chr(10) ||
    '  AND s.created_at >= now() - interval ''30 days''' || chr(10) ||
    '  AND NOT public._foundash_is_test_email(u.email)';

  patched := regexp_replace(
    def,
    'SELECT[[:space:]]+count[[:space:]]*\([[:space:]]*DISTINCT[[:space:]]+s\.user_id[[:space:]]*\)[[:space:]]+INTO[[:space:]]+v_active_users[^;]*;',
    new_block || ';',
    'i'
  );

  IF patched = def THEN
    RAISE EXCEPTION 'Could not locate SELECT … INTO v_active_users in foundash_overview_counts() — inspect NOTICE def above and patch by hand';
  END IF;

  EXECUTE patched;
  RAISE NOTICE 'foundash_overview_counts() active_users subquery patched';
END
$$;
