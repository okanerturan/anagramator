import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const start = html.indexOf("const graphemes=");
const end = html.indexOf("function layoutSlots");

assert.notEqual(start, -1, "Could not find the analyzer helpers in index.html");
assert.notEqual(end, -1, "Could not find the end of the analyzer block in index.html");

const analyze = new Function(`${html.slice(start, end)}; return analyze;`)();
const longExample = JSON.parse(
  readFileSync(new URL("./anagram.json", import.meta.url), "utf8"),
);

assert.equal(analyze("listen", "silent").isAnagram, true);
assert.equal(analyze("eleven plus two", "twelve plus one").isAnagram, true);
assert.equal(analyze("Version 2!", "2 version").isAnagram, true);
assert.equal(analyze("hello", "world").isAnagram, false);

const longResult = analyze(longExample.source, longExample.target);
assert.equal(longResult.isAnagram, true);
assert.equal(longResult.pairs.length, 103);

console.log("Analyzer checks passed, including the 103-letter demo.");
