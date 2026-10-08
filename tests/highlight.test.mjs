import test from "node:test";
import assert from "node:assert/strict";
import { highlight } from "../src/highlight.js";

test("aero code gets token classes", () => {
  const html = highlight("aero", 'public fun Add(a: Int) -> Int { // sum\n  val s = $"x{a}" + 0xFF\n}\n@Packed');
  assert.ok(html.includes('<span class="doc-tok-keyword">public</span>'));
  assert.ok(html.includes('<span class="doc-tok-keyword">fun</span>'));
  assert.ok(html.includes('<span class="doc-tok-function">Add</span>'));
  assert.ok(html.includes('<span class="doc-tok-type">Int</span>'));
  assert.ok(html.includes('<span class="doc-tok-comment">// sum</span>'));
  assert.ok(html.includes('<span class="doc-tok-string">$&quot;x{a}&quot;</span>'));
  assert.ok(html.includes('<span class="doc-tok-number">0xFF</span>'));
  assert.ok(html.includes('<span class="doc-tok-annotation">@Packed</span>'));
});

test("everything is escaped and text is preserved", () => {
  const code = 'val a = 1 < 2 && "<b>"\nList<T>';
  const html = highlight("aero", code);
  assert.ok(!html.includes("<b>"));
  assert.equal(html.replace(/<\/?span[^>]*>/g, "").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&amp;/g, "&"), code);
});

test("other languages stay plain", () => {
  assert.equal(highlight("text", "val <x>"), "val &lt;x&gt;");
  assert.equal(highlight("json", "{}"), "{}");
});

test("the real spec code blocks keep their text", () => {
  assert.equal(highlight("aero", ""), "");
  assert.ok(highlight("aero", "fun Main() {}").includes("doc-tok-function"));
});
