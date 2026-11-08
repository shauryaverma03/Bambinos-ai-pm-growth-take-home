async function post(path, body) {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}

async function action(button, message, pending, callback) {
  button.disabled = true;
  message.classList.remove('error');
  message.textContent = pending;
  try {
    await callback();
  } catch (error) {
    message.classList.add('error');
    message.textContent = error.message;
  } finally {
    button.disabled = false;
  }
}

const run = document.querySelector('#run-pipeline');
run?.addEventListener('click', () => action(run, document.querySelector('#pipeline-message'),
  'Preparing transcripts and generating clip previews…', async () => {
    await post('/api/run', {});
    window.location.reload();
  }));

const imports = document.querySelector('#import-picks');
imports?.addEventListener('submit', (event) => {
  event.preventDefault();
  const data = new FormData(imports);
  const button = imports.querySelector('button');
  const message = imports.querySelector('[role="status"]');
  action(button, message, 'Validating picks…', async () => {
    const file = data.get('file');
    if (file.size > 1024 * 1024) throw new Error('Choose a picks file smaller than 1 MB.');
    let picks;
    try {
      picks = JSON.parse(await file.text());
    } catch {
      throw new Error('The picks file must contain valid JSON.');
    }
    const result = await post('/api/picks', { session: data.get('session'), picks });
    message.textContent = `Saved ${result.accepted} valid picks; ${result.rejected} rows rejected. Run the pipeline to refresh the queue.`;
  });
});

const filterSession = document.querySelector('#session-filter');
const filterStatus = document.querySelector('#status-filter');
const items = [...document.querySelectorAll('.queue-item')];
function filter() {
  if (!filterSession || !filterStatus) return;
  let visible = 0;
  for (const item of items) {
    const matches = (!filterSession.value || item.dataset.session === filterSession.value) &&
      (!filterStatus.value || item.dataset.status === filterStatus.value);
    item.hidden = !matches;
    if (matches) visible++;
    else item.querySelector('video')?.pause();
  }
  document.querySelector('#queue-empty').hidden = visible !== 0;
}
filterSession?.addEventListener('change', filter);
filterStatus?.addEventListener('change', filter);
filter();

for (const form of document.querySelectorAll('form[data-candidate]')) {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    action(form.querySelector('button'), form.querySelector('[role="status"]'), 'Saving review…', async () => {
      await post('/api/review', { id: form.dataset.candidate, decision: Object.fromEntries(new FormData(form)) });
      window.location.hash = form.dataset.candidate;
      window.location.reload();
    });
  });
}

for (const panel of document.querySelectorAll('.playback')) {
  const video = panel.querySelector('video');
  let cutEnd = null;
  for (const button of panel.querySelectorAll('[data-play]')) {
    button.addEventListener('click', async () => {
      const cut = button.dataset.play === 'cut';
      cutEnd = cut ? Number(video.dataset.end) : null;
      video.currentTime = cut ? Number(video.dataset.start) : 0;
      try {
        await video.play();
      } catch {
        panel.querySelector('.muted').textContent = 'Playback could not start. Try the video controls.';
      }
    });
  }
  video.addEventListener('timeupdate', () => {
    if (cutEnd !== null && video.currentTime >= cutEnd) {
      video.pause();
      cutEnd = null;
    }
  });
}
