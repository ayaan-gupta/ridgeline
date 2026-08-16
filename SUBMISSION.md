# Ridgeline: Devpost submission

Written for **Hack the Habitat 2026**. Every field below maps to a box on the
Devpost form and is ready to paste. Numbers are measurements, reproducible with
the commands under "Try it".

Judging weights this copy is written against: Environmental Impact 30%, Use of
Technology 25%, Design and Usability 20%, Execution 15%, Theme Alignment 10%.

---

## Project name

60 character limit. This is 57.

```
Ridgeline: wildfire smoke detection that earns its alarms
```

## Elevator pitch

200 character limit.

```
Ridgeline watches public mountain cameras for wildfire smoke and holds every alert until three consecutive frames agree. On five real recorded fires: 4 of 5 found, 11 minute median, 0 false alarms.
```

## Try it out links

```
https://github.com/ayaan-gupta/ridgeline
```

## Built With

```
python, pytorch, torchvision, fastapi, numpy, pillow, httpx, next.js, react, typescript, drizzle-orm, postgresql, leaflet, sharp, docker, docker-compose
```

---

## Project details

Everything from the lead paragraph to "What's next" goes in this one rich text
box, in this order. Devpost renders markdown, so headings, bold and tables
survive a straight paste.

---

Ridgeline watches public mountain cameras for wildfire smoke and refuses to
raise an alarm on the strength of a single frame. It scores every frame, holds
the alert until three consecutive frames agree, and shows the person on watch
the evidence behind that decision instead of only the verdict. Measured against
five real recorded fires, it finds four of them at a median of 11 minutes after
ignition, with zero false alarms.

## Inspiration

In 2025 the United States lost just over 5 million acres to 72,068 wildfires.
The damage that follows is not only counted in structures. In a bad season fire
burns through 15 to 30 percent of the mapped range of roughly 50 vertebrate
species, and an estimated 300 to 600 mountain lions, around 15 percent of
California's entire population, died in the 2020 fires alone. Habitat does not
evacuate. A deer herd can outrun a flame front; a salamander population, a seed
bank and a nesting season cannot.

Almost all of that outcome is decided in the first hour. A fire found while it
is still small enough to be attacked directly is a fundamentally different event
from the same fire found an hour later, and the difference between those two
worlds is measured in minutes of detection latency.

Camera based detection already works and is already deployed. Pano AI monitors
more than 50 million acres across the US, Canada and Australia. But look closely
at how they make it trustworthy: every candidate detection is reviewed by a
human analyst in a staffed incident center, because, in their own framing, this
is too important to get wrong.

That instinct is correct, and it is also the bottleneck. Human judgement is what
makes machine detection safe to act on, and it is precisely the part that does
not come free. A county with four cameras and no budget for a 24/7 analyst desk
does not get to buy that confidence. Neither does a land trust, a tribal
forestry office, or a research reserve.

So the interesting problem is not "can a model see smoke in a photograph." A
single frame cannot separate smoke from fog, from dust, from a low sun blooming
across a lens. The interesting problem is what you do with a score you do not
fully trust, and how you hand that uncertainty to a person in a form they can
act on in seconds. A system that cries wolf at 2am in August gets muted in week
three, and a muted detector protects nothing at all.

## What it does

Ridgeline polls mountain cameras, scores every frame for smoke, and refuses to
raise an alert until the score clears the threshold on **three consecutive
frames**. That rule is the product. Everything else exists to make the rule
legible to the person who has to act on it.

**A watch floor.** A contact sheet of every camera, sorted so anything needing
attention is above the fold. Each camera carries a frame strip that draws the
decision rule itself: bar height is that frame's score, a hairline marks the
threshold, and three bars over the line looks visibly different from one spike
over the line. The operator sees the evidence, not just the conclusion.

**An answer to every alert.** Real fire, false alarm, or seen and undecided. The
verdict is stored in its own column beside the model's claim, never written over
it, so a disagreement between a person and the scorer survives as a record
rather than silently erasing what the machine actually said.

**A reference wipe.** Press `C` on any camera and drag between the current frame
and the known clear frame the scorer is actually comparing against. The model
always had both halves of that comparison. Now the person does too.

**Audible alerting that behaves.** Off until you turn it on, plays its tone once
when you do so you know what it sounds like, and per camera mutes that always
expire and are always visible. A mute you can forget about is how a monitoring
tool goes quiet permanently.

**Keyboard triage.** `J` and `K` to move, `Enter` to open, `R`, `F` and `A` to
answer. During an incident the mouse is the slow path.

**A shift handoff.** A dedicated view over 8, 12 or 24 hour windows with
unanswered alerts pinned to the top regardless of age, because an alert nobody
can close is exactly how these systems lose credibility.

The front page is a scroll scrubbed sequence of a real fire. Every confidence
number on it was produced by the same scorer the worker runs.

## How we built it

**Detection: a tile based frame differencer.** Each frame is cut into a 16 by 12
grid, and a tile scores only if it is *both* changing against a frozen reference
*and* losing saturation, because smoke veils what is behind it. Either signal
alone is a bird or it is haze. Clipped tiles score zero, which removes the worst
false positive these cameras produce: a low sun whose bloom changes shape every
minute.

The reference is frozen rather than rolling, and refreshes only after 12
consecutive clear frames. Score a window against its own recent frames and a
slowly growing plume works its way into the background and erases its own
signal within minutes.

**The decision layer lives in the web app, not the worker.** The threshold and
the consecutive frame count can change without redeploying anything that touches
a camera.

**A trained model exists, and it lost.** A ResNet18 plus LSTM over frame
sequences, fine tuned on FIgLib with a per camera split. It underperformed the
heuristic on every measure that matters. Both sets of numbers are in the README,
rather than only the flattering one.

**Scale.** 1,559 lines of Python across the model and ingestion services, 4,875
lines of TypeScript, 2,576 lines of CSS, 11 API routes, 24 React components, 5
Postgres tables, 3 migrations that apply themselves on boot, and 112 files
total. Python, PyTorch, torchvision, FastAPI, NumPy and Pillow for the model.
Python and httpx for ingestion. Next.js 15 App Router, TypeScript, Drizzle,
postgres.js, Postgres 16 and Leaflet for the web. Docker Compose for all of it.

**Design as a constraint, not a coat of paint.** 28 design tokens, of which 14
are colours, and a rule that saturated colour appears only to encode risk.
An automated audit walks every rendered colour on both surfaces and fails on
anything outside the declared set.

## Challenges we ran into

**A metric that flattered us.** The validator reported five fires found out of
five. Two of those "detections" were a cloud and a lens vignette that happened
to occur after ignition. A confirmation now counts as a find only if the
bounding box centre falls inside a hand verified plume region, the honest score
is four of five, and a permanent regression test keeps the two bad boxes
failing so they can never quietly pass again.

**Two demo sequences with no fire in them.** Bundled sequences were checked
frame by frame and two contained no visible plume at all. They were replaced,
and every remaining sequence was opened and verified by eye.

**Training on the demo.** The replay cameras were in the training set.
They are held out now, so validation measures performance on cameras the model
never fitted.

**A design system that caught its own violation.** The automated colour audit
found a saturated green live connection dot, a default white range input, and a
basemap shade that an `!important` was forcing. All three are gone. Both
surfaces now audit at zero off system colours.

**A handoff full of deleted evidence.** The frame volume kept a rolling window
about ten minutes deep, so a 24 hour handoff pointed almost entirely at images
that no longer existed. Frames that raised an alert are now held back from
pruning.

## Accomplishments that we're proud of

**The alerting rule is visible, not asserted.** The frame strip renders the
three consecutive frames rule as a shape you can read at a glance across a whole
grid of cameras. Nobody has to trust a number they cannot inspect.

**The front page argues with real data.** Scroll scrubbing a real fire while the
real per frame scores climb is only possible because the manifest is generated
by the production scorer, not drawn by hand.

**We publish the miss.** The Santa Margarita fire ships with the demo and the
model never catches it. It is on the front page, under a heading that says
"What it does not do."

**`docker compose up` and nothing else.** Verified from wiped volumes with no
`.env` file: all four services healthy in 30 seconds, all three migrations
applied to a fresh database, first real alert 82 seconds later.

## What we learned

**The scary number was not the one we expected.** Sweeping the consecutive frame
rule from N=1 to N=5 across the real data, false alarms stayed at zero at
*every* value, because the scorer never once called clear sky smoke on this set.
So on this data the rule buys no measurable reduction in false alarms. What it
costs is very visible: roughly one minute of median latency per step. N=3 is
simply the largest value that still catches every fire the set contains. That is
stated on the front page as an argument rather than a demonstration, because the
data does not support the stronger claim.

**Accuracy is the wrong metric, and we never report it.** On a camera that is
clear 99.9 percent of the time, a model that always says "no smoke" scores 99.9
percent. Precision, recall, and false alarms per camera per day are the numbers
a dispatcher's decision actually depends on.

**Interface decisions are safety decisions.** Storing the operator's verdict in
the same column as the model's reading would have silently destroyed the
model's claim every time a human disagreed. That is a schema detail and it is
also the difference between a system you can audit after a bad night and one you
cannot.

## How Ridgeline fits in

Public camera networks already exist. HPWREN and ALERTWildfire put hundreds of
mountain cameras online, and their imagery is free to look at right now.
Commercial detection on top of those feeds also exists, and it works: Pano AI
covers more than 50 million acres.

The gap is not sensing. It is confirmation. Pano's answer to "how do we know
this alert is real" is a staffed incident center where analysts review every
candidate. That is a good answer and an expensive one, and it is available in
proportion to budget.

Ridgeline is a different answer to the same question. Instead of adding people
to filter the machine, it makes the machine's uncertainty legible enough that
one person already on shift can adjudicate in seconds: the temporal rule
suppresses the single frame flukes automatically, the frame strip shows why an
alert fired, the reference wipe shows what the model was comparing against, and
the verdict column records what the human concluded without overwriting what the
machine claimed. It runs on cameras that are already public and already free.

Nobody should confuse this with a deployable replacement for a staffed watch
desk. It is an argument, backed by a working system and a reproducible
measurement, that the confirmation layer deserves as much engineering as the
classifier, and that a well designed one can put usable detection within reach
of places that cannot buy an analyst.

## Feasibility and what deployment would actually take

The compute is deliberately unremarkable. The shipped detector is a tile based
differencer that runs on CPU in well under a second per frame, so a five camera
site is comfortably a single small always on machine, not a GPU fleet. At a two
minute polling interval, five cameras is roughly 3,600 frames a day. There is no
per inference API cost, which is the reason the heuristic winning over the
trained network is good news rather than a disappointment: the cheap thing is
also the accountable thing, and it keeps the carbon and dollar cost of running
this near zero.

What deployment honestly requires beyond what exists today: many more clear sky
hours before the false alarm rate means anything (54 observed minutes is far too
small a denominator), a real notification path to the people who respond,
per site threshold tuning because a coastal camera and a desert camera do not
behave alike, and a conversation with the camera network operators about polling
etiquette. HPWREN imagery is published CC BY-NC-ND 4.0, which is why this
repository downloads it at runtime and never redistributes it.

## What's next for Ridgeline

- **Cross camera triangulation.** Two cameras seeing the same plume on different
  bearings gives a position, not just an alert. That turns a detection into a
  dispatchable location.
- **An incident view.** One link that collects the frames, the score curve and
  the verdicts behind a single event, pasteable into an incident channel.
- **Escalation.** An unanswered confirmation should get louder, or reach a second
  person, after some number of minutes.
- **Many more clear sky hours,** so the false alarm rate rests on a denominator
  that can carry it.
- **Habitat layers on the map,** so a confirmed detection can be read against
  the ranges of the species it threatens, rather than only against roads and
  structures.

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
git clone https://github.com/ayaan-gupta/ridgeline && cd ridgeline
docker compose up
```

Open http://localhost:3100. No `.env` and no manual steps. Replay imagery
downloads on first run, because HPWREN publishes it under a licence that does
not permit redistribution.

Reproduce the numbers:

```bash
docker compose exec model python validate_replay.py
docker compose exec model python sweep_consecutive.py
docker compose exec model python test_validation.py
```

---

## Sources for the claims in Inspiration

- 2025 US fire season totals, 72,068 fires and 5,039,145 acres: National
  Interagency Fire Center year end figures.
- Range overlap for roughly 50 vertebrate species, and the 2020 mountain lion
  mortality estimate: reporting on California biodiversity impacts of the 2020
  fire season.
- Pano AI coverage and human in the loop review: MIT Technology Review 2024
  Climate Tech Companies to Watch, and Pano AI product documentation.

---

## Demo video script, 2 minutes 30

**0:00 to 0:20. The claim.**
Open `/`. Let the hero land: "ONE FRAME IS NOT A FIRE" over a real camera frame.
Read the sub-line aloud. Say the camera and coordinates are real, and so is the
photograph.

**0:20 to 1:00. The reel.**
Scroll into the sticky sequence. Narrate as it goes: nineteen minutes of
nothing, the score flat at 0.04. Then a false start that climbs and falls back,
which is the honest part. Then 0.59, 0.97, 0.999. Watch the strip fill, the chip
turn from clear to watching to confirmed, and the box draw on the plume. Land
on: "three consecutive frames, and the alert goes out here, fifteen minutes
after ignition."

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

## What only you can do

1. **Record the demo video** using the script above and put the link in
   Devpost's video field. Devpost wants YouTube or Vimeo.
2. **Take the screenshots** in the shot list and upload them to the gallery. The
   first becomes the thumbnail, so use the hero.
3. **Pick the prize categories** on the submission form.
4. **Add your team members** by Devpost handle.

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
