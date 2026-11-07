import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { parseVtt, prepare, validate } from '../pipeline.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const fixture = join(root, 'examples', 'synthetic.vtt');
const pick = JSON.parse(readFileSync(join(root, 'examples', 'synthetic-picks.json'), 'utf8'))[0];

test('validation preserves source dialogue and rejects invalid or duplicate picks', () => {
  const cues = parseVtt(fixture);
  const { reviewQueue, rejected } = validate(cues, [pick, pick, { ...pick, endCue: 1 }, null]);
  assert.equal(reviewQueue.length, 1);
  assert.equal(reviewQueue[0].dialogue, cues.map((cue) => cue.text).join('\n'));
  assert.equal(reviewQueue[0].durationSeconds, 12);
  assert.equal(reviewQueue[0].score, 10);
  assert.deepEqual(rejected.map(({ reason }) => reason).sort(), [
    'Invalid 10–20 second cue window', 'Invalid cue range', 'Overlapping window',
  ]);
  assert.deepEqual(validate(cues, []), { reviewQueue: [], rejected: [] });
});

test('batches include valid cuts that straddle the boundary', () => {
  const cues = Array.from({ length: 90 }, (_, index) => ({
    id: index + 1,
    start: `01:${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}.000`,
    end: `01:${String(Math.floor((index + 1) / 60)).padStart(2, '0')}:${String((index + 1) % 60).padStart(2, '0')}.000`,
    text: 'Fixture',
  }));
  const batches = prepare(cues, 'fixture');
  assert.equal(batches.length, 2);
  assert.deepEqual(batches[0].cues.slice(78, 89).map(({ id }) => id),
    Array.from({ length: 11 }, (_, index) => index + 79));
  assert.equal(batches[1].cues[0].id, 81);
});

test('run renders playable evidence and gates the CSV on current decisions', (t) => {
  const temp = mkdtempSync(join(tmpdir(), 'bambinos-test-'));
  t.after(() => rmSync(temp, { recursive: true, force: true }));
  for (const folder of ['transcripts', 'picks', 'videos', 'output']) mkdirSync(join(temp, folder));
  const transcript = join(temp, 'transcripts', 'fixture.vtt');
  copyFileSync(fixture, transcript);
  writeFileSync(join(temp, 'transcripts', 'unmined.vtt'), 'WEBVTT\n');
  writeFileSync(join(temp, 'picks', 'fixture-picks.json'), JSON.stringify([{ ...pick, hook: '=1+1 <unsafe>' }]));
  execFileSync('ffmpeg', [
    '-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=160x90:r=10',
    '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=16000',
    '-t', '20', '-c:v', 'libx264', '-c:a', 'aac', join(temp, 'videos', 'fixture.mp4'),
  ]);

  const reviews = join(temp, 'decisions.json');
  const run = (useReviews = false) => {
    const stdout = execFileSync(process.execPath, [
      join(root, 'run.mjs'), '--transcripts', join(temp, 'transcripts'),
      '--picks', join(temp, 'picks'), '--videos', join(temp, 'videos'),
      '--output', join(temp, 'output'), ...(useReviews ? ['--reviews', reviews] : []),
    ], { encoding: 'utf8' });
    const dir = dirname(stdout.trim().split('\n').at(-1));
    const read = (file) => readFileSync(join(dir, file), 'utf8');
    const result = JSON.parse(read('run.json'));
    return { dir, read, result, candidate: result.sessions[0].reviewQueue[0] };
  };

  const initial = run();
  const { id, preview } = initial.candidate;
  assert.equal(initial.candidate.review.status, 'pending');
  assert.equal(initial.result.sessions[1].status, 'awaiting-picks');
  assert.equal(initial.result.sessions[1].cues, 0);
  assert.equal(preview.cutStart, 5);
  assert.equal(preview.duration, 19);
  assert.match(initial.read('index.html'), /&lt;unsafe&gt;/);
  assert.doesNotMatch(initial.read('index.html'), /<unsafe>/);
  assert.match(initial.read('prompts/fixture-1.txt'), /Transcript input \(JSON\)/);
  assert.doesNotMatch(initial.read('editor-handoff.csv'), /fixture/);
  const codec = execFileSync('ffprobe', [
    '-v', 'error', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', join(initial.dir, preview.file),
  ], { encoding: 'utf8' });
  assert.match(codec, /h264\s+aac/);

  const complete = {
    status: 'review', reviewer: 'Synthetic reviewer', notes: 'Fictional test only',
    visual: 'pass', audio: 'pass', soundOff: 'pass', privacy: 'pass', rights: 'pass',
    rightsReference: 'Synthetic fixture',
  };
  writeFileSync(reviews, JSON.stringify({ [id]: { ...complete, rightsReference: '' } }));
  assert.equal(run(true).candidate.review.status, 'pending');
  writeFileSync(reviews, JSON.stringify({ [id]: complete }));
  const approved = run(true);
  assert.equal(approved.candidate.id, id);
  assert.equal(approved.candidate.review.status, 'ready');
  assert.match(approved.read('editor-handoff.csv'), /"'=1\+1 <unsafe>"/);

  writeFileSync(reviews, JSON.stringify({
    [id]: { status: 'rejected', reviewer: 'Synthetic reviewer', reason: 'Fixture rejection' },
  }));
  assert.equal(run(true).candidate.review.status, 'rejected');

  writeFileSync(reviews, JSON.stringify({ [id]: complete }));
  writeFileSync(transcript, readFileSync(transcript, 'utf8').replace('Exactly.', 'Correct.'));
  const changed = run(true);
  assert.deepEqual(changed.result.staleReviews, [id]);
  assert.equal(changed.candidate.review.status, 'pending');
  rmSync(join(temp, 'videos', 'fixture.mp4'));
  const noVideo = run();
  assert.match(noVideo.candidate.preview.issue, /missing/);
  assert.equal(noVideo.candidate.review.status, 'pending');
});
