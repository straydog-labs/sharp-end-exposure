import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import assert from 'assert';
import vm from 'vm';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dash = readFileSync(join(root, 'coach-dashboard.html'), 'utf8');
const sql = readFileSync(join(root, 'sql/coach-note-patterns.sql'), 'utf8');

assert.ok(/create table if not exists public\.coach_pattern_tags/.test(sql));
assert.ok(/label text not null unique/.test(sql));
assert.ok(/create table if not exists public\.coach_athlete_note_patterns/.test(sql));
assert.ok(/kind text not null check \(kind in \('dominant','secondary','breath','cue'\)\)/.test(sql));
assert.ok(/on delete cascade/.test(sql));
assert.ok(/add column if not exists note_type text not null default 'general'/.test(sql));
assert.ok(/note_type in \('general','call','video_review'\)/.test(sql));
assert.ok(/is_coach = true/.test(sql));
assert.ok(/coach_id = auth\.uid\(\)/.test(sql));
assert.ok(!/update public\.coach_athlete_notes/.test(sql), 'no backfill of existing notes');
assert.ok(!/set note_type/.test(sql));

assert.ok(/data-note-type="general"/.test(dash));
assert.ok(/data-note-type="call"/.test(dash));
assert.ok(/data-note-type="video_review"/.test(dash));
assert.ok(/id="coach-note-video-fields" style="display:none;"/.test(dash));
assert.ok(/Dominant pattern/.test(dash));
assert.ok(/Secondary pattern/.test(dash));
assert.ok(/'Breath'/.test(dash));
assert.ok(/Technique cues/.test(dash));
assert.ok(/id="coach-note-add-cue"/.test(dash) && /\+ Add cue/.test(dash));
assert.ok(/＋ new tag/.test(dash));
assert.ok(/data-add-tag/.test(dash) && /Add tag/.test(dash));
assert.ok(/Video \/ session notes/.test(dash));
assert.ok(/id="coach-note-body" rows="12"/.test(dash));
assert.ok(/id="coach-note-title"/.test(dash));
assert.ok(/Recurring patterns/.test(dash));
assert.ok(/function tallyCoachNotePatterns\(/.test(dash));
assert.ok(/function insertCoachAthleteNoteAfterSave\(/.test(dash));
assert.ok(/function addCoachPatternTagInline\(/.test(dash));
assert.ok(/function ensureCoachPatternTag\(/.test(dash));

const generalItem = dash.match(/if\(type === 'general'\)\{[\s\S]*?return '<div class="coach-note-item">[\s\S]*?<\/div>';/);
assert.ok(generalItem, 'general notes keep the legacy item template');
assert.ok(/escapeHtml\(n\.title \|\| 'Untitled'\)/.test(generalItem[0]));
assert.ok(/escapeHtml\(n\.body \|\| ''\)/.test(generalItem[0]));
assert.ok(!/coach-note-type-chip/.test(generalItem[0]), 'general notes have no type chip');
assert.ok(!/coachNotePatternsViewHtml/.test(generalItem[0]));

const saveFnStart = dash.indexOf('async function saveNewCoachAthleteNote(');
const saveFnEnd = dash.indexOf('function wireCoachAthleteNoteActions(', saveFnStart);
const saveFn = dash.slice(saveFnStart, saveFnEnd);
assert.ok(/insertCoachAthleteNoteAfterSave\(saved, type, drafts\)/.test(saveFn));
assert.ok(!/reloadCoachAthleteNotes\(/.test(saveFn), 'save updates cache in place, no list reload');
assert.ok(!/loadAthleteCoachNotes\(/.test(saveFn));
assert.ok(/note_type: type/.test(saveFn));
assert.ok(/coach_athlete_note_patterns/.test(saveFn));

const insertStart = dash.indexOf('function insertCoachAthleteNoteAfterSave(');
const insertEnd = dash.indexOf('function renderCoachAthleteNotes(', insertStart);
const insertFn = dash.slice(insertStart, insertEnd);
assert.ok(/renderCoachAthleteNotes\(el, _coachAthleteNotesCache\)/.test(insertFn));
assert.ok(!/reloadCoachAthleteNotes\(/.test(insertFn));
assert.ok(!/loadAthleteCoachNotes\(/.test(insertFn));

function extractFn(src, name){
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start >= 0, name + ' missing');
  let i = src.indexOf('{', start);
  let depth = 0;
  for(; i < src.length; i++){
    if(src[i] === '{') depth++;
    else if(src[i] === '}'){
      depth--;
      if(depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error('unclosed ' + name);
}

const ctx = {
  _coachPatternTagsCache: [
    { id: 't-foot', label: 'Footwork placement' },
    { id: 't-hip', label: 'Hips in' }
  ]
};
vm.createContext(ctx);
vm.runInContext(extractFn(dash, 'coachNotePatternLabel', 'tallyCoachNotePatterns'), ctx);
vm.runInContext(extractFn(dash, 'tallyCoachNotePatterns', 'coachNotePatternsStripHtml'), ctx);

const tallied = vm.runInContext(`tallyCoachNotePatterns([
  {
    note_type: 'general',
    coach_athlete_note_patterns: []
  },
  {
    note_type: 'video_review',
    coach_athlete_note_patterns: [
      { kind: 'dominant', tag_id: 't-foot', coach_pattern_tags: { label: 'Footwork placement' } },
      { kind: 'secondary', tag_id: 't-hip', coach_pattern_tags: { label: 'Hips in' } },
      { kind: 'breath', tag_id: 't-foot', coach_pattern_tags: { label: 'Footwork placement' } },
      { kind: 'cue', tag_id: 't-foot', coach_pattern_tags: { label: 'Footwork placement' } }
    ]
  },
  {
    note_type: 'video_review',
    coach_athlete_note_patterns: [
      { kind: 'dominant', coach_pattern_tags: { label: 'Footwork placement' } },
      { kind: 'cue', coach_pattern_tags: { label: 'Quiet feet' } }
    ]
  }
])`, ctx);

assert.strictEqual(tallied[0].label, 'Footwork placement');
assert.strictEqual(tallied[0].count, 3, 'dominant + cue + later dominant; breath excluded');
assert.strictEqual(tallied.length, 3);
assert.ok(tallied.some(function(t){ return t.label === 'Hips in' && t.count === 1; }));
assert.ok(tallied.some(function(t){ return t.label === 'Quiet feet' && t.count === 1; }));

const empty = vm.runInContext('tallyCoachNotePatterns([{ note_type: "general", body: "old", coach_athlete_note_patterns: [] }])', ctx);
assert.ok(Array.isArray(empty) && empty.length === 0, 'old general notes do not invent patterns');

console.log('coach-note-patterns tests: ok');
