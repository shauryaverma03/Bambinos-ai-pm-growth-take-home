const escape = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);
const list = (items) => items.length
  ? '<ul>' + items.map((item) => `<li>${escape(item)}</li>`).join('') + '</ul>'
  : '<p>None recorded.</p>';
const statusText = {
  'awaiting-picks': 'Awaiting prompt results',
  'zero-candidates': 'No candidate passed',
  candidates: 'Candidates found',
  pending: 'Pending review',
  rejected: 'Rejected',
  ready: 'Ready for edit',
};

const checks = {
  visual: 'Visual support', audio: 'Audio and timing', soundOff: 'Sound-off clarity',
  privacy: 'Privacy and dignity', rights: 'Usage rights',
};

function reviewForm(id, decision) {
  const option = (value, label, current) =>
    `<option value="${value}"${value === current ? ' selected' : ''}>${label}</option>`;
  return `<details class="review-form">
    <summary>Record review decision</summary>
    <form data-candidate="${escape(id)}">
      <label>Decision <select name="status">
        ${option('review', 'Review checks', decision.status)}
        ${option('rejected', 'Reject candidate', decision.status)}
      </select></label>
      <label>Reviewer <input name="reviewer" value="${escape(decision.reviewer)}"></label>
      ${Object.entries(checks).map(([key, label]) => `<label>${label} <select name="${key}">
        ${option('pending', 'Pending', decision[key] ?? 'pending')}
        ${option('pass', 'Pass', decision[key])}
        ${option('fail', 'Fail', decision[key])}
      </select></label>`).join('')}
      <label>Rights register reference <input name="rightsReference" value="${escape(decision.rightsReference)}"></label>
      <label>Review notes <textarea name="notes">${escape(decision.notes)}</textarea></label>
      <label>Rejection reason <input name="reason" value="${escape(decision.reason)}"></label>
    </form>
  </details>`;
}

function card(candidate, decision) {
  const { preview, review } = candidate;
  const media = preview.file
    ? `<div class="playback"><video controls playsinline preload="metadata" src="${escape(preview.file)}"
          data-start="${preview.cutStart.toFixed(3)}" data-end="${preview.cutEnd.toFixed(3)}"></video>
        <div class="buttons"><button type="button" data-play="cut">Play proposed cut</button>
        <button type="button" data-play="context">Play with context</button></div>
        <p class="muted">Private preview includes up to five seconds of context on either side.</p></div>`
    : `<p>${escape(preview.issue)}</p>`;
  return `<article class="card">
    <header><div><p class="eyebrow">${escape(candidate.bucket)}</p>
      <h3>${escape(candidate.hook)}</h3></div>
      <span class="badge ${escape(review.status)}">${statusText[review.status]}</span></header>
    <p class="window">${escape(candidate.start)} – ${escape(candidate.end)} · ${candidate.durationSeconds.toFixed(3)}s · ${candidate.score}/10</p>
    ${media}
    <div class="details">
      <div><h4>Source dialogue</h4><pre>${escape(candidate.dialogue)}</pre></div>
      <div><h4>What to verify</h4><p>${escape(candidate.visualCheck)}</p>
      <h4>Editor direction</h4><p>${escape(candidate.editorNotes)}</p></div>
      <div><h4>Market fit hypotheses</h4>${list(Object.entries(candidate.geography).map(([key, value]) => `${key} — ${value}`))}</div>
      <div><h4>Flags and review</h4>${list([...candidate.flags, ...review.blockers])}
      ${review.reviewer ? `<p>Reviewer — ${escape(review.reviewer)}</p>` : ''}
      ${review.notes ? `<p>${escape(review.notes)}</p>` : ''}</div>
    </div>
    ${reviewForm(candidate.id, decision)}
    <details><summary>Candidate ID and scores</summary>
      <p><code>${escape(candidate.id)}</code></p>
      ${list(Object.entries(candidate.scores).map(([key, value]) => `${key} ${value}/2`))}
    </details>
  </article>`;
}

export function renderReport(run, decisions) {
  const candidates = run.sessions.flatMap((session) => session.reviewQueue);
  const ready = candidates.filter((candidate) => candidate.review.status === 'ready').length;
  const sections = run.sessions.map((session) => `<section id="${escape(session.session)}">
    <h2>${escape(session.session.replace(/_/g, ' · '))}</h2>
    <p>${escape(statusText[session.status])} · ${session.cues} cues · ${session.batches} batches
      · <a href="sessions/${escape(session.session)}.json">Session JSON</a></p>
    <details><summary>Prompt inputs</summary>${Array.from({ length: session.batches }, (_, index) => {
      const batch = index + 1;
      return ` <a href="prompts/${escape(session.session)}-${batch}.txt">Batch ${batch}</a>`;
    }).join('')}</details>
    ${session.rejected.length ? `<details><summary>${session.rejected.length} validator rejections</summary>
      ${list(session.rejected.map(({ row, reason }) => `Row ${row} — ${reason}`))}</details>` : ''}
    ${session.reviewQueue.map((candidate) => card(candidate, decisions[candidate.id])).join('')}
  </section>`).join('');
  return `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bambinos · Classroom clip review</title>
<style>
  :root{color-scheme:light;--ink:#172347;--soft:#f3f5ff;--blue:#263ebd;--line:#d8dff4}
  *{box-sizing:border-box}
  body{margin:0;background:#f8f9fc;color:var(--ink);font:16px/1.55 system-ui,sans-serif}
  main{max-width:1050px;margin:auto;padding:32px 20px 64px}
  .hero,.card{padding:clamp(16px,3vw,30px);border:1px solid var(--line);border-radius:16px;background:white}
  .hero{background:var(--soft)}
  .eyebrow{margin:0;color:var(--blue);font-size:.8rem;font-weight:750;text-transform:uppercase;letter-spacing:.08em}
  h1,h2,h3,h4{line-height:1.2;margin:0 0 8px}
  h1{font-size:clamp(1.9rem,5vw,3rem);margin-top:8px}
  section{margin-top:32px}
  p,ul{margin:8px 0 12px}
  a{color:var(--blue);text-underline-offset:3px}
  .card{margin-top:16px}
  header,.buttons,nav{display:flex;flex-wrap:wrap;align-items:center;gap:10px 16px;justify-content:space-between}
  .buttons,nav{justify-content:flex-start}
  .badge{display:inline-block;border-radius:20px;padding:4px 12px;background:#fff1c6;color:#563706;font-size:.86rem;font-weight:750}
  .ready{background:#d7f5e1;color:#145a32}.rejected{background:#fde6e5;color:#8f2020}
  video{display:block;width:100%;max-height:470px;border-radius:10px;background:#141829;margin:12px 0}
  button{font:inherit;font-weight:650;border:1px solid var(--line);border-radius:9px;background:var(--soft);color:var(--blue);padding:6px 12px;cursor:pointer}
  .details{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:16px;margin:18px 0}
  pre,code{white-space:pre-wrap;overflow-wrap:anywhere}
  pre{padding:12px;background:var(--soft);border-radius:8px;margin:0;font:inherit}
  .review-form{margin:12px 0}
  form{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,200px),1fr));gap:12px;margin:12px 0}
  label{display:grid;align-content:start;gap:3px;font-size:.9rem;font-weight:650}
  input,select,textarea{width:100%;border:1px solid var(--line);border-radius:6px;background:white;padding:5px;font:inherit}
  summary{cursor:pointer}.muted{color:#4c5a75;font-size:.9rem}
</style>
<main>
  <div class="hero">
    <p class="eyebrow">Bambinos.live · Private assessment workspace</p>
    <h1>Classroom clip review</h1>
    <p>${run.sessions.length} sessions · ${candidates.length} candidates · ${ready} ready for edit</p>
    <p class="muted">Candidate scores come from transcript review. Only rows that clear every review check appear in the editor handoff.</p>
    ${run.staleReviews.length ? `<p>${run.staleReviews.length} unmatched decisions were ignored. See the run manifest.</p>` : ''}
    <nav aria-label="Run files"><a href="run.json">Run manifest</a>
      <a href="review-decisions.template.json" download>Review decisions template</a>
      <a href="editor-handoff.csv" download>Editor handoff CSV</a>
      <button type="button" id="download-decisions"${candidates.length ? '' : ' disabled'}>Download entered decisions</button></nav>
    <p class="muted">Download the decisions file before leaving this page. Run the CLI with <code>--reviews</code> to apply it.</p>
    <p role="status" id="decision-message"></p>
  </div>
  ${sections}
</main>
<script>
  document.querySelector('#download-decisions').addEventListener('click', () => {
    const decisions = {};
    const status = document.querySelector('#decision-message');
    for (const form of document.querySelectorAll('form[data-candidate]')) {
      const decision = Object.fromEntries(new FormData(form));
      if (decision.status === 'rejected' && (!decision.reviewer.trim() || !decision.reason.trim())) {
        form.closest('details').open = true;
        form.querySelector(decision.reviewer.trim() ? '[name="reason"]' : '[name="reviewer"]').focus();
        status.textContent = 'Add a reviewer and reason for every rejection before downloading.';
        return;
      }
      decisions[form.dataset.candidate] = decision.status === 'rejected'
        ? { status: decision.status, reviewer: decision.reviewer, reason: decision.reason }
        : decision;
    }
    const file = new Blob([JSON.stringify(decisions, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'review-decisions.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = 'Decision file generated. Apply it with the CLI.';
  });

  for (const panel of document.querySelectorAll('.playback')) {
    const video = panel.querySelector('video');
    let cutEnd = null;
    for (const button of panel.querySelectorAll('button')) {
      button.addEventListener('click', () => {
        const cut = button.dataset.play === 'cut';
        cutEnd = cut ? Number(video.dataset.end) : null;
        video.currentTime = cut ? Number(video.dataset.start) : 0;
        video.play().catch((error) => {
          panel.querySelector('.muted').textContent = 'Playback failed. Try the video controls. ' + error.message;
        });
      });
    }
    video.addEventListener('timeupdate', () => {
      if (cutEnd !== null && video.currentTime >= cutEnd) {
        video.pause();
        cutEnd = null;
      }
    });
  }
</script>
</html>`;
}

export function editorCsv(rows) {
  const fields = [
    'session', 'id', 'start', 'end', 'hook', 'bucket', 'score', 'dialogue',
    'India', 'US', 'GCC', 'flags', 'editorNotes', 'reviewer', 'notes', 'rightsReference',
  ];
  const cell = (value) => {
    let str = String(value ?? '');
    if (/^\s*[=+@-]|^[\t\r\n]/.test(str)) str = "'" + str;
    return '"' + str.replace(/"/g, '""') + '"';
  };
  return [fields.join(','), ...rows.map((row) => {
    const values = { ...row, ...row.geography, ...row.review, flags: row.flags.join(' | ') };
    return fields.map((key) => cell(values[key])).join(',');
  })].join('\r\n') + '\r\n';
}
