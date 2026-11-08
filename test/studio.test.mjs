import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { once } from 'node:events';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));

test('studio routes picks through the runner and gates the live editor export', { timeout: 15000 }, async (t) => {
  const data = mkdtempSync(join(tmpdir(), 'bambinos-studio-'));
  for (const dir of ['assets/transcripts', 'assets/videos', 'runs']) mkdirSync(join(data, dir), { recursive: true });
  copyFileSync(join(root, 'examples/synthetic.vtt'), join(data, 'assets/transcripts/demo.vtt'));
  execFileSync('ffmpeg', [
    '-nostdin', '-v', 'error', '-f', 'lavfi', '-i', 'color=green:s=160x90:r=10',
    '-f', 'lavfi', '-i', 'sine=frequency=440', '-t', '20', '-c:v', 'libx264',
    '-c:a', 'aac', join(data, 'assets/videos/demo.mp4'),
  ]);
  const server = spawn(process.execPath, [join(root, 'studio.mjs')], {
    env: { ...process.env, BAMBINOS_PORT: '0', BAMBINOS_DATA_DIR: data },
  });
  const exited = once(server, 'exit');
  t.after(async () => {
    server.kill();
    await exited;
    rmSync(data, { recursive: true, force: true });
  });
  const [start] = await Promise.race([
    once(server.stdout, 'data'),
    exited.then(() => { throw new Error('Studio could not start.'); }),
  ]);
  const base = start.toString().match(/http:\/\/127\.0\.0\.1:\d+/)[0];
  const get = (route, options) => fetch(base + route, options);
  const post = (route, body, origin = base) => get(route, {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  assert.match(await (await get('/')).text(), /href="\/dashboard"/);
  assert.equal((await post('/api/run', {}, 'https://example.test')).status, 403);
  let page = '';
  for (let i = 0; i < 40 && !page.includes('Awaiting prompt results'); i++) {
    page = await (await get('/dashboard')).text();
    if (!page.includes('Awaiting prompt results')) await setTimeout(50);
  }
  assert.match(page, /Awaiting prompt results/);
  const prompt = page.match(/href="([^"]*prompts\/demo-1\.txt)"/)[1];
  assert.match(await (await get(prompt)).text(), /Transcript input \(JSON\)/);
  const picks = JSON.parse(readFileSync(join(root, 'examples/synthetic-picks.json'), 'utf8'));
  assert.equal((await post('/api/picks', { session: 'demo', picks: [{}] })).status, 422);
  assert.deepEqual(await (await post('/api/picks', { session: 'demo', picks })).json(), { accepted: 1, rejected: 0 });
  const runResponse = await post('/api/run', {});
  assert.equal(runResponse.status, 200);
  const { run } = await runResponse.json();
  const manifest = await (await get(`/runs/${run}/run.json`)).json();
  const [candidate] = manifest.sessions[0].reviewQueue;
  const range = await get(`/runs/${run}/${candidate.preview.file}`, { headers: { Range: 'bytes=0-63' } });
  assert.equal(range.status, 206);
  assert.equal((await range.arrayBuffer()).byteLength, 64);
  assert.doesNotMatch(await (await get('/editor-handoff.csv')).text(), /Half or quarter/);
  const decision = {
    status: 'review', reviewer: 'Test reviewer', notes: 'Synthetic fixture', rightsReference: 'TEST',
    visual: 'pass', audio: 'pass', soundOff: 'pass', privacy: 'pass', rights: 'pass',
  };
  assert.deepEqual(await (await post('/api/review', { id: candidate.id, decision })).json(), { status: 'ready' });
  assert.match(await (await get('/dashboard')).text(), /Ready for edit/);
  assert.match(await (await get('/editor-handoff.csv')).text(), /Half or quarter/);
  assert.deepEqual(await (await post('/api/review', {
    id: candidate.id, decision: { status: 'rejected', reviewer: 'Test reviewer', reason: 'Fictional rejection' },
  })).json(), { status: 'rejected' });
  assert.doesNotMatch(await (await get('/editor-handoff.csv')).text(), /Half or quarter/);
});
