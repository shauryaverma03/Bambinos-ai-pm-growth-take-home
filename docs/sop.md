# Workflow and operating procedure

| Stage | Pilot tooling and owner | Output or gate |
| --- | --- | --- |
| Class ends | Recording platform and restricted Drive folder, operations | Assign a pseudonymous session ID. Confirm authorized internal processing and link the consent register. |
| Transcript ingest | Platform WebVTT export and local Node.js prototype, operations | Check recording version, cue range and sync. If missing, queue for transcription inside the approved environment. |
| Mine moments | Approved ChatGPT workspace with the system prompt, marketing analyst | Save raw JSON, prompt version and reviewer-visible source IDs. Accept zero-candidate sessions. |
| Validate and dedupe | Node.js validator, analyst | Reconstruct dialogue, enforce duration and scoring, reject malformed rows, keep up to three non-overlapping candidates per session. |
| Verify clip | Private local review page and review JSON, marketing reviewer | Watch the window plus five seconds on each side. Check attribution, payoff, crop, sound-off comprehension, privacy and documented rights. Log one decision and primary reason. |
| Cut and review | CapCut Desktop using approved local storage, editor | Build a 9:16 proof cut with readable captions and any authorized masking. Watch final export with sound on and off. |
| Release | Marketing lead and rights owner | Approve exact export, markets, channel and usage period. Log creative ID and rights reference. |

## Resolve the transcript-to-video gap

The reviewer opens the linked recording at the proposed start time and confirms that the student voice, visual action and subtitle match. For camera-off moments, approve only when an authorized board or screen share carries the proof and the source audio can be cleared. If a prompt relies on an unseen reaction or absent game board, reject the pick. Check the proposed crop for name tiles, faces, chat, backgrounds, display names, school logos and stray voices. Resolve timing drift against the actual recording. Check guardian permissions and other relevant rights against the final audio and video for every identifiable participant before external use.

## Queue and automation

Use one row per candidate. The local review page captures audio, visual, sound-off, privacy and rights checks. A rerun with the downloaded decisions exports only fully reviewed rows. Track the eventual creative ID and edited and approved states in the production queue. Consent records live in the restricted register, referenced by ID in the review file.

After the manual pilot, build the orchestration in n8n with a Drive Trigger, approved model endpoint, validation Code node and Google Sheets upsert. Key ingestion by session ID + source version and candidate rows by session ID + source version + cue span. Store a run status and prompt version. Retry transient failures without duplicating rows and route malformed input to operations. Keep human decisions outside the retried fields. Keep source assets, full dialogue and rights records out of shared GitHub.
