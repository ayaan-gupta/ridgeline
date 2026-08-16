#!/usr/bin/env node
/**
 * Enforces the writing rules in design-system.md section 9.
 *
 * Em dashes and filler adjectives are easy to reintroduce by habit, and a rule
 * nobody checks is a rule that decays. This runs over the whole repository, not
 * just the interface, because the README is product surface too.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

const SKIP_DIRS = new Set([
  "node_modules", ".next", ".git", "weights", "figlib", "replay", "__pycache__", "dist",
]);
const CHECK_EXT = new Set([
  ".ts", ".tsx", ".js", ".mjs", ".css", ".md", ".py", ".yaml", ".yml", ".sql", ".sh", ".txt",
]);

const RULES = [
  { name: "em dash", re: /—/g, hint: "Use a period, a comma, or a colon." },
  {
    name: "filler adjective",
    re: /\b(powerful|seamless|cutting[- ]edge|robust|blazing[- ]fast|revolutionary|game[- ]changing|state[- ]of[- ]the[- ]art)\b/gi,
    hint: "Say what it does instead.",
  },
];

let failures = 0;

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const info = statSync(full);
    if (info.isDirectory()) walk(full);
    else if (CHECK_EXT.has(extname(entry))) check(full);
  }
}

function check(file) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, i) => {
    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      const hit = rule.re.exec(line);
      if (!hit) continue;
      // The checker names the words it bans, so it has to exempt itself.
      if (relative(root, file).endsWith("check-copy.mjs")) continue;
      failures += 1;
      console.error(
        `${relative(root, file)}:${i + 1}  ${rule.name}: "${hit[0]}"\n    ${rule.hint}`,
      );
    }
  });
}

walk(root);

if (failures > 0) {
  console.error(`\n${failures} copy problem(s) found.`);
  process.exit(1);
}
console.log("Copy check passed. No em dashes, no filler adjectives.");
