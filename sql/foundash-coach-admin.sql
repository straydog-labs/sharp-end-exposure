-- Foundash back-office: coach list / grant / revoke + roster + athlete training
-- Apply in Supabase SQL editor (same delivery pattern as coach-layer-additions.sql).
--
-- Confirmed live schema (probed 2026-08-10):
--   public.coach_flags(user_id, is_coach, created_at, …)
--   public.coach_athlete_links(id, coach_id, athlete_id, status, created_at, …)
--
-- Auth model matches founder-dashboard.html: password gate in the browser, plus
-- these SECURITY DEFINER RPCs which re-check the same founder key server-side
-- before touching auth.users or writing coach_flags. Anon REST alone cannot
-- grant/revoke (RLS blocks INSERT on coach_flags).

CREATE OR REPLACE FUNCTION public._foundash_key_ok(p_founder_key text)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT p_founder_key IS NOT NULL AND p_founder_key = 'straydog2026';
$$;

-- ---------------------------------------------------------------------------
-- List every coach (is_coach = true) with email, granted date, athlete count
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.foundash_list_coaches(p_founder_key text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  IF NOT public._foundash_key_ok(p_founder_key) THEN
    RETURN json_build_object('ok', false, 'error', 'unauthorized');
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
CREATE OR REPLACE FUNCTION public.foundash_grant_coach(p_founder_key text, p_email text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target auth.users%ROWTYPE;
BEGIN
  IF NOT public._foundash_key_ok(p_founder_key) THEN
    RETURN json_build_object('ok', false, 'error', 'unauthorized');
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
-- p_force = true — founders should unlink / accept orphaned links first.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.foundash_revoke_coach(
  p_founder_key text,
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
  IF NOT public._foundash_key_ok(p_founder_key) THEN
    RETURN json_build_object('ok', false, 'error', 'unauthorized');
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
CREATE OR REPLACE FUNCTION public.foundash_list_roster(p_founder_key text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result json;
BEGIN
  IF NOT public._foundash_key_ok(p_founder_key) THEN
    RETURN json_build_object('ok', false, 'error', 'unauthorized');
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
-- (uses columns already on those tables — no new schema)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.foundash_athlete_training(
  p_founder_key text,
  p_athlete_id uuid
)
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
  IF NOT public._foundash_key_ok(p_founder_key) THEN
    RETURN json_build_object('ok', false, 'error', 'unauthorized');
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

GRANT EXECUTE ON FUNCTION public._foundash_key_ok(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.foundash_list_coaches(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.foundash_grant_coach(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.foundash_revoke_coach(text, text, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.foundash_list_roster(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.foundash_athlete_training(text, uuid) TO anon, authenticated;
