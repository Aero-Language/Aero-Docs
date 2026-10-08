import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse, parseSite } from "../src/parser.js";
import { buildIndex, search } from "../src/search.js";

const readJson = (p) => JSON.parse(readFileSync(new URL("../" + p, import.meta.url), "utf8"));
const { site } = parseSite(readJson("site.json"));
const docs = {};
for (const d of site.docs) {
  const parsed = parse(readJson(d.file), site.variables);
  docs[parsed.doc.id] = parsed;
}
const index = buildIndex(docs);

test("index has one entry per section plus one per document", () => {
  const sections = Object.values(docs).reduce((n, d) => n + d.order.length, 0);
  assert.equal(index.length, sections + 2);
});

test("title matches rank first", () => {
  const r = search(index, "reference counting");
  assert.equal(r[0].gid, "#memory_reference-counting");
  assert.equal(r[0].docId, "#language");
  assert.equal(r[0].where, "Aero / Memory");
});

test("text matches carry a snippet around the hit", () => {
  const r = search(index, "fiber");
  assert.ok(r.length > 0);
  assert.equal(r[0].snippet.match.toLowerCase(), "fiber");
  assert.ok(r[0].snippet.before.length + r[0].snippet.after.length > 10);
});

test("all words must match, empty queries find nothing", () => {
  assert.deepEqual(search(index, "   "), []);
  assert.deepEqual(search(index, "zzzzqqq"), []);
  assert.ok(search(index, "luft").some((r) => r.docId === "#compiler" && r.gid === null));
  assert.ok(search(index, "lexer", 3).length <= 3);
});
