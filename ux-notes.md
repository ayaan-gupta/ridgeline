# Ridgeline UX

What the flows actually are, which ones were built, and which ones were not.

---

## Who this is for

A dispatcher or duty officer at a county emergency communications center, or the
wildfire mitigation desk at a utility. During fire season Ridgeline is on one of
four or five monitors.

The important thing about that person is that **they are not looking at it.**
They are on a radio, or in CAD, or on the phone. Ridgeline is not competing for
attention with other dashboards. It is competing with a live incident.

That single fact decides almost every call below.

---

## The job, stated honestly

It is not "monitor cameras." Nobody watches forty sky photographs.

The job is: **when the system makes a claim, decide within about thirty seconds
whether to act, and leave a record of having decided.**

Three verbs. Interrupt, judge, record. The first build did the first one well,
the second one partly, and the third not at all.

---

## The flows

### 1. Ambient watch

Where the product spends 99.9% of its life. Nothing is happening and the screen
should not tire anyone.

This was already right and is unchanged. No green dots, no ambient motion, clear
rendered as silence rather than as a wall of colour. The one thing added is that
the live indicator stopped being a saturated green, which was a fifth status
colour competing with the four real ones.

### 2. Interrupt

A run reaches three consecutive frames and the banner appears.

**Built.** The banner names the camera, the confidence and the consecutive
count, so the claim can be judged rather than only received.

**Built: sound and browser notification.** This is the only thing on the
dashboard that can reach an operator looking at a different monitor, which is
most of the time. It is held in place by three rules, because sound is also the
fastest way to get a monitoring tool switched off for good.

1. **Off until someone turns it on.** A tool that starts making noise on first
   load gets muted before it has earned anything. Turning it on plays the tone
   once, which is the only honest way to find out what the room will sound like
   at three in the morning, and doubles as the gesture browsers require before
   any audio can play.
2. **Every mute expires.** Fifteen minutes, an hour, or four. A permanent mute
   is indistinguishable from a broken camera and is invisible six weeks later
   when it matters.
3. **A mute is visible while it is in force.** The top bar carries a count that
   unmutes everything when clicked. The dangerous state is not "muted", it is
   "muted and forgotten".

The tone is generated rather than shipped as an audio file: two short rising
pulses, deliberately plain. A pleasant chime gets learned as background and a
siren gets muted the first time it fires on cirrus.

It rings on the detection id changing, not on the state, because a camera stays
confirmed for as long as its run holds and ringing on the state would produce a
tone every few seconds for minutes. The first pass after a page load records
what is already on screen without announcing it, so opening the dashboard onto a
ten minute old alert does not sound like a new one.

Muting a camera is deliberately a separate act from answering it. A camera that
keeps re-confirming while a crew is already on scene should be quietened without
anyone pretending it has been resolved.

### 3. Judge

Open the camera, look at the frame, look at the window.

**Built already:** the frame strip renders the decision rule itself, so the
operator can see three bars over the line rather than one spike, which is the
difference between a real plume and a bird.

**Built: the reference comparison.** The judgment an operator is actually making
is not "is there smoke in this photograph", which is hard. It is "does this
differ from what this camera normally looks like", which is easy once both
images are in front of you. The model has always had both halves. Now the person
does too.

This needed a pipeline change before it could be a UI change. The worker holds a
frozen background of known-clear frames and freezes it the moment anything
crosses the threshold, but those paths existed only inside the worker and the
model service. The worker now sends them with each scored frame and the web app
records which one the scorer compared against.

A wipe rather than two images side by side. Side by side asks the eye to hold
one frame in memory while it looks at the other, and a plume against a hazy ridge
is exactly the kind of low contrast difference that does not survive that trip.
Wiping puts the difference in the same pixels. Bound to `C`.

No difference blend and no false colour map. That would be the interface
deciding what changed, which is the operator's job and the one thing this
comparison exists to hand back to them.

### 4. Record

**This was the hole.** There was no verdict. A confirmation could be raised and
never answered, which has three consequences, in increasing order of severity:

1. The banner never clears, so the next one is trusted less.
2. There is no shift handoff. Nobody can ask what happened last night.
3. The system never learns which of its claims were right, so the false alarms
   it produces are never labelled and the model can never improve on them.

**Built.** Four states, and the middle one matters:

| Verdict | Means |
|---|---|
| Unanswered | Nobody has looked. This is what raises the banner. |
| Seen, undecided | Someone looked and does not know yet. |
| Real fire | Someone looked and there is a fire. |
| False alarm | Someone looked and there is not. |

"Seen, undecided" exists because the honest answer thirty seconds in is usually
"I have seen it and I do not know," and a tool that forces a premature choice
gets given a wrong one. Forcing real-or-not immediately would corrupt the exact
dataset the verdict exists to produce.

The verdict is written to its own column beside the scorer's `status`, never over
it. The first version of this overloaded `status`, and marking something a false
alarm silently erased the fact that the model had called it confirmed. The tile
still shows the state the scores produced, in the colour the scores earned, with
the verdict underneath. **The disagreement between a person and the model is the
most valuable record this system keeps, and it only exists if both halves
survive.**

### 5. Hand off

End of shift: what fired, what was decided, what is still open.

**Built.** `/handoff` over the last eight, twelve or twenty four hours.
Unanswered alerts sort to the top and stay there regardless of age, because the
only thing that must not be lost at a handover is the alert nobody looked at.
Each row can be answered in place, so the outgoing shift can close what it knows
before it leaves.

One row per alert, not per confirmed frame. A run that holds for eight frames
writes eight detection rows and fires exactly one alert, and a handoff listing
all eight would report a single fire as eight events, which is the same
exaggeration the consecutive-frame rule exists to prevent.

The frame volume prunes to the most recent frames per camera, which is right for
a live dashboard and was wrong for a handoff: over a shift, almost every row
pointed at an image that had already been deleted. The worker now holds back any
frame that raised an alert, so the evidence outlives the rolling window. Rows
whose frame is genuinely gone say "frame pruned" rather than showing an empty
box.

### 6. Retrospect

After a fire: when did we first see it, and what did the camera show.

**Not built.** The data is all there. What is missing is an incident view that
collects the frames, the score curve and the verdicts into one page with a
shareable link.

---

## Interaction rules for a room like this

**Keyboard first.** During an incident the mouse is the slow path and the other
hand is on a radio. Built: `J`/`K` to move, `Enter` to open, `R`/`F`/`A` to
answer, `C` to compare against the reference, `?` for the list. Keystrokes are
ignored while a text field has focus, so typing a position label cannot record a
verdict.

**Never move anything under the cursor.** The grid sorts by risk so a confirmed
camera cannot be below the fold, then by name, so a refresh never reshuffles.
De-escalation is deliberately not animated: a camera going quiet should not pull
the eye.

**The selection ring is not a state colour.** Keyboard selection is a neutral
outline, so it can never be confused with the rail that carries risk.

**Identity is a label, not a login.** Verdicts carry a position typed into the
top bar at the start of a shift, and the field says it is not a sign in. A real
account system here would imply a guarantee this product cannot make.

---

## What was deliberately not done

- **A settings screen.** Threshold and consecutive count are environment
  variables. Putting them in the UI invites someone to lower the threshold during
  a quiet week and forget.
- **A permanent mute.** Every mute expires. A camera cannot be silenced for a
  season by one tired click.
- **Dismissing a detection outright.** Every alert gets an answer or stays open.
  There is no "make this go away."
- **An onboarding tour.** The empty state names the file to edit.

---

## What is still open

**An incident view.** After a fire, someone wants one page: when the camera first
saw it, the score curve, every frame, and the verdicts, behind a link that can be
pasted into an incident channel. All of the data exists. Nothing collects it.

**Escalation.** Right now an unanswered alert stays unanswered forever and only
the top bar counts it. A real watch floor would want an unanswered confirmation
to get louder, or to reach a second person, after some number of minutes.
