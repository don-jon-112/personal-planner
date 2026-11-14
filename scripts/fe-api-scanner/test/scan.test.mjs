// Regression test for the FE API scanner. Run: npm run fe-api:test
// Every case below is a pattern that was once missed or mis-read in the real FE repo.
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = path.join(here, "fixture");
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "fe-scan-")), "map.json");
execFileSync(
  process.execPath,
  [path.join(here, "..", "scan.mjs"), "--repo", fixture, "--out", out, "--exclude-apps", "cms", "--annotations", path.join(fixture, "annotations.json")],
  { stdio: "ignore" }
);
const map = JSON.parse(fs.readFileSync(out, "utf8"));
const ep = (key) => map.endpoints.find((e) => e.key === key);
const keys = map.endpoints.map((e) => e.key);
const bff = (key) => (ep(key)?.backendCalls || []).map((b) => b.key);

test("aliased http client + page mapping", () => {
  assert.deepEqual(ep("GET /customer/v1/user")?.usedBy, ["demo:/"]);
});
test("default host of the client is read from axios.create({ baseURL })", () => {
  assert.deepEqual(ep("GET /customer/v1/user")?.hosts, ["NEXT_PUBLIC_BASE_URL"]);
});
test("a per-call baseURL override replaces the default host", () => {
  assert.deepEqual(ep("GET /demo/api/proxy")?.hosts, ["NEXT_PUBLIC_BASEPATH_URL"]);
});
test("client recognised by import source, not by name (CMS)", () => {
  assert.ok(ep("POST /branch/list"), keys.join("\n"));
});
test("conditional url yields every alternative", () => {
  assert.ok(ep("GET /api/global-cart") || map.audit.bffWithoutBackend.includes("GET /api/global-cart"));
  assert.ok(ep("GET /global-cart"));
});
test("optional query suffix is not part of the path", () => {
  const e = ep("GET /after-sales/category/list");
  assert.ok(e, keys.join("\n"));
  assert.deepEqual(e.query, ["showAll=true"]);
});
test("forwarding helper (url is its own parameter) is not an endpoint", () => {
  assert.ok(!keys.some((k) => k.includes("{url}")), keys.join("\n"));
});
test("custom client members: postFormData / postData(base, url)", () => {
  assert.ok(ep("POST /saphybris-proxy/v1/upload-doc"));
  const ocr = ep("POST /ocr/scan");
  assert.ok(ocr, keys.join("\n"));
  assert.ok(ocr.hosts.includes("NEXT_PUBLIC_OCR_URL"), JSON.stringify(ocr.hosts));
});
test("EventSource is recorded", () => {
  assert.ok(ep("GET /events/stream"));
});
test("basePath-prefixed /api route lists its backend calls with their conditions", () => {
  const e = ep("GET /demo/api/proxy");
  assert.equal(e?.target, "next-bff");
  const profile = e.backendCalls.find((b) => b.key === "POST /saphybris-proxy/v1/profile");
  assert.deepEqual(profile?.when, ["req.query.type = 'profile'"]);
  const dbg = e.backendCalls.find((b) => b.key === "GET /customer/v1/debug");
  assert.ok(dbg?.when?.some((w) => w.includes("req.query.debug")), JSON.stringify(dbg));
});
test("req.method guard: only the guarded method is reported", () => {
  assert.ok(ep("POST /customer/v1/guarded"), keys.join("\n"));
  assert.ok(!ep("GET /customer/v1/guarded"));
  assert.ok(!keys.some((k) => k.startsWith("ANY ")), keys.filter((k) => k.startsWith("ANY ")).join());
});
test("unguarded forwarded method = the methods the FE uses to call the route", () => {
  assert.ok(ep("GET /customer/v1/forward") && ep("POST /customer/v1/forward"), keys.join("\n"));
});
test("class: only the methods that are used link to their calls (this.setup in the constructor)", () => {
  assert.ok(ep("POST /class/setup"), keys.join("\n"));
  assert.ok(!ep("GET /class/unused"));
});
test("dead code is left out and listed for review", () => {
  assert.ok(!ep("POST /dead/code"));
  assert.ok(map.audit.deadOmitted.some((d) => d.key === "POST /dead/code"));
});
test("excluded app (CMS) is not scanned", () => {
  assert.ok(!keys.some((k) => k.includes("/cms/only")));
});
test("verified non-API call is annotated, not listed", () => {
  assert.ok(map.audit.verifiedNonApi.some((v) => v.url.includes("fileUrl")));
  assert.ok(!keys.some((k) => k.includes("fileUrl")));
});
test("audit reports network access it cannot classify (WebSocket)", () => {
  assert.equal(map.audit.suspects.length, 1, JSON.stringify(map.audit.suspects));
  assert.match(map.audit.suspects[0].reason, /WebSocket/);
});
