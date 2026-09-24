-- Foundash: replace ONLY the v_active_users block inside foundash_overview_counts()
-- Apply in Supabase SQL editor as postgres / service role.
--
-- Why surgical (not CREATE OR REPLACE of a guessed full body):
--   The live function was written in the SQL editor and never committed.
--   total_real_users / total_sessions_real / total_climbs_real / falls_logged
--   stay "real logged climb only" (and total_real_users still excludes
--   foundash_admins — that's "new real SIGNUPS", a different question).
--   This file rewrites v_active_users only, then byte-compares the other
--   INTO blocks so a missed regex cannot silently rewrite them.
--
-- CORRECTED v_active_users (is_checkin REMOVED; foundash_admins REMOVED here only):
--
--   SELECT count(DISTINCT s.user_id)
--   INTO v_active_users
--   FROM public.sessions s
--   JOIN auth.users u ON u.id = s.user_id
--   WHERE s.deleted_at IS NULL
--     AND s.created_at >= now() - interval '30 days'
--     AND NOT public._foundash_is_test_email(u.email);
--   -- is_checkin filter REMOVED: a baseline check-in is still real account activity
--   -- foundash_admins exclusion REMOVED here only: an admin account with genuine
--   -- real usage should count same as anyone else
--   -- (total_real_users below is unaffected and still excludes admins, since
--   -- that's about counting new real SIGNUPS, a different question than
--   -- "who's actively using it.")

CREATE OR REPLACE FUNCTION public._foundash_overview_into_block(p_def text, p_name text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  m text[];
BEGIN
  SELECT regexp_match(
    p_def,
    '(SELECT[[:space:]]+count[^;]*INTO[[:space:]]+' || p_name || '[^;]*;)',
    'i'
  ) INTO m;
  IF m IS NULL THEN
    RETURN NULL;
  END IF;
  RETURN m[1];
END;
$$;

DO $$
DECLARE
  def text;
  patched text;
  after_def text;
  new_block text;
  names text[] := ARRAY[
    'v_total_real_users',
    'v_total_sessions_real',
    'v_total_climbs_real',
    'v_falls_logged',
    'v_journal_entries'
  ];
  n text;
  before_block text;
  after_block text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO def
  FROM pg_proc p
  JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
  WHERE nsp.nspname = 'public'
    AND p.proname = 'foundash_overview_counts'
    AND pg_get_function_identity_arguments(p.oid) = '';

  IF def IS NULL THEN
    RAISE EXCEPTION 'public.foundash_overview_counts() not found';
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
    RAISE EXCEPTION 'Could not locate SELECT count(DISTINCT s.user_id) INTO v_active_users in foundash_overview_counts() — inspect NOTICE def above and patch by hand';
  END IF;

  EXECUTE patched;

  SELECT pg_get_functiondef(p.oid) INTO after_def
  FROM pg_proc p
  JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
  WHERE nsp.nspname = 'public'
    AND p.proname = 'foundash_overview_counts'
    AND pg_get_function_identity_arguments(p.oid) = '';

  FOREACH n IN ARRAY names LOOP
    before_block := public._foundash_overview_into_block(def, n);
    after_block := public._foundash_overview_into_block(after_def, n);
    IF before_block IS DISTINCT FROM after_block THEN
      RAISE EXCEPTION 'Other tile query changed: %', n;
    END IF;
  END LOOP;

  IF after_def !~* 'INTO[[:space:]]+v_active_users' THEN
    RAISE EXCEPTION 'Patched function missing v_active_users';
  END IF;
  IF after_def ~* 'INTO[[:space:]]+v_active_users[^;]*is_checkin' THEN
    RAISE EXCEPTION 'v_active_users still has an is_checkin filter';
  END IF;
  IF after_def ~* 'INTO[[:space:]]+v_active_users[^;]*foundash_admins' THEN
    RAISE EXCEPTION 'v_active_users still excludes foundash_admins';
  END IF;

  RAISE NOTICE 'foundash_overview_counts() v_active_users patched; other INTO blocks unchanged';
  RAISE NOTICE 'foundash_overview_counts patched def: %', after_def;
END
$$;

DROP FUNCTION IF EXISTS public._foundash_overview_into_block(text, text);

-- Live verification of the NEW active_users rule (not the other tiles).
-- Expected against today's data: 5 — Jess, John, Kellyanne Peters, Anna, Wes.
SELECT
  count(DISTINCT s.user_id) AS active_users_30d,
  array_agg(DISTINCT u.email ORDER BY u.email) AS emails
FROM public.sessions s
JOIN auth.users u ON u.id = s.user_id
WHERE s.deleted_at IS NULL
  AND s.created_at >= now() - interval '30 days'
  AND NOT public._foundash_is_test_email(u.email);
