# Reference research notes

Captured 2026-08-15 by direct browsing, not from memory. Every hex below was read
out of a live page via computed styles or CSS custom properties.

## What I actually looked at

### awwwards.com
- `/websites/dashboard/` returned agency portfolio sites (ZeeFrames UI UX Design
  Agency, ThemeMakker, Winter Studio). This is the templated end of the site and
  was not useful.
- `/websites/sites_of_the_day/` (Aug 12-15 2026 winners: PX PUSH, curiosity-wen,
  Tubik, Revelatio Studio) is expressive marketing work: 3D product renders,
  oversized display type, saturated brand color, full-bleed image beds.
- **Verdict:** the layout vocabulary here is wrong for a life-safety console and
  most of it is on the 17.3 avoid list. The one transferable lesson is type
  confidence: award-winning work commits to a real type scale with wide contrast
  between display and body sizes instead of hedging at 16px/24px/32px.

### mobbin.com
- `/browse/web/apps` then the Dashboard screen-pattern filter (1,166 screens).
- Hard paywalled: "Upgrade for full access beyond the 4 latest apps," and the
  dashboard screens themselves render blank behind "Access all 640,113 screens."
- **Verdict:** could not read this source. Not going to pretend otherwise. The
  ops-pattern research below came from live products instead, which is a better
  source anyway since it is the running software rather than a screenshot of it.

### Linear (linear.app)
Read from `:root` custom properties (478 of them).
- Light: bg `#f9f9fa`, sidebar `#efeff0`, border `#e2e2e2`
- Dark: sidebar `#09090a`, base `#121213`, border `#212224`
- **Lesson:** the sidebar is *darker* than the content area in dark mode, and the
  border color sits only ~15% above the surface it separates. Separation is done
  with hairlines at very low contrast, never with shadow.

### Vercel Geist (vercel.com/geist/colors)
- `--geist-radius: 6px`, marketing radius `8px`
- Gray ramp is pure neutral: `hsla(0, 0%, 10%)` through `hsla(0, 0%, 93%)`, zero
  hue. Accent ramps are in oklch.
- `--ds-shadow-border-base: 0 0 0 1px #00000014` - the "shadow" is a hairline.
- **Lesson:** small radius, hue-free neutrals, borders-as-shadows.

### Stripe (docs.stripe.com)
- Body text `rgb(60, 66, 87)` = `#3C4257`. Not gray: a blue-leaning slate.
- Base font size 14px. `--sail-radius-2: 2px`, `--sail-radius-4: 4px`.
- `--sail-color-text-green: rgb(9, 130, 93)` = `#09825D`
- **Lesson:** semantic colors are deep and desaturated, not bright. Radii are
  tighter than almost anything on awwwards. Neutrals carry a slight hue.

### Grafana (play.grafana.org) - closest true analogue
- Body background `rgb(17, 18, 23)` = `#111217`, a cool near-black.
- Body text `rgb(204, 204, 220)` = `#CCCCDC`. **Never pure white.** Slightly
  blue, slightly dim.
- Base font size 14px, `border-radius: 0` on app chrome.
- Alert rules list: full-width rows, hairline separators, tiny label chips, no
  card elevation at all.
- **Lesson:** the highest-density ops tool in the set uses the least decoration.
  Dimmed cool text on cool near-black is the actual control-room convention, and
  it exists because pure white on pure black vibrates during long shifts.

### HPWREN (hpwren.ucsd.edu/cameras) - the actual domain
- Cameras are named `Site name` + cardinal FOV with bearing: "Cuyamaca Peak FFOV
  Color N 0 deg". Sites carry lat/lng plus elevation in both m and ft.
- Live still endpoints:
  - full: `https://cdn.hpwren.ucsd.edu/RT/{site}-{dir}-mobo-c.jpg`
  - 640px: `https://cdn.hpwren.ucsd.edu/RTS/{site}-{dir}-mobo-c-640.jpg`
  - cache-busted with `?t={epoch_ms}`
- Real site ids confirmed: `bm` Big Black Mountain, `bi` Birch Hill, `bh` Boucher
  Hill, `cp` Cuyamaca Peak, `hp` High Point, `pi` Los Pinos, `lp` Lyons Peak,
  `mp` Monument Peak.
- **Licensing (hpwren.ucsd.edu/cc.html): CC BY-NC-ND 4.0.** Non-commercial,
  no-derivatives, attribution required. This is a real product constraint, not a
  footnote: live polling ships opt-in and off by default, and attribution is
  rendered in the UI wherever a live frame appears.
- **Lesson for the interface:** operators already think in
  `site + bearing + elevation`. Inventing our own camera naming would fight
  fifteen years of muscle memory. The UI uses their vocabulary verbatim.
