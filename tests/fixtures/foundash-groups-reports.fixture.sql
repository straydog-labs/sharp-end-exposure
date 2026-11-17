-- Local fixture only. Not applied to Supabase.
-- Stand-ins for the Supabase objects sql/foundash-groups-reports.sql reads.
-- auth.uid() reads request.jwt.claim.sub so a test can switch callers:
--   unset            -> the admin (1111...)
--   'none'           -> NULL (not signed in)
--   any uuid         -> that user
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_sign_in_at timestamptz
);

CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN current_setting('request.jwt.claim.sub', true) = 'none' THEN NULL
    ELSE COALESCE(
      NULLIF(current_setting('request.jwt.claim.sub', true), ''),
      '11111111-1111-1111-1111-111111111111'
    )::uuid
  END
$$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
END $$;

GRANT USAGE ON SCHEMA auth TO anon, authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon, authenticated;

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
  deleted_at timestamptz,
  name text
);
CREATE TABLE IF NOT EXISTS public.training_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  ended_at timestamptz,
  deleted_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.journal_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  created_at timestamptz DEFAULT now(),
  deleted_at timestamptz,
  entry_text text
);
CREATE TABLE IF NOT EXISTS public.psyche_drills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  created_at timestamptz DEFAULT now(),
  deleted_at timestamptz
);

-- Users (all signed up 2026-09-01 unless noted)
--   1111 founder (admin, not test)     -- no activity
--   aaaa anna    athlete of wes        -- 2 climb sessions + 1 check-in in Oct, 1 climb
--   bbbb kelly   athlete of wes        -- 1 climb session in Oct week of 10-12, training 10-30
--   cccc wes     coach                 -- journal 10-20
--   dddd probe   rls-probe- test acct  -- 3 climb sessions in Oct
--   eeee solo    signed up 2026-10-15  -- 1 deleted session (ignored), psyche 10-31
--   ffff late    signed up 2026-11-10  -- after the October window
TRUNCATE
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

INSERT INTO auth.users (id, email, created_at) VALUES
  ('11111111-1111-1111-1111-111111111111', 'founder@straydog.dev', '2026-09-01T12:00:00Z'),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'anna.lee@gmail.com', '2026-09-01T12:00:00Z'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'kelly.peterson@gmail.com', '2026-09-01T12:00:00Z'),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc3', 'wes.shih@gmail.com', '2026-09-01T12:00:00Z'),
  ('dddddddd-dddd-dddd-dddd-ddddddddddd4', 'rls-probe-1@gmail.com', '2026-09-01T12:00:00Z'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee5', 'solo.user@gmail.com', '2026-10-15T12:00:00Z'),
  ('ffffffff-ffff-ffff-ffff-fffffffffff6', 'late.user@gmail.com', '2026-11-10T12:00:00Z');

INSERT INTO public.foundash_admins (user_id) VALUES ('11111111-1111-1111-1111-111111111111');

INSERT INTO public.profiles (user_id, first_name, last_name) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'Anna', 'Lee'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'Kelly', 'Peterson'),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc3', 'Wes', 'Shih');

INSERT INTO public.coach_flags (user_id, is_coach) VALUES
  ('cccccccc-cccc-cccc-cccc-ccccccccccc3', true);

INSERT INTO public.coach_athlete_links (coach_id, athlete_id, status, created_at) VALUES
  ('cccccccc-cccc-cccc-cccc-ccccccccccc3', 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', 'active', '2026-09-10T12:00:00Z'),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc3', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'active', '2026-10-20T12:00:00Z'),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc3', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee5', 'revoked', '2026-10-16T12:00:00Z');

INSERT INTO public.sessions (user_id, created_at, deleted_at, is_checkin, is_baseline) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '2026-10-06T12:00:00Z', NULL, false, false),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '2026-10-28T12:00:00Z', NULL, false, false),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '2026-10-29T12:00:00Z', NULL, true, false),
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '2026-09-20T12:00:00Z', NULL, false, false),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', '2026-10-13T12:00:00Z', NULL, false, false),
  ('dddddddd-dddd-dddd-dddd-ddddddddddd4', '2026-10-07T12:00:00Z', NULL, false, false),
  ('dddddddd-dddd-dddd-dddd-ddddddddddd4', '2026-10-14T12:00:00Z', NULL, false, false),
  ('dddddddd-dddd-dddd-dddd-ddddddddddd4', '2026-10-30T12:00:00Z', NULL, false, false),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee5', '2026-10-20T12:00:00Z', '2026-10-21T12:00:00Z', false, false);

INSERT INTO public.climbs (user_id, created_at, deleted_at, name) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaa1', '2026-10-06T12:00:00Z', NULL, 'Arete'),
  ('dddddddd-dddd-dddd-dddd-ddddddddddd4', '2026-10-07T12:00:00Z', NULL, 'Probe route'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', '2026-10-13T12:00:00Z', '2026-10-14T12:00:00Z', 'Deleted');

INSERT INTO public.training_sessions (user_id, created_at, started_at, ended_at) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', '2026-10-30T12:00:00Z', '2026-10-30T12:00:00Z', '2026-10-30T13:00:00Z');

INSERT INTO public.journal_entries (user_id, created_at, entry_text) VALUES
  ('cccccccc-cccc-cccc-cccc-ccccccccccc3', '2026-10-20T12:00:00Z', 'coach notes');

INSERT INTO public.psyche_drills (user_id, created_at) VALUES
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee5', '2026-10-31T12:00:00Z');
