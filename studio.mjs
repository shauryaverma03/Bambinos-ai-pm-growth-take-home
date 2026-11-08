import { createServer } from 'node:http';
import { createReadStream, mkdirSync, readFileSync, readdirSync, renameSync, statSync, writeFileSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';
import { assess, editorCsv } from './review-output.mjs';
import { parseVtt, validate } from './pipeline.mjs';
import { home, dashboard } from './studio/pages.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const data = resolve(process.env.BAMBINOS_DATA_DIR ?? root);
const runs = join(data, 'runs');
const output = join(runs, 'studio-runs');
const picks = join(runs, 'studio-picks');
const decisionsPath = join(runs, 'studio-decisions.json');
const transcripts = join(data, 'assets/transcripts');
const port = Number(process.env.BAMBINOS_PORT ?? 4173);
const host = '127.0.0.1';
const idPattern = /^[A-Za-z0-9_-]+$/;
const runPattern = /^run-[0-9TZ-]+-[A-Za-z0-9]{6}$/;
const defaultDecision = {
  status: 'review', visual: 'pending', audio: 'pending', soundOff: 'pending',
  privacy: 'pending', rights: 'pending',
};
const fields = ['status', 'reviewer', 'notes', 'rightsReference', 'reason', 'visual', 'audio', 'soundOff', 'privacy', 'rights'];
const execute = promisify(execFile);
let running = false;
for (const dir of [output, picks]) mkdirSync(dir, { recursive: true, mode: 0o700 });

function getJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT' && fallback !== undefined) return fallback;
    throw error;
  }
}

function saveJson(path, value) {
  const temp = path + '.tmp';
  writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  renameSync(temp, path);
}

function currentRun() {
  const latest = readdirSync(output).filter((name) => runPattern.test(name)).sort().at(-1);
  return latest ? getJson(join(output, latest, 'run.json')) : null;
}

function rowsFor(run, decisions) {
  return run?.sessions.flatMap((session) => session.reviewQueue.map((candidate) => ({
    ...candidate, session: session.session, review: assess(candidate, decisions[candidate.id]),
  }))) ?? [];
}

function reply(res, code, body, type = 'application/json; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type });
  res.end(type.startsWith('application/json') ? JSON.stringify(body) : body);
}

function clientError(message, status = 400) {
  return Object.assign(new Error(message), { status });
}

async function payload(req) {
  if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] ?? '')) {
    throw clientError('Expected JSON.', 415);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) throw clientError('JSON is limited to 1 MB.', 413);
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error();
    return value;
  } catch {
    throw clientError('Expected a JSON object.');
  }
}

async function build() {
  if (running) throw clientError('The pipeline is already running.', 409);
  running = true;
  try {
    await execute(process.execPath, [
      join(root, 'run.mjs'), '--transcripts', transcripts, '--videos', join(data, 'assets/videos'),
      '--picks', runs, '--overrides', picks, '--output', output,
      ...(statSync(decisionsPath, { throwIfNoEntry: false }) ? ['--reviews', decisionsPath] : []),
    ], { cwd: root });
    return currentRun();
  } catch (error) {
    throw clientError(error.stderr?.trim() || 'The pipeline did not finish.', 422);
  } finally {
    running = false;
  }
}

async function sendFile(req, res, path, type) {
  const file = statSync(path, { throwIfNoEntry: false });
  if (!file?.isFile()) return reply(res, 404, { error: 'File not found.' });
  const size = file.size;
  const headers = { 'Content-Type': type, 'Content-Length': size };
  let bounds;
  if (type === 'video/mp4') {
    headers['Accept-Ranges'] = 'bytes';
    const range = req.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      const start = match?.[1] ? Number(match[1]) : Math.max(0, size - Number(match?.[2]));
      const end = match?.[1] && match[2] ? Math.min(size - 1, Number(match[2])) : size - 1;
      if (!match || (!match[1] && !match[2]) || !Number.isSafeInteger(start) || start > end) {
        res.writeHead(416, { 'Content-Range': `bytes */${size}` });
        return res.end();
      }
      headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
      headers['Content-Length'] = end - start + 1;
      bounds = { start, end };
    }
  }
  res.writeHead(bounds ? 206 : 200, headers);
  if (req.method === 'HEAD') return res.end();
  await pipeline(createReadStream(path, bounds), res);
}

const server = createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Content-Security-Policy', "default-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  const origin = `http://${host}:${server.address().port}`;
  try {
    if (req.headers.host !== new URL(origin).host) return reply(res, 403, { error: 'Open this workspace at its printed local address.' });
    const url = new URL(req.url, origin);
    const route = url.pathname;
    if (req.method === 'POST') {
      if (req.headers.origin !== origin) throw clientError('This request must come from the local workspace.', 403);
      const body = await payload(req);
      if (route === '/api/run') {
        const run = await build();
        return reply(res, 200, { run: run.run });
      }
      if (running) throw clientError('Wait for the pipeline run to finish.', 409);
      if (route === '/api/picks') {
        if (typeof body.session !== 'string' || !idPattern.test(body.session) || !Array.isArray(body.picks)) {
          throw clientError('Choose a session and a JSON array of picks.');
        }
        const transcript = join(transcripts, `${body.session}.vtt`);
        if (!statSync(transcript, { throwIfNoEntry: false })?.isFile()) throw clientError('Session transcript not found.', 404);
        const validated = validate(parseVtt(transcript), body.picks);
        if (body.picks.length && !validated.reviewQueue.length) {
          throw clientError(validated.rejected[0]?.reason ?? 'No valid picks. Use [] to record an intentional zero-pick result.', 422);
        }
        saveJson(join(picks, `${body.session}-picks.json`), body.picks);
        return reply(res, 200, { accepted: validated.reviewQueue.length, rejected: validated.rejected.length });
      }
      if (route === '/api/review') {
        const candidate = rowsFor(currentRun(), {}).find((row) => row.id === body.id);
        if (!candidate) throw clientError('This candidate changed. Refresh the dashboard before saving.', 409);
        const input = body.decision;
        if (!input || typeof input !== 'object' || Array.isArray(input) ||
            Object.entries(input).some(([key, value]) => !fields.includes(key) || typeof value !== 'string' || value.length > 4000)) {
          throw clientError('Enter a valid review decision.');
        }
        let review;
        try {
          review = assess(candidate, input);
        } catch (error) {
          throw clientError(error.message.replace(` for ${candidate.id}`, ''), 422);
        }
        const decisions = getJson(decisionsPath, {});
        decisions[candidate.id] = input;
        saveJson(decisionsPath, decisions);
        return reply(res, 200, { status: review.status });
      }
      return reply(res, 404, { error: 'Unknown action.' });
    }
    if (!['GET', 'HEAD'].includes(req.method)) return reply(res, 405, { error: 'Method not allowed.' });

    const staticFiles = { '/studio.css': ['studio.css', 'text/css'], '/studio.js': ['client.js', 'text/javascript'] };
    if (Object.hasOwn(staticFiles, route)) {
      const [name, type] = staticFiles[route];
      return await sendFile(req, res, join(root, 'studio', name), type);
    }
    const artifact = /^\/runs\/([^/]+)\/(run\.json|(?:previews|prompts|sessions)\/[A-Za-z0-9_-]+\.(?:mp4|txt|json))$/.exec(route);
    if (artifact && runPattern.test(artifact[1])) {
      const type = artifact[2].endsWith('.mp4') ? 'video/mp4' :
        artifact[2].endsWith('.txt') ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8';
      return await sendFile(req, res, join(output, artifact[1], artifact[2]), type);
    }
    if (route === '/') return reply(res, 200, home(), 'text/html; charset=utf-8');
    if (route === '/dashboard' || route === '/editor-handoff.csv') {
      const run = currentRun();
      const decisions = getJson(decisionsPath, {});
      const rows = rowsFor(run, decisions);
      if (route === '/editor-handoff.csv') {
        res.setHeader('Content-Disposition', 'attachment; filename="editor-handoff.csv"');
        return reply(res, 200, editorCsv(rows.filter((row) => row.review.status === 'ready')), 'text/csv; charset=utf-8');
      }
      return reply(res, 200, dashboard({ run, rows, decisions, defaultDecision }), 'text/html; charset=utf-8');
    }
    return reply(res, 404, { error: 'Page not found.' });
  } catch (error) {
    if (res.destroyed || res.headersSent) return;
    if (!error.status) console.error(error.message);
    return reply(res, error.status ?? 500, { error: error.status ? error.message : 'Unable to complete this request. Check the terminal for details.' });
  }
});

server.listen(port, host, () => {
  console.log(`Bambinos Clip Studio: http://${host}:${server.address().port}`);
  if (!currentRun()) build().catch((error) => console.error(error.message));
});
