-- Local fixture only. Not applied to Supabase.
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_sign_in_at timestamptz,
  raw_user_meta_data jsonb,
  raw_app_meta_data jsonb
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
  is_baseline boolean,
  route_name text,
  grade_value text,
  climbing_type text,
  setting text,
  zone text,
  baseline_zone text,
  zone_confidence text,
  breathing_post text,
  gut_post text,
  crux_response text,
  body_state text,
  session_notes text,
  climb_id uuid,
  baseline_grade_range text,
  baseline_terrain_state jsonb,
  baseline_terrain_calibrated jsonb
);
CREATE TABLE IF NOT EXISTS public.falls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid,
  user_id uuid,
  created_at timestamptz DEFAULT now(),
  catch_quality text,
  fall_consequence text,
  fall_description text,
  got_back_on boolean,
  learning_reflection text,
  vs_expect text
);
CREATE TABLE IF NOT EXISTS public.climbs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  created_at timestamptz DEFAULT now(),
  deleted_at timestamptz,
  name text,
  grade_value text,
  climbing_type text,
  is_project boolean
);
CREATE TABLE IF NOT EXISTS public.training_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  ended_at timestamptz,
  deleted_at timestamptz,
  energy_type text,
  notes text,
  warm_up text,
  cool_down text,
  blocks jsonb,
  assignment_id uuid
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
  deleted_at timestamptz,
  drill_key text,
  duration_seconds int
);
CREATE TABLE IF NOT EXISTS public.assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid,
  athlete_id uuid,
  title text,
  description text,
  due_date date,
  completed_at timestamptz,
  deleted_at timestamptz
);
CREATE TABLE IF NOT EXISTS public.coach_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid,
  athlete_id uuid,
  sender_id uuid,
  body text,
  link text,
  created_at timestamptz DEFAULT now(),
  read_at timestamptz,
  edited_at timestamptz
);

TRUNCATE
  public.coach_messages,
  public.assignments,
  public.psyche_drills,
  public.journal_entries,
  public.training_sessions,
  public.falls,
  public.climbs,
  public.sessions,
  public.coach_athlete_links,
  public.coach_flags,
  public.profiles,
  public.foundash_admins,
  auth.users
RESTART IDENTITY;

INSERT INTO auth.users (id, email, created_at, last_sign_in_at, raw_user_meta_data, raw_app_meta_data) VALUES
  ('11111111-1111-1111-1111-111111111111', 'founder@sharp-end.test', now() - interval '400 days', now() - interval '1 hour', '{"name":"Founder"}'::jsonb, '{}'::jsonb),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'kelly.peterson@gmail.com', now() - interval '120 days', now() - interval '2 days', '{"name":"Kelly"}'::jsonb, '{}'::jsonb),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc3', 'wes.shih@gmail.com', now() - interval '200 days', now() - interval '3 hours', '{"name":"Wes"}'::jsonb, '{}'::jsonb),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee5', 'solo.user@gmail.com', now() - interval '10 days', NULL, '{}'::jsonb, '{}'::jsonb);

INSERT INTO public.foundash_admins (user_id) VALUES ('11111111-1111-1111-1111-111111111111');

INSERT INTO public.profiles (user_id, first_name, last_name) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'Kelly', 'Peterson'),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc3', 'Wes', 'Shih'),
  ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeee5', 'Solo', 'User');

INSERT INTO public.coach_flags (user_id, is_coach) VALUES
  ('cccccccc-cccc-cccc-cccc-ccccccccccc3', true);

INSERT INTO public.coach_athlete_links (coach_id, athlete_id, status, created_at) VALUES
  ('cccccccc-cccc-cccc-cccc-ccccccccccc3', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'active', now() - interval '30 days');

INSERT INTO public.sessions (
  id, user_id, created_at, is_checkin, is_baseline, route_name, grade_value,
  climbing_type, setting, zone, zone_confidence, breathing_post, gut_post,
  crux_response, body_state, session_notes
) VALUES (
  '22222222-2222-2222-2222-222222222221',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
  now() - interval '4 days',
  false, false, 'Arete', '5.11a', 'sport', 'outdoor', 'learning', 'high',
  'steady', 'tight', 'breathed', 'ready', 'held the clip'
);

INSERT INTO public.sessions (
  id, user_id, created_at, is_checkin, is_baseline,
  baseline_grade_range, baseline_zone, baseline_terrain_state, baseline_terrain_calibrated
) VALUES (
  '22222222-2222-2222-2222-222222222223',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
  now() - interval '40 days',
  true, true, '5.10-5.11', 'learning',
  '{"Slab":"sent","Vertical":"sent","Overhang":"fell","Crack":"","Roof":""}'::jsonb,
  '{"Slab":true}'::jsonb
);

INSERT INTO public.sessions (id, user_id, created_at, is_checkin, is_baseline) VALUES
  ('22222222-2222-2222-2222-222222222224', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', now() - interval '1 day', true, false);

INSERT INTO public.falls (id, session_id, user_id, created_at, fall_description, got_back_on) VALUES
  ('22222222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222221', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', now() - interval '4 days', 'slip at the clip', true);

INSERT INTO public.climbs (id, user_id, name, grade_value, climbing_type, is_project) VALUES
  ('44444444-4444-4444-4444-444444444441', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'Arete', '5.11a', 'sport', true);

INSERT INTO public.assignments (id, coach_id, athlete_id, title, description, due_date, completed_at) VALUES
  ('33333333-3333-3333-3333-333333333331', 'cccccccc-cccc-cccc-cccc-ccccccccccc3', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'Power', 'four rounds', (CURRENT_TIMESTAMP AT TIME ZONE 'UTC')::date - 2, NULL);

INSERT INTO public.training_sessions (
  id, user_id, created_at, started_at, ended_at, energy_type, notes, assignment_id, blocks
) VALUES (
  '33333333-3333-3333-3333-333333333332',
  'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2',
  now() - interval '3 days',
  now() - interval '3 days',
  now() - interval '3 days' + interval '40 minutes',
  'strength',
  'Hangboard',
  '33333333-3333-3333-3333-333333333331',
  '[{"shape":"emom","rounds":[{"boulders":[{"text":"Green V4","result":"sent"},{"text":"Blue V5","result":"failed"},{"text":"Yellow V3","complete":true},{"text":"Pink V6"}]}]}]'::jsonb
);

INSERT INTO public.journal_entries (user_id, entry_text, created_at) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'First week notes', now() - interval '6 days');

INSERT INTO public.psyche_drills (user_id, drill_key, duration_seconds, created_at) VALUES
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'panic-week', 120, now() - interval '5 days');

INSERT INTO public.coach_messages (coach_id, athlete_id, sender_id, body, link, created_at) VALUES
  ('cccccccc-cccc-cccc-cccc-ccccccccccc3', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'cccccccc-cccc-cccc-cccc-ccccccccccc3', 'Try the arete again', 'https://example.com/beta', now() - interval '2 days'),
  ('cccccccc-cccc-cccc-cccc-ccccccccccc3', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbb2', 'Sent it', NULL, now() - interval '1 day');
