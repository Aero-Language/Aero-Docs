import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parse, parseSite } from "../src/parser.js";
import { loadTemplates, compileTemplate, renderDocument, escapeHtml, TEMPLATE_NAMES } from "../src/render.js";

const root = (p) => new URL("../" + p, import.meta.url);
const readJson = (p) => JSON.parse(readFileSync(root(p), "utf8"));
const templates = await loadTemplates((name) => readFileSync(root("templates/" + name), "utf8"));
const render = (json, extra = {}) => {
  const parsed = parse({ id: "#d", title: "T", ...json });
  return renderDocument(parsed, { templates, ...extra });
};

const VOID = new Set(["br", "hr", "img", "input", "meta", "link"]);
function unbalanced(html) {
  const stack = [];
  for (const m of html.matchAll(/<(\/?)([a-z][a-z0-9]*)\b[^>]*>/g)) {
    const [, closing, name] = m;
    if (VOID.has(name)) continue;
    if (!closing) stack.push(name);
    else if (stack.pop() !== name) return "unexpected </" + name + ">";
  }
  return stack.length ? "unclosed <" + stack.at(-1) + ">" : null;
}

test("template files compile and keep parts out of the main part", () => {
  assert.equal(TEMPLATE_NAMES.length, 14);
  for (const name of TEMPLATE_NAMES) assert.ok(templates[name], name);
  const t = compileTemplate('<p>{{a}}</p><template data-part="x"><b>{{{b}}}</b></template>');
  assert.equal(t.main, "<p>{{a}}</p>");
  assert.equal(t.parts.x, "<b>{{{b}}}</b>");
});

test("values are escaped and nothing raw leaks through", () => {
  const html = render({
    title: "<script>alert(1)</script>",
    sections: [{ id: "#a", title: "<img src=x>", content: ["<script>x</script> text", { type: "code", lang: '"><x', code: "<b>&</b>" }] }],
  });
  assert.ok(!/<script/i.test(html));
  assert.ok(!html.includes("<img"));
  assert.ok(html.includes("&lt;script&gt;"));
  assert.ok(html.includes("&lt;b&gt;&amp;&lt;/b&gt;"));
  assert.equal(escapeHtml("\"'&<>"), "&quot;&#39;&amp;&lt;&gt;");
});

test("chapters: heading levels, anchors, tags, duplicates", () => {
  const html = render({
    sections: [
      { id: "#a", title: "A", tag: "Planned", sections: [{ id: "#b", title: "B", sections: [{ id: "#c", title: "C" }] }] },
      { id: "#x", title: "One" },
      { id: "#x", title: "Two" },
    ],
  });
  assert.match(html, /<h2 class="doc-chapter-title">A<span class="doc-chapter-tag">Planned<\/span><\/h2>/);
  assert.match(html, /<h3 class="doc-chapter-title">B<\/h3>/);
  assert.match(html, /<h4 class="doc-chapter-title">C<\/h4>/);
  assert.ok(html.includes(' id="a_b_c"'));
  assert.equal((html.match(/ id="x"/g) || []).length, 1);
  assert.equal(unbalanced(html), null);
});

test("blocks: groups, tables, callouts, code, lists", () => {
  const html = render({
    sections: [{
      id: "#a",
      title: "A",
      content: [
        { type: "box", title: "one", subtitle: "sub", content: ["x"] },
        { type: "box", title: "two", content: ["y"] },
        { type: "badge", title: "b1" },
        { type: "badge", title: "b2", variant: "outline" },
        { type: "table", headers: ["h"], rows: [["c"]] },
        { type: "table", rows: [["p", "q"]] },
        { type: "callout", kind: "planned", content: ["later"] },
        { type: "code", lang: "aero", title: "Main.aero", code: "val x = 1" },
        "intro\n-- one\n-- two",
        { type: "section", title: "Inner", text: "t", content: ["z"] },
      ],
    }],
  });
  assert.equal((html.match(/doc-box-group/g) || []).length, 1);
  assert.equal((html.match(/doc-badge-group/g) || []).length, 1);
  assert.ok(html.includes("doc-table-headed"));
  assert.ok(html.includes("doc-table-plain"));
  assert.ok(html.includes('<p class="doc-callout-title">Planned</p>'));
  assert.ok(html.includes('class="doc-code doc-code-aero"'));
  assert.ok(html.includes("doc-code-title"));
  assert.equal((html.match(/doc-text-item/g) || []).length, 2);
  assert.match(html, /<h3 class="doc-section-title">Inner<\/h3>/);
  assert.equal(unbalanced(html), null);
});

test("highlighter output is used for code and trusted", () => {
  const html = render(
    { sections: [{ id: "#a", title: "A", content: [{ type: "code", lang: "aero", code: "val" }] }] },
    { highlight: (lang, code) => '<span class="doc-tok-keyword">' + code + "</span>" },
  );
  assert.ok(html.includes('<span class="doc-tok-keyword">val</span>'));
});

test("links: internal hash, external, dead, button hrefs", () => {
  const html = render({
    buttons: [{ title: "Go", link: "#a" }, { title: "Out", link: "https://x.dev" }],
    sections: [{ id: "#a", title: "A", content: ['<a href="#a">in</a> <a href="https://x.dev">out</a> <a href="#nope">dead</a>'] }],
  });
  assert.ok(html.includes('class="doc-button doc-button-primary" href="#d/a"'));
  assert.ok(html.includes('class="doc-button doc-button-secondary" href="https://x.dev"'));
  assert.ok(html.includes('<a class="doc-link" href="#d/a">in</a>'));
  assert.ok(html.includes('rel="noopener noreferrer">out</a>'));
  assert.ok(html.includes('<span class="doc-link doc-link-dead">dead</span>'));
});

test("empty things render nothing", () => {
  const html = render({ sections: [{ id: "#a", title: "A", content: [{ type: "text", text: "" }, { type: "badge" }] }] });
  assert.ok(!html.includes("doc-text"));
  assert.ok(!html.includes("doc-badge-group"));
  assert.ok(!html.includes("doc-footer"));
  assert.ok(!html.includes("doc-buttons"));
  assert.equal(renderDocument({ doc: null }, { templates }), "");
});

test("real documents render completely", () => {
  const { site } = parseSite(readJson("site.json"));
  const docs = {};
  for (const d of site.docs) {
    const parsed = parse(readJson(d.file), site.variables);
    docs[parsed.doc.id] = parsed;
  }
  for (const parsed of Object.values(docs)) {
    const html = renderDocument(parsed, { templates, docs });
    assert.ok(!html.includes("{{"), parsed.doc.id + " has an unfilled slot");
    assert.equal(unbalanced(html), null, parsed.doc.id);
    for (const gid of parsed.order) assert.ok(html.includes(' id="' + gid.slice(1) + '"'), gid);
    assert.ok(html.includes("doc-hero"));
    assert.ok(html.includes("doc-footer"));
  }
  const spec = renderDocument(docs["#language"], { templates, docs });
  assert.ok(spec.includes("v0.3.0 · Work In Progress"));
  assert.ok(spec.includes('href="#language/memory_reference-counting"'));
  const compiler = renderDocument(docs["#compiler"], { templates, docs });
  assert.ok(compiler.includes('href="#language/reference_precedence"'));
});
        
