-- Workout library starter seed (build 190)
-- Schema is already live. Run this in the Supabase SQL editor (service role /
-- dashboard) if you want system-owned rows (created_by null) or to clean up
-- test leftovers. The app also client-seeds missing starter names on first
-- signed-in browse via workout_library_insert_own (created_by = auth.uid()).
--
-- Note: workout_library currently has SELECT + INSERT RLS only — no UPDATE
-- or DELETE policies — so client apps cannot patch or remove rows.

-- Optional cleanup of agent probe leftover (safe if absent)
delete from workout_library where name = 'RLS Probe';

-- Starter protocols (skip any name that already exists)
insert into workout_library (category, name, description, created_by)
select s.category, s.name, s.description, null
from (values
  (
    'Hangboard',
    'Repeaters',
    $md$**Classic hangboard density.**

- Warm up thoroughly first
- 7 seconds on / 3 seconds off × 6 reps
- Rest 3 minutes, then next grip
- 6 grips × 2 sets

- [ ] Warm-up complete
- [ ] Set 1 done
- [ ] Set 2 done$md$
  ),
  (
    'Hangboard',
    '3x6x9',
    $md$**Density hangs for max force.**

- Pick a grip you can hang about 10-12 seconds fresh
- 3 hangs of 6-9 seconds
- Full rest (2-3 min) between hangs
- 1-2 grips per session

- [ ] Grip 1 complete
- [ ] Grip 2 complete (optional)$md$
  ),
  (
    'Hangboard',
    'Max Hang',
    $md$**Near-failure hangs for peak finger strength.**

- Single hangs of 7-12 seconds near failure
- 3-5 sets per grip
- 3-5 minutes rest between sets
- Stop if form breaks or pain shows up

- [ ] Warm-up complete
- [ ] Working sets logged$md$
  ),
  (
    'Boulder circuits',
    '4x4',
    $md$**Power-endurance classic.**

- Choose 4 problems about 2 grades under your limit
- Climb each once, short rest between problems
- Rest 4-5 minutes, then repeat the set
- 4 sets total

- [ ] Set 1
- [ ] Set 2
- [ ] Set 3
- [ ] Set 4$md$
  ),
  (
    'Boulder circuits',
    'Capacity',
    $md$**Aerobic power for longer boulder sessions.**

- 8-12 problems at easy-moderate intensity
- Move continuously or with minimal rest
- Keep heart rate working but form clean
- 1-2 rounds with full rest between rounds

- [ ] Round 1 complete
- [ ] Round 2 complete (optional)$md$
  ),
  (
    'Strength',
    'Spray-wall finger strength',
    $md$**Quality finger-strength moves on the spray wall.**

- Open-handed and half-crimp on small holds
- 4-6 hard moves per set
- Full rest between sets (2-3 min)
- 4-6 sets total. Stop when quality drops.

- [ ] Sets complete
- [ ] Notes on grips that felt weak$md$
  )
) as s(category, name, description)
where not exists (
  select 1 from workout_library w where w.name = s.name
);

-- Optional: normalize earlier agent-seeded descriptions to hyphen ranges
-- (requires running as a role that bypasses RLS, e.g. SQL editor)
update workout_library set description = replace(replace(description, '–', '-'), '—', '-')
where description like '%–%' or description like '%—%';
