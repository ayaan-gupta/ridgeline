# Ridgeline: hackathon submission copy

Everything below is ready to paste. Numbers are measurements, reproducible with
the commands in the "Try it" section.

---

## Name

**Ridgeline**

## Tagline (Devpost "elevator pitch", 200 characters)

> One frame is not a fire. Ridgeline watches public mountain cameras for smoke and holds every alert until three consecutive frames agree.

*(136 characters.)*

## One-line description

Wildfire smoke detection built on public camera networks, where the alerting rule
matters more than the model.

---

## Inspiration

Camera-based wildfire detection already exists and mostly works. The reason
dispatchers turn it off is not that it misses fires. It is that it cries wolf,
and a system that cries wolf at 2am in August gets muted in week three, after
which it detects nothing at all.

So the interesting problem is not "can a model see smoke in a photograph." A
single frame cannot separate smoke from fog, from dust, from a low sun blooming
across a lens. The interesting problem is what you do with a score you do not
fully trust.

## What it does

Ridgeline polls mountain cameras, scores every frame for smoke, and refuses to
raise an alert until the score clears the threshold on **three consecutive
frames**. That rule is the product. Everything else exists to make the rule
legible to the person who has to act on it.

- **A watch floor** at `/watch`. A contact sheet of cameras, sorted so anything
  needing attention is above the fold, each carrying a frame strip that draws the
  decision rule itself: bar height is that frame's score, a hairline marks the
  threshold, and three bars over the line looks visibly different from one spike
  over the line. The operator can see the evidence, not just the verdict.
- **An answer to every alert.** Real fire, false alarm, or seen and undecided.
  The verdict is stored beside the model's claim, never over it, so the
  disagreement between a person and the scorer survives as a record.
- **Audible alerting** that is off until you turn it on, plays its tone once when
  you do, and whose per-camera mutes always expire and are always visible.
- **A reference wipe.** Press `C` on a camera and drag between the current frame
  and the known-clear frame the scorer is actually comparing against. The model
  always had both halves of that comparison; now the person does.
- **Keyboard triage.** `J`/`K` to move, `Enter` to open, `R`/`F`/`A` to answer.
  During an incident the mouse is the slow path.
- **A shift handoff** at `/handoff`, with unanswered alerts pinned to the top
  regardless of age.

The front page at `/` is a scroll-scrubbed sequence of a real fire. Every
confidence number on it came out of the same scorer the worker runs.

## How we built it

**Detection.** A tile-based frame differencer. Each frame is cut into a 16x12
grid and a tile scores only if it is *both* moving against a frozen reference
*and* losing saturation, because smoke veils what is behind it. Either signal
alone is a bird or it is haze. Clipped tiles score zero, which removes the single
worst false positive these cameras produce: a low sun whose bloom changes shape
every minute.

The reference is frozen rather than rolling. Score a window against its own first
frames and a slowly growing plume works its way into the background and erases
its own signal within minutes.

**The decision layer lives in the web app, not the worker**, so the threshold and
the consecutive-frame count can change without redeploying anything that touches
a camera.

**A trained model exists and lost.** A ResNet18 plus LSTM over frame sequences,
fine-tuned on FIgLib with a per-camera split. It underperformed the heuristic on
every measure that matters. Both sets of numbers are in the README rather than
the better one alone.

**Stack.** Python, PyTorch, torchvision, FastAPI, NumPy, Pillow for the model.
Python and httpx for ingestion. Next.js 15 App Router, TypeScript, Drizzle,
postgres.js, Postgres 16, Leaflet for the web. Docker Compose for all of it.

## Challenges we ran into

**A metric that flattered us.** The validator reported five of five fires
detected. Two of those "detections" were a cloud and a lens vignette that
happened to occur after ignition. A confirmation is now only counted as a find if
the bounding box centre falls inside a hand-verified plume region, the honest
score is four of five, and a permanent regression test keeps the two boxes that
used to pass.

**Two demo sequences with no fire in them.** Bundled sequences were checked frame
by frame and two contained no visible plume at all. They were replaced, and every
remaining sequence was opened and verified by eye.

**Training on the demo.** The replay cameras were in the training set. They are
held out now, so validation measures on cameras the model never fitted.

**A design system that caught its own violation.** The rule is that saturated
colour appears only to encode risk. An automated audit of every rendered colour
against the declared tokens found a saturated green live-connection dot, a
default-white range input, and a basemap shade that a `!important` was forcing.
All three are gone. Both surfaces now audit at zero off-system colours.

**A handoff full of deleted evidence.** The frame volume kept a rolling window
about ten minutes deep, so a 24-hour handoff pointed almost entirely at images
that no longer existed. Frames that raised an alert are now held back from
pruning.

## Accomplishments that we're proud of

- **The alerting rule is visible, not asserted.** The frame strip renders the
  N-consecutive-frames rule as a shape you can read at a glance across a grid.
- **The front page argues with real data.** Scroll-scrubbing a real fire while
  the real per-frame scores climb is only possible because the manifest is
  generated by the production scorer.
- **We publish the miss.** The Santa Margarita fire is bundled with the demo and
  the model never catches it. It is on the front page under "What it does not do."
- **`docker compose up` and nothing else.** Verified from wiped volumes with no
  `.env`: healthy in 30 seconds, first real alert 82 seconds later.

## What we learned

**The scary number was not the one we expected.** Sweeping the consecutive-frame
rule from N=1 to N=5 over real data, false alarms stayed at zero at *every* value,
because the scorer never once called clear sky smoke on this set. So on this data
the rule buys no measurable reduction in false alarms. What it costs is visible:
one minute of median latency per step. N=3 is simply the largest value that still
catches every fire the set contains. That is on the front page, stated as an
argument rather than a demonstration, because the data does not support the
stronger claim.

**Accuracy is the wrong metric and we never report it.** On a camera that is
clear 99.9% of the time, a model that always says "no smoke" scores 99.9%.
Precision, recall, and false alarms per camera per day are the numbers a
dispatcher's decision actually depends on.

## What's next

- An incident view that collects the frames, the score curve and the verdicts
  behind one link that can be pasted into an incident channel.
- Escalation, so an unanswered confirmation gets louder or reaches a second
  person after some number of minutes.
- Cross-camera triangulation. Two cameras seeing the same plume on different
  bearings gives a position, not just an alert.
- More clear-sky hours. 54 minutes of observed clear time is too small a
  denominator for the false alarm rate to mean much.

## Built with

`python` `pytorch` `torchvision` `fastapi` `numpy` `pillow` `httpx`
`next.js` `react` `typescript` `drizzle-orm` `postgresql` `leaflet` `sharp`
`docker` `docker-compose`

---

## Measured behaviour

Shipped scorer, threshold 0.60, three consecutive frames, five real recorded
fires from the cameras that saw them.

| | |
|---|---|
| Fires found, box on the verified plume | **4 of 5** |
| Median detection latency from labelled ignition | **11 minutes** |
| Confirmed false alarms | **0** |
| False alarms per camera per day | **0.0** |
| Clear camera time observed | 54 minutes |
| Never confirmed | Santa Margarita TCS8, 2019-08-29 |

Caveats we state rather than hide: 54 minutes of clear sky is a small
denominator, and one false run would have read as 19 per day. Thin cirrus still
fools the differencer. The lens vignette is deliberately left in, because
cropping the frame edges also crops away the Junction Fire plume.

---

## Try it

```bash
git clone <repo> && cd wildfire-sentry
docker compose up
```

Open http://localhost:3100. No `.env` and no manual steps. Replay imagery
downloads on first run, because HPWREN publishes it under a licence that does not
permit redistribution.

Reproduce the numbers:

```bash
docker compose exec model python validate_replay.py
docker compose exec model python sweep_consecutive.py
docker compose exec model python test_validation.py
```

---

## Demo video script, 2 minutes 30

**0:00 to 0:20. The claim.**
Open `/`. Let the hero land: "ONE FRAME IS NOT A FIRE" over a real camera frame.
Read the sub-line aloud. Say the camera and coordinates are real, and so is the
photograph.

**0:20 to 1:00. The reel.**
Scroll into the sticky sequence. Narrate as it goes: nineteen minutes of
nothing, the score flat at 0.04. Then a false start that climbs and falls back, which
is the honest part. Then 0.59, 0.97, 0.999. Watch the strip fill, the chip turn
from clear to watching to confirmed, and the box draw on the plume. Land on:
"three consecutive frames, and the alert goes out here, fifteen minutes after
ignition."

**1:00 to 1:25. The rule, measured.**
Scroll to the dial. Drag N from 3 down to 1: faster, less corroboration. Drag to
4: two of the five fires drop out entirely. Say the honest finding out loud,
that false alarms were zero at every N on this set, so the rule is buying
corroboration and paying latency for it.

**1:25 to 1:35. The limits.**
Scroll to "What it does not do". Rest on the first item, the fire it misses
completely, for two full seconds.

**1:35 to 2:10. The watch floor.**
Click "Open the watch floor". Show the grid sorted by risk, the frame strips, a
confirmed banner. Press `C` on a camera and drag the reference wipe. Come back
and answer an alert with `F`. Point out the verdict landing next to the model's
claim, not over it.

**2:10 to 2:30. The handoff.**
Open `/handoff`. Unanswered pinned to the top. Say the line that matters: an
alert nobody can close is how a monitoring tool gets muted, and this is the part
most of them leave out.

## Screenshot shot list

Take these at 1440x900 unless noted.

1. `/` hero, after the headline reveal has settled.
2. `/` mid-reel at the confirmed frame: score 1.00, `3 of 3`, red box on the
   plume, strip showing grey then orange then red.
3. `/` the rule dial at N=3, showing 4 of 5 and 11 min.
4. `/` the "What it does not do" list.
5. `/watch` with a confirmed banner and the verdict buttons visible.
6. `/camera/<id>` with the reference wipe open, handle around 40%.
7. `/handoff` showing "Needs an answer".
8. `/map` showing the rail and the markers.
9. `/watch` at 375x812 for the mobile shot.
