-- Foundash: full user profile (read-only) plus the access log.
-- Apply in the Supabase SQL editor as postgres / service role AFTER
-- sql/foundash-users-summary.sql (needs public._foundash_is_admin()).
--
-- Does not replace foundash_overview_counts(), foundash_user_detail(),
-- or foundash_users_summary(). Does not redefine public._foundash_is_test_email.
--
-- foundash_user_full(p_user_id) is the profile source, including users with
-- no coach link. Opening it inserts foundash_access_log.kind = 'profile'.
-- foundash_user_messages(p_user_id) is the read-only thread source and
-- inserts kind = 'messages'. Neither function writes sessions, messages,
-- or payments.
--
-- Payments: no per-user payments table is committed in sql/. This file
-- does not invent one. The payload says so in payments_note.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS, DROP + CREATE of these two
-- signatures, then revoke/grant.

CREATE TABLE IF NOT EXISTS public.foundash_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id uuid NOT NULL,
  user_id uuid NOT NULL,
  kind text NOT NULL,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT foundash_access_log_kind_check CHECK (kind IN ('profile', 'messages'))
);

CREATE INDEX IF NOT EXISTS foundash_access_log_user_viewed_idx
  ON public.foundash_access_log (user_id, viewed_at DESC);

ALTER TABLE public.foundash_access_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.foundash_access_log FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.foundash_user_full(uuid);
DROP FUNCTION IF EXISTS public.foundash_user_messages(uuid);

CREATE FUNCTION public.foundash_user_full(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_email text;
  v_profile json;
  v_account json;
  v_climb_sessions json;
  v_climbs json;
  v_training json;
  v_assignments json;
  v_journal json;
  v_psyche json;
  v_baseline json;
  v_access json;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  IF NOT public._foundash_is_admin() THEN
    RETURN json_build_object('ok', false, 'error', 'not_admin');
  END IF;
  IF p_user_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'user_required');
  END IF;

  SELECT u.email INTO v_email FROM auth.users u WHERE u.id = p_user_id;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  INSERT INTO public.foundash_access_log (admin_id, user_id, kind)
  VALUES (auth.uid(), p_user_id, 'profile');

  SELECT json_build_object(
    'id', u.id,
    'email', u.email,
    'created_at', u.created_at,
    'last_sign_in_at', u.last_sign_in_at,
    'raw_user_meta_data', u.raw_user_meta_data,
    'raw_app_meta_data', u.raw_app_meta_data
  )
  INTO v_account
  FROM auth.users u
  WHERE u.id = p_user_id;

  WITH last_ev AS (
    SELECT ts, kind
    FROM (
      SELECT
        s.created_at AS ts,
        CASE
          WHEN s.is_baseline IS TRUE THEN 'baseline'
          WHEN s.is_checkin IS TRUE THEN 'checkin'
          ELSE 'climb'
        END AS kind,
        1 AS pri
      FROM public.sessions s
      WHERE s.user_id = p_user_id
        AND s.deleted_at IS NULL
        AND s.created_at IS NOT NULL
      UNION ALL
      SELECT
        GREATEST(t.created_at, t.started_at, t.ended_at),
        'training',
        2
      FROM public.training_sessions t
      WHERE t.user_id = p_user_id
        AND t.deleted_at IS NULL
        AND GREATEST(t.created_at, t.started_at, t.ended_at) IS NOT NULL
      UNION ALL
      SELECT j.created_at, 'journal', 3
      FROM public.journal_entries j
      WHERE j.user_id = p_user_id
        AND j.deleted_at IS NULL
        AND j.created_at IS NOT NULL
      UNION ALL
      SELECT d.created_at, 'psyche', 4
      FROM public.psyche_drills d
      WHERE d.user_id = p_user_id
        AND d.deleted_at IS NULL
        AND d.created_at IS NOT NULL
    ) ev
    ORDER BY ts DESC, pri ASC
    LIMIT 1
  ),
  coaches AS (
    SELECT COALESCE(json_agg(
      json_build_object(
        'user_id', cal.coach_id,
        'email', coach.email,
        'first_name', cp.first_name,
        'last_name', cp.last_name,
        'name', NULLIF(btrim(concat_ws(' ', cp.first_name, cp.last_name)), '')
      )
      ORDER BY cal.created_at
    ), '[]'::json) AS links
    FROM public.coach_athlete_links cal
    LEFT JOIN auth.users coach ON coach.id = cal.coach_id
    LEFT JOIN LATERAL (
      SELECT p.first_name, p.last_name
      FROM public.profiles p
      WHERE p.user_id = cal.coach_id
      LIMIT 1
    ) cp ON true
    WHERE cal.athlete_id = p_user_id
      AND cal.status = 'active'
  ),
  athletes AS (
    SELECT COALESCE(json_agg(
      json_build_object(
        'user_id', cal.athlete_id,
        'email', au.email,
        'first_name', ap.first_name,
        'last_name', ap.last_name,
        'name', NULLIF(btrim(concat_ws(' ', ap.first_name, ap.last_name)), '')
      )
      ORDER BY cal.created_at
    ), '[]'::json) AS links
    FROM public.coach_athlete_links cal
    LEFT JOIN auth.users au ON au.id = cal.athlete_id
    LEFT JOIN LATERAL (
      SELECT p.first_name, p.last_name
      FROM public.profiles p
      WHERE p.user_id = cal.athlete_id
      LIMIT 1
    ) ap ON true
    WHERE cal.coach_id = p_user_id
      AND cal.status = 'active'
  )
  SELECT json_build_object(
    'user_id', u.id,
    'first_name', pr.first_name,
    'last_name', pr.last_name,
    'email', u.email,
    'signed_up', u.created_at,
    'is_coach', COALESCE(cf.is_coach, false),
    'is_athlete', EXISTS (
      SELECT 1 FROM public.coach_athlete_links cal
      WHERE cal.athlete_id = u.id AND cal.status = 'active'
    ),
    'is_test', public._foundash_is_test_email(u.email),
    'last_activity', le.ts,
    'last_activity_kind', le.kind,
    'baseline_set', EXISTS (
      SELECT 1 FROM public.sessions s
      WHERE s.user_id = u.id AND s.deleted_at IS NULL AND s.is_baseline IS TRUE
    ),
    'baseline_at', (
      SELECT MAX(s.created_at) FROM public.sessions s
      WHERE s.user_id = u.id AND s.deleted_at IS NULL AND s.is_baseline IS TRUE
    ),
    'coach_links', coaches.links,
    'athletes', athletes.links,
    'climb_sessions', (
      SELECT COUNT(*)::int FROM public.sessions s
      WHERE s.user_id = u.id AND s.deleted_at IS NULL AND s.is_checkin IS NOT TRUE
    ),
    'climbs', (
      SELECT COUNT(*)::int FROM public.climbs c
      WHERE c.user_id = u.id AND c.deleted_at IS NULL
    ),
    'training_sessions', (
      SELECT COUNT(*)::int FROM public.training_sessions t
      WHERE t.user_id = u.id AND t.deleted_at IS NULL
    ),
    'sessions_30d', (
      SELECT COUNT(*)::int FROM public.sessions s
      WHERE s.user_id = u.id AND s.deleted_at IS NULL
        AND s.is_checkin IS NOT TRUE
        AND s.created_at >= now() - interval '30 days'
    ),
    'training_30d', (
      SELECT COUNT(*)::int FROM public.training_sessions t
      WHERE t.user_id = u.id AND t.deleted_at IS NULL
        AND GREATEST(t.created_at, t.started_at, t.ended_at) >= now() - interval '30 days'
    ),
    'falls_count', (
      SELECT COUNT(*)::int FROM public.falls f
      WHERE f.user_id = u.id
         OR f.session_id IN (
           SELECT s.id FROM public.sessions s
           WHERE s.user_id = u.id AND s.deleted_at IS NULL
         )
    ),
    'journal_count', (
      SELECT COUNT(*)::int FROM public.journal_entries j
      WHERE j.user_id = u.id AND j.deleted_at IS NULL
    ),
    'psyche_count', (
      SELECT COUNT(*)::int FROM public.psyche_drills d
      WHERE d.user_id = u.id AND d.deleted_at IS NULL
    ),
    'assignments_open', (
      SELECT COUNT(*)::int FROM public.assignments a
      WHERE a.athlete_id = u.id AND a.deleted_at IS NULL AND a.completed_at IS NULL
    ),
    'assignments_overdue', (
      SELECT COUNT(*)::int FROM public.assignments a
      WHERE a.athlete_id = u.id AND a.deleted_at IS NULL AND a.completed_at IS NULL
        AND a.due_date IS NOT NULL
        AND left(a.due_date::text, 10) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
        AND left(a.due_date::text, 10)::date < (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date
    ),
    'assignments_completed', (
      SELECT COUNT(*)::int FROM public.assignments a
      WHERE a.athlete_id = u.id AND a.deleted_at IS NULL AND a.completed_at IS NOT NULL
    )
  )
  INTO v_profile
  FROM auth.users u
  LEFT JOIN LATERAL (
    SELECT p.first_name, p.last_name
    FROM public.profiles p
    WHERE p.user_id = u.id
    LIMIT 1
  ) pr ON true
  LEFT JOIN LATERAL (
    SELECT cf.is_coach
    FROM public.coach_flags cf
    WHERE cf.user_id = u.id
    ORDER BY cf.created_at DESC NULLS LAST
    LIMIT 1
  ) cf ON true
  LEFT JOIN last_ev le ON true
  LEFT JOIN coaches ON true
  LEFT JOIN athletes ON true
  WHERE u.id = p_user_id;

  SELECT COALESCE(json_agg(x.j ORDER BY x.created_at DESC), '[]'::json)
  INTO v_climb_sessions
  FROM (
    SELECT
      s.created_at,
      json_build_object(
        'id', s.id,
        'created_at', s.created_at,
        'route_name', s.route_name,
        'grade_value', s.grade_value,
        'climbing_type', s.climbing_type,
        'setting', s.setting,
        'zone', s.zone,
        'baseline_zone', s.baseline_zone,
        'zone_confidence', s.zone_confidence,
        'breathing_post', s.breathing_post,
        'gut_post', s.gut_post,
        'crux_response', s.crux_response,
        'body_state', s.body_state,
        'session_notes', s.session_notes,
        'climb_id', s.climb_id,
        'is_checkin', s.is_checkin,
        'is_baseline', s.is_baseline,
        'falls', COALESCE((
          SELECT json_agg(json_build_object(
            'id', f.id,
            'created_at', f.created_at,
            'catch_quality', f.catch_quality,
            'fall_consequence', f.fall_consequence,
            'fall_description', f.fall_description,
            'got_back_on', f.got_back_on,
            'learning_reflection', f.learning_reflection,
            'vs_expect', f.vs_expect
          ) ORDER BY f.created_at)
          FROM public.falls f
          WHERE f.session_id = s.id
        ), '[]'::json)
      ) AS j
    FROM public.sessions s
    WHERE s.user_id = p_user_id
      AND s.deleted_at IS NULL
      AND s.is_checkin IS NOT TRUE
  ) x;

  SELECT COALESCE(json_agg(x.j ORDER BY x.created_at DESC), '[]'::json)
  INTO v_climbs
  FROM (
    SELECT
      c.created_at,
      json_build_object(
        'id', c.id,
        'created_at', c.created_at,
        'name', c.name,
        'grade_value', c.grade_value,
        'climbing_type', c.climbing_type,
        'is_project', c.is_project
      ) AS j
    FROM public.climbs c
    WHERE c.user_id = p_user_id
      AND c.deleted_at IS NULL
  ) x;

  SELECT COALESCE(json_agg(x.j ORDER BY x.sort_at DESC NULLS LAST), '[]'::json)
  INTO v_training
  FROM (
    SELECT
      GREATEST(t.created_at, t.started_at, t.ended_at) AS sort_at,
      json_build_object(
        'id', t.id,
        'created_at', t.created_at,
        'started_at', t.started_at,
        'ended_at', t.ended_at,
        'energy_type', t.energy_type,
        'notes', t.notes,
        'warm_up', t.warm_up,
        'cool_down', t.cool_down,
        'blocks', t.blocks,
        'assignment_id', t.assignment_id,
        'assignment_title', a.title
      ) AS j
    FROM public.training_sessions t
    LEFT JOIN public.assignments a ON a.id = t.assignment_id
    WHERE t.user_id = p_user_id
      AND t.deleted_at IS NULL
  ) x;

  SELECT COALESCE(json_agg(x.j ORDER BY x.due_date ASC NULLS LAST), '[]'::json)
  INTO v_assignments
  FROM (
    SELECT
      a.due_date,
      json_build_object(
        'id', a.id,
        'coach_id', a.coach_id,
        'athlete_id', a.athlete_id,
        'title', a.title,
        'description', a.description,
        'due_date', a.due_date,
        'completed_at', a.completed_at,
        'status', CASE
          WHEN a.completed_at IS NOT NULL THEN 'completed'
          WHEN a.due_date IS NOT NULL
            AND left(a.due_date::text, 10) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
            AND left(a.due_date::text, 10)::date < (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date
            THEN 'overdue'
          ELSE 'open'
        END,
        'linked_session', (
          SELECT json_build_object(
            'id', t.id,
            'started_at', t.started_at,
            'ended_at', t.ended_at,
            'energy_type', t.energy_type
          )
          FROM public.training_sessions t
          WHERE t.assignment_id = a.id
            AND t.deleted_at IS NULL
          ORDER BY t.created_at DESC
          LIMIT 1
        )
      ) AS j
    FROM public.assignments a
    WHERE a.athlete_id = p_user_id
      AND a.deleted_at IS NULL
  ) x;

  SELECT COALESCE(json_agg(x.j ORDER BY x.created_at DESC), '[]'::json)
  INTO v_journal
  FROM (
    SELECT
      j.created_at,
      json_build_object(
        'id', j.id,
        'created_at', j.created_at,
        'entry_text', j.entry_text
      ) AS j
    FROM public.journal_entries j
    WHERE j.user_id = p_user_id
      AND j.deleted_at IS NULL
  ) x;

  SELECT COALESCE(json_agg(x.j ORDER BY x.created_at DESC), '[]'::json)
  INTO v_psyche
  FROM (
    SELECT d.created_at,
      json_build_object(
        'id', d.id,
        'created_at', d.created_at,
        'kind', 'drill',
        'drill_key', d.drill_key,
        'duration_seconds', d.duration_seconds
      ) AS j
    FROM public.psyche_drills d
    WHERE d.user_id = p_user_id
      AND d.deleted_at IS NULL
    UNION ALL
    SELECT s.created_at,
      json_build_object(
        'id', s.id,
        'created_at', s.created_at,
        'kind', 'checkin',
        'drill_key', NULL,
        'duration_seconds', NULL
      ) AS j
    FROM public.sessions s
    WHERE s.user_id = p_user_id
      AND s.deleted_at IS NULL
      AND s.is_checkin IS TRUE
      AND s.is_baseline IS NOT TRUE
  ) x;

  SELECT json_build_object(
    'id', s.id,
    'created_at', s.created_at,
    'baseline_grade_range', s.baseline_grade_range,
    'baseline_zone', s.baseline_zone,
    'baseline_terrain_state', s.baseline_terrain_state,
    'baseline_terrain_calibrated', s.baseline_terrain_calibrated
  )
  INTO v_baseline
  FROM public.sessions s
  WHERE s.user_id = p_user_id
    AND s.deleted_at IS NULL
    AND s.is_baseline IS TRUE
  ORDER BY s.created_at DESC
  LIMIT 1;

  SELECT COALESCE(json_agg(x.j ORDER BY x.viewed_at DESC), '[]'::json)
  INTO v_access
  FROM (
    SELECT
      l.viewed_at,
      json_build_object(
        'id', l.id,
        'admin_id', l.admin_id,
        'user_id', l.user_id,
        'kind', l.kind,
        'viewed_at', l.viewed_at
      ) AS j
    FROM public.foundash_access_log l
    WHERE l.user_id = p_user_id
    ORDER BY l.viewed_at DESC
    LIMIT 100
  ) x;

  RETURN json_build_object(
    'ok', true,
    'profile', v_profile,
    'account', v_account,
    'climb_sessions', v_climb_sessions,
    'climbs', v_climbs,
    'training_sessions', v_training,
    'assignments', v_assignments,
    'journal', v_journal,
    'psyche', v_psyche,
    'baseline', v_baseline,
    'payments', '[]'::json,
    'payments_note', 'No per-user payments table is committed in sql/. This section does not query one.',
    'access_log', v_access
  );
END;
$$;

CREATE FUNCTION public.foundash_user_messages(p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_messages json;
  v_access json;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  IF NOT public._foundash_is_admin() THEN
    RETURN json_build_object('ok', false, 'error', 'not_admin');
  END IF;
  IF p_user_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'user_required');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_user_id) THEN
    RETURN json_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  INSERT INTO public.foundash_access_log (admin_id, user_id, kind)
  VALUES (auth.uid(), p_user_id, 'messages');

  SELECT COALESCE(json_agg(x.j ORDER BY x.created_at ASC), '[]'::json)
  INTO v_messages
  FROM (
    SELECT
      m.created_at,
      json_build_object(
        'id', m.id,
        'coach_id', m.coach_id,
        'athlete_id', m.athlete_id,
        'sender_id', m.sender_id,
        'body', m.body,
        'link', m.link,
        'created_at', m.created_at,
        'read_at', m.read_at,
        'edited_at', m.edited_at,
        'sender_name', NULLIF(btrim(concat_ws(' ', sp.first_name, sp.last_name)), ''),
        'coach_name', NULLIF(btrim(concat_ws(' ', cp.first_name, cp.last_name)), ''),
        'athlete_name', NULLIF(btrim(concat_ws(' ', ap.first_name, ap.last_name)), '')
      ) AS j
    FROM public.coach_messages m
    LEFT JOIN LATERAL (
      SELECT p.first_name, p.last_name FROM public.profiles p WHERE p.user_id = m.sender_id LIMIT 1
    ) sp ON true
    LEFT JOIN LATERAL (
      SELECT p.first_name, p.last_name FROM public.profiles p WHERE p.user_id = m.coach_id LIMIT 1
    ) cp ON true
    LEFT JOIN LATERAL (
      SELECT p.first_name, p.last_name FROM public.profiles p WHERE p.user_id = m.athlete_id LIMIT 1
    ) ap ON true
    WHERE m.coach_id = p_user_id OR m.athlete_id = p_user_id
  ) x;

  SELECT COALESCE(json_agg(x.j ORDER BY x.viewed_at DESC), '[]'::json)
  INTO v_access
  FROM (
    SELECT
      l.viewed_at,
      json_build_object(
        'id', l.id,
        'admin_id', l.admin_id,
        'user_id', l.user_id,
        'kind', l.kind,
        'viewed_at', l.viewed_at
      ) AS j
    FROM public.foundash_access_log l
    WHERE l.user_id = p_user_id
    ORDER BY l.viewed_at DESC
    LIMIT 100
  ) x;

  RETURN json_build_object(
    'ok', true,
    'messages', v_messages,
    'access_log', v_access
  );
END;
$$;

REVOKE ALL ON FUNCTION public.foundash_user_full(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.foundash_user_messages(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.foundash_user_full(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.foundash_user_messages(uuid) TO authenticated;
