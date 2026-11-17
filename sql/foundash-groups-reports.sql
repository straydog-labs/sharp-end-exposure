-- Foundash: user groups and a fixed-parameter usage report.
-- Apply in the Supabase SQL editor as postgres / service role AFTER
-- sql/foundash-users-summary.sql (needs public._foundash_is_admin() and
-- public._foundash_is_test_email(), both already live).
--
-- Does not redefine _foundash_is_admin, _foundash_is_test_email, or any
-- existing foundash_* function. New objects only:
--   tables     foundash_groups, foundash_group_members
--   functions  foundash_group_list, foundash_group_create, foundash_group_delete,
--              foundash_group_add_members, foundash_group_remove_member,
--              foundash_group_members, foundash_report
--
-- Writes: only foundash_groups and foundash_group_members. Every other table
-- (auth.users, sessions, climbs, training_sessions, journal_entries,
-- psyche_drills, coach_athlete_links, coach_flags, profiles) is read-only here.
-- Deleting a group deletes that group row; its membership rows go with it
-- through ON DELETE CASCADE. Users and their data are never touched.
--
-- Access: RLS on both tables with no policies, and table privileges revoked,
-- so anon/authenticated cannot read or write them directly. All access goes
-- through the SECURITY DEFINER functions below, which return not_authenticated
-- / not_admin unless auth.uid() is in foundash_admins.
--
-- foundash_report: fixed typed parameters, static SQL only (no EXECUTE, no
-- string-built queries).
--   p_date_from, p_date_to  inclusive UTC calendar dates.
--                           Default: the 30 days ending today (UTC).
--   p_role                  NULL or 'all' = everyone, else one of
--                           coach | athlete | both | signed-up-only
--                           coach    = coach_flags.is_coach (latest row), no active athlete link
--                           athlete  = active coach_athlete_links row as athlete_id, not a coach
--                           both     = both of the above
--                           signed-up-only = neither
--                           (current role; there is no role history table)
--   p_group_id              NULL = everyone, else members of that group
--   p_include_test          default false: accounts where
--                           _foundash_is_test_email(email) is true are excluded
--                           (same rule as foundash_users_summary().is_test)
--   p_group_by              none | role | group | week
--                           week = ISO weeks (Monday start) clipped to the range
-- Metrics per bucket, where [bucket_start, bucket_end] is the full range, or
-- the clipped week for group_by = week:
--   users                  cohort users with auth.users.created_at on/before bucket_end
--   active_7d              of those, users with any activity in the 7 days ending bucket_end
--   active_30d             same, 30 days ending bucket_end
--                          activity = sessions.created_at (check-in and baseline included),
--                          greatest(training_sessions.created_at, started_at, ended_at),
--                          journal_entries.created_at, psyche_drills.created_at
--                          (the foundash_users_summary last_activity sources)
--   sessions               climb sessions (is_checkin IS NOT TRUE) created in the bucket
--   climbs                 public.climbs rows created in the bucket
--   coach_linked_athletes  users with an active coach_athlete_links row as athlete
--                          whose created_at is on/before bucket_end
-- Soft-deleted rows (deleted_at IS NOT NULL) are ignored everywhere.
-- group_by = group returns one row per group (a user in two groups counts in
-- both); users in no group are not listed in that view.
--
-- Idempotent: CREATE TABLE / INDEX IF NOT EXISTS, DROP + CREATE of these
-- function signatures, then revoke/grant. Re-running keeps existing groups.

CREATE TABLE IF NOT EXISTS public.foundash_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  CONSTRAINT foundash_groups_name_check CHECK (char_length(btrim(name)) BETWEEN 1 AND 120),
  CONSTRAINT foundash_groups_note_check CHECK (note IS NULL OR char_length(note) <= 2000)
);

CREATE UNIQUE INDEX IF NOT EXISTS foundash_groups_name_key
  ON public.foundash_groups (lower(btrim(name)));

CREATE TABLE IF NOT EXISTS public.foundash_group_members (
  group_id uuid NOT NULL REFERENCES public.foundash_groups (id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  added_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX IF NOT EXISTS foundash_group_members_user_idx
  ON public.foundash_group_members (user_id);

ALTER TABLE public.foundash_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.foundash_group_members ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.foundash_groups FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.foundash_group_members FROM PUBLIC, anon, authenticated;

DROP FUNCTION IF EXISTS public.foundash_group_list();
DROP FUNCTION IF EXISTS public.foundash_group_create(text, text);
DROP FUNCTION IF EXISTS public.foundash_group_delete(uuid);
DROP FUNCTION IF EXISTS public.foundash_group_add_members(uuid, uuid[]);
DROP FUNCTION IF EXISTS public.foundash_group_remove_member(uuid, uuid);
DROP FUNCTION IF EXISTS public.foundash_group_members(uuid);
DROP FUNCTION IF EXISTS public.foundash_report(date, date, text, uuid, boolean, text);

CREATE FUNCTION public.foundash_group_list()
RETURNS json
LANGUAGE plpgsql
STABLE
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

  SELECT COALESCE(json_agg(json_build_object(
    'id', g.id,
    'name', g.name,
    'note', g.note,
    'created_at', g.created_at,
    'created_by', g.created_by,
    'member_count', (
      SELECT COUNT(*)::int FROM public.foundash_group_members m WHERE m.group_id = g.id
    )
  ) ORDER BY lower(g.name), g.created_at), '[]'::json)
  INTO result
  FROM public.foundash_groups g;

  RETURN json_build_object('ok', true, 'groups', result);
END;
$$;

CREATE FUNCTION public.foundash_group_create(p_name text, p_note text DEFAULT NULL)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := btrim(COALESCE(p_name, ''));
  v_note text := NULLIF(btrim(COALESCE(p_note, '')), '');
  v_row public.foundash_groups%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  IF NOT public._foundash_is_admin() THEN
    RETURN json_build_object('ok', false, 'error', 'not_admin');
  END IF;
  IF v_name = '' THEN
    RETURN json_build_object('ok', false, 'error', 'name_required');
  END IF;
  IF char_length(v_name) > 120 THEN
    RETURN json_build_object('ok', false, 'error', 'name_too_long');
  END IF;
  IF v_note IS NOT NULL AND char_length(v_note) > 2000 THEN
    RETURN json_build_object('ok', false, 'error', 'note_too_long');
  END IF;
  IF EXISTS (SELECT 1 FROM public.foundash_groups g WHERE lower(btrim(g.name)) = lower(v_name)) THEN
    RETURN json_build_object('ok', false, 'error', 'name_taken');
  END IF;

  INSERT INTO public.foundash_groups (name, note, created_by)
  VALUES (v_name, v_note, auth.uid())
  RETURNING * INTO v_row;

  RETURN json_build_object('ok', true, 'group', json_build_object(
    'id', v_row.id,
    'name', v_row.name,
    'note', v_row.note,
    'created_at', v_row.created_at,
    'created_by', v_row.created_by,
    'member_count', 0
  ));
EXCEPTION
  WHEN unique_violation THEN
    RETURN json_build_object('ok', false, 'error', 'name_taken');
END;
$$;

CREATE FUNCTION public.foundash_group_delete(p_group_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_members int;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  IF NOT public._foundash_is_admin() THEN
    RETURN json_build_object('ok', false, 'error', 'not_admin');
  END IF;
  IF p_group_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'group_required');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.foundash_groups g WHERE g.id = p_group_id) THEN
    RETURN json_build_object('ok', false, 'error', 'group_not_found');
  END IF;

  SELECT COUNT(*)::int INTO v_members
  FROM public.foundash_group_members m
  WHERE m.group_id = p_group_id;

  -- Group row only. Membership rows cascade. No user table is referenced.
  DELETE FROM public.foundash_groups g WHERE g.id = p_group_id;

  RETURN json_build_object('ok', true, 'deleted', true, 'members_removed', v_members);
END;
$$;

CREATE FUNCTION public.foundash_group_add_members(p_group_id uuid, p_user_ids uuid[])
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requested int := COALESCE(cardinality(p_user_ids), 0);
  v_added int;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  IF NOT public._foundash_is_admin() THEN
    RETURN json_build_object('ok', false, 'error', 'not_admin');
  END IF;
  IF p_group_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'group_required');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.foundash_groups g WHERE g.id = p_group_id) THEN
    RETURN json_build_object('ok', false, 'error', 'group_not_found');
  END IF;
  IF v_requested > 1000 THEN
    RETURN json_build_object('ok', false, 'error', 'too_many_users');
  END IF;

  -- Only ids that exist in auth.users are added; duplicates are no-ops.
  WITH ins AS (
    INSERT INTO public.foundash_group_members (group_id, user_id)
    SELECT DISTINCT p_group_id, u.id
    FROM unnest(COALESCE(p_user_ids, ARRAY[]::uuid[])) AS req(user_id)
    JOIN auth.users u ON u.id = req.user_id
    ON CONFLICT (group_id, user_id) DO NOTHING
    RETURNING 1
  )
  SELECT COUNT(*)::int INTO v_added FROM ins;

  RETURN json_build_object(
    'ok', true,
    'added', v_added,
    'skipped', v_requested - v_added
  );
END;
$$;

CREATE FUNCTION public.foundash_group_remove_member(p_group_id uuid, p_user_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_removed int;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  IF NOT public._foundash_is_admin() THEN
    RETURN json_build_object('ok', false, 'error', 'not_admin');
  END IF;
  IF p_group_id IS NULL OR p_user_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'group_and_user_required');
  END IF;

  -- Membership row only.
  DELETE FROM public.foundash_group_members m
  WHERE m.group_id = p_group_id
    AND m.user_id = p_user_id;
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  RETURN json_build_object('ok', true, 'removed', v_removed > 0);
END;
$$;

CREATE FUNCTION public.foundash_group_members(p_group_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_group json;
  v_members json;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  IF NOT public._foundash_is_admin() THEN
    RETURN json_build_object('ok', false, 'error', 'not_admin');
  END IF;
  IF p_group_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'group_required');
  END IF;

  SELECT json_build_object(
    'id', g.id,
    'name', g.name,
    'note', g.note,
    'created_at', g.created_at,
    'created_by', g.created_by
  )
  INTO v_group
  FROM public.foundash_groups g
  WHERE g.id = p_group_id;

  IF v_group IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'group_not_found');
  END IF;

  SELECT COALESCE(json_agg(json_build_object(
    'user_id', m.user_id,
    'email', u.email,
    'first_name', pr.first_name,
    'last_name', pr.last_name,
    'name', NULLIF(btrim(concat_ws(' ', pr.first_name, pr.last_name)), ''),
    'is_test', COALESCE(public._foundash_is_test_email(u.email), false),
    'user_exists', u.id IS NOT NULL,
    'added_at', m.added_at
  ) ORDER BY lower(COALESCE(NULLIF(btrim(concat_ws(' ', pr.first_name, pr.last_name)), ''), u.email, '')), m.added_at), '[]'::json)
  INTO v_members
  FROM public.foundash_group_members m
  LEFT JOIN auth.users u ON u.id = m.user_id
  LEFT JOIN LATERAL (
    SELECT p.first_name, p.last_name
    FROM public.profiles p
    WHERE p.user_id = m.user_id
    LIMIT 1
  ) pr ON true
  WHERE m.group_id = p_group_id;

  RETURN json_build_object('ok', true, 'group', v_group, 'members', v_members);
END;
$$;

CREATE FUNCTION public.foundash_report(
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_role text DEFAULT NULL,
  p_group_id uuid DEFAULT NULL,
  p_include_test boolean DEFAULT false,
  p_group_by text DEFAULT 'none'
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_to date := COALESCE(p_date_to, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date);
  v_from date := COALESCE(p_date_from, COALESCE(p_date_to, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date) - 29);
  v_role text := NULLIF(lower(btrim(COALESCE(p_role, ''))), '');
  v_group_by text := COALESCE(NULLIF(lower(btrim(COALESCE(p_group_by, ''))), ''), 'none');
  v_include_test boolean := COALESCE(p_include_test, false);
  v_rows json;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  IF NOT public._foundash_is_admin() THEN
    RETURN json_build_object('ok', false, 'error', 'not_admin');
  END IF;
  IF v_role = 'all' THEN
    v_role := NULL;
  END IF;
  IF v_role IS NOT NULL AND v_role NOT IN ('coach', 'athlete', 'both', 'signed-up-only') THEN
    RETURN json_build_object('ok', false, 'error', 'bad_role');
  END IF;
  IF v_group_by NOT IN ('none', 'role', 'group', 'week') THEN
    RETURN json_build_object('ok', false, 'error', 'bad_group_by');
  END IF;
  IF v_from > v_to THEN
    RETURN json_build_object('ok', false, 'error', 'bad_date_range');
  END IF;
  IF v_to - v_from > 3660 THEN
    RETURN json_build_object('ok', false, 'error', 'range_too_long');
  END IF;
  IF p_group_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.foundash_groups g WHERE g.id = p_group_id) THEN
    RETURN json_build_object('ok', false, 'error', 'group_not_found');
  END IF;

  WITH people AS (
    SELECT
      u.id AS user_id,
      u.created_at::date AS signed_up_on,
      CASE
        WHEN COALESCE(flag.is_coach, false) AND ath.is_athlete THEN 'both'
        WHEN COALESCE(flag.is_coach, false) THEN 'coach'
        WHEN ath.is_athlete THEN 'athlete'
        ELSE 'signed-up-only'
      END AS role,
      ath.linked_at
    FROM auth.users u
    LEFT JOIN LATERAL (
      SELECT cf.is_coach
      FROM public.coach_flags cf
      WHERE cf.user_id = u.id
      ORDER BY cf.created_at DESC NULLS LAST
      LIMIT 1
    ) flag ON true
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) > 0 AS is_athlete,
        MIN(cal.created_at) AS linked_at
      FROM public.coach_athlete_links cal
      WHERE cal.athlete_id = u.id
        AND cal.status = 'active'
    ) ath ON true
    WHERE (v_include_test OR NOT COALESCE(public._foundash_is_test_email(u.email), false))
      AND (p_group_id IS NULL OR EXISTS (
        SELECT 1 FROM public.foundash_group_members gm
        WHERE gm.group_id = p_group_id AND gm.user_id = u.id
      ))
  ),
  cohort AS (
    SELECT * FROM people p
    WHERE v_role IS NULL OR p.role = v_role
  ),
  buckets AS (
    SELECT 'all'::text AS bucket, 'All users'::text AS bucket_label,
           v_from AS b_start, v_to AS b_end, 0 AS sort_key, NULL::uuid AS group_ref, NULL::text AS role_ref
    WHERE v_group_by = 'none'
    UNION ALL
    SELECT r.role, r.role, v_from, v_to, r.ord, NULL::uuid, r.role
    FROM (VALUES ('coach', 1), ('athlete', 2), ('both', 3), ('signed-up-only', 4)) AS r(role, ord)
    WHERE v_group_by = 'role'
      AND (v_role IS NULL OR r.role = v_role)
    UNION ALL
    SELECT g.id::text, g.name, v_from, v_to,
           (ROW_NUMBER() OVER (ORDER BY lower(g.name), g.created_at))::int, g.id, NULL::text
    FROM public.foundash_groups g
    WHERE v_group_by = 'group'
      AND (p_group_id IS NULL OR g.id = p_group_id)
    UNION ALL
    SELECT to_char(w.week_start, 'YYYY-MM-DD'), 'Week of ' || to_char(w.week_start, 'YYYY-MM-DD'),
           GREATEST(w.week_start, v_from), LEAST(w.week_start + 6, v_to),
           (w.week_start - v_from), NULL::uuid, NULL::text
    FROM (
      SELECT gs::date AS week_start
      FROM generate_series(date_trunc('week', v_from::timestamp), v_to::timestamp, interval '1 week') AS gs
    ) w
    WHERE v_group_by = 'week'
  ),
  bucket_users AS (
    SELECT b.bucket, c.user_id, c.signed_up_on, c.linked_at
    FROM buckets b
    JOIN cohort c
      ON (b.role_ref IS NULL OR c.role = b.role_ref)
     AND (b.group_ref IS NULL OR EXISTS (
           SELECT 1 FROM public.foundash_group_members gm
           WHERE gm.group_id = b.group_ref AND gm.user_id = c.user_id
         ))
    WHERE c.signed_up_on <= b.b_end
  ),
  activity AS (
    SELECT s.user_id, s.created_at AS ts
    FROM public.sessions s
    WHERE s.deleted_at IS NULL AND s.created_at IS NOT NULL
      AND s.user_id IN (SELECT user_id FROM cohort)
    UNION ALL
    SELECT t.user_id, GREATEST(t.created_at, t.started_at, t.ended_at)
    FROM public.training_sessions t
    WHERE t.deleted_at IS NULL
      AND t.user_id IN (SELECT user_id FROM cohort)
    UNION ALL
    SELECT j.user_id, j.created_at
    FROM public.journal_entries j
    WHERE j.deleted_at IS NULL AND j.created_at IS NOT NULL
      AND j.user_id IN (SELECT user_id FROM cohort)
    UNION ALL
    SELECT d.user_id, d.created_at
    FROM public.psyche_drills d
    WHERE d.deleted_at IS NULL AND d.created_at IS NOT NULL
      AND d.user_id IN (SELECT user_id FROM cohort)
  ),
  results AS (
    SELECT
      b.bucket,
      b.bucket_label,
      b.b_start,
      b.b_end,
      b.sort_key,
      (SELECT COUNT(*)::int FROM bucket_users bu WHERE bu.bucket = b.bucket) AS users,
      (SELECT COUNT(DISTINCT bu.user_id)::int
         FROM bucket_users bu
         JOIN activity a ON a.user_id = bu.user_id
        WHERE bu.bucket = b.bucket
          AND a.ts >= ((b.b_end - 6)::timestamp AT TIME ZONE 'UTC')
          AND a.ts <  ((b.b_end + 1)::timestamp AT TIME ZONE 'UTC')) AS active_7d,
      (SELECT COUNT(DISTINCT bu.user_id)::int
         FROM bucket_users bu
         JOIN activity a ON a.user_id = bu.user_id
        WHERE bu.bucket = b.bucket
          AND a.ts >= ((b.b_end - 29)::timestamp AT TIME ZONE 'UTC')
          AND a.ts <  ((b.b_end + 1)::timestamp AT TIME ZONE 'UTC')) AS active_30d,
      (SELECT COUNT(*)::int
         FROM bucket_users bu
         JOIN public.sessions s ON s.user_id = bu.user_id
        WHERE bu.bucket = b.bucket
          AND s.deleted_at IS NULL
          AND s.is_checkin IS NOT TRUE
          AND s.created_at >= (b.b_start::timestamp AT TIME ZONE 'UTC')
          AND s.created_at <  ((b.b_end + 1)::timestamp AT TIME ZONE 'UTC')) AS sessions,
      (SELECT COUNT(*)::int
         FROM bucket_users bu
         JOIN public.climbs c ON c.user_id = bu.user_id
        WHERE bu.bucket = b.bucket
          AND c.deleted_at IS NULL
          AND c.created_at >= (b.b_start::timestamp AT TIME ZONE 'UTC')
          AND c.created_at <  ((b.b_end + 1)::timestamp AT TIME ZONE 'UTC')) AS climbs,
      (SELECT COUNT(*)::int
         FROM bucket_users bu
        WHERE bu.bucket = b.bucket
          AND bu.linked_at IS NOT NULL
          AND bu.linked_at < ((b.b_end + 1)::timestamp AT TIME ZONE 'UTC')) AS coach_linked_athletes
    FROM buckets b
  )
  SELECT COALESCE(json_agg(json_build_object(
    'bucket', r.bucket,
    'bucket_label', r.bucket_label,
    'bucket_start', r.b_start,
    'bucket_end', r.b_end,
    'users', r.users,
    'active_7d', r.active_7d,
    'active_30d', r.active_30d,
    'sessions', r.sessions,
    'climbs', r.climbs,
    'coach_linked_athletes', r.coach_linked_athletes
  ) ORDER BY r.sort_key, r.bucket), '[]'::json)
  INTO v_rows
  FROM results r;

  RETURN json_build_object(
    'ok', true,
    'params', json_build_object(
      'date_from', v_from,
      'date_to', v_to,
      'role', v_role,
      'group_id', p_group_id,
      'include_test', v_include_test,
      'group_by', v_group_by
    ),
    'rows', v_rows
  );
END;
$$;

REVOKE ALL ON FUNCTION public.foundash_group_list() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.foundash_group_create(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.foundash_group_delete(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.foundash_group_add_members(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.foundash_group_remove_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.foundash_group_members(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.foundash_report(date, date, text, uuid, boolean, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.foundash_group_list() TO authenticated;
GRANT EXECUTE ON FUNCTION public.foundash_group_create(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.foundash_group_delete(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.foundash_group_add_members(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.foundash_group_remove_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.foundash_group_members(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.foundash_report(date, date, text, uuid, boolean, text) TO authenticated;
