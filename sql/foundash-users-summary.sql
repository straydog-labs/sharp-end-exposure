-- Foundash: All Users roster from one admin RPC.
-- Apply in the Supabase SQL editor as postgres / service role AFTER
-- sql/foundash-coach-admin.sql (needs public._foundash_is_admin()).
--
-- Replaces the roster's direct REST reads of other users' sessions
-- (RLS returns nothing for the admin, and the page swallowed that error).
-- Does not replace foundash_overview_counts() or foundash_user_detail().
-- Does not redefine public._foundash_is_test_email (already live; overview
-- counts call it). is_test is that helper's result.
--
-- Idempotent: DROP + CREATE of this signature only, then revoke/grant.
--
-- Column rules (soft-deleted rows ignored everywhere: deleted_at IS NULL):
--   signed_up          auth.users.created_at
--   is_coach           coach_flags.is_coach (false when no row)
--   is_athlete         active coach_athlete_links row as athlete_id
--                      (no profiles.role column in this repo)
--   climb_sessions     sessions with is_checkin IS NOT TRUE
--                      (same rule as foundash_list_all_users session_count;
--                      a non-check-in baseline still counts)
--   sessions_30d       those climb sessions with created_at in the last 30 days
--   climbs             public.climbs rows for the user
--   training_sessions  public.training_sessions rows
--   training_30d       those whose greatest(created_at, started_at, ended_at)
--                      is in the last 30 days
--   baseline_set       any non-deleted session with is_baseline IS TRUE
--   baseline_at        max created_at of those baseline sessions
--   last_activity      max timestamp across:
--                        sessions.created_at (check-in and baseline included),
--                        greatest(training_sessions.created_at, started_at, ended_at),
--                        journal_entries.created_at,
--                        psyche_drills.created_at
--   last_activity_kind climb | checkin | baseline | training | journal | psyche
--                      (baseline wins over checkin on the winning session row;
--                      on a timestamp tie the order above wins)
--   coach_links        active coaches (user_id, email, first_name, last_name, name)
--   athlete_count      active coach_athlete_links where this user is coach_id
--   assignments_open   assignments for athlete_id, completed_at IS NULL
--   assignments_overdue  open and due_date's calendar date is before today UTC
--   assignments_completed  completed_at IS NOT NULL
--
-- session_count and climb_count mirror climb_sessions and climbs so older
-- readers of the list payload keep working.

DROP FUNCTION IF EXISTS public.foundash_users_summary();

CREATE FUNCTION public.foundash_users_summary()
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

  WITH sess AS (
    SELECT
      s.user_id,
      COUNT(*) FILTER (WHERE s.is_checkin IS NOT TRUE)::int AS climb_sessions,
      COUNT(*) FILTER (
        WHERE s.is_checkin IS NOT TRUE
          AND s.created_at >= now() - interval '30 days'
      )::int AS sessions_30d,
      COALESCE(BOOL_OR(s.is_baseline IS TRUE), false) AS baseline_set,
      MAX(s.created_at) FILTER (WHERE s.is_baseline IS TRUE) AS baseline_at
    FROM public.sessions s
    WHERE s.deleted_at IS NULL
      AND s.user_id IS NOT NULL
    GROUP BY s.user_id
  ),
  sess_last AS (
    SELECT DISTINCT ON (s.user_id)
      s.user_id,
      s.created_at AS ts,
      CASE
        WHEN s.is_baseline IS TRUE THEN 'baseline'
        WHEN s.is_checkin IS TRUE THEN 'checkin'
        ELSE 'climb'
      END AS kind
    FROM public.sessions s
    WHERE s.deleted_at IS NULL
      AND s.user_id IS NOT NULL
      AND s.created_at IS NOT NULL
    ORDER BY s.user_id, s.created_at DESC,
      CASE
        WHEN s.is_baseline IS TRUE THEN 0
        WHEN s.is_checkin IS TRUE THEN 1
        ELSE 2
      END
  ),
  trains AS (
    SELECT
      t.user_id,
      COUNT(*)::int AS training_sessions,
      COUNT(*) FILTER (
        WHERE GREATEST(t.created_at, t.started_at, t.ended_at) >= now() - interval '30 days'
      )::int AS training_30d,
      MAX(GREATEST(t.created_at, t.started_at, t.ended_at)) AS ts
    FROM public.training_sessions t
    WHERE t.deleted_at IS NULL
      AND t.user_id IS NOT NULL
    GROUP BY t.user_id
  ),
  journals AS (
    SELECT j.user_id, MAX(j.created_at) AS ts
    FROM public.journal_entries j
    WHERE j.deleted_at IS NULL
      AND j.user_id IS NOT NULL
    GROUP BY j.user_id
  ),
  psyches AS (
    SELECT d.user_id, MAX(d.created_at) AS ts
    FROM public.psyche_drills d
    WHERE d.deleted_at IS NULL
      AND d.user_id IS NOT NULL
    GROUP BY d.user_id
  ),
  climb_rows AS (
    SELECT c.user_id, COUNT(*)::int AS climbs
    FROM public.climbs c
    WHERE c.deleted_at IS NULL
      AND c.user_id IS NOT NULL
    GROUP BY c.user_id
  ),
  assigns AS (
    SELECT
      a.athlete_id AS user_id,
      COUNT(*) FILTER (WHERE a.completed_at IS NULL)::int AS assignments_open,
      COUNT(*) FILTER (
        WHERE a.completed_at IS NULL
          AND a.due_date IS NOT NULL
          AND left(a.due_date::text, 10) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
          AND left(a.due_date::text, 10)::date < (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date
      )::int AS assignments_overdue,
      COUNT(*) FILTER (WHERE a.completed_at IS NOT NULL)::int AS assignments_completed
    FROM public.assignments a
    WHERE a.deleted_at IS NULL
      AND a.athlete_id IS NOT NULL
    GROUP BY a.athlete_id
  ),
  coach_link_rows AS (
    SELECT
      cal.athlete_id AS user_id,
      COALESCE(json_agg(
        json_build_object(
          'user_id', cal.coach_id,
          'email', coach.email,
          'first_name', cp.first_name,
          'last_name', cp.last_name,
          'name', NULLIF(btrim(concat_ws(' ', cp.first_name, cp.last_name)), '')
        )
        ORDER BY cal.created_at
      ), '[]'::json) AS coach_links
    FROM public.coach_athlete_links cal
    LEFT JOIN auth.users coach ON coach.id = cal.coach_id
    LEFT JOIN LATERAL (
      SELECT p.first_name, p.last_name
      FROM public.profiles p
      WHERE p.user_id = cal.coach_id
      LIMIT 1
    ) cp ON true
    WHERE cal.status = 'active'
    GROUP BY cal.athlete_id
  ),
  athlete_counts AS (
    SELECT cal.coach_id AS user_id, COUNT(*)::int AS athlete_count
    FROM public.coach_athlete_links cal
    WHERE cal.status = 'active'
    GROUP BY cal.coach_id
  )
  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.signed_up DESC NULLS LAST), '[]'::json)
  INTO result
  FROM (
    SELECT
      u.id AS user_id,
      prof.first_name,
      prof.last_name,
      u.email,
      u.created_at AS signed_up,
      COALESCE(flag.is_coach, false) AS is_coach,
      EXISTS (
        SELECT 1
        FROM public.coach_athlete_links cal
        WHERE cal.athlete_id = u.id
          AND cal.status = 'active'
      ) AS is_athlete,
      COALESCE(public._foundash_is_test_email(u.email), false) AS is_test,
      act.ts AS last_activity,
      act.kind AS last_activity_kind,
      COALESCE(sess.climb_sessions, 0) AS climb_sessions,
      COALESCE(sess.climb_sessions, 0) AS session_count,
      COALESCE(climb_rows.climbs, 0) AS climbs,
      COALESCE(climb_rows.climbs, 0) AS climb_count,
      COALESCE(trains.training_sessions, 0) AS training_sessions,
      COALESCE(sess.sessions_30d, 0) AS sessions_30d,
      COALESCE(trains.training_30d, 0) AS training_30d,
      COALESCE(sess.baseline_set, false) AS baseline_set,
      sess.baseline_at,
      COALESCE(coach_link_rows.coach_links, '[]'::json) AS coach_links,
      COALESCE(athlete_counts.athlete_count, 0) AS athlete_count,
      COALESCE(assigns.assignments_open, 0) AS assignments_open,
      COALESCE(assigns.assignments_overdue, 0) AS assignments_overdue,
      COALESCE(assigns.assignments_completed, 0) AS assignments_completed
    FROM auth.users u
    LEFT JOIN LATERAL (
      SELECT p.first_name, p.last_name
      FROM public.profiles p
      WHERE p.user_id = u.id
      LIMIT 1
    ) prof ON true
    LEFT JOIN LATERAL (
      SELECT cf.is_coach
      FROM public.coach_flags cf
      WHERE cf.user_id = u.id
      ORDER BY cf.created_at DESC NULLS LAST
      LIMIT 1
    ) flag ON true
    LEFT JOIN sess ON sess.user_id = u.id
    LEFT JOIN sess_last ON sess_last.user_id = u.id
    LEFT JOIN trains ON trains.user_id = u.id
    LEFT JOIN journals ON journals.user_id = u.id
    LEFT JOIN psyches ON psyches.user_id = u.id
    LEFT JOIN climb_rows ON climb_rows.user_id = u.id
    LEFT JOIN assigns ON assigns.user_id = u.id
    LEFT JOIN coach_link_rows ON coach_link_rows.user_id = u.id
    LEFT JOIN athlete_counts ON athlete_counts.user_id = u.id
    LEFT JOIN LATERAL (
      SELECT c.ts, c.kind
      FROM (
        SELECT sess_last.ts, sess_last.kind, 1 AS pri
        UNION ALL
        SELECT trains.ts, 'training', 2
        UNION ALL
        SELECT journals.ts, 'journal', 3
        UNION ALL
        SELECT psyches.ts, 'psyche', 4
      ) c
      WHERE c.ts IS NOT NULL
      ORDER BY c.ts DESC, c.pri ASC
      LIMIT 1
    ) act ON true
  ) t;

  RETURN json_build_object('ok', true, 'users', result);
END;
$$;

REVOKE ALL ON FUNCTION public.foundash_users_summary() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.foundash_users_summary() TO authenticated;
