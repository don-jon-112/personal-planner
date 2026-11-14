// Regression test for the FE API scanner. Run: npm run fe-api:test
import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "fe-scan-")), "map.json");
execFileSync(process.execPath, [path.join(here, "..", "scan.mjs"), "--repo", path.join(here, "fixture"), "--out", out], { stdio: "ignore" });
const map = JSON.parse(fs.readFileSync(out, "utf8"));
const ep = (key) => map.endpoints.find((e) => e.key === key);
const keys = map.endpoints.map((e) => e.key);

test("aliased http client + page mapping", () => {
  assert.deepEqual(ep("GET /customer/v1/user")?.usedBy, ["demo:/"]);
});
test("client recognised by import source, not by name (CMS)", () => {
  assert.ok(ep("POST /branch/list"), keys.join("\n"));
});
test("conditional url yields every alternative", () => {
  assert.ok(ep("GET /api/global-cart"));
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
test("basePath-prefixed /api route is a next-bff endpoint listing its backend calls", () => {
  const e = ep("GET /demo/api/proxy");
  assert.equal(e?.target, "next-bff");
  const calls = (e.backendCalls || []).map((b) => b.key);
  assert.ok(calls.includes("POST /saphybris-proxy/v1/profile"), calls.join());
  assert.ok(calls.includes("ANY /customer/v1/default"), calls.join());
  const profile = e.backendCalls.find((b) => b.key === "POST /saphybris-proxy/v1/profile");
  assert.deepEqual(profile.when, ["req.query.type = 'profile'"]);
});
test("EventSource is recorded", () => {
  assert.ok(ep("GET /api/events"));
});
test("code no page reaches is listed with empty usedBy", () => {
  assert.deepEqual(ep("POST /dead/code")?.usedBy, []);
});
test("audit reports nothing for the fixture", () => {
  assert.equal(map.audit.suspects.length, 0, JSON.stringify(map.audit.suspects));
});
