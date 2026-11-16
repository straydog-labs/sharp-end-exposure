-- Local fixture only. Not applied to Supabase.
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$ SELECT '11111111-1111-1111-1111-111111111111'::uuid $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.foundash_admins (
  user_id uuid PRIMARY KEY
);

CREATE OR REPLACE FUNCTION public._foundash_is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.foundash_admins a WHERE a.user_id = auth.uid()
  );
$$;

-- Fixture stand-in for the live helper (body is not in the repo).
-- Matches founder-dashboard isTestAccount email rules.
CREATE OR REPLACE FUNCTION public._foundash_is_test_email(p_email text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_email IS NULL OR btrim(p_email) = '' THEN false
    WHEN lower(p_email) LIKE 'rls-probe-%' THEN true
    WHEN lower(p_email) LIKE 'tf-verify-%' THEN true
    WHEN position('+test' IN lower(p_email)) > 0 THEN true
    WHEN right(lower(p_email), 9) = '@test.com' THEN true
    WHEN right(lower(p_email), 12) = '@example.com' THEN true
    ELSE false
  END;
$$;

CREATE TABLE IF NOT EXISTS public.profiles (
  user_id uuid,
  first_name text,
  last_name text
);
CREATE TABLE IF NOT EXISTS public.coach_flags (
  user_id uuid,
  is_coach boolean,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.coach_athlete_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid,
  athlete_id uuid,
  status text,
  created_at timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  created_at timestamptz,
  deleted_at timestamptz,
  is_checkin boolean,
  is_baseline boolean
);
CREATE TABLE IF NOT EXISTS public.climbs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  created_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.training_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  ended_at timestamptz,
  deleted_at timestamptz,
  energy_type text NOT NULL DEFAULT 'strength'
);
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  created_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.psyche_drills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  created_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id uuid,
  completed_at timestamptz,
  due_date date,
  deleted_at timestamptz
);

TRUNCATE
  public.assignments,
  public.psyche_drills,
  public.journal_entries,
  public.training_sessions,
  public.climbs,
  public.sessions,
  public.coach_athlete_links,
  public.coach_flags,
  public.profiles,
  public.foundash_admins,
  auth.users;

INSERT INTO public.foundash_admins (user_id)
VALUES ('11111111-1111-1111-1111-111111111111');

-- Anna, Kelly, Wes, plus one test account and one revoked-link athlete.
INSERT INTO auth.users (id, email, created_at) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'anna.islamova@gmail.com', now() - interval '160 days'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'kelly.peterson@gmail.com', now() - interval '120 days'),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc3', 'wes.shih@gmail.com', now() - interval '200 days'),
  ('dddddddd-dddd-dddd-dddd-ddddddddddd4', 'rls-probe-9@example.com', now() - interval '10 days');

INSERT INTO public.profiles (user_id, first_name, last_name) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Anna', 'Islamova'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'Kelly', 'Peterson'),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc3', 'Wes', 'Shih'),
  ('dddddddd-dddd-dddd-dddd-ddddddddddd4', 'Probe', 'Bot');

INSERT INTO public.coach_flags (user_id, is_coach, created_at) VALUES
  ('cccccccc-cccc-cccc-cccc-ccccccccccc3', true, now() - interval '190 days'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', false, now() - interval '150 days');

-- Kelly actively linked to Wes. A revoked link must not count.
INSERT INTO public.coach_athlete_links (coach_id, athlete_id, status, created_at) VALUES
  ('cccccccc-cccc-cccc-cccc-ccccccccccc3', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'active', now() - interval '100 days'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'revoked', now() - interval '90 days'),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc3', 'dddddddd-dddd-dddd-dddd-ddddddddddd4', 'revoked', now() - interval '9 days');

-- Anna: 16 real climb sessions (5 in 30d, 11 older), plus check-in, baseline, and a deleted row newer than all of them.
INSERT INTO public.sessions (user_id, created_at, is_checkin, is_baseline)
SELECT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', now() - (n || ' days')::interval, false, false
FROM generate_series(3, 7) AS n;
INSERT INTO public.sessions (user_id, created_at, is_checkin, is_baseline)
SELECT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', now() - (n || ' days')::interval, false, false
FROM generate_series(40, 50) AS n;
INSERT INTO public.sessions (user_id, created_at, is_checkin, is_baseline) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', now() - interval '20 days', true, false),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', now() - interval '70 days', true, true),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', now() - interval '1 hour', false, false);

UPDATE public.sessions
SET deleted_at = now()
WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1'
  AND created_at = (SELECT MAX(created_at) FROM public.sessions WHERE user_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1');

INSERT INTO public.climbs (user_id, deleted_at)
SELECT 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', NULL FROM generate_series(1, 9);
INSERT INTO public.climbs (user_id, deleted_at) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', now());

INSERT INTO public.training_sessions (user_id, created_at, started_at, ended_at, deleted_at) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', now() - interval '10 days', now() - interval '10 days', now() - interval '10 days' + interval '1 hour', NULL),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', now() - interval '50 days', now() - interval '50 days', NULL, NULL),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', now() - interval '1 hour', now() - interval '1 hour', now(), now());

INSERT INTO public.journal_entries (user_id, created_at) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', now() - interval '20 days');
INSERT INTO public.psyche_drills (user_id, created_at) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', now() - interval '40 days');

INSERT INTO public.assignments (athlete_id, completed_at, due_date, deleted_at) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', NULL, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date - 1, NULL),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', NULL, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date + 10, NULL),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', now() - interval '5 days', (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date - 6, NULL),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', now() - interval '6 days', NULL, NULL),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', now() - interval '7 days', NULL, NULL),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', now() - interval '8 days', NULL, NULL),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', NULL, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date - 3, now());

-- Kelly: two old climb sessions, a check-in yesterday that is the latest live activity,
-- and a deleted training row timestamped now that must not win.
INSERT INTO public.sessions (user_id, created_at, is_checkin, is_baseline) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', now() - interval '40 days', false, false),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', now() - interval '50 days', false, false),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', now() - interval '1 day', true, false);
INSERT INTO public.climbs (user_id) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2');
INSERT INTO public.training_sessions (user_id, created_at, started_at, ended_at, deleted_at) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', now() - interval '1 hour', now() - interval '1 hour', now(), now());
INSERT INTO public.assignments (athlete_id, completed_at, due_date) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', NULL, (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date + 4);

-- Wes: coach. Training ended_at is later than created_at and later than his climbs.
INSERT INTO public.sessions (user_id, created_at, is_checkin, is_baseline) VALUES
  ('cccccccc-cccc-cccc-cccc-ccccccccccc3', now() - interval '6 days', false, false),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc3', now() - interval '8 days', false, false),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc3', now() - interval '40 days', false, false),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc3', now() - interval '45 days', false, false),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc3', now() - interval '80 days', true, true);
INSERT INTO public.climbs (user_id) VALUES
  ('cccccccc-cccc-cccc-cccc-ccccccccccc3'),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc3');
INSERT INTO public.training_sessions (user_id, created_at, started_at, ended_at) VALUES
  ('cccccccc-cccc-cccc-cccc-ccccccccccc3', now() - interval '2 days', now() - interval '1 day', now() - interval '2 hours');
