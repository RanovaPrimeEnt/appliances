"use strict";
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");

const tracked = execFileSync("git", ["ls-files", "-z"], {encoding:"utf8"})
  .split("\0").filter(Boolean);
assert.ok(tracked.length > 100, "Unexpectedly small tracked-file inventory; abort hygiene check");

const forbidden = [
  /(^|\/)node_modules\//i,
  /(^|\/)\.gradle\//i,
  /(^|\/)(?:build|DerivedData)\//,
  /(^|\/)\.env(?:\.|$)/i,
  /(^|\/)\.DS_Store$/,
  /(^|\/)Thumbs\.db$/i,
  /\.(?:apk|aab|ipa|keystore|jks|p12|mobileprovision|xcarchive)$/i
];
const violations = tracked.filter(file => forbidden.some(pattern => pattern.test(file)));
assert.deepEqual(violations, [], "Remove local build/signing/secret files from tracking: " + violations.join(", "));

const essential = [
  "all/index.html",
  "all/site.html",
  "all/seller-dashboard.html",
  "seller-sw.js",
  "rpe-v2/index.html",
  "rpe-v2/offline-marketplace.json",
  "rpe-v2/supabase/functions/ranova-seller-store/index.ts",
  "android-app/app/src/main/java/com/ranova/marketplace/MainActivity.java",
  "ios-app/RANOVA/ViewController.swift"
];
for (const file of essential) {
  assert.ok(tracked.includes(file), "Essential app route or source is missing: " + file);
}
console.log("PASS repository hygiene: " + tracked.length + " tracked files, no local build/signing artifacts, essential application paths retained");
