# Case analysis draft

The brief estimates that 85–90% of manual review time is wasted and sets a 10× speed ambition. The prototype separates finding candidate windows from deciding whether those windows can carry an ad. Zero-candidate classes are valid results. A missed worthwhile clip and an editor's wasted review minute both matter, so the pilot measures rejection rate and samples classes where the system found nothing.

## Creative hypotheses

| Brand | Public positioning observed | Creative hypothesis |
| --- | --- | --- |
| Bambinos.live | Live participation across English, maths, science and values-based learning | Open on a learner's specific response and make the classroom interaction clear on mute. |
| PlanetSpark | Structured live speaking practice in storytelling, debate and presentation | Show one speaking behavior the parent can hear or read immediately, such as a child giving a reason for their opinion. |
| Bhanzu | Concept-first maths through small groups and practical questions | Use a familiar maths question as the overlay, then let the learner's reasoning supply the reveal. |

These observations come from public brand pages. Meta Ad Library and Instagram Reels could not be accessed for this first pass. For the creative audit, record each accessible ad or Reel URL, capture date, opening line, visual proof, captions, offer and target market. Test the hypotheses with three-second view rate, qualified trial rate and cost per qualified trial. Conversion cannot be inferred from positioning or public engagement.

- Bambinos.live program overview — https://www.bambinos.live/blog
- PlanetSpark public speaking — https://www.planetspark.in/explore/public-speaking-program
- Bhanzu live class format — https://bhanzu.com/math/classes

The [mining prompt](../prompts/moment-miner.md) defines five creative categories, the 10-point score and exclusions. Final footage review hard-stops missing rights, exposed identifying details, distress, misleading edits or claims, and visuals that fail to support the advertised moment.

## Weekly scenario at 500 classes

Planning assumptions in INR. Replace with measured baseline and pilot rates. Both scenarios assume 50 approved clips and equal editing time to isolate mining efficiency.

| Step | Manual | AI-assisted |
| --- | ---: | ---: |
| Review or triage all 500 classes | 500 × 40 min = 333.3 h | 500 × 1 min = 8.3 h |
| Visual checks beyond initial review | Included above | 150 × 6 min = 15.0 h |
| Audit 25 zero-candidate sessions | Included above | 25 × 20 min = 8.3 h |
| Edit and final QA of 50 clips | 50 × 20 min = 16.7 h | 50 × 20 min = 16.7 h |
| Total labor | 350.0 h | 48.3 h |
| Cost at ₹600/h + incremental AI/tool spend | ₹210,000 | ₹29,000 + ₹5,000 |
| Cost per approved clip | ₹4,200 | ₹680 |

The modeled review step is 10.5× faster (333.3 h vs 31.7 h). The full workflow is 7.2× faster. If approval volume drops to 30 and upstream work stays the same, estimated cost per clip increases to ₹1,000. Confirm yield and rights-clearance burden before scaling.

## 30 / 60 / 90 days

- **Day 30.** Baseline timed manual reviews. Run the pipeline in parallel on 50 stratified sessions. Calibrate with editors on 10 shared examples. Track rejected picks by reason and audit a random sample of zero-pick sessions against manual review.
- **Day 60.** Expand to 200 weekly classes if visual rejection is under 40%, median pre-edit review time is under six minutes per class, and rights checks are logged for every externally used clip. Give editors a short calibration session and incorporate their rejection feedback weekly.
- **Day 90.** Move toward 500 weekly classes if approved clip yield is at least comparable to baseline and rights checks remain complete. Target 80% of eligible review sessions using the queue and measure clip-to-ad conversion within 30 days, cost per approved clip and qualified trial cost by market.

Define false positives as visually or creatively rejected picks divided by reviewed picks. Track rights blocks separately, using the same denominator. Define adoption as queue-reviewed eligible classes divided by eligible classes. Define clip-to-ad conversion as launched unique clips divided by approved clips in the same matured cohort.
