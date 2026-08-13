-- Foundash Ops / Command Center
-- Apply AFTER sql/foundash-coach-admin.sql (needs public._foundash_is_admin()).
--
-- Auth model (same as other Foundash RPCs):
--   SECURITY DEFINER · EXECUTE to authenticated only · never anon
--   Caller must be auth.uid() ∈ public.foundash_admins
--
-- CONTENT_REV: bump OPS_CONTENT_REV below to re-seed default task notes /
-- status / due / priority from this file while PRESERVING done (and
-- user-edited contact notes on non-bump). Match on seed_key.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ops_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_key text UNIQUE,
  phase text NOT NULL CHECK (phase IN (
    'now_aug_2026', 'sep_2026', 'oct_dec_2026', 'mar_2027'
  )),
  name text NOT NULL,
  priority text NOT NULL CHECK (priority IN ('HIGH', 'MED', 'LOW')),
  due text,
  status text NOT NULL CHECK (status IN (
    'Done', 'In Progress', 'Urgent', 'Waiting', 'Future'
  )),
  notes text NOT NULL DEFAULT '',
  done boolean NOT NULL DEFAULT false,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ops_expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_key text UNIQUE,
  date date NOT NULL,
  description text NOT NULL,
  category text NOT NULL CHECK (category IN (
    'insurance', 'permits', 'flights', 'transport',
    'accommodation', 'food', 'other'
  )),
  amount numeric(12,2) NOT NULL CHECK (amount >= 0),
  paid_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ops_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seed_key text UNIQUE,
  name text NOT NULL,
  role text NOT NULL DEFAULT '',
  details text NOT NULL DEFAULT '',
  notes text NOT NULL DEFAULT '',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ops_settings (
  id int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  payment_received boolean NOT NULL DEFAULT false,
  content_rev int NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.ops_settings (id, payment_received, content_rev)
VALUES (1, false, 0)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.ops_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_settings ENABLE ROW LEVEL SECURITY;

-- No direct client policies — access only via SECURITY DEFINER RPCs.
REVOKE ALL ON TABLE public.ops_tasks FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ops_expenses FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ops_contacts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ops_settings FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.ops_tasks TO postgres;
GRANT ALL ON TABLE public.ops_expenses TO postgres;
GRANT ALL ON TABLE public.ops_contacts TO postgres;
GRANT ALL ON TABLE public.ops_settings TO postgres;

-- ---------------------------------------------------------------------------
-- Seed / content-rev sync
-- ---------------------------------------------------------------------------
-- Drop prior signatures if re-applying
DROP FUNCTION IF EXISTS public.foundash_ops_get();
DROP FUNCTION IF EXISTS public.foundash_ops_set_task(uuid, boolean, text);
DROP FUNCTION IF EXISTS public.foundash_ops_set_task(uuid, boolean, text, text);
DROP FUNCTION IF EXISTS public.foundash_ops_add_expense(date, text, text, numeric, text);
DROP FUNCTION IF EXISTS public.foundash_ops_delete_expense(uuid);
DROP FUNCTION IF EXISTS public.foundash_ops_set_contact_notes(uuid, text);
DROP FUNCTION IF EXISTS public.foundash_ops_set_payment(boolean);
DROP FUNCTION IF EXISTS public._foundash_ops_seed_sync();

CREATE OR REPLACE FUNCTION public._foundash_ops_seed_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  -- Bump to re-seed task defaults (notes/status/due/priority/phase/name)
  -- while preserving checkbox done state on existing seed_key rows.
  OPS_CONTENT_REV int := 3;
  cur_rev int;
  bump boolean;
BEGIN
  INSERT INTO public.ops_settings (id, payment_received, content_rev)
  VALUES (1, false, 0)
  ON CONFLICT (id) DO NOTHING;

  SELECT content_rev INTO cur_rev FROM public.ops_settings WHERE id = 1;
  bump := COALESCE(cur_rev, 0) < OPS_CONTENT_REV;

  -- Tasks (upsert by seed_key)
  WITH seed(seed_key, phase, name, priority, due, status, notes, done, sort_order) AS (
    VALUES
      ('t1',  'now_aug_2026', 'Straydog Labs LLC formed', 'LOW', 'Done', 'Done', 'EIN 42-4119123', true, 10),
      ('t2',  'now_aug_2026', 'Mercury bank account open', 'LOW', 'Done', 'Done', '', true, 20),
      ('t3',  'now_aug_2026', 'BLM permit application submitted', 'MED', 'Done', 'Done', 'RAPTOR #2026-02151 · Lottery results September 30, 2026', true, 30),
      ('t4',  'now_aug_2026', 'Wes Shih email sent', 'MED', 'Awaiting', 'Waiting', 'Waiting on reply', true, 40),
      ('t24', 'now_aug_2026', 'Granite Insurance evaluated', 'LOW', 'Done', 'Done', 'Ruled out — $15k minimum annual premium, too expensive', true, 50),
      ('t25', 'now_aug_2026', 'Draft Veracity Guided Recreation application', 'HIGH', 'Done', 'Done', 'Annual coverage (not single-event) fully drafted: entity info, revenue projection ~$20k, $1M/$2M limits, BLM named as additional insured, deductible quote requested at $1,000 and $2,500', true, 60),
      ('t26', 'now_aug_2026', 'Draft insurance supporting documents', 'MED', 'Done', 'Done', 'Ready to attach: Safety & Procedure Manual · Participant Waiver + Health/Fitness Declaration (combined) · Equipment Inspection Log template', true, 70),
      ('t5',  'now_aug_2026', 'Bind general liability insurance (Veracity)', 'HIGH', 'After Alma call', 'Urgent', 'Path: Veracity Insurance Solutions Guided Recreation Program. Application drafted; submission on hold until guide roster / guide-to-client ratio complete after Tuesday Alma call. Required before clinic agreement goes to Dana.', false, 80),
      ('t27', 'now_aug_2026', 'Submit Veracity insurance application', 'HIGH', 'After Alma call', 'Waiting', 'Intentionally holding — guide roster section incomplete pending Alma''s status. Will submit complete package after Tuesday call (not half-finished).', false, 90),
      ('t28', 'now_aug_2026', 'Attorney review of participant waiver', 'MED', 'This week', 'Urgent', 'Formal attorney review before use with real participants. Not blocking insurance submission, but should go out this week.', false, 100),
      ('t6',  'now_aug_2026', 'Send clinic agreement to Dana', 'HIGH', 'Hold', 'Urgent', 'dana@cruxwilderness.org · Clinic confirmed ($15k, Mar 27–29 2027, Red Rocks, 12 veterans, co-taught with Alma). Agreement still on hold — waiting on insurance to bind first.', false, 110),
      ('t7',  'now_aug_2026', 'Collect $15,000 payment', 'HIGH', 'After agreement', 'Urgent', 'ACH to Mercury from Crux Wilderness · After agreement signed', false, 120),
      ('t8',  'now_aug_2026', 'File 3 DBA registrations', 'MED', 'This week', 'Urgent', 'tncab.tnsos.gov · $60 total', false, 130),
      ('t9',  'now_aug_2026', 'Alma / Rock Zen call', 'HIGH', 'Tue Aug 11', 'In Progress', E'Open questions:\n• Coverage status — co-guide on Straydog policy vs. independent contractor with her own French coverage? Would French coverage satisfy BLM additional-insured?\n• Guide roster details — age, experience, certifications\n• Comfort with 2-guide-to-12-participant ratio (exactly at 1:6 max)\n• Rock Zen entity details for partnership agreement\n• Revenue-share terms\n(One-page call checklist prepared separately.)', false, 140),
      ('t10', 'sep_2026', 'BLM permit lottery results', 'HIGH', 'Sep 30, 2026', 'Waiting', 'RAPTOR #2026-02151 · 8 spots available · Lottery results dated September 30, 2026', false, 210),
      ('t15', 'sep_2026', 'Draft Alma / Rock Zen partnership agreement', 'MED', 'After Alma call', 'Future', 'Scout drafts after Tuesday Aug 11 call · Need Rock Zen entity details + revenue-share terms', false, 220),
      ('t11', 'sep_2026', 'Book accommodation', 'MED', 'Sep', 'Future', '2 VRBO houses Summerlin Las Vegas · 14 people · 2 nights', false, 230),
      ('t12', 'sep_2026', 'Book van rental', 'MED', 'Sep', 'Future', 'Mercedes Sprinter Las Vegas · 3 days', false, 240),
      ('t13', 'sep_2026', 'Book Alma flight', 'MED', 'Book early', 'Future', 'France to Las Vegas · book early', false, 250),
      ('t14', 'sep_2026', 'Book John flight', 'MED', 'Sep', 'Future', 'Nashville BNA to Las Vegas LAS', false, 260),
      ('t16', 'oct_dec_2026', 'Complete BLM permit package', 'HIGH', 'Oct 15', 'Future', 'If drawn — docs due Oct 15', false, 310),
      ('t17', 'oct_dec_2026', 'Confirm 12 participants with Dana', 'MED', 'Q4', 'Future', 'Clinic confirmed for 12 veteran participants · Waivers required', false, 320),
      ('t18', 'oct_dec_2026', 'Confirm dates with all parties', 'MED', 'Q4', 'Future', 'Alma, Dana, John · Mar 27-29 2027', false, 330),
      ('t19', 'oct_dec_2026', 'Finalize crag selection', 'LOW', 'Q4', 'Future', 'Calico Hills or Panty Wall · 5.9 and under', false, 340),
      ('t20', 'oct_dec_2026', 'Arrange participant waivers', 'MED', 'Q4', 'Future', 'Dana handles · Waiver needs attorney review first (see Aug task)', false, 350),
      ('t21', 'mar_2027', 'Clinic Day 1', 'HIGH', 'Mar 27', 'Future', 'Foundations · Mar 27', false, 410),
      ('t22', 'mar_2027', 'Clinic Day 2', 'HIGH', 'Mar 28', 'Future', 'Application · Mar 28', false, 420),
      ('t23', 'mar_2027', 'Post-clinic debrief', 'MED', 'Mar 29', 'Future', 'Mar 29', false, 430)
  )
  INSERT INTO public.ops_tasks AS t
    (seed_key, phase, name, priority, due, status, notes, done, sort_order)
  SELECT seed_key, phase, name, priority, due, status, notes, done, sort_order FROM seed
  ON CONFLICT (seed_key) DO UPDATE SET
    phase = EXCLUDED.phase,
    name = EXCLUDED.name,
    priority = EXCLUDED.priority,
    due = EXCLUDED.due,
    sort_order = EXCLUDED.sort_order,
    -- On content bump: take seeded notes/status; always preserve done.
    notes = CASE WHEN bump THEN EXCLUDED.notes ELSE t.notes END,
    status = CASE
      WHEN t.done THEN 'Done'
      WHEN bump THEN EXCLUDED.status
      ELSE t.status
    END,
    done = t.done;

  -- Expenses: seed only when table has no seeded rows (don't wipe user adds)
  IF NOT EXISTS (SELECT 1 FROM public.ops_expenses WHERE seed_key IS NOT NULL) THEN
    INSERT INTO public.ops_expenses (seed_key, date, description, category, amount, paid_by)
    VALUES
      ('e1', '2026-08-15', 'Insurance GL / Veracity (est)', 'insurance', 650, 'Estimate'),
      ('e2', '2026-08-01', 'BLM permit fee', 'permits', 130, 'Straydog'),
      ('e3', '2026-09-15', 'John flight BNA–LAS (est)', 'flights', 500, 'Estimate'),
      ('e4', '2026-09-15', 'Alma flight France–LAS (est)', 'flights', 1500, 'Estimate'),
      ('e5', '2026-09-20', 'Van rental 3 days (est)', 'transport', 750, 'Estimate'),
      ('e6', '2026-09-20', '2 VRBO houses 2 nights (est)', 'accommodation', 1300, 'Estimate'),
      ('e7', '2027-03-27', 'Meals 14 people 3 days (est)', 'food', 2000, 'Estimate')
    ON CONFLICT (seed_key) DO NOTHING;
  ELSIF bump THEN
    -- On bump, refresh seeded expense descriptions/amounts if still present
    UPDATE public.ops_expenses e SET
      date = v.date::date,
      description = v.description,
      category = v.category,
      amount = v.amount,
      paid_by = v.paid_by
    FROM (VALUES
      ('e1', '2026-08-15', 'Insurance GL / Veracity (est)', 'insurance', 650::numeric, 'Estimate'),
      ('e2', '2026-08-01', 'BLM permit fee', 'permits', 130::numeric, 'Straydog'),
      ('e3', '2026-09-15', 'John flight BNA–LAS (est)', 'flights', 500::numeric, 'Estimate'),
      ('e4', '2026-09-15', 'Alma flight France–LAS (est)', 'flights', 1500::numeric, 'Estimate'),
      ('e5', '2026-09-20', 'Van rental 3 days (est)', 'transport', 750::numeric, 'Estimate'),
      ('e6', '2026-09-20', '2 VRBO houses 2 nights (est)', 'accommodation', 1300::numeric, 'Estimate'),
      ('e7', '2027-03-27', 'Meals 14 people 3 days (est)', 'food', 2000::numeric, 'Estimate')
    ) AS v(seed_key, date, description, category, amount, paid_by)
    WHERE e.seed_key = v.seed_key;
  END IF;

  -- Contacts
  WITH seed(seed_key, name, role, details, notes, sort_order) AS (
    VALUES
      ('c1', 'Tara Myers', 'Funding source', '', '', 10),
      ('c2', 'Dana Stricevic', 'Crux Wilderness',
        E'Email: dana@cruxwilderness.org\nNote: Clinic confirmed · Client on agreement (hold until insurance binds)',
        '', 20),
      ('c3', 'Alma', 'RWW / Rock Zen',
        E'Email: TBD\nNote: Co-trainer · Call Tue Aug 11',
        'Call agenda: coverage (Straydog policy vs French IC / BLM AI), guide roster (age/exp/certs), 2:12 ratio comfort, Rock Zen entity details, revenue-share. Full Qs on Alma call task.',
        30),
      ('c5', 'Veracity Insurance Solutions', 'Insurance broker',
        'Note: Guided Recreation Program — annual GL path',
        'Application drafted; submission after Alma call. Granite ruled out ($15k min). Docs ready: safety manual, waiver+health, equipment log.',
        40),
      ('c4', 'Abram Johnson', 'BLM Red Rock Canyon',
        E'Email: abramjohnson@blm.gov\nPhone: 702-515-5392\nNote: Permit contact · RAPTOR #2026-02151',
        '', 50)
  )
  INSERT INTO public.ops_contacts AS c
    (seed_key, name, role, details, notes, sort_order)
  SELECT seed_key, name, role, details, notes, sort_order FROM seed
  ON CONFLICT (seed_key) DO UPDATE SET
    name = EXCLUDED.name,
    role = EXCLUDED.role,
    details = EXCLUDED.details,
    sort_order = EXCLUDED.sort_order,
    notes = CASE WHEN bump THEN EXCLUDED.notes ELSE c.notes END;

  IF bump THEN
    UPDATE public.ops_settings
    SET content_rev = OPS_CONTENT_REV, updated_at = now()
    WHERE id = 1;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._foundash_ops_seed_sync() FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.foundash_ops_get()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tasks_json json;
  expenses_json json;
  contacts_json json;
  payment boolean;
  rev int;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  IF NOT public._foundash_is_admin() THEN
    RETURN json_build_object('ok', false, 'error', 'not_admin');
  END IF;

  PERFORM public._foundash_ops_seed_sync();

  SELECT COALESCE(json_agg(row_to_json(t) ORDER BY t.sort_order ASC, t.created_at ASC), '[]'::json)
  INTO tasks_json
  FROM (
    SELECT id, seed_key, phase, name, priority, due, status, notes, done, sort_order, created_at
    FROM public.ops_tasks
  ) t;

  SELECT COALESCE(json_agg(row_to_json(e) ORDER BY e.date DESC, e.created_at DESC), '[]'::json)
  INTO expenses_json
  FROM (
    SELECT id, seed_key, date, description, category, amount, paid_by, created_at
    FROM public.ops_expenses
  ) e;

  SELECT COALESCE(json_agg(row_to_json(c) ORDER BY c.sort_order ASC, c.created_at ASC), '[]'::json)
  INTO contacts_json
  FROM (
    SELECT id, seed_key, name, role, details, notes, sort_order, created_at
    FROM public.ops_contacts
  ) c;

  SELECT payment_received, content_rev INTO payment, rev
  FROM public.ops_settings WHERE id = 1;

  RETURN json_build_object(
    'ok', true,
    'budget', 15000,
    'clinic_date', '2027-03-27',
    'payment_received', COALESCE(payment, false),
    'content_rev', COALESCE(rev, 0),
    'tasks', tasks_json,
    'expenses', expenses_json,
    'contacts', contacts_json
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.foundash_ops_set_task(
  p_id uuid,
  p_done boolean DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_status text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  row_json json;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  IF NOT public._foundash_is_admin() THEN
    RETURN json_build_object('ok', false, 'error', 'not_admin');
  END IF;
  IF p_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'id_required');
  END IF;

  UPDATE public.ops_tasks t SET
    done = COALESCE(p_done, t.done),
    notes = COALESCE(p_notes, t.notes),
    status = CASE
      WHEN COALESCE(p_done, t.done) THEN 'Done'
      WHEN p_status IS NOT NULL THEN p_status
      WHEN p_done IS FALSE AND t.status = 'Done' THEN 'In Progress'
      ELSE t.status
    END
  WHERE t.id = p_id;

  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'not_found');
  END IF;

  SELECT row_to_json(x) INTO row_json
  FROM (
    SELECT id, seed_key, phase, name, priority, due, status, notes, done, sort_order, created_at
    FROM public.ops_tasks WHERE id = p_id
  ) x;

  RETURN json_build_object('ok', true, 'task', row_json);
END;
$$;

CREATE OR REPLACE FUNCTION public.foundash_ops_add_expense(
  p_date date,
  p_description text,
  p_category text,
  p_amount numeric,
  p_paid_by text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_id uuid;
  row_json json;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  IF NOT public._foundash_is_admin() THEN
    RETURN json_build_object('ok', false, 'error', 'not_admin');
  END IF;

  INSERT INTO public.ops_expenses (date, description, category, amount, paid_by)
  VALUES (
    p_date,
    trim(p_description),
    p_category,
    COALESCE(p_amount, 0),
    trim(COALESCE(p_paid_by, ''))
  )
  RETURNING id INTO new_id;

  SELECT row_to_json(x) INTO row_json
  FROM (
    SELECT id, seed_key, date, description, category, amount, paid_by, created_at
    FROM public.ops_expenses WHERE id = new_id
  ) x;

  RETURN json_build_object('ok', true, 'expense', row_json);
END;
$$;

CREATE OR REPLACE FUNCTION public.foundash_ops_delete_expense(p_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  IF NOT public._foundash_is_admin() THEN
    RETURN json_build_object('ok', false, 'error', 'not_admin');
  END IF;
  IF p_id IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'id_required');
  END IF;

  DELETE FROM public.ops_expenses WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'not_found');
  END IF;
  RETURN json_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.foundash_ops_set_contact_notes(
  p_id uuid,
  p_notes text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  IF NOT public._foundash_is_admin() THEN
    RETURN json_build_object('ok', false, 'error', 'not_admin');
  END IF;

  UPDATE public.ops_contacts SET notes = COALESCE(p_notes, '') WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN json_build_object('ok', false, 'error', 'not_found');
  END IF;
  RETURN json_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.foundash_ops_set_payment(p_received boolean)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN json_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  IF NOT public._foundash_is_admin() THEN
    RETURN json_build_object('ok', false, 'error', 'not_admin');
  END IF;

  UPDATE public.ops_settings
  SET payment_received = COALESCE(p_received, false), updated_at = now()
  WHERE id = 1;

  RETURN json_build_object('ok', true, 'payment_received', COALESCE(p_received, false));
END;
$$;

-- Privileges
REVOKE ALL ON FUNCTION public.foundash_ops_get() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.foundash_ops_set_task(uuid, boolean, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.foundash_ops_add_expense(date, text, text, numeric, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.foundash_ops_delete_expense(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.foundash_ops_set_contact_notes(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.foundash_ops_set_payment(boolean) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.foundash_ops_get() TO authenticated;
GRANT EXECUTE ON FUNCTION public.foundash_ops_set_task(uuid, boolean, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.foundash_ops_add_expense(date, text, text, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.foundash_ops_delete_expense(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.foundash_ops_set_contact_notes(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.foundash_ops_set_payment(boolean) TO authenticated;
