import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse, parseSite, parseText, parseInline, resolveLink, validateLinks, sectionToText, slugify } from "../src/parser.js";

const read = (p) => JSON.parse(readFileSync(new URL("../" + p, import.meta.url), "utf8"));
const doc = (extra) => ({ id: "#d", title: "T", ...extra });
const levels = (r, level) => r.errors.filter((e) => e.level === level);

test("inline: whitelisted tags, literal angle brackets", () => {
  const n = parseInline("a <b>bold <i>both</i></b> List<T> <q>x</q> <code>y</code>");
  assert.equal(n[0], "a ");
  assert.equal(n[1].tag, "b");
  assert.equal(n[1].children[1].tag, "i");
  assert.equal(n[2], " List<T> ");
  assert.equal(n[3].tag, "q");
  assert.equal(n[5].tag, "code");
});

test("inline: links are restricted and unknown tags stay literal", () => {
  const n = parseInline('<a href="#x">ok</a> <a href="javascript:alert(1)">bad</a> <script>x</script>');
  assert.equal(n[0].href, "#x");
  assert.equal(n[1], " bad <script>x</script>");
  assert.ok(!JSON.stringify(n).includes("javascript"));
});

test("inline: unclosed and stray tags", () => {
  const warnings = [];
  const rep = { warn: (p, m) => warnings.push(m) };
  const n = parseInline("<b>open", "p", rep);
  assert.equal(n[0].tag, "b");
  assert.equal(warnings.length, 1);
  assert.deepEqual(parseInline("x</b>y"), ["x</b>y"]);
});

test("text: paragraphs, line breaks, lists", () => {
  const parts = parseText("one\ntwo\n\nthree\n-- a\n-- b\nafter\n- single");
  assert.equal(parts.length, 4);
  assert.equal(parts[0].kind, "p");
  assert.equal(parts[0].inline[1].tag, "br");
  assert.equal(parts[2].kind, "list");
  assert.equal(parts[2].items.length, 2);
  assert.equal(parts[3].inline[0], "after");
  assert.equal(parts[3].inline[2], "- single");
  assert.deepEqual(parseText("  \n\n "), []);
});

test("ids combine with underscore", () => {
  const r = parse(doc({ sections: [{ id: "#a", title: "A", sections: [{ id: "#b", title: "B" }] }] }));
  assert.deepEqual(r.order, ["#a", "#a_b"]);
  assert.equal(r.index["#a_b"].parent, "#a");
  assert.equal(r.index["#a_b"].level, 2);
  assert.equal(r.errors.length, 0);
});

test("ids: missing, invalid, digits, duplicate", () => {
  const r = parse(doc({
    sections: [
      { title: "No Id" },
      { id: "#Bad_Id", title: "Bad" },
      { id: "#step-1", title: "Digits" },
      { id: "#dup", title: "One" },
      { id: "#dup", title: "Two" },
    ],
  }));
  assert.ok(r.index["#no-id"]);
  assert.ok(r.index["#bad"]);
  assert.equal(levels(r, "error").length, 2);
  assert.equal(levels(r, "warning").length, 2);
  assert.equal(r.index["#dup"].title, "One");
  assert.equal(r.doc.sections[4].duplicate, true);
  assert.equal(r.order.filter((g) => g === "#dup").length, 1);
});

test("empty and missing arrays are the same", () => {
  const r = parse(doc({ sections: [{ id: "#a", title: "A", content: [], sections: [] }, { id: "#b", title: "B" }] }));
  assert.equal(r.errors.length, 0);
  assert.deepEqual(r.doc.sections[0].content, []);
  assert.deepEqual(r.doc.sections[1].content, []);
});

test("blocks: shorthand, empty blocks vanish, unknown types are skipped", () => {
  const r = parse(doc({
    sections: [{
      id: "#a",
      title: "A",
      content: [
        "plain",
        { type: "text", text: "" },
        { type: "table", headers: ["x"], rows: [] },
        { type: "code", code: "" },
        { type: "nope" },
        { type: "badge", title: "b", variant: "weird" },
        { type: "callout", kind: "tip", content: [] },
      ],
    }],
  }));
  const c = r.doc.sections[0].content;
  assert.equal(c.length, 2);
  assert.equal(c[0].type, "text");
  assert.equal(c[1].variant, "accent");
  assert.equal(levels(r, "warning").length, 2);
});

test("tables: padding, trimming, plain row boxes", () => {
  const r = parse(doc({
    sections: [{
      id: "#a",
      title: "A",
      content: [
        { type: "table", headers: ["a", "b"], rows: [["1"], ["1", "2", "3"]] },
        { type: "table", rows: [["x", "y"]] },
      ],
    }],
  }));
  const [t1, t2] = r.doc.sections[0].content;
  assert.equal(t1.rows[0].length, 2);
  assert.equal(t1.rows[1].length, 2);
  assert.equal(t1.hasHeaders, true);
  assert.equal(t2.hasHeaders, false);
  assert.equal(levels(r, "warning").length, 1);
});

test("variables: site and document, skipped fields, unknown", () => {
  const r = parse(
    doc({
      variables: { name: "Doc" },
      badge: "v{{version}} {{name}}",
      sections: [{ id: "#a", title: "A {{version}}", content: [{ type: "code", code: "{{version}}" }, "{{missing}}"] }],
    }),
    { version: "1.2", name: "Site" },
  );
  assert.equal(r.doc.badge, "v1.2 Doc");
  assert.equal(r.doc.sections[0].title, "A 1.2");
  assert.equal(r.doc.sections[0].content[0].code, "{{version}}");
  assert.equal(r.doc.sections[0].content[1].parts[0].inline[0], "{{missing}}");
  assert.equal(levels(r, "warning").length, 1);
});

test("variables are not substituted twice", () => {
  const r = parse(doc({ badge: "{{a}}" }), { a: "{{b}}", b: "no" });
  assert.equal(r.doc.badge, "{{b}}");
  assert.equal(levels(r, "warning").length, 1);
});

test("never throws on bad input", () => {
  for (const bad of [null, 5, "{", [], { id: 3 }, { id: "#a", title: "T", sections: "x", footer: 3, buttons: {} }]) {
    const r = parse(bad);
    assert.ok(Array.isArray(r.errors));
  }
  assert.equal(parse("{").doc, null);
});

test("links: same doc, cross doc, root, external, dead", () => {
  const a = parse(doc({
    id: "#a",
    buttons: [{ title: "go", link: "#s" }, { title: "bad", link: "#nope" }],
    sections: [{ id: "#s", title: "S", content: ['<a href="#b/t_u">x</a> <a href="#b">y</a> <a href="https://x.dev">z</a> <a href="#gone">w</a>'] }],
  }));
  const b = parse(doc({ id: "#b", sections: [{ id: "#t", title: "T", sections: [{ id: "#u", title: "U" }] }] }));
  const docs = { "#a": a, "#b": b };
  assert.deepEqual(resolveLink("#b/t_u", "#a", docs), { docId: "#b", gid: "#t_u" });
  assert.deepEqual(resolveLink("#b", "#a", docs), { docId: "#b", gid: null });
  assert.equal(resolveLink("https://x.dev", "#a", docs).external, true);
  const errs = validateLinks(docs);
  assert.deepEqual(errs.map((e) => e.message).sort(), ["dead link #gone", "dead link #nope"]);
});

test("manifest", () => {
  const ok = parseSite({ title: "T", default: "#a", variables: { v: "1" }, docs: [{ file: "a.json", title: "A" }] });
  assert.equal(ok.errors.length, 0);
  assert.equal(ok.site.docs.length, 1);
  assert.ok(parseSite({ docs: [] }).errors.length > 0);
  assert.ok(parseSite("nope").site === null);
});

test("slugify", () => {
  assert.equal(slugify("Overview & Philosophy"), "overview-philosophy");
  assert.equal(slugify("123"), "section");
});

test("real content parses clean", () => {
  const siteRaw = parseSite(read("site.json"));
  assert.equal(siteRaw.errors.length, 0);
  const docs = {};
  for (const d of siteRaw.site.docs) {
    const r = parse(read(d.file), siteRaw.site.variables);
    assert.deepEqual(r.errors, [], d.file);
    docs[r.doc.id] = r;
  }
  assert.equal(siteRaw.site.default in docs, true);
  assert.deepEqual(validateLinks(docs), []);
  const spec = docs["#language"];
  assert.equal(spec.doc.badge, "V0.3.0 · Work In Progress");
  assert.ok(spec.index["#memory_reference-counting"]);
  assert.ok(sectionToText(spec.index["#quickstart_hello-world"]).includes("Hello, Aero!"));
  assert.ok(docs["#compiler"].index["#pipeline_lexer"]);
});
