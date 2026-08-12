-- Foundash: custom_workouts analytics (oversight only)
-- Apply in Supabase SQL editor AFTER sql/foundash-coach-admin.sql
-- (needs public._foundash_is_admin()) and after custom_workouts exists
-- (sql/training-sessions-custom-workouts.sql).
--
-- Auth model (same as other Foundash RPCs):
--   SECURITY DEFINER · EXECUTE granted to authenticated only · never anon
--   Caller must be auth.uid() ∈ public.foundash_admins
--
-- Returns aggregate counts (total / coach-created / athlete-created via
-- coach_flags.is_coach), weekly series (last 12 weeks), and a browsable list.

DROP FUNCTION IF EXISTS public.foundash_custom_workout_analytics();

CREATE OR REPLACE FUNCTION public.foundash_custom_workout_analytics()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  totals_json json;
  by_week_json json;
  workouts_json json;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  IF NOT public._foundash_is_admin() THEN
    RETURN json_build_object('ok', false, 'error', 'not_admin');
  END IF;

  WITH flagged AS (
    SELECT
      cw.id,
      cw.category,
      cw.name,
      cw.description,
      cw.type,
      cw.visibility,
      cw.created_by,
      cw.created_at,
      u.email AS creator_email,
      p.first_name AS creator_first_name,
      p.last_name AS creator_last_name,
      CASE
        WHEN cw.created_by IS NULL THEN 'unknown'
        WHEN EXISTS (
          SELECT 1
          FROM public.coach_flags cf
          WHERE cf.user_id = cw.created_by
            AND cf.is_coach IS TRUE
        ) THEN 'coach'
        ELSE 'athlete'
      END AS creator_role
    FROM public.custom_workouts cw
    LEFT JOIN auth.users u ON u.id = cw.created_by
    LEFT JOIN public.profiles p ON p.user_id = cw.created_by
  )
  SELECT json_build_object(
    'total', COUNT(*)::int,
    'coach_created', COUNT(*) FILTER (WHERE creator_role = 'coach')::int,
    'athlete_created', COUNT(*) FILTER (WHERE creator_role = 'athlete')::int,
    'unknown_creator', COUNT(*) FILTER (WHERE creator_role = 'unknown')::int,
    'shared', COUNT(*) FILTER (WHERE visibility = 'shared')::int,
    'private', COUNT(*) FILTER (WHERE visibility = 'private')::int
  )
  INTO totals_json
  FROM flagged;

  WITH flagged AS (
    SELECT
      cw.created_at,
      CASE
        WHEN cw.created_by IS NULL THEN 'unknown'
        WHEN EXISTS (
          SELECT 1
          FROM public.coach_flags cf
          WHERE cf.user_id = cw.created_by
            AND cf.is_coach IS TRUE
        ) THEN 'coach'
        ELSE 'athlete'
      END AS creator_role
    FROM public.custom_workouts cw
  )
  SELECT COALESCE(json_agg(row_to_json(w) ORDER BY w.week_start ASC), '[]'::json)
  INTO by_week_json
  FROM (
    SELECT
      (date_trunc('week', f.created_at AT TIME ZONE 'UTC'))::date AS week_start,
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE f.creator_role = 'coach')::int AS coach_created,
      COUNT(*) FILTER (WHERE f.creator_role = 'athlete')::int AS athlete_created,
      COUNT(*) FILTER (WHERE f.creator_role = 'unknown')::int AS unknown_creator
    FROM flagged f
    WHERE f.created_at >= (now() - interval '12 weeks')
    GROUP BY 1
  ) w;

  SELECT COALESCE(json_agg(row_to_json(r) ORDER BY r.created_at DESC), '[]'::json)
  INTO workouts_json
  FROM (
    SELECT
      cw.id,
      cw.category,
      cw.name,
      cw.description,
      cw.type,
      cw.visibility,
      cw.created_by,
      cw.created_at,
      u.email AS creator_email,
      p.first_name AS creator_first_name,
      p.last_name AS creator_last_name,
      CASE
        WHEN cw.created_by IS NULL THEN 'unknown'
        WHEN EXISTS (
          SELECT 1
          FROM public.coach_flags cf
          WHERE cf.user_id = cw.created_by
            AND cf.is_coach IS TRUE
        ) THEN 'coach'
        ELSE 'athlete'
      END AS creator_role
    FROM public.custom_workouts cw
    LEFT JOIN auth.users u ON u.id = cw.created_by
    LEFT JOIN public.profiles p ON p.user_id = cw.created_by
    ORDER BY cw.created_at DESC
    LIMIT 200
  ) r;

  RETURN json_build_object(
    'ok', true,
    'totals', COALESCE(totals_json, json_build_object(
      'total', 0,
      'coach_created', 0,
      'athlete_created', 0,
      'unknown_creator', 0,
      'shared', 0,
      'private', 0
    )),
    'by_week', COALESCE(by_week_json, '[]'::json),
    'workouts', COALESCE(workouts_json, '[]'::json)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.foundash_custom_workout_analytics() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.foundash_custom_workout_analytics() TO authenticated;
