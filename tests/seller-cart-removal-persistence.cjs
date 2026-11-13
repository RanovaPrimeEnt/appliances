"use strict";
const assert=require("node:assert/strict");const fs=require("node:fs");const path=require("node:path");const s=fs.readFileSync(path.join(__dirname,"../all/seller-store.html"),"utf8");
assert.match(s,/if\(!x&&!Object\.keys\(cart\)\.length\)/,"An explicitly empty cart must not import legacy items");
assert.match(s,/if\(cartRevision===hydrationRevision&&!hasCartDraft\(\)\)cart=remote/,"Stale remote hydration must not resurrect deleted items");
assert.doesNotMatch(s,/Object\.keys\(remote\)\.forEach\(function\(id\)\{if\(cart\[id\]==null\)cart\[id\]=remote\[id\]/,"Pending local deletions must not merge stale remote items");
assert.match(s,/cartSyncChain=cartSyncChain\.catch\(function\(\)\{\}\)\.then\(work\)/,"Remote writes must be serialized");
assert.match(s,/if\(cartRevision===revision&&buyerSession/,"Only latest successful write can clear pending draft");
assert.match(s,/function removeItem\(id\)\{delete cart\[id\];saveCart\(\);render\(\);renderCart\(\)\}/);
console.log("PASS seller cart removal persistence contract");
