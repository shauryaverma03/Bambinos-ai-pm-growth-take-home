import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, mkdtemp, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { basename, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { milliseconds, parseVttText, prepare, validate } from './pipeline.mjs';
import { renderReport, editorCsv, assess } from './review-output.mjs';

const digest = (value) => createHash('sha256').update(value).digest('hex');
const json = (value) => JSON.stringify(value, null, 2) + '\n';

async function readOptional(path) {
  try {
    return await readFile(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return undefined;
    throw error;
  }
}

async function hashVideo(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

function execute(binary, args) {
  const result = spawnSync(binary, args, { encoding: 'utf8' });
  if (result.error) throw new Error(`${binary}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${binary}: ${result.stderr.trim() || 'failed'}`);
  return result.stdout;
}

function probe(path) {
  const result = JSON.parse(execute('ffprobe', [
    '-v', 'error', '-show_entries', 'format=duration:stream=codec_type', '-of', 'json', path,
  ]));
  const duration = Number(result.format?.duration);
  if (!Number.isFinite(duration) || duration <= 0 ||
      !result.streams?.some((stream) => stream.codec_type === 'video')) {
    throw new Error(`Expected a playable video with a finite duration: ${path}`);
  }
  return { duration, audio: result.streams.some((stream) => stream.codec_type === 'audio') };
}

function makePreview(path, media, candidate, directory) {
  if (!media) return { issue: 'Matching recording is missing.' };
  const start = milliseconds(candidate.start) / 1000;
  const end = milliseconds(candidate.end) / 1000;
  if (end > media.duration) return { issue: 'Proposed cut runs past the recording.' };
  const offset = Math.max(0, start - 5);
  const duration = Math.min(media.duration, end + 5) - offset;
  const file = `previews/${candidate.id}.mp4`;
  execute('ffmpeg', [
    '-nostdin', '-v', 'error', '-ss', offset.toFixed(3), '-i', path,
    '-t', duration.toFixed(3), '-map', '0:v:0', '-map', '0:a:0?',
    '-vf', 'scale=min(960\\,iw):-2', '-c:v', 'libx264', '-preset', 'fast',
    '-crf', '23', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-movflags', '+faststart',
    join(directory, file),
  ]);
  return { file, audio: media.audio, offset, duration, cutStart: start - offset, cutEnd: end - offset };
}

async function run(options) {
  const transcriptDir = resolve(options.transcripts);
  const names = (await readdir(transcriptDir)).filter((file) => file.endsWith('.vtt')).sort();
  if (!names.length) throw new Error(`No .vtt files found in ${transcriptDir}.`);
  const prompt = await readFile(new URL('./prompts/moment-miner.md', import.meta.url), 'utf8');
  const decisions = options.reviews ? JSON.parse(await readFile(resolve(options.reviews), 'utf8')) : {};
  if (!decisions || typeof decisions !== 'object' || Array.isArray(decisions) ||
      Object.values(decisions).some((item) => !item || typeof item !== 'object' || Array.isArray(item))) {
    throw new Error('Expected a JSON object of review decisions keyed by candidate ID.');
  }

  const output = resolve(options.output);
  await mkdir(output, { recursive: true, mode: 0o700 });
  const staging = await mkdtemp(join(output, '.run-'));
  const runName = `run-${new Date().toISOString().replace(/[:.]/g, '-')}-${basename(staging).slice(5)}`;
  try {
    for (const name of ['prompts', 'previews', 'sessions']) await mkdir(join(staging, name));
    const sessions = [];
    const usedDecisions = new Set();
    const template = {};
    for (const name of names) {
      const session = basename(name, '.vtt');
      if (!/^[A-Za-z0-9_-]+$/.test(session)) throw new Error(`Unsupported session ID in ${name}.`);
      const transcript = await readFile(join(transcriptDir, name));
      const sourceHash = digest(transcript);
      const cues = parseVttText(transcript.toString('utf8'));
      const batches = prepare(cues, session);
      for (const batch of batches) {
        await writeFile(join(staging, 'prompts', `${session}-${batch.batch}.txt`),
          `${prompt.trim()}\n\nTranscript input (JSON)\n\n${json(batch)}`);
      }
      const picksName = `${session}-picks.json`;
      const override = options.overrides && await readOptional(join(resolve(options.overrides), picksName));
      const rawPicks = override ?? await readOptional(join(resolve(options.picks), picksName));
      let validated = { reviewQueue: [], rejected: [] };
      if (rawPicks !== undefined) {
        try {
          validated = validate(cues, JSON.parse(rawPicks));
        } catch (error) {
          throw new Error(`${session}-picks.json: ${error.message}`);
        }
      }
      const video = join(resolve(options.videos), `${session}.mp4`);
      let media;
      if (validated.reviewQueue.length) {
        try {
          const version = await stat(video);
          const hash = await hashVideo(video);
          media = { ...probe(video), hash, version };
        } catch (error) {
          if (error.code !== 'ENOENT') throw error;
        }
      }
      for (const candidate of validated.reviewQueue) {
        const identity = { ...candidate };
        delete identity.row;
        candidate.id = `${session}-${digest(JSON.stringify([sourceHash, media?.hash, identity]))}`;
        candidate.preview = makePreview(video, media, candidate, staging);
        const decision = decisions[candidate.id];
        if (decision) usedDecisions.add(candidate.id);
        candidate.review = assess(candidate, decision);
        candidate.visualStatus = decision?.visual ?? 'pending';
        candidate.rightsStatus = decision?.rights ?? 'pending';
        template[candidate.id] = decision ?? {
          status: 'review', reviewer: '', notes: '',
          visual: 'pending', audio: 'pending', soundOff: 'pending',
          privacy: 'pending', rights: 'pending', rightsReference: '',
        };
      }
      if (media) {
        const current = await stat(video);
        if (['dev', 'ino', 'size', 'mtimeMs', 'ctimeMs'].some((field) => current[field] !== media.version[field])) {
          throw new Error(`Recording changed during the run: ${video}. Run again once it is stable.`);
        }
      }
      const result = {
        session, sourceHash, videoHash: media?.hash, cues: cues.length, batches: batches.length,
        status: rawPicks === undefined ? 'awaiting-picks' : validated.reviewQueue.length ? 'candidates' : 'zero-candidates',
        ...validated,
      };
      sessions.push(result);
      await writeFile(join(staging, 'sessions', `${session}.json`), json(result));
    }
    const staleReviews = Object.keys(decisions).filter((id) => !usedDecisions.has(id));
    const rows = sessions.flatMap(({ session, reviewQueue }) => reviewQueue.map((candidate) => ({ session, ...candidate })));
    const ready = rows.filter((row) => row.review.status === 'ready');
    const summary = { run: runName, promptHash: digest(prompt), sessions, staleReviews };
    await writeFile(join(staging, 'run.json'), json(summary));
    await writeFile(join(staging, 'review-decisions.template.json'), json(template));
    await writeFile(join(staging, 'editor-handoff.csv'), editorCsv(ready));
    await writeFile(join(staging, 'index.html'), renderReport(summary, template));
    const final = join(output, runName);
    await rename(staging, final);
    console.log(`${sessions.length} sessions | ${rows.length} candidates | ${ready.length} ready for edit`);
    if (staleReviews.length) console.log(`${staleReviews.length} unmatched review decisions ignored. See run.json.`);
    console.log(join(final, 'index.html'));
  } catch (error) {
    await rm(staging, { force: true, recursive: true });
    throw error;
  }
}

try {
  const defaults = {
    transcripts: 'assets/transcripts', videos: 'assets/videos', picks: 'runs',
    output: 'runs', reviews: undefined, overrides: undefined,
  };
  const { values } = parseArgs({ options: Object.fromEntries(
    Object.entries(defaults).map(([name, value]) => [name, { type: 'string', default: value }]),
  ) });
  await run(values);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
