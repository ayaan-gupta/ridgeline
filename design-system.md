# Ridgeline design system

Derived from the reference research in `design/research-notes.md`. Every screen
pulls its color, type, spacing, radius and motion from this file. Nothing here is
relitigated per-component.

Product name: **Ridgeline**. The cameras sit on mountain ridgelines and watch the
horizon line for the first vertical break in it. The PRD's working name "Sentry"
collides with a well-known error-monitoring product, so it was renamed as the PRD
invited.

---

## 1. The one idea this system is built on

**The interface is 80% photographs of the sky. The chrome must not lie about
color.**

Every other decision follows from that. An operator's core judgment is "is that
gray smudge on the ridge smoke, or is it fog, or is it dust." That judgment is
made on hue and value inside a photograph. So:

- The chrome is **hue-neutral to slightly cool**, never warm. A warm interface
  pushes the eye's white balance and makes ordinary haze read as smoke.
- There is **no brand accent color.** A teal or indigo brand color sitting next
  to a photograph of the sky is a second opinion the operator did not ask for.
- Saturated color appears **only** to encode risk state. When something on this
  screen is orange or red, it is because the system is making a claim about a
  fire. Nothing decorative is ever allowed to be those colors.
- This rule caught a real violation. The live-connection dot was built as a
  saturated green, which is both a fifth status color competing with the four
  real ones and the most generic move available in dashboard design. Liveness is
  now carried by lightness and a slow pulse instead. Green-means-healthy is a
  convention this product has no use for anyway: a clear camera is not a success,
  it is the normal state, and 38 green dots would be noise the two that matter
  have to fight through.

This is also why the anti-slop list in PRD 17.3 is easy to satisfy here rather
than a constraint to work around: gradient washes, glass panels and glow effects
are all things that would tint or veil a photograph.

---

## 1b. Two rooms

The product has two surfaces and they get different permissions.

The **console** is everything under `/watch`. Section 8 bans ambient motion
there, the display face is capped at 30px, and every rule in this document
applies without exception. It is read at a desk during an incident.

The **front page** at `/` is read once, at arm's length, by someone deciding
whether this is serious. It is allowed the display face at nine rem, a page that
carries momentum, and a scroll driven reel. That is not a relaxation of the
system, it is the same system at a different reading distance.

Three rules cross the boundary intact, and they are the ones that matter:

1. **No brand accent, on either surface.** Every button, rule and label on the
   front page is neutral. The two moments of orange and red on it are a real
   detection crossing a real threshold, which is why they land.
2. **Nothing tints a photograph.** The front page HUD panels are opaque rather
   than blurred. Covering part of a frame is honest. Frosting it is not, and a
   backdrop filter over a landscape redistributes exactly the colours the whole
   product claims not to touch. The one gradient in the codebase is the hero
   scrim, which adds no hue: it is the page background fading up so a headline
   holds contrast, and it is commented as such.
3. **Every number is a measurement.** No sequence on the front page was drawn to
   look convincing. `model/build_reel.py` runs the identical loop the worker
   runs, and the honest result is on the page including the parts that do not
   flatter the scorer.

---

## 1c. A verdict answers a claim, it never replaces it

The operator's verdict lives in its own database column next to the scorer's own
`status`. The first version of this overloaded `status`, and marking a detection
a false alarm silently erased the fact that the model had called it confirmed.

That is worth stating as a rule, because it is the same rule as everything else
here: the interface does not get to quietly rewrite what happened. A tile whose
detection a person called a false alarm still shows the state the scores
produced, in the colour the scores earned, with the verdict underneath it. The
disagreement between a person and the model is the most useful record this
system keeps, and it only exists if both halves survive.

---

## 2. Color

### Chrome (neutral, cool, recedes behind imagery)

| Token | Hex | Use |
|---|---|---|
| `--surface-base` | `#0E1013` | Page background. Deepest layer. |
| `--surface-raised` | `#16191E` | Camera tiles, panels, table bodies. |
| `--surface-inset` | `#1C2027` | Wells: the frame strip track, inputs, code. |
| `--line` | `#262B33` | Default hairline. Separates without announcing. |
| `--line-strong` | `#363D47` | Focus rings, active tab underline, table head. |

Sampled against Grafana's `#111217` and Linear's `#121213`. Ridgeline sits a
touch deeper and a touch cooler so that a 640px daylight sky photo, which is the
brightest thing on the screen, has the widest possible value gap from its frame.

### Text (never pure white, per the Grafana finding)

| Token | Hex | Use |
|---|---|---|
| `--text-primary` | `#E4E7EB` | Camera names, headings, values that matter. |
| `--text-secondary` | `#9BA3AE` | Labels, column heads, supporting copy. |
| `--text-muted` | `#646C78` | Timestamps at rest, disabled, hint text. |

`#E4E7EB` measures 14.8:1 on `--surface-base` and 12.1:1 on `--surface-raised`.
`--text-secondary` holds 6.4:1 on raised, `--text-muted` holds 3.4:1 and is
therefore never used for anything an operator must read to make a decision.

### Risk state (the only saturated color in the product)

| State | Token | Hex | Meaning |
|---|---|---|---|
| Clear | `--state-clear` | `#2A2F37` | Model sees nothing. Deliberately colorless. |
| Watching | `--state-watching` | `#D98A1F` | Above threshold, not yet N consecutive. |
| Confirmed | `--state-confirmed` | `#F2555A` | N consecutive frames crossed. Alert fired. |
| Offline | `--state-offline` | `#5A6472` | No recent frame. Not a fire signal. |

**Clear is not green, and that is the most deliberate call in this system.** In a
grid of forty cameras, thirty-eight are nominal. Painting thirty-eight green dots
produces a wall of color that the two cameras that actually matter have to
compete with. Silence is the correct rendering of "nothing is happening." Green
would be decoration pretending to be information.

**Offline is not red.** A camera that stopped sending frames is an operations
problem, not a fire. Collapsing those two into one alarming color is how a system
teaches its operators to ignore red.

### Color is never the only channel

Roughly 8% of men have red-green color vision deficiency, and this is a
life-safety tool, so every state is encoded three ways at once:

1. **Hue** as above.
2. **Luminance**, ordered monotonically with severity, so the grid still reads
   correctly in grayscale: clear `0.03` < offline `0.14` < confirmed `0.26` <
   watching `0.33`.
3. **Form.** Clear has no rail. Watching draws a 2px left rail. Confirmed draws a
   3px full-perimeter rule plus a filled state chip. Offline draws a 45-degree
   hatch over the frame area, which is unmistakable at any distance and in any
   color perception.

Plus the literal word, always: "Clear", "Watching", "Confirmed", "Offline".

---

## 3. Type

Three faces, all from the **IBM Plex** superfamily. Plex was commissioned for
technical and industrial contexts, which is the register this product needs, and
using one superfamily means the three faces share skeleton and metrics rather
than being an arbitrary pairing. It is emphatically not Inter-for-everything, and
it is not a decorative display face bolted onto a dashboard either.

| Role | Face | Where |
|---|---|---|
| Display | **IBM Plex Sans Condensed**, 600 | Exactly three places. See restraint note. |
| UI / body | **IBM Plex Sans**, 400/500/600 | Camera names, copy, controls, labels. |
| Data | **IBM Plex Mono**, 400/500 | Timestamps, lat/lng, confidence, IDs, bearings. |

**Restraint on the display face.** Condensed appears in exactly three positions
and nowhere else: the wordmark in the rail, the page title on each screen, and
the headline of a confirmed-detection banner. It earns those because condensed
type is what signage and instrument panels use when space is tight and legibility
at a glance is the whole job. Using it a fourth time would make it a texture
instead of a signal.

**Mono is functional, not aesthetic.** Every number on this screen updates live.
Plex Mono's tabular figures mean a confidence value going from `0.61` to `0.09`
does not reflow the row, and a clock ticking over does not shift the layout under
the operator's cursor. Proportional digits in a live dashboard are a bug.

### Scale

Base is 14px, matching both Grafana and Stripe. Dense tools do not use 16px.

| Step | Size / line-height | Tracking | Use |
|---|---|---|---|
| `display-lg` | 30 / 34 | -0.02em | Confirmed banner headline |
| `display-md` | 21 / 26 | -0.01em | Page titles |
| `body-lg` | 15 / 22 | 0 | Camera name on a tile |
| `body` | 14 / 20 | 0 | Default |
| `body-sm` | 13 / 18 | 0 | Secondary copy, table cells |
| `label` | 11 / 14 | 0.06em, uppercase | Column heads, state chips |
| `data` | 12 / 16 | 0 | Mono. Timestamps, coordinates, scores. |
| `data-sm` | 11 / 14 | 0 | Mono. Dense table columns. |

---

## 4. Spacing

4px base increment. Permitted values only: **4, 8, 12, 16, 24, 32, 48, 64**.

- Inside a tile: 12
- Between tiles: 8. Tight on purpose. Camera tiles are a contact sheet, and a
  contact sheet's value is comparison across frames, which wide gutters destroy.
- Page gutter: 24
- Between major sections: 32

Grid: `repeat(auto-fill, minmax(300px, 1fr))`. 300px is the smallest width at
which a 640px HPWREN frame still shows a readable horizon.

---

## 5. Radius

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | `2px` | State chips, badges, inputs. |
| `--radius` | `3px` | Tiles, panels, buttons. Default. |
| `--radius-lg` | `4px` | Modals, the alert banner. |
| none | `0` | State rails, frame-strip bars, table rows, the image itself. |

Tight, following Stripe's 2/4 and Geist's 6 rather than the 12-16px that reads as
consumer software. **Nothing in this product is a pill,** and the frame strip and
state rails are deliberately square: they are measurement marks, and rounding a
measurement mark makes it look like a decoration.

---

## 6. Elevation

Hairline borders do essentially all the work, per Linear and Geist.

- Default separation: `1px solid var(--line)`. No shadow.
- Hover on an interactive tile: border moves to `--line-strong`. No lift, no
  scale, no shadow.
- **One** real shadow exists in the product: the confirmed-detection banner,
  `0 4px 16px rgba(0,0,0,0.5)`. It is the only element allowed to float, because
  it is the only element that interrupts.

No glassmorphism, no backdrop blur, no glow. A frosted panel over a photograph
destroys the photograph.

---

## 7. Signature element: the frame strip

**What it is.** Every camera tile and every detection row carries a compact strip
of vertical bars, one per frame in the model's sliding window, oldest at left.
Bar height is that frame's smoke probability. A horizontal hairline crosses the
strip at the confirmation threshold. Bars above the line are drawn in the current
state color, bars below in `--line-strong`.

```
      threshold
  ────────┬─────────────────
  ▁  ▂  ▁ │ ▅  ▆  ▇        <- three consecutive above -> Confirmed
          │
  ▁  ▇  ▁ │ ▂  ▁  ▂        <- one spike, suppressed -> Clear
```

**Why this product specifically.** PRD 16.6 says the temporal-consistency rule
matters more than model accuracy, because it is what keeps false positives
survivable. That rule is the actual product. But a bare "Confirmed 0.81" chip
hides it: the operator cannot tell a real growing plume from a bird that crossed
the lens, and cannot tell why the system stayed quiet during a glare spike.

The frame strip renders the decision rule itself. Three bars over the line is
visibly different from one spike over the line, at a glance, across a grid, with
no interaction. It turns "trust the model" into "look at the evidence," which is
the difference between a tool a dispatcher uses and one they mute.

It also carries real weight elsewhere in the system: it is the form-based
redundancy that makes risk state readable without color, and it is the one place
motion is allowed, because a bar entering the strip is the literal heartbeat of
the pipeline.

No other dashboard has this, because no other dashboard's core logic is
N-consecutive-frames.

---

## 8. Motion

Ambient motion is banned. Motion happens at exactly four moments, and each one
means something:

| Moment | Motion | Duration |
|---|---|---|
| A frame enters the strip | New bar fades in and the strip shifts left one slot | 180ms `ease-out` |
| Risk state escalates | Rail and chip cross-fade to the new state color | 240ms `ease-out` |
| Detection confirmed | Banner slides down 8px and fades in | 260ms `cubic-bezier(.2,.7,.3,1)` |
| Frame image refreshes | New image cross-fades over the old | 200ms linear |

De-escalation is deliberately **not** animated. A camera going quiet should not
draw the eye.

All of it sits behind `@media (prefers-reduced-motion: reduce)`, which drops
every one of these to an instant swap.

---

## 9. Voice

Per PRD 17.4, enforced by a script in `scripts/check-copy.mjs` that fails the
build on violation.

- **No em dashes anywhere.** Not in UI, empty states, errors, comments, or this
  file.
- Operator nouns only: cameras, frames, detections, alerts. Never "ingest queue",
  "inference job", "worker", "buffer".
- Controls say what they do: "Fire test alert", not "Submit". "Dismiss
  detection", not "Cancel".
- Empty states give direction: "No cameras configured yet. Add one in
  `ingestion/camera_config.yaml` and restart." Not "No data."
- No filler adjectives. If a sentence would survive deleting the adjective,
  delete it. `scripts/check-copy.mjs` holds the banned list.

---

## 10. 17.3 checklist

| Pattern to avoid | Status |
|---|---|
| Gradient backgrounds, buttons, glows | Absent. No `linear-gradient` in the codebase. |
| Cream + serif + terracotta | Absent. Cool near-black, no serif. |
| Near-black + one neon accent | **Avoided deliberately.** Dark, but three semantic state colors that appear only on state, plus zero brand accent. The distinguishing test: remove all risk state and this UI has no color at all. A neon-accent design still glows. |
| Broadsheet / hairline-rule editorial | Absent. Hairlines are structural, not a motif. |
| Centered badge + headline + CTA hero | Absent. No marketing surface exists. |
| Icon-grid feature blocks | Absent. |
| Floating icon pills, fake dashboard mockups, BETA badges | Absent. Every frame shown is a real frame. |
| Glassmorphism | Absent. Banned in section 6 with a reason. |
| Blanket over-rounded corners | Absent. Max radius 4px. |
| Default Inter for everything | Absent. Three deliberate Plex faces with stated jobs. |
| Testimonial carousels, footer link dumps | Absent. |
| Decorative 01 / 02 / 03 markers | Absent. Numbers appear only as real measurements. |
| Ambient motion everywhere | Absent. Four named moments, section 8. |
| "Clean and modern" driving decisions | Every decision above traces to a research finding or a stated product constraint. |
