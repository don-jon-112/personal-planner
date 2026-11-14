#!/usr/bin/env node
/**
 * Sync the FE repo and refresh the API map.
 *
 *   node scripts/fe-api-scanner/sync.mjs [--force] [--no-fetch] [--branch <name>] [--repo <path>]
 *
 * 1. `git fetch` in the FE repo (your own working copy is never checked out / modified)
 * 2. resolve origin/<branch>; if it is the commit we already scanned, stop (unless --force)
 * 3. check that commit out into a private git worktree (.cache/fe-repo) and scan it
 * 4. write data/fe-api-map.json, including what changed (added / removed endpoints)
 *    since the previous scan.
 *
 * Config lives in scripts/fe-api-scanner/config.json (repoPath, branch); CLI flags override it.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..", "..");
const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => {
  const i = args.indexOf(`--${n}`);
  return i >= 0 ? args[i + 1] : undefined;
};

const configPath = path.join(here, "config.json");
const config = fs.existsSync(configPath) ? JSON.parse(fs.readFileSync(configPath, "utf8")) : {};
const repoPath = path.resolve(opt("repo") || config.repoPath || "");
const branch = opt("branch") || config.branch || "main";
const outFile = path.join(root, "data", "fe-api-map.json");
const worktree = path.join(root, ".cache", "fe-repo");

if (!opt("repo") && !config.repoPath) {
  console.error("No FE repo configured. Set repoPath in scripts/fe-api-scanner/config.json or pass --repo.");
  process.exit(1);
}

const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
const log = (m) => console.error(`[fe-sync] ${m}`);

// 1. fetch
if (!flag("no-fetch")) {
  log("git fetch origin ...");
  git(repoPath, "fetch", "origin", "--prune");
}

// 2. resolve ref
const ref = `origin/${branch}`;
const commit = git(repoPath, "rev-parse", ref);
const commitInfo = git(repoPath, "log", "-1", "--format=%an|%aI|%s", commit).split("|");
const previous = fs.existsSync(outFile) ? JSON.parse(fs.readFileSync(outFile, "utf8")) : null;

if (previous?.repo?.commit === commit && previous?.repo?.branch === branch && !flag("force")) {
  log(`Up to date (${branch} @ ${commit.slice(0, 8)}). Nothing to scan.`);
  previous.sync = { ...(previous.sync || {}), lastCheckedAt: new Date().toISOString(), upToDate: true };
  fs.writeFileSync(outFile, JSON.stringify(previous, null, 2));
  process.exit(0);
}

// 3. worktree at that commit
if (!fs.existsSync(path.join(worktree, ".git"))) {
  fs.mkdirSync(path.dirname(worktree), { recursive: true });
  git(repoPath, "worktree", "prune");
  git(repoPath, "worktree", "add", "--detach", "--force", worktree, commit);
} else {
  git(worktree, "checkout", "--detach", "--force", commit);
  git(worktree, "clean", "-fdx", "-q");
}
log(`Scanning ${branch} @ ${commit.slice(0, 8)} ...`);

let remote = "";
try { remote = git(repoPath, "remote", "get-url", "origin").replace(/\/\/[^@/]+@/, "//"); } catch {}

const meta = {
  name: path.basename(repoPath),
  branch,
  commit,
  commitAuthor: commitInfo[0],
  commitDate: commitInfo[1],
  commitMessage: commitInfo.slice(2).join("|"),
  remote,
};
const tmpOut = outFile + ".tmp";
execFileSync(process.execPath, [path.join(here, "scan.mjs"), "--repo", worktree, "--out", tmpOut, "--meta", JSON.stringify(meta)], { stdio: "inherit" });

// 4. diff vs previous
const next = JSON.parse(fs.readFileSync(tmpOut, "utf8"));
const prevKeys = new Set((previous?.endpoints || []).map((e) => e.key));
const nextKeys = new Set(next.endpoints.map((e) => e.key));
const added = [...nextKeys].filter((k) => !prevKeys.has(k)).sort();
const removed = [...prevKeys].filter((k) => !nextKeys.has(k)).sort();
next.sync = {
  lastCheckedAt: new Date().toISOString(),
  upToDate: false,
  previousCommit: previous?.repo?.commit || null,
  changes: previous ? { added, removed } : null,
};
fs.writeFileSync(outFile, JSON.stringify(next, null, 2));
fs.rmSync(tmpOut, { force: true });
log(previous ? `Done. +${added.length} / -${removed.length} endpoints since ${previous.repo.commit.slice(0, 8)}.` : "Done (first scan).");
