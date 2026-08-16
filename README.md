# Ridgeline

Wildfire smoke detection on public lookout camera networks. Real frames in,
bounding box and alert out, with a dashboard an operator can watch.

The cameras already exist. HPWREN and ALERTWildfire stream thousands of ridgeline
views around the clock, originally so trained human lookouts could watch them.
That does not scale, and a fire that goes twenty minutes unnoticed is a different
fire than one caught at four. The bottleneck is attention, not data.

Everything here runs on public data and public infrastructure.

---

## Run it

```bash
docker compose up
```

Then open http://localhost:3100.

That is the whole setup. No API keys, no manual migration step, no dataset to
download by hand. On first start the ingestion service fetches five real fire
sequences from HPWREN's Fire Ignition Library, the database migrates itself, and
frames begin flowing within about a minute. Cameras are staggered, so the first
confirmed detection lands roughly two minutes in and the rest follow.

If those ports are taken, set `WEB_PORT`, `MODEL_PORT` and `DB_PORT` in `.env`.
Only the host side moves; the services talk to each other on the compose network.

To watch it work from the terminal:

```bash
docker compose logs -f ingestion
```

---

## Two surfaces

`/` is the front page. `/watch` is the watch floor. They are separate route
groups with separate stylesheets and no shared layout, which is deliberate: the
front page is read once at arm's length by someone deciding whether this is
serious, and the watch floor is read at a desk by someone who already decided.
The front page gets a display face at nine rem, a page with momentum and a
scroll driven reel. The watch floor gets none of that.

What they do share is the colour, the three IBM Plex faces and the frame strip,
so the two read as one product rather than a brochure bolted to a tool.

The reel on the front page scrubs through a real replay sequence, and every
confidence value on it comes from `model/build_reel.py`, which runs the identical
loop the worker runs. Regenerate it with:

```
docker compose exec model python build_reel.py beaver-fire > web/public/reel/beaver-fire.json
docker compose exec model python sweep_consecutive.py    > web/public/reel/sweep.json
```

The frames themselves are not committed. They download at run time, because
HPWREN publishes them under a licence that does not permit redistribution, so on
a cold start the reel says it is waiting for frames rather than showing gaps.

---

## What you are looking at

Five cameras, each replaying a real recorded wildfire from the camera that
actually saw it. Names, coordinates, elevations and bearings are the real HPWREN
values, and the ids follow HPWREN's own site-plus-direction convention.

| Camera | Site | Sequence |
|---|---|---|
| `hp-e` | High Point East, Palomar Mountain | Junction Fire, 2026-06-29 |
| `cp-w` | Cuyamaca Peak West | Creelman Fire, 2026-07-22 |
| `lp-w` | Lyons Peak West, east of Jamul | Beaver Fire, 2026-08-07 |
| `rm-n` | Red Mountain North, Fallbrook | FIgLib 2016-06-04 |
| `smer-tcs8` | SDSU Santa Margarita Ecological Reserve | FIgLib 2019-08-29 |

The last two are named by camera and date because FIgLib labels those sequences
only as `FIRE`, and giving them a fire name would be inventing one.

Every sequence was opened frame by frame and checked to contain a plume a person
can actually see. Two earlier picks did not, and were replaced. A sequence with
no visible fire in it cannot tell you whether a detector works, and both of them
were being reported as successful detections.

Each sequence opens on clear sky and runs through ignition, so every camera moves
through Clear, then Watching, then Confirmed, then back to Clear when the replay
loops.

---

## How a detection happens

```
replay or live camera
        |  frame every N seconds
        v
ingestion worker  ..  rolling window of 5 frames per camera
        |             plus a background reference from known-clear frames
        v
model service /infer  ..  score per frame, plus a bounding region
        v
web app /api/ingest  ..  the decision rule lives here
        |
        |  3 frames in a row at or above 0.60
        v
detection confirmed  ->  alert fired once  ->  dashboard updates over SSE
```

### The rule that matters

A detection is confirmed only after **three consecutive frames** each score at or
above **0.60**. One frame over the line is not a fire. Glare off a windshield, a
bird crossing the lens, the edge of a cloud catching the sun: all of them clear
0.60 once and are gone by the next frame. Smoke shows up and stays.

This single rule does more for usability than any amount of model accuracy, and
it is why the interface shows the frame strip rather than a bare confidence
number. Three bars over the line looks nothing like one spike over the line.

Both values are configurable in `.env` as `CONFIDENCE_THRESHOLD` and
`CONSECUTIVE_FRAMES`, and the interface reads them from the server, so the
threshold line drawn on the strip is always the threshold actually in use.

### Why a window and not a single frame

Smoke and fog are close to identical in one still frame. What separates them is
behavior over time: a plume grows and drifts, fog settles. Both scorers here work
on a sequence for that reason.

The background reference is the other half of it. Comparing a window against its
own first frames works for a sudden change and fails for a growing plume, because
within a few minutes the plume is in the background and has erased its own
signal. Ridgeline holds a reference built from frames captured while the camera
was Clear, and freezes it the moment anything crosses the threshold.

---

## Two scorers

**Heuristic** (`model/heuristic_fallback.py`) is the default. It is tile based
frame differencing that looks for a region simultaneously changing, losing
saturation, and growing across frames. It exists so the whole pipeline could be
built and tested before any model was trained, and it stays as the documented
fallback.

Three things in it are worth knowing about, because each one came from a real
false positive on real frames:

- **A region of interest.** Scoring the whole frame produced a steady false
  positive along the bottom edge, where the camera tower's own shadow rotates
  through the day and vegetation moves in wind. The top strip is excluded too,
  since these cameras burn a timestamp into every image.
- **Clipped highlight rejection.** A low sun in frame was the worst false
  positive of all. The sensor clips, and the bloom around the disc changes shape
  every frame in a way that looks exactly like smoke. Real smoke is translucent
  and never a clipped highlight, so clipped tiles score zero.
- **Global illumination cancelling.** A cloud crossing the sun lifts every tile
  at once, so the median response is subtracted before ranking.

**Trained** (`model/model.py`) is a ResNet18 backbone feeding an LSTM over the
window, following the SmokeyNet approach. `SCORER` decides which one runs:
`heuristic` (the shipped default, and why is in the comparison below), `trained`
to require the checkpoint, or `auto` to use it when it loads. `GET /health` says
which one is live:

```bash
curl http://localhost:8100/health
```

---

## Measured behavior

```bash
docker compose exec model python validate_replay.py
```

On the five bundled sequences, with the shipped threshold and consecutive count:

```
sequence                clear  smoke  false  per day  confirmed  verdict
beaver-fire                11     20      0      0.0      +899s  found, box on the plume
creelman-fire              11     20      0      0.0     +1140s  found, box on the plume
junction-fire              11     20      0      0.0      +237s  found, box on the plume
rm-n-20160604              11     21      0      0.0      +420s  found, box on the plume
smer-tcs8-20190829         10     18      0      0.0      never  missed

fires found on the plume     4 of 5
median detection latency     +660s from labeled ignition
confirmed false alarms       0 in 54 minutes of clear camera time
```

### What those numbers do and do not mean

**A confirmation is only counted as finding the fire when the box lands on the
fire.** That is not how this script started out. The first version counted any
confirmed run after the labeled ignition as a detection and reported five of
five, and two of those five were a cloud drifting beside the sun and a lens
vignette in the corner of a fisheye, on sequences with no visible plume in them
at all.

So the plume location in each sequence was checked by hand, written down in
`model/replay_truth.yaml`, and the script now scores against it. A confirmation
somewhere else in the sky is reported as `confirmed off the plume`, not as a
find. `model/test_validation.py` keeps the two boxes that used to be scored as
successes as regression cases, so that arithmetic cannot come back:

```bash
docker compose exec model python test_validation.py
```

**`smer-tcs8` is a real plume the detector never sees.** It is bundled anyway.
A demo where every camera always alerts would say something untrue about a
detector that misses distant early smoke, and this is what a miss looks like on
the dashboard: a camera sitting on Clear while a fire burns in view.

Zero false alarms is not a validated false alarm rate. It is zero in 54 minutes
of clear sky, which is a small sample and nowhere near the "under one per camera
per day" target the PRD sets. That number needs days of continuous camera time.

Latency holds up best: the fastest genuine detection was 237 seconds after
labeled ignition, against a fifteen minute target.

### Known false positive sources

Every one of these was found by running the system on real frames, not by
reasoning about it:

- **Clouds.** Altocumulus and thin cirrus are desaturated, change shape, and sit
  in the sky. That is the smoke signature to a frame differencer. It is the
  single clearest argument for the trained model that PRD section 9 makes, and it
  is what made one of the two replaced sequences look like a detection.
- **Lens vignette.** These are fisheye lenses, and the dark corners shift as
  exposure adapts. Cropping the sides removes it, and also removes the Junction
  Fire plume, which sits at the very left edge of that camera's view. Missing a
  real fire is the worse error, so the edges stay in. A camera with a persistent
  edge artifact should get its own `roi` in `camera_config.yaml`.
- **Faint plumes.** Several real sequences were tested where the scorer never
  crossed threshold at all. Early smoke at distance is genuinely subtle, and
  `smer-tcs8` is bundled as a standing example of it.

Three false positive sources were found and fixed rather than documented: the
camera tower's own rotating shadow along the bottom of frame, the burned-in
timestamp along the top, and a clipped sun, whose bloom changes shape every frame
in a way that looks exactly like a growing plume.

### Heuristic against the trained model

Same five sequences, same rule, both scorers:

| | heuristic | trained |
|---|---|---|
| Fires found with the box on the plume | 4 | 0 |
| Fires missed entirely | 1 | 2 |
| Confirmed but no box reported | 0 | 3 |
| Confirmed false alarms on clear sky | 0 | 1 |
| False alarms per camera per day | 0.0 | 26.7 |

The trained checkpoint in this repository loses, and `SCORER` ships set to
`heuristic` because of it. It never scores a find, because it returns a
probability and no bounding box at all: every confirmation it makes is an alert
with nowhere to look, which cannot be checked against the plume and would not be
actionable for a dispatcher either.

That is not a defect in the architecture, it is a defect in the training run: 17
sequences, 6 epochs, CPU only. On held-out cameras it collapses to answering
"smoke" to nearly everything (recall 1.0, precision 0.54), which is what a model
does when it has seen too few scenes to learn anything but the class balance.

One caveat on that comparison, in the trained model's favour and still not enough
to save it: this checkpoint was trained before `dataset.py` began holding the
replay cameras out. It has very likely seen `rm-n` and `smer-tcs8` in training,
and it still performs as above on them.

FIgLib has 518 sequences. Train on a real fraction of them with a GPU, re-run
the comparison, and switch `SCORER` when the trained one wins:

```bash
docker compose exec -e SCORER=trained model python validate_replay.py
```

## Training the model

Optional. The system runs without it.

```bash
docker compose exec model python fetch_figlib.py --sequences 40
docker compose exec model python train.py --epochs 6
docker compose restart model
```

`fetch_figlib.py` pulls sequences from the Fire Ignition Library into
`data/figlib/`. `train.py` fine-tunes from ImageNet weights with the backbone
frozen for the first two epochs, then opens the final residual stage.

Two choices in there are deliberate:

**The split is by camera, never by frame.** Every frame from one camera shares a
background. Split by frame and the model sees the same ridgeline, tower and
vegetation in training and validation, learns the scene, and reports a validation
number that says nothing about a camera it has never seen.

**Metrics are precision, recall and false positives per camera per day.**
Accuracy is not reported. Smoke is rare across a full day of footage, so a model
that answers "clear" to everything scores wonderfully on accuracy and is worth
nothing.

The checkpoint is written to `model/weights/smokenet.pt`, which is where the
service looks on startup.

---

## Using a live camera

Live sources are off by default. Turn them on in `.env`:

```
ENABLE_LIVE_SOURCES=true
```

Two live HPWREN cameras are already configured in
`ingestion/camera_config.yaml`. Adding another needs only its still-image URL:

```yaml
  - id: om-s-live
    name: Otay Mountain South, live
    network: hpwren
    lat: 32.59
    lng: -116.84
    elevation_m: 1087
    bearing_deg: 180
    source_type: live
    attribution: HPWREN, UC San Diego. CC BY-NC-ND 4.0.
    source_config:
      url: https://cdn.hpwren.ucsd.edu/RTS/om-s-mobo-c-640.jpg
      poll_interval_seconds: 60
```

The URL pattern is `https://cdn.hpwren.ucsd.edu/RTS/{site}-{direction}-mobo-c-640.jpg`
for 640 px frames, or `/RT/{site}-{direction}-mobo-c.jpg` for full size. Site ids
and coordinates are listed at https://hpwren.ucsd.edu/cameras.

The live source refuses to poll faster than every 30 seconds regardless of
config, and skips frames identical to the last one, since these cameras refresh
on their own schedule.

Nothing else changes. A live camera and a replay camera go through the same
worker, the same scorer, the same decision rule and the same interface.

### Terms

**HPWREN imagery is licensed CC BY-NC-ND 4.0**: non-commercial, no derivatives,
attribution required. See https://www.hpwren.ucsd.edu/cc.html. That is why live
polling ships off by default, why attribution appears in the interface wherever a
frame is shown, and why this repository downloads imagery at runtime rather than
committing it.

Anything beyond local non-commercial research needs a conversation with UC San
Diego first.

---

## Layout

```
model/       scorers and the FastAPI service
  heuristic_fallback.py   tile-based frame differencing, the default
  model.py                ResNet18 plus LSTM
  dataset.py              FIgLib loader, split by camera
  train.py                fine-tuning loop
  validate_replay.py      precision, latency and false alarm measurement
  build_reel.py           scores a sequence into the front page reel manifest
  sweep_consecutive.py    the same scores read back at N of one through five
  inference_server.py     POST /infer, GET /health

ingestion/   polling worker
  worker.py               one thread per camera, window and background state
  sources/                replay and live camera sources
  camera_config.yaml      the camera list

web/         Next.js front page, watch floor and API
  app/(marketing)/        the front page, its own stylesheet and motion
  app/(console)/          the watch floor, map, detections, handoff, camera detail
  components/site/        reel, rule dial, pipeline, scroll primitives
  lib/risk.ts             the decision rule, shared by server and browser
  lib/decision.ts         server-side configured values
  lib/verdicts.ts         what an operator can answer, and what open means
  lib/alerting.ts         the tone, the mutes, and why each mute expires
  components/ReferenceCompare.tsx  wipe between now and the frozen reference
  app/api/ingest/         where a scored frame becomes a detection
  components/FrameStrip.tsx   the signature element

design-system.md          tokens, type, motion, and why each one
ux-notes.md               the operator flows, what was built and what was not
SUBMISSION.md             submission copy, measured numbers, demo script
design/research-notes.md  what was looked at, with the hex values read off it
```

### Endpoints

| Endpoint | Method | Purpose |
|---|---|---|
| `/api/cameras` | GET | Cameras with current risk state |
| `/api/cameras` | POST | The worker registers its camera list |
| `/api/cameras/:id` | GET | Recent frames and detection history |
| `/api/detections` | GET | Recent detections, newest first |
| `/api/ingest` | POST | A scored frame. Applies the decision rule |
| `/api/detections/:id/verdict` | POST | Records what the operator decided |
| `/api/reel/:seq` | GET | Whether a reel's frames have downloaded yet |
| `/api/reel/:seq/:frame` | GET | One reel frame, resized and re-encoded |
| `/api/alerts/test` | POST | Fires a test alert down the real path |
| `/api/stream` | GET | Server-sent snapshots for the dashboard |
| `/infer` (model, port 8100) | POST | Scores a window of frames |

---

## Answering an alert

A confirmation can be answered, and this is the part most monitoring tools leave
out. An alert nobody can close keeps shouting, the next one is trusted less, and
by the third week the tab is muted. The verdicts are:

| Verdict | Means |
|---|---|
| Unanswered | Nobody has looked yet. This is what raises the banner. |
| Seen, undecided | Someone looked and does not know yet. Honest at thirty seconds. |
| Real fire | Someone looked and there is a fire. |
| False alarm | Someone looked and there is not. |

The verdict is stored in its own column beside the scorer's own `status`, never
in place of it. A detection a person called a false alarm still records the
confidence, the bounding box and the consecutive count that produced it, because
the pair is the only thing that lets anyone ask later why a person and the model
disagreed. The camera tile keeps showing the state the scores produced and adds
the verdict underneath.

Verdicts carry a position label, typed into the top bar at the start of a shift.
It is a label and not a sign in, and the field says so. Building accounts here
would imply a guarantee this system cannot make.

### Hearing it

Sound is off until you turn it on, and turning it on plays the tone once so you
know what the room will sound like. It rings when a camera is newly confirmed and
nobody has answered it, once per run rather than once per frame, and the first
pass after a page load stays quiet so opening the dashboard onto an old alert
does not sound like a new one. A browser notification goes out alongside the tone
where the browser allows it.

Any camera can be muted for 15 minutes, an hour or 4 hours. Mutes always expire,
and the top bar shows how many are in force and unmutes them all when clicked.
Muting is deliberately separate from answering: a camera that keeps re-confirming
while a crew is already on scene should be quietened without anyone pretending it
has been resolved.

### Comparing against the reference

The scorer holds a frozen reference of known-clear frames, refreshed only while
the camera is clear and frozen the moment anything crosses the threshold. Press
`C` on a camera page to wipe between that reference and the current frame.

This is the judgment an operator is actually making. Not "is there smoke in this
photograph" but "does this differ from what this camera normally looks like".
There is no difference blend and no false colour map, because deciding what
changed is the operator's job.

### Keyboard

A watch floor runs on a keyboard, because during an incident the mouse is the
slow path and the operator's other hand is on a radio.

| Key | Does |
|---|---|
| `J` / `down` | Next camera |
| `K` / `up` | Previous camera |
| `Enter` | Open the selected camera |
| `R` | Mark the selection a real fire |
| `F` | Mark the selection a false alarm |
| `A` | Mark the selection seen but undecided |
| `C` | On a camera page, wipe against the reference frame |
| `Escape` | Clear the selection |
| `?` | Show the list |

Keystrokes are ignored while a text field has focus, so typing a position label
never records a verdict.

### Handing over

`/handoff` lists what fired in the last 8, 12 or 24 hours, with the unanswered
alerts pinned to the top regardless of age, because the one thing that must not
be lost at a handover is the alert nobody looked at. Rows can be answered in
place.

It lists one row per alert rather than per confirmed frame. A run that holds for
eight frames writes eight detection rows and fires one alert, and counting all
eight would report a single fire as eight events.

The frame volume keeps a rolling window per camera, which at replay speed is
about ten minutes deep, so a handoff reaching back over a shift would otherwise
be a list of deleted images. Any frame that raised an alert is held back from
pruning, capped so a long replay loop cannot fill the volume.

---

## Alerting

With no webhook configured, alerts are recorded to the database and shown in the
interface. To deliver them, set `SLACK_WEBHOOK_URL` in `.env`.

The alert is recorded before delivery is attempted, so a misconfigured webhook
shows up as a delivery failure rather than as silence.

Fire one on demand with the button on the dashboard, or:

```bash
curl -X POST http://localhost:3100/api/alerts/test
```

---

## Design

The interface is built from `design-system.md`, which was extracted from real
reference research before any component was written. The research and the hex
values read off each source are in `design/research-notes.md`.

The short version: this screen is mostly photographs of the sky, and an
operator's core judgment is whether a gray smudge is smoke or fog. So the chrome
is hue neutral and never warm, there is no brand accent color competing with the
imagery, and saturated color appears only to encode risk state. Clear cameras are
deliberately colorless, because thirty-eight green dots are noise the two cameras
that matter have to compete with.

Copy rules are enforced rather than trusted:

```bash
cd web && npm run check-copy
```

---

## Not in this version

Nighttime and infrared, which is a real gap: this is a daylight system. Fire
spread prediction. Multi-camera triangulation to place a fire rather than report
which camera saw it. Anything resembling a replacement for official dispatch.
This is a triage layer that tells a person where to look sooner.
