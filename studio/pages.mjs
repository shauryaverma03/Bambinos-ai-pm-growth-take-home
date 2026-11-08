import { card, escape, statusText } from '../review-output.mjs';

const arrow = '<span aria-hidden="true">↗</span>';
const logo = '<a class="brand" href="/"><span class="brand-icon" aria-hidden="true">▶</span><span>Bambinos<span class="brand-studio"> / CLIP STUDIO</span></span></a>';
const workflow = [
  ['01', 'Prepare transcripts', 'Split timestamped class transcripts into overlapping prompt batches.'],
  ['02', 'Validate AI picks', 'Import candidate JSON. Check timing and scores, then remove overlapping picks.'],
  ['03', 'Review the footage', 'Play the proposed cut and its context. Record what you hear and see.'],
  ['04', 'Hand off to editors', 'Export briefs after every review check passes and rights are documented.'],
];

function shell(title, body, kind) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title} · Bambinos Clip Studio</title><link rel="stylesheet" href="/studio.css">
<script defer src="/studio.js"></script></head><body class="${kind}">${body}</body></html>`;
}

export function home() {
  return shell('Home', `
<header class="home-nav"><div class="site-width nav-inner">${logo}
  <nav aria-label="Main"><a class="nav-workflow" href="#workflow">How it works</a><a class="button primary" href="/dashboard">Open dashboard ${arrow}</a></nav>
</div></header>
<main class="site-width">
  <section class="landing-hero" aria-labelledby="home-title">
    <div class="hero-copy">
      <p class="kicker"><span></span> CLASSROOM-TO-CREATIVE WORKFLOW</p>
      <h1 id="home-title">Find the teachable moment worth sharing.</h1>
      <p>Turn live-class recordings and transcripts into short, evidence-backed ad briefs. Review the footage, document approvals, and hand editors a cut they can work with.</p>
      <a class="button primary" href="/dashboard">Open dashboard ${arrow}</a>
    </div>
    <div class="hero-visual" aria-label="Illustration of a short cut on a classroom timeline">
      <div class="monitor"><div class="monitor-head"><span><i></i> EXAMPLE CUT</span><span>01 / 04</span></div>
      <div class="film"><span class="film-label">SCIENCE CLASS</span><strong>Where does a tractor get its energy?</strong><span class="film-play" aria-hidden="true">▶</span></div>
      <div class="timeline" aria-hidden="true"><span></span><span></span><span class="selected"></span><span></span><span></span><span></span></div>
      <div class="time-label"><span>CONTEXT</span><span>14.7 SEC CUT</span><span>CONTEXT</span></div></div>
    </div>
  </section>
  <div class="hero-strip"><div><b>10–20 sec</b><span>Target clip length</span></div><div><b>5 checks</b><span>Required for handoff</span></div><div><b>One brief</b><span>Source dialogue, hook and edit notes</span></div></div>
  <section id="workflow" class="home-section"><div class="section-heading"><p class="kicker">THE WORKFLOW</p><h2>From class to cut</h2><p>The AI prompt proposes moments. A human reviewer checks the footage and decides what goes to editors.</p></div>
    <ol class="steps">${workflow.map(([number, title, copy]) => `<li><span>${number}</span><h3>${title}</h3><p>${copy}</p></li>`).join('')}</ol>
  </section>
  <section class="home-callout"><div><p class="kicker">THE LOCAL WORKSPACE</p><h2>See the official sample run.</h2><p>Explore the sessions, watch a candidate, and inspect its brief and review checks.</p></div><a class="button primary" href="/dashboard">Go to dashboard ${arrow}</a></section>
</main>
<footer class="site-width home-footer"><span>Bambinos Clip Studio</span><span>Local assessment workspace</span></footer>
`, 'home');
}

export function dashboard({ run, rows, decisions, defaultDecision }) {
  const sessions = run?.sessions ?? [];
  const mediaBase = run ? `/runs/${escape(run.run)}/` : '';
  const stats = [
    ['Sessions', sessions.length, 'Transcripts processed'],
    ['Candidates', rows.length, 'Validated clip briefs'],
    ['Pending review', rows.filter((row) => row.review.status === 'pending').length, 'Awaiting reviewer checks'],
    ['Ready for edit', rows.filter((row) => row.review.status === 'ready').length, 'Included in editor export'],
  ];
  return shell('Dashboard', `
<div class="workspace">
  <aside class="sidebar">${logo}<div class="sidebar-nav"><p>WORKSPACE</p>
    <a href="#overview">Overview</a><a href="#queue">Candidate queue</a><a href="#inputs">Prompt inputs</a><a href="#handoff">Editor handoff</a>
  </div><a class="back-home" href="/">← Back to home</a></aside>
  <main id="overview" class="dashboard">
    <div class="topline"><span>WORKSPACE / OVERVIEW</span><span class="local-pill">● Local workspace</span></div>
    <div class="dash-heading"><div><p class="kicker">REVIEW WORKSPACE</p><h1>Clip dashboard</h1><p>Validate class moments, review the footage, and prepare editor briefs.</p></div>
      <button class="primary" id="run-pipeline">Run pipeline ${arrow}</button></div>
    <p class="feedback" id="pipeline-message" role="status">${run ? 'Latest run loaded.' : 'Run the pipeline to prepare the session inputs.'}</p>
    <div class="stats">${stats.map(([title, value, copy]) => `<div><span>${title}</span><strong>${value}</strong><small>${copy}</small></div>`).join('')}</div>
    <section id="queue">
      <div class="section-heading"><p class="kicker">01 / REVIEW</p><h2>Candidate queue</h2><p>Check the source footage and save a decision for each candidate.</p></div>
      ${run ? `<div class="filters"><label>Session <select id="session-filter"><option value="">All sessions</option>${sessions.map(({ session }) => `<option value="${escape(session)}">${escape(session)}</option>`).join('')}</select></label>
        <label>Status <select id="status-filter"><option value="">All statuses</option><option value="pending">Pending review</option><option value="ready">Ready for edit</option><option value="rejected">Rejected</option></select></label></div>` : ''}
      ${rows.map((row) => `<div class="queue-item" id="${escape(row.id)}" data-session="${escape(row.session)}" data-status="${row.review.status}">
        <div class="clip-session">${escape(row.session.replace('_', ' · '))}</div>
        ${card(row, decisions[row.id] ?? defaultDecision, { mediaBase, save: true })}</div>`).join('')}
      <p id="queue-empty" class="empty" ${rows.length ? 'hidden' : ''}>No candidates match this view. Check session results or import new picks.</p>
    </section>
    <section id="inputs">
      <div class="section-heading"><p class="kicker">02 / INPUTS</p><h2>Prompt inputs and picks</h2><p>Open a batch in your approved AI workspace. Combine each session’s results into a JSON array and import it here.</p></div>
      <div class="input-panel">
        <div class="session-list">${sessions.length ? sessions.map((session) => `<details><summary><strong>${escape(session.session.replace('_', ' · '))}</strong>
          <span>${statusText[session.status]} · ${session.cues} cues</span></summary><div class="batch-links">
          ${Array.from({ length: session.batches }, (_, i) => `<a href="${mediaBase}prompts/${escape(session.session)}-${i + 1}.txt" target="_blank" rel="noopener">Batch ${i + 1} ${arrow}</a>`).join('')}
          <a href="${mediaBase}sessions/${escape(session.session)}.json" target="_blank" rel="noopener">Session JSON ${arrow}</a>
          </div>${session.rejected.length ? `<ul>${session.rejected.map(({ row, reason }) => `<li>Row ${row} · ${escape(reason)}</li>`).join('')}</ul>` : ''}</details>`).join('') : '<p>Run the pipeline to list prompt batches.</p>'}</div>
        <form class="import-form" id="import-picks"><h3>Import AI picks</h3><p>Saved picks are used on the next run. Import <code>[]</code> to record a session with no picks.</p>
          <label>Session <select name="session" required><option value="">Choose a session</option>${sessions.map(({ session }) => `<option value="${escape(session)}">${escape(session)}</option>`).join('')}</select></label>
          <label>Picks file <input name="file" type="file" accept=".json,application/json" required></label>
          <button class="primary" type="submit"${sessions.length ? '' : ' disabled'}>Save picks</button><p role="status"></p>
        </form>
      </div>
    </section>
    <section id="handoff" class="home-callout"><div><p class="kicker">03 / EXPORT</p><h2>Editor handoff</h2><p>Only approved briefs appear in this CSV. It includes timestamps, hooks, dialogue, market fit, and edit notes.</p></div>
      <a class="button primary" href="/editor-handoff.csv" download>Download editor CSV ↓</a></section>
  </main>
</div>`, 'studio');
}
