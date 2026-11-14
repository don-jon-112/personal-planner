#!/usr/bin/env node
/**
 * Re-scan the FE repository and regenerate src/data/fe-api-map.json.
 *
 *   npm run fe-api:scan [-- --repo <path>]
 *
 * The FE repo is only READ, from whatever branch/commit you currently have checked out:
 * pull it yourself first (git pull in the FE folder), then run this. Nothing from the FE
 * repo is copied into this project except the generated JSON, which is committed here
 * and is the data source of the /fe-api page.
 *
 * The repo path comes from scripts/fe-api-scanner/config.json (repoPath) or --repo.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const args = process.argv.slice(2);
const opt = (n) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const configPath = path.join(here, "config.json");
const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, "utf8")) : {};
const repoPath = path.resolve(opt("repo") || config.repoPath || "");
const outFile = path.join(root, "src", "data", "fe-api-map.json");

if (!opt("repo") && !config.repoPath) {
  console.error("No FE repo configured. Set repoPath in scripts/fe-api-scanner/config.json or pass --repo.");
  process.exit(1);
}
if (!fs.existsSync(repoPath)) {
  console.error(`FE repo not found: ${repoPath}`);
  process.exit(1);
}

const git = (...a) => execFileSync("git", a, { cwd: repoPath, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const tryGit = (...a) => { try { return git(...a); } catch { return ""; } };

const info = tryGit("log", "-1", "--format=%H|%an|%aI|%s").split("|");
const meta = {
  name: path.basename(repoPath),
  branch: tryGit("rev-parse", "--abbrev-ref", "HEAD"),
  commit: info[0] || null,
  commitAuthor: info[1] || null,
  commitDate: info[2] || null,
  commitMessage: info.slice(3).join("|") || null,
  // true when the FE folder has uncommitted changes (the scan then differs from the commit)
  dirty: tryGit("status", "--porcelain").length > 0,
};

const previous = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, "utf8")) : null;

fs.mkdirSync(path.dirname(outFile), { recursive: true });
const tmpOut = outFile + ".tmp";
execFileSync(process.execPath, [path.join(here, "scan.mjs"), "--repo", repoPath, "--out", tmpOut, "--meta", JSON.stringify(meta)], { stdio: "inherit" });

const next = JSON.parse(fs.readFileSync(tmpOut, "utf8"));
const prevKeys = new Set((previous?.endpoints || []).map((e) => e.key));
const nextKeys = new Set(next.endpoints.map((e) => e.key));
const added = [...nextKeys].filter((k) => !prevKeys.has(k)).sort();
const removed = [...prevKeys].filter((k) => !nextKeys.has(k)).sort();
next.changes = previous
  ? { previousCommit: previous.repo?.commit || null, previousScannedAt: previous.generatedAt, added, removed }
  : null;

// One endpoint per line: compact file, but git diffs still show which endpoints changed.
const { endpoints: epList, ...head } = next;
const headJson = JSON.stringify(head, null, 2).replace(/\n}$/, "");
fs.writeFileSync(
  outFile,
  `${headJson},\n  "endpoints": [\n${epList.map((e) => "    " + JSON.stringify(e)).join(",\n")}\n  ]\n}\n`
);
fs.rmSync(tmpOut, { force: true });

console.error(`\nFE repo: ${meta.branch} @ ${(meta.commit || "").slice(0, 8)}${meta.dirty ? " (has uncommitted changes)" : ""}`);
console.error(previous ? `Changes vs previous scan: +${added.length} / -${removed.length} endpoints` : "First scan.");
console.error(`Wrote ${path.relative(root, outFile)} — commit this file to publish the update.`);
