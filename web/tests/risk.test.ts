/**
 * Checks the rule that decides what an operator sees.
 *
 * These are cheap and worth having because labelRuns drives the frame strip, and
 * a wrong colour there does not throw an error, it just quietly tells someone
 * that a detection was confirmed when it was not.
 *
 * Run with:  node --experimental-strip-types tests/risk.test.ts
 */
import assert from "node:assert/strict";

import { cameraState, classify, consecutiveAboveThreshold, labelRuns } from "../lib/risk.ts";

let passed = 0;
function check(name: string, fn: () => void) {
  fn();
  passed += 1;
  console.log(`  ok  ${name}`);
}

check("an unbroken run is counted from the newest frame back", () => {
  assert.equal(consecutiveAboveThreshold([0.9, 0.8, 0.7, 0.1], 0.6), 3);
});

check("one frame below threshold resets the run", () => {
  assert.equal(consecutiveAboveThreshold([0.9, 0.1, 0.9, 0.9], 0.6), 1);
});

check("three in a row confirms", () => {
  assert.deepEqual(classify([0.9, 0.8, 0.7], 0.6, 3), {
    state: "confirmed",
    consecutiveCount: 3,
  });
});

check("two in a row is still only watching", () => {
  assert.deepEqual(classify([0.9, 0.8, 0.1], 0.6, 3), {
    state: "watching",
    consecutiveCount: 2,
  });
});

check("a single spike does not confirm", () => {
  assert.deepEqual(classify([0.99, 0.1, 0.99, 0.99], 0.6, 3), {
    state: "watching",
    consecutiveCount: 1,
  });
});

check("nothing above threshold is clear", () => {
  assert.deepEqual(classify([0.2, 0.1, 0.3], 0.6, 3), { state: "clear", consecutiveCount: 0 });
});

check("a camera with no frames is offline, not clear", () => {
  assert.equal(cameraState([], null, 0.6, 3).state, "offline");
});

check("a camera that stopped reporting goes offline even after a confirmed run", () => {
  const stale = new Date(Date.now() - 10 * 60 * 1000);
  assert.equal(cameraState([0.9, 0.9, 0.9], stale, 0.6, 3).state, "offline");
});

check("only the confirming frame onward is labelled confirmed", () => {
  assert.deepEqual(labelRuns([0.1, 0.7, 0.8, 0.9, 0.2], 0.6, 3), [
    "below",
    "watching",
    "watching",
    "confirmed",
    "below",
  ]);
});

check("a run shorter than the requirement never reaches confirmed", () => {
  assert.deepEqual(labelRuns([0.7, 0.2, 0.7, 0.7], 0.6, 3), [
    "watching",
    "below",
    "watching",
    "watching",
  ]);
});

check("a long run stays confirmed to the end", () => {
  assert.deepEqual(labelRuns([0.7, 0.7, 0.7, 0.7], 0.6, 3), [
    "watching",
    "watching",
    "confirmed",
    "confirmed",
  ]);
});

console.log(`\n${passed} checks passed.`);
