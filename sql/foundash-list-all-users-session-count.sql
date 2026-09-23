-- Foundash: fix foundash_list_all_users() session_count
-- Apply in Supabase SQL editor as postgres / service role AFTER
-- sql/foundash-coach-admin.sql (needs public._foundash_is_admin on the live raw RPC).
--
-- Why a wrapper, not CREATE OR REPLACE of the live body:
--   foundash_list_all_users / foundash_user_detail were created in the SQL editor
--   and were never committed to this repo. Replacing the whole function would
--   guess columns and destroy later live additions. This file RENAMES the live
--   function to foundash_list_all_users_raw() and wraps it, rewriting only
--   session_count.
--
-- foundash_user_detail is NOT touched. The per-athlete detail view already
-- shows real climbs (data.climbs / profile.climb_count) and no longer tiles
-- profile.session_count.
--
-- Inspect the live count clause (run separately, read-only):
--   SELECT p.proname,
--          pg_get_function_identity_arguments(p.oid) AS args,
--          pg_get_functiondef(p.oid) AS def
--   FROM pg_proc p
--   JOIN pg_namespace n ON n.oid = p.pronamespace
--   WHERE n.nspname = 'public'
--     AND p.proname IN (
--       'foundash_list_all_users',
--       'foundash_list_all_users_raw',
--       'foundash_user_detail'
--     );
--
-- Observed without pg_proc access (2026-09-23):
--   All Users reads session_count verbatim via usersSessionCount().
--   Anna Islamova / Wes Shih each have exactly one public.sessions row,
--   is_checkin=true AND is_baseline=true, and the roster shows 1.
--   So the live list count includes check-in / baseline rows — it does not
--   apply is_checkin = false. Exact text of the subquery is in pg_proc
--   (not readable from the publishable REST key).
--
-- Verified on live public.sessions (anon-visible rows, 358 total):
--   is_checkin=true  AND is_baseline=true  : 13
--   is_checkin=true  AND is_baseline=false : 131
--   is_checkin=false AND is_baseline=true  : 19  (all user_id IS NULL)
--   is_checkin=false AND is_baseline=false : 195
--   is_checkin=false AND deleted_at IS NULL: 213
-- Baseline ∩ ¬checkin exists, but every visible one has user_id IS NULL, so
-- it cannot affect a per-auth-user session_count. Do NOT add is_baseline=false
-- — match the app's real-logged-climb filter:
--
--   CORRECTED clause:
--     COUNT(*) FROM public.sessions s
--     WHERE s.user_id = <row user_id>
--       AND s.is_checkin = false
--       AND s.deleted_at IS NULL

DO $$
DECLARE
  src text;
BEGIN
  SELECT p.prosrc INTO src
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'foundash_list_all_users'
    AND pg_get_function_identity_arguments(p.oid) = '';

  IF src IS NULL THEN
    RAISE EXCEPTION 'public.foundash_list_all_users() not found — apply the live list RPC before this patch';
  END IF;

  IF src LIKE '%foundash_list_all_users_raw%' THEN
    RAISE NOTICE 'foundash_list_all_users() already wraps _raw — skip rename';
    RETURN;
  END IF;

  RAISE NOTICE 'foundash_list_all_users current prosrc (session_count lives in here): %', src;

  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'foundash_list_all_users_raw'
      AND pg_get_function_identity_arguments(p.oid) = ''
  ) THEN
    RAISE EXCEPTION 'foundash_list_all_users_raw() already exists but the current list RPC is not the wrapper — resolve by hand';
  END IF;

  ALTER FUNCTION public.foundash_list_all_users() RENAME TO foundash_list_all_users_raw;
END
$$;

CREATE OR REPLACE FUNCTION public.foundash_list_all_users()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  raw jsonb;
  users_key text;
  patched jsonb;
BEGIN
  raw := public.foundash_list_all_users_raw()::jsonb;
  IF raw IS NULL THEN
    RETURN NULL;
  END IF;
  IF COALESCE((raw->>'ok')::boolean, false) IS NOT TRUE THEN
    RETURN raw::json;
  END IF;

  users_key := CASE
    WHEN jsonb_typeof(raw->'users') = 'array' THEN 'users'
    WHEN jsonb_typeof(raw->'rows') = 'array' THEN 'rows'
    WHEN jsonb_typeof(raw->'accounts') = 'array' THEN 'accounts'
    ELSE NULL
  END;

  IF users_key IS NULL THEN
    RETURN raw::json;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      elem || jsonb_build_object(
        'session_count', (
          SELECT COUNT(*)::int
          FROM public.sessions s
          WHERE s.user_id = CASE
            WHEN (elem->>'user_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              THEN (elem->>'user_id')::uuid
            WHEN (elem->>'id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              THEN (elem->>'id')::uuid
            ELSE NULL
          END
            AND s.is_checkin = false
            AND s.deleted_at IS NULL
        )
      )
      ORDER BY ord
    ),
    '[]'::jsonb
  )
  INTO patched
  FROM jsonb_array_elements(raw->users_key) WITH ORDINALITY AS t(elem, ord);

  RETURN (raw || jsonb_build_object(users_key, patched))::json;
END;
$$;

REVOKE ALL ON FUNCTION public.foundash_list_all_users_raw() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.foundash_list_all_users() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.foundash_list_all_users() TO authenticated;
