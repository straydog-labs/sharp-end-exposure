-- Foundash back-office: coach list / grant / revoke + roster + athlete training
-- Apply in Supabase SQL editor AFTER reading the auth model below.
--
-- ⚠️  DO NOT use any earlier revision of this file that accepted p_founder_key /
--     a shared password and GRANTed EXECUTE to anon. That pattern is unsafe:
--     the password lived in page source and anyone could hit the public REST
--     RPC endpoint directly. This file replaces that model.
--
-- Auth model (secure):
--   1. RPCs are SECURITY DEFINER but ONLY executable by the `authenticated` role
--      (anon has no EXECUTE — revoke explicitly below).
--   2. Authorization is auth.uid() ∈ public.foundash_admins — a server-side
--      allowlist table. No password parameter. No client-held secret.
--   3. founder-dashboard.html must sign in with a real Supabase user that has
--      been inserted into foundash_admins; it passes that user's JWT, not the
--      publishable/anon key, when calling these RPCs.
--
-- Bootstrap (one-time, in SQL editor as postgres/service role):
--   INSERT INTO public.foundash_admins (user_id)
--   SELECT id FROM auth.users WHERE lower(email) = lower('YOUR_FOUNDER_EMAIL');
--
-- Confirmed live schema (probed 2026-08-10):
--   public.coach_flags(user_id, is_coach, created_at, …)
--   public.coach_athlete_links(id, coach_id, athlete_id, status, created_at, …)

-- ---------------------------------------------------------------------------
-- Tear down any insecure prior revision (password-param + anon grants).
-- DROP IF EXISTS is enough — do not REVOKE first (REVOKE errors if missing).
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public._foundash_key_ok(text);
DROP FUNCTION IF EXISTS public.foundash_list_coaches(text);
DROP FUNCTION IF EXISTS public.foundash_grant_coach(text, text);
DROP FUNCTION IF EXISTS public.foundash_revoke_coach(text, text, boolean);
DROP FUNCTION IF EXISTS public.foundash_list_roster(text);
DROP FUNCTION IF EXISTS public.foundash_athlete_training(text, uuid);

-- Also drop secure signatures if re-running this migration
DROP FUNCTION IF EXISTS public._foundash_is_admin();
DROP FUNCTION IF EXISTS public.foundash_list_coaches();
DROP FUNCTION IF EXISTS public.foundash_grant_coach(text);
DROP FUNCTION IF EXISTS public.foundash_revoke_coach(text, boolean);
DROP FUNCTION IF EXISTS public.foundash_list_roster();
DROP FUNCTION IF EXISTS public.foundash_athlete_training(uuid);
DROP FUNCTION IF EXISTS public.foundash_whoami();

-- ---------------------------------------------------------------------------
-- Admin allowlist (server-side only — no client writes)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.foundash_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  note text
);

ALTER TABLE public.foundash_admins ENABLE ROW LEVEL SECURITY;

-- No policies for anon/authenticated: direct table access denied.
-- Only SECURITY DEFINER functions below read this table.
REVOKE ALL ON TABLE public.foundash_admins FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.foundash_admins TO postgres;

CREATE OR REPLACE FUNCTION public._foundash_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.foundash_admins a
    WHERE a.user_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- whoami — lets the UI confirm the signed-in user is a Foundash admin
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.foundash_whoami()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  em text;
BEGIN
  IF uid IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT email INTO em FROM auth.users WHERE id = uid;

  IF NOT public._foundash_is_admin() THEN
    RETURN json_build_object(
      'ok', false,
      'error', 'not_admin',
      'user_id', uid,
      'email', em
    );
  END IF;

  RETURN json_build_object(
    'ok', true,
    'user_id', uid,
    'email', em,
    'is_admin', true
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- List every coach (is_coach = true) with email, granted date, athlete count
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.foundash_list_coaches()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  IF NOT public._foundash_is_admin() THEN
    RETURN json_build_object('ok', false, 'error', 'not_admin');
  END IF;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.granted_at ASC NULLS LAST), '[]'::json)
  INTO result
  FROM (
    SELECT
      cf.user_id,
      u.email,
      cf.is_coach,
      cf.created_at AS granted_at,
      (
        SELECT count(*)::int
        FROM public.coach_athlete_links cal
        WHERE cal.coach_id = cf.user_id
          AND cal.status = 'active'
      ) AS athlete_count
    FROM public.coach_flags cf
    JOIN auth.users u ON u.id = cf.user_id
    WHERE cf.is_coach = true
  ) t;

  RETURN json_build_object('ok', true, 'coaches', result);
END;
$$;

-- ---------------------------------------------------------------------------
-- Grant coach by email (upsert coach_flags.is_coach = true)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.foundash_grant_coach(p_email text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target auth.users%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  IF NOT public._foundash_is_admin() THEN
    RETURN json_build_object('ok', false, 'error', 'not_admin');
  END IF;

  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN
    RETURN json_build_object('ok', false, 'error', 'email_required');
  END IF;

  SELECT * INTO target
  FROM auth.users
  WHERE lower(email) = lower(trim(p_email))
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'no_account');
  END IF;

  UPDATE public.coach_flags
  SET is_coach = true
  WHERE user_id = target.id;

  IF NOT FOUND THEN
    INSERT INTO public.coach_flags (user_id, is_coach)
    VALUES (target.id, true);
  END IF;

  RETURN json_build_object(
    'ok', true,
    'user_id', target.id,
    'email', target.email,
    'is_coach', true
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Revoke coach by email (sets is_coach = false).
-- Blocks by default when the coach still has active athlete links unless
-- p_force = true.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.foundash_revoke_coach(
  p_email text,
  p_force boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target auth.users%ROWTYPE;
  link_count int;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  IF NOT public._foundash_is_admin() THEN
    RETURN json_build_object('ok', false, 'error', 'not_admin');
  END IF;

  IF p_email IS NULL OR length(trim(p_email)) = 0 THEN
    RETURN json_build_object('ok', false, 'error', 'email_required');
  END IF;

  SELECT * INTO target
  FROM auth.users
  WHERE lower(email) = lower(trim(p_email))
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'no_account');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.coach_flags cf
    WHERE cf.user_id = target.id AND cf.is_coach = true
  ) THEN
    RETURN json_build_object('ok', false, 'error', 'not_a_coach');
  END IF;

  SELECT count(*)::int INTO link_count
  FROM public.coach_athlete_links cal
  WHERE cal.coach_id = target.id AND cal.status = 'active';

  IF link_count > 0 AND NOT COALESCE(p_force, false) THEN
    RETURN json_build_object(
      'ok', false,
      'error', 'has_linked_athletes',
      'athlete_count', link_count,
      'message', 'Coach still has active athlete links. Pass force=true to revoke anyway (links remain; athlete linking UI will reject new links).'
    );
  END IF;

  UPDATE public.coach_flags
  SET is_coach = false
  WHERE user_id = target.id;

  RETURN json_build_object(
    'ok', true,
    'user_id', target.id,
    'email', target.email,
    'is_coach', false,
    'athlete_count', link_count,
    'forced', COALESCE(p_force, false) AND link_count > 0
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Cross-coach roster for Foundash (all active coach_athlete_links)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.foundash_list_roster()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  IF NOT public._foundash_is_admin() THEN
    RETURN json_build_object('ok', false, 'error', 'not_admin');
  END IF;

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.linked_at ASC), '[]'::json)
  INTO result
  FROM (
    SELECT
      cal.id AS link_id,
      cal.coach_id,
      coach.email AS coach_email,
      cal.athlete_id,
      athlete.email AS athlete_email,
      cal.status,
      cal.created_at AS linked_at
    FROM public.coach_athlete_links cal
    LEFT JOIN auth.users coach ON coach.id = cal.coach_id
    LEFT JOIN auth.users athlete ON athlete.id = cal.athlete_id
    WHERE cal.status = 'active'
  ) t;

  RETURN json_build_object('ok', true, 'links', result);
END;
$$;

-- ---------------------------------------------------------------------------
-- Per-athlete training bundle: sessions / falls / assignments
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.foundash_athlete_training(p_athlete_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  athlete_email text;
  sessions_json json;
  falls_json json;
  assignments_json json;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  IF NOT public._foundash_is_admin() THEN
    RETURN json_build_object('ok', false, 'error', 'not_admin');
  END IF;

  IF p_athlete_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'athlete_required');
  END IF;

  SELECT email INTO athlete_email FROM auth.users WHERE id = p_athlete_id;

  SELECT COALESCE(json_agg(row_to_json(s) ORDER BY s.created_at DESC), '[]'::json)
  INTO sessions_json
  FROM (
    SELECT
      id, created_at, route_name, grade_value, climbing_type, setting,
      zone, baseline_zone, zone_confidence,
      breathing_post, gut_post, crux_response, body_state
    FROM public.sessions
    WHERE user_id = p_athlete_id
      AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 40
  ) s;

  SELECT COALESCE(json_agg(row_to_json(f) ORDER BY f.created_at DESC), '[]'::json)
  INTO falls_json
  FROM (
    SELECT id, session_id, created_at
    FROM public.falls
    WHERE session_id IN (
      SELECT id FROM public.sessions
      WHERE user_id = p_athlete_id AND deleted_at IS NULL
    )
       OR user_id = p_athlete_id
    ORDER BY created_at DESC
    LIMIT 40
  ) f;

  SELECT COALESCE(json_agg(row_to_json(a) ORDER BY a.due_date ASC NULLS LAST), '[]'::json)
  INTO assignments_json
  FROM (
    SELECT
      id, coach_id, athlete_id, title, description, due_date,
      completed_at, deleted_at
    FROM public.assignments
    WHERE athlete_id = p_athlete_id
      AND deleted_at IS NULL
    ORDER BY due_date ASC NULLS LAST
    LIMIT 40
  ) a;

  RETURN json_build_object(
    'ok', true,
    'athlete_id', p_athlete_id,
    'athlete_email', athlete_email,
    'sessions', sessions_json,
    'falls', falls_json,
    'assignments', assignments_json
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Privileges: authenticated only. Never anon. Never PUBLIC default grants.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public._foundash_is_admin() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.foundash_whoami() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.foundash_list_coaches() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.foundash_grant_coach(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.foundash_revoke_coach(text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.foundash_list_roster() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.foundash_athlete_training(uuid) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public._foundash_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.foundash_whoami() TO authenticated;
GRANT EXECUTE ON FUNCTION public.foundash_list_coaches() TO authenticated;
GRANT EXECUTE ON FUNCTION public.foundash_grant_coach(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.foundash_revoke_coach(text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.foundash_list_roster() TO authenticated;
GRANT EXECUTE ON FUNCTION public.foundash_athlete_training(uuid) TO authenticated;
