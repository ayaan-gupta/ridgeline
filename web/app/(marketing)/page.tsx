import { readFile } from "node:fs/promises";
import { join } from "node:path";

import Link from "next/link";

import { Pipeline } from "@/components/site/Pipeline";
import { RuleDial } from "@/components/site/RuleDial";
import { ScrubReel } from "@/components/site/ScrubReel";
import { CountUp, RevealLines } from "@/components/site/motion";
import type { Reel, Sweep } from "@/components/site/types";

export const metadata = {
  title: "One frame is not a fire",
};

async function readManifest<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(join(process.cwd(), "public", "reel", name), "utf8")) as T;
}

export default async function LandingPage() {
  // The Beaver Fire is the reel because its score curve is the honest one: a
  // long flat baseline, a false start that falls back, then a climb that holds.
  // A sequence that went straight up would make the scorer look better than it
  // is.
  const [reel, sweep, miss] = await Promise.all([
    readManifest<Reel>("beaver-fire.json"),
    readManifest<Sweep>("sweep.json"),
    readManifest<Reel>("smer-tcs8-20190829.json"),
  ]);

  const hero = reel.frames[0];
  const shipped = sweep.results.find((r) => r.n === 3)!;
  const fastest = sweep.results.find((r) => r.n === 1)!;
  // Read off the sweep rather than written down. A latency cost typed into the
  // copy goes stale the first time the scorer changes and nobody notices.
  const latencyCostMinutes = Math.round(
    ((shipped.median_latency_seconds ?? 0) - (fastest.median_latency_seconds ?? 0)) / 60,
  );
  const peakMiss = Math.max(...miss.frames.map((f) => f.score ?? 0));

  return (
    <>
      <section className="hero">
        <img
          className="hero-frame"
          src={"/api/reel/" + reel.sequence + "/" + encodeURIComponent(hero.file) + "?w=1600"}
          alt={
            "The view from " +
            reel.camera.name +
            ", fourteen minutes before the Beaver Fire was reported. The ridge is clear."
          }
          fetchPriority="high"
        />
        <div className="hero-scrim" aria-hidden="true" />

        <div className="hero-body">
          <RevealLines as="h1" className="hero-title" lines={["One frame", "is not a fire"]} />
          <p className="hero-sub">
            Ridgeline watches public mountain cameras for the first vertical break in the horizon
            line. It scores every frame, and it holds the alert until three consecutive frames
            agree.
          </p>
          <div className="hero-actions">
            <Link className="btn" href="/watch">
              Open the watch floor
            </Link>
            <a className="btn ghost" href="#reel">
              Watch it find one
            </a>
          </div>
        </div>

        <div className="hero-meta">
          <span className="micro">{reel.camera.name}</span>
          <span className="micro dim">
            {reel.camera.lat.toFixed(5)}, {reel.camera.lng.toFixed(5)}
          </span>
          <span className="micro dim">{reel.camera.elevation_m} m</span>
          <span className="micro dim">real frame, no retouching</span>
        </div>

        <a className="hero-cue" href="#reel" aria-label="Skip to the sequence">
          <span className="micro">scroll to advance the sequence</span>
          <span className="hero-cue-rule" aria-hidden="true" />
        </a>
      </section>

      <section id="reel" className="band">
        <div className="band-head">
          <span className="micro">the sequence</span>
          <RevealLines
            as="h2"
            className="band-title"
            lines={["Thirty five minutes", "on one camera"]}
          />
          <p className="band-lede">
            This is the Beaver Fire as {reel.camera.name} saw it, one frame a minute. Scroll and the
            model scores each frame in front of you. Nothing on this reel was drawn to look
            convincing. Every confidence value came out of the same scorer the worker runs.
          </p>
        </div>
      </section>

      <ScrubReel reel={reel} />

      <section id="rule" className="band">
        <div className="band-head">
          <span className="micro">the rule</span>
          <RevealLines
            as="h2"
            className="band-title"
            lines={["Three consecutive", "frames, or nothing"]}
          />
          <p className="band-lede">
            A threshold on a single frame turns every glare spike and every passing bird into a
            dispatch. The whole system rests on a second rule: the score has to clear the line on N
            frames in a row. N is the one number worth arguing about, so here it is, measured.
          </p>
        </div>
        <RuleDial sweep={sweep} />
        <p className="band-foot">
          One thing this measurement does not show. False alarms stayed at zero for every value of
          N, because the scorer never once called clear sky smoke across the bundled set. So on this
          data the rule is not earning its keep on false alarms, it is buying corroboration and
          paying {latencyCostMinutes} minutes of median latency for it. It is insurance against the
          cirrus and the sun glare that these five sequences happen not to contain, and the honest
          way to put that is that the benefit here is argued rather than demonstrated.
        </p>
      </section>

      <section className="numbers">
        <div className="numbers-grid">
          <div className="stat">
            <span className="stat-value">
              <CountUp to={shipped.found} />
              <span className="stat-of"> of {shipped.sequences}</span>
            </span>
            <span className="micro">fires found, on the plume</span>
            <p className="stat-note">
              A confirmation only counts if the box lands inside a hand-verified plume region. An
              alert that fired after ignition but pointed at a cloud is a false alarm with good
              timing.
            </p>
          </div>
          <div className="stat">
            <span className="stat-value">
              <CountUp to={(shipped.median_latency_seconds ?? 0) / 60} />
              <span className="stat-of"> min</span>
            </span>
            <span className="micro">median time from ignition</span>
            <p className="stat-note">
              Measured to the frame the run completes, not to the first frame over the line.
            </p>
          </div>
          <div className="stat">
            <span className="stat-value">
              <CountUp to={shipped.false_alarms_per_camera_per_day} decimals={1} />
            </span>
            <span className="micro">false alarms per camera per day</span>
            <p className="stat-note">
              Across every clear-sky frame in the set. The denominator is about an hour of camera
              time per sequence, which is small, and a single false run would have read as 19 a day.
            </p>
          </div>
          <div className="stat">
            <span className="stat-value">
              <CountUp to={1} />
            </span>
            <span className="micro">fire it misses completely</span>
            <p className="stat-note">
              Santa Margarita TCS8, August 2019. It is bundled with the demo on purpose rather than
              quietly dropped.
            </p>
          </div>
        </div>
        <p className="numbers-foot micro dim">
          Reproduce all of it with docker compose exec model python validate_replay.py
        </p>
      </section>

      <section id="pipeline" className="band">
        <div className="band-head">
          <span className="micro">the pipeline</span>
          <RevealLines as="h2" className="band-title" lines={["What happens", "to one frame"]} />
        </div>
      </section>

      <Pipeline />

      <section id="limits" className="band limits">
        <div className="band-head">
          <span className="micro">limits</span>
          <RevealLines as="h2" className="band-title" lines={["What it", "does not do"]} />
          <p className="band-lede">
            This is the section a product page normally leaves out. Leaving it out is how a
            monitoring tool gets muted in month two, because the first surprise failure teaches an
            operator that the confident parts were not trustworthy either.
          </p>
        </div>

        <ul className="limits-list">
          <li>
            <h3>It misses the Santa Margarita fire entirely</h3>
            <p>
              Thirty two frames, a real plume, and the score never gets past{" "}
              <span className="data">{peakMiss.toFixed(2)}</span> against a threshold of{" "}
              <span className="data">{miss.threshold.toFixed(2)}</span>. The plume is thin and it
              sits against terrain rather than sky, so it neither changes nor desaturates enough to
              register. That sequence ships with the demo.
            </p>
          </li>
          <li>
            <h3>Thin cirrus still reads as smoke</h3>
            <p>
              High cloud is desaturated, it moves against a frozen background, and it grows. That is
              the whole signature. Rejecting clipped highlights removed the sun, and nothing in the
              current scorer removes cirrus.
            </p>
          </li>
          <li>
            <h3>The lens vignette is left in deliberately</h3>
            <p>
              These are fisheye lenses whose dark edge shifts as exposure adapts, which looks like
              smoke. Cropping the sides fixes it and also crops away the Junction Fire plume, which
              genuinely sits at the very edge of that camera view. Missing a fire is the worse
              error, so the artifact stays and gets documented.
            </p>
          </li>
          <li>
            <h3>The trained model is worse than the frame differencer</h3>
            <p>
              The shipped scorer is the heuristic. A ResNet was trained on FIgLib and lost on every
              measure that matters, and it also predates the camera holdout that keeps the demo
              sequences out of training. Both numbers are in the README rather than the better one
              alone.
            </p>
          </li>
          <li>
            <h3>Detection is not confirmation</h3>
            <p>
              Ridgeline says a camera is looking at something that behaves like smoke. It does not
              know what is burning, how large it is, or where it will go. A person still has to look
              at the frame, and the interface is built to put that frame in front of them fast.
            </p>
          </li>
        </ul>
      </section>

      <section className="closer">
        <RevealLines
          as="h2"
          className="closer-title"
          lines={["The screen is mostly", "photographs of the sky"]}
        />
        <p className="closer-body">
          So the interface never puts a colour next to one that the operator did not ask for. There
          is no brand accent. Saturated colour appears only when the system is making a claim about
          a fire, clear cameras are rendered in silence rather than in green, and a camera that
          stopped sending frames is not painted the same red as one that is burning.
        </p>
        <div className="closer-actions">
          <Link className="btn" href="/watch">
            Open the watch floor
          </Link>
          <Link className="btn ghost" href="/detections">
            Read the detection log
          </Link>
        </div>
      </section>
    </>
  );
}
