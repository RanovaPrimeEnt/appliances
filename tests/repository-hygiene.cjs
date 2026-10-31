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


// Validate explicitly precached offline routes without touching service-worker behavior.
const path = require("node:path");
const fs = require("node:fs");
for (const swFile of ["all/sw.js","seller-sw.js","rpe-v2/rpe-v2-sw.js","rpe-v2/admin-sw.js"]) {
  const sw=fs.readFileSync(path.resolve(__dirname,"..",swFile),"utf8");
  const list=sw.match(/(?:const|let)\s+(?:SHELL|CORE)\s*=\s*\[([\s\S]*?)\]/);
  assert.ok(list,"Missing offline resource list in "+swFile);
  const entries=[...list[1].matchAll(/["']([^"']+)["']/g)].map(match=>match[1]);
  for (const entry of entries) {
    if (/^https?:/i.test(entry)) continue;
    const rel=entry.split(/[?#]/)[0];
    const normalized=path.posix.normalize(path.posix.join(path.posix.dirname(swFile),rel));
    const exists=tracked.includes(normalized)||tracked.includes(path.posix.join(normalized,"index.html"));
    assert.ok(exists,"Broken offline precache reference in "+swFile+": "+entry+" -> "+normalized);
  }
}
console.log("PASS offline precache references: all declared paths exist");


// Validate static asset and navigation links in main public entrypoints.
// Do not attempt to interpret JS-generated URLs or external navigation.
const entrypoints=[
  "all/index.html","all/marketplace.html","all/product.html","all/seller-center.html",
  "all/seller-dashboard.html","all/seller-store.html","all/cart.html","all/order-status.html",
  "rpe-v2/index.html","rpe-v2/admin.html","rpe-v2/seller-start.html","rpe-v2/market-home.html"
];
for(const page of entrypoints){
  assert.ok(tracked.includes(page),"Missing public entrypoint: "+page);
  const html=fs.readFileSync(path.resolve(__dirname,"..",page),"utf8");
  const references=[...html.matchAll(/\b(?:src|href)=["']([^"'<>]+)["']/gi)].map(m=>m[1]);
  for(const ref of references){
    if(!ref||ref.startsWith("#")||/^(https?:|data:|mailto:|tel:|javascript:|blob:)/i.test(ref))continue;
    if(/[{}$]/.test(ref))continue; // dynamic template binding
    const withoutQuery=ref.split(/[?#]/)[0];
    if(!withoutQuery)continue;
    if(withoutQuery.startsWith("/")&&!withoutQuery.startsWith("/appliances/"))continue;
    const target=withoutQuery.startsWith("/appliances/")
      ?path.posix.normalize(withoutQuery.slice("/appliances/".length))
      :path.posix.normalize(path.posix.join(path.posix.dirname(page),withoutQuery));
    assert.ok(tracked.includes(target)||tracked.includes(path.posix.join(target,"index.html")),
      "Broken local link in "+page+": "+ref+" -> "+target);
  }
}
console.log("PASS public entrypoints: local static links resolve");
