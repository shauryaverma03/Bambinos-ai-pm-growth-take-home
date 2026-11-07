import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const dimensions = ['hook', 'evidence', 'payoff', 'clarity', 'relevance'];
const buckets = [
  'Student explanation', 'Misconception repaired', 'Skill in action',
  'Transfer to everyday life', 'Curiosity and discovery',
];
const markets = ['India', 'US', 'GCC'];
const hasText = (value) => typeof value === 'string' && value.trim().length > 0;

export function milliseconds(timestamp) {
  const [seconds, minutes, hours = 0] = timestamp.split(':').reverse().map(Number);
  return Math.round((hours * 3600 + minutes * 60 + seconds) * 1000);
}

export function parseVtt(path) {
  return parseVttText(readFileSync(path, 'utf8'));
}

export function parseVttText(input) {
  const source = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  if (!/^WEBVTT(?:[ \t].*)?(?:\n|$)/.test(source)) throw new Error('Expected a WEBVTT file.');
  const timing = /^((?:\d{2,}:)?[0-5]\d:[0-5]\d\.\d{3})[ \t]+-->[ \t]+((?:\d{2,}:)?[0-5]\d:[0-5]\d\.\d{3})(?:[ \t].*)?$/;
  const cues = [];
  for (const block of source.split(/\n(?:[ \t]*\n)+/).slice(1)) {
    if (!block.trim()) continue;
    if (/^(?:NOTE|STYLE|REGION)(?:\s|$)/.test(block)) continue;
    const lines = block.replace(/\n$/, '').split('\n');
    const index = lines[0].includes('-->') ? 0 : 1;
    const match = timing.exec(lines[index] ?? '');
    const dialogue = lines.slice(index + 1).join('\n');
    if (!match || !hasText(dialogue)) throw new Error(`Malformed cue at index ${cues.length + 1}.`);
    const [, start, end] = match;
    if (milliseconds(end) < milliseconds(start) ||
        (cues.length && milliseconds(start) < milliseconds(cues.at(-1).start))) {
      throw new Error(`Invalid timing at cue ${cues.length + 1}.`);
    }
    cues.push({ id: cues.length + 1, start, end, text: dialogue });
  }
  return cues;
}

export function prepare(cues, session) {
  const batches = [];
  for (let start = 0; start < cues.length; start += 80) {
    const batch = cues.slice(start, start + 80);
    const boundary = milliseconds(batch.at(-1).start) + 20_000;
    for (let next = start + 80; next < cues.length && milliseconds(cues[next].start) <= boundary; next++) {
      batch.push(cues[next]);
    }
    batches.push({ session, batch: batches.length + 1, cues: batch });
  }
  return batches;
}

export function validate(cues, picks) {
  if (!Array.isArray(picks)) throw new Error('Expected an array of candidates.');
  const accepted = [];
  const rejected = [];
  for (const [index, pick] of picks.entries()) {
    const reject = (reason) => rejected.push({ row: index + 1, reason });
    const first = pick?.startCue;
    const last = pick?.endCue;
    if (!Number.isInteger(first) || !Number.isInteger(last) || first < 1 || last < first || last > cues.length) {
      reject('Invalid cue range');
      continue;
    }
    const selected = cues.slice(first - 1, last);
    const start = selected[0].start;
    const end = selected.at(-1).end;
    const duration = milliseconds(end) - milliseconds(start);
    if (duration < 10_000 || duration > 20_000 || selected.some((cue) => milliseconds(cue.end) > milliseconds(end))) {
      reject('Invalid 10–20 second cue window');
      continue;
    }
    const values = dimensions.map((key) => pick.scores?.[key]);
    if (!values.every((score) => score === 1 || score === 2)) {
      reject('Each score must be 1 or 2');
      continue;
    }
    const score = values.reduce((sum, value) => sum + value, 0);
    if (score < 8 || !buckets.includes(pick.bucket) || !hasText(pick.hook) || [...pick.hook].length > 45 ||
        !markets.every((market) => hasText(pick.geography?.[market])) ||
        !Array.isArray(pick.flags) || !pick.flags.every(hasText) ||
        !hasText(pick.visualCheck) || !hasText(pick.editorNotes)) {
      reject('Missing brief fields, unknown bucket, long hook or score below 8');
      continue;
    }
    const timingFlags = [];
    if (selected.some((cue) => milliseconds(cue.start) === milliseconds(cue.end))) {
      timingFlags.push('Zero-duration source cue. Verify against audio.');
    }
    if (cues.slice(0, first - 1).some((cue) => milliseconds(cue.end) > milliseconds(start)) ||
        (cues[last] && milliseconds(cues[last].start) < milliseconds(end))) {
      timingFlags.push('Adjacent transcript cue overlaps the cut. Verify audio and captions.');
    }
    accepted.push({
      row: index + 1, startCue: first, endCue: last, start, end,
      durationSeconds: duration / 1000, hook: pick.hook, bucket: pick.bucket,
      dialogue: selected.map((cue) => cue.text).join('\n'),
      scores: pick.scores, score, geography: pick.geography,
      flags: [...pick.flags, ...timingFlags], visualCheck: pick.visualCheck, editorNotes: pick.editorNotes,
      visualStatus: 'pending', rightsStatus: 'pending',
    });
  }
  accepted.sort((a, b) => b.score - a.score || a.startCue - b.startCue || a.endCue - b.endCue);
  const reviewQueue = [];
  for (const candidate of accepted) {
    const overlaps = reviewQueue.some((item) =>
      milliseconds(candidate.start) < milliseconds(item.end) &&
      milliseconds(item.start) < milliseconds(candidate.end));
    if (overlaps || reviewQueue.length === 3) {
      rejected.push({ row: candidate.row, reason: overlaps ? 'Overlapping window' : 'Session cap' });
    } else {
      reviewQueue.push(candidate);
    }
  }
  return { reviewQueue, rejected };
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  try {
    const [command, path, argument] = process.argv.slice(2);
    if (!['prepare', 'validate'].includes(command) || !path || !argument) {
      throw new Error('Usage: node pipeline.mjs prepare input.vtt SESSION_ID | validate input.vtt picks.json');
    }
    const cues = parseVtt(path);
    const result = command === 'prepare'
      ? prepare(cues, argument)
      : validate(cues, JSON.parse(readFileSync(argument, 'utf8')));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
