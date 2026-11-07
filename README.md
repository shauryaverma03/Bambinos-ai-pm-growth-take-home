# Bambinos.live | Class-to-creative pipeline

Prepare timestamped class transcripts for AI review, validate 10–20 second candidates, and review real footage before releasing any brief to an editor.

## Run the official sample

Requirements are Node.js 20+ and FFmpeg with `ffprobe` and `libx264` on PATH. The prototype needs no network connection or API key.

```sh
cd "$HOME/Desktop/Bambinos-AI-PM-Growth"
node run.mjs
```

Open the printed `index.html` in a browser. The run uses the four official transcripts and recordings in `assets/` and the saved first-pass picks in `runs/`. It should show three candidates and zero editor-ready rows before review. The prior footage observations are in [the private assessment notes](runs/assessment-review.md). The original assets are available from [Bambinos’ marketing assessment repository](https://github.com/bambinoslive/AI-PM-hiring-take-home-assignments/tree/main/marketing).

Each run writes a separate, complete snapshot. It includes:

- `index.html` — session results, proposed-cut and context playback, verbatim source cues, review forms, and export links.
- `prompts/` — the exact mining prompt and transcript JSON for each batch.
- `sessions/` and `run.json` — source fingerprints, cue counts, accepted picks, rejection reasons, and review status.
- `editor-handoff.csv` — editor briefs whose review checks all passed. An empty queue produces a header-only CSV.

## Mine a new set of classes

1. Put each VTT and its matching MP4 in the input directories under the same basename, such as `Science_2125687282.vtt` and `Science_2125687282.mp4`. Session IDs use letters, digits, underscores, or hyphens.
2. Run once to generate prompt files. A missing picks file is shown as awaiting prompt results. Paste each generated batch file into a model workspace approved for the source data. The AI step is manual. No classroom files are sent by the CLI.
3. Combine the JSON arrays from the session’s batches into one `SESSION-picks.json` file. Save `[]` when no candidate qualifies. Run again. The validator reconstructs exact VTT dialogue, enforces duration and rubric thresholds, resolves overlap by score, and keeps up to three candidates per session. Transcript wording remains subject to audio verification.

Override locations with `--transcripts DIR --videos DIR --picks DIR --output DIR`. The existing `node pipeline.mjs prepare FILE.vtt SESSION` and `node pipeline.mjs validate FILE.vtt PICKS.json` commands also work independently.

## Review and hand off

1. In the browser, play each proposed cut and its context. Use **Record review decision** to document visual support, audio and timing, sound-off clarity, privacy and dignity, and usage rights. Enter reviewer notes and the rights register reference. Use **Reject candidate** with a reviewer and reason for excluded rows.
2. Select **Download entered decisions**. Apply the JSON file with the same input options used to generate the page.

```sh
node run.mjs --reviews "$HOME/Downloads/review-decisions.json"
```

3. Open the newly printed report. Only rows with all five passes, reviewer notes, a rights reference, and a playable preview with audio appear in the editor CSV. Decisions apply to the matching transcript, recording, and proposed brief. A changed source or brief requires a fresh review. The final edited ad has a separate approval step in the [SOP](docs/sop.md).

Keep the input assets, prompt packs, previews, review decisions, and output snapshots private. Keep custom run directories outside a shared repository or add them to its ignore rules.

## Verify

Run `node --test`. The tests use a fictional transcript and generated video to exercise parsing, batch boundaries, exact dialogue, overlap, preview encoding, missing footage, approval, rejection, stale decisions, and CSV escaping. For research notes, modeled ROI, and rollout, see [the case analysis](docs/case-notes.md).
