#!/bin/bash
set -e
cd "$(dirname "$0")"
node -e 'const fs=require("fs");fs.writeFileSync("page.js","export default "+JSON.stringify(fs.readFileSync("index.html","utf8"))+";\n")'
# Single-file bundle for Cloudflare Pages (_worker.js)
mkdir -p dist
node -e '
const fs=require("fs");
const strip=s=>s.replace(/^import .*$/mg,"").replace(/^export (?!default)/mg,"");
let out="// Allinq Christmas Party RSVP — bundled\n";
out+=strip(fs.readFileSync("lib.js","utf8"));
out+=strip(fs.readFileSync("results.js","utf8"));
out+=fs.readFileSync("page.js","utf8").replace(/^export default /,"const PAGE = ");
out+=fs.readFileSync("worker.js","utf8").replace(/^import .*$/mg,"");
fs.writeFileSync("dist/_worker.js",out);'
