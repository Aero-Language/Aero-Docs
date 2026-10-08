import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const jsdom = await import("jsdom").catch(() => null);
const skip = jsdom ? false : "jsdom is not installed, run: npm install --no-save jsdom";

const root = (p) => new URL("../" + p, import.meta.url);
const loadText = async (path) => readFileSync(root(path), "utf8");
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));

async function boot(hash = "") {
  const { JSDOM, VirtualConsole } = jsdom;
  const logs = { warn: [], error: [] };
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("warn", (m) => logs.warn.push(m));
  virtualConsole.on("error", (m) => logs.error.push(m));
  const dom = new JSDOM(readFileSync(root("index.html"), "utf8"), { url: "http://localhost/" + hash, virtualConsole });
  const win = dom.window;
  win.scrollTo = () => {};
  win.Element.prototype.scrollIntoView = function () {
    win.__scrolledTo = this.id;
  };
  const copied = [];
  Object.defineProperty(win.navigator, "clipboard", { value: { writeText: async (t) => copied.push(t) } });
  const { createApp } = await import("../src/app.js");
  const app = await createApp({ window: win, loadText });
  return { app, win, doc: win.document, logs, copied };
}

test("boots into the default document with shell, nav and tabs", { skip }, async () => {
  const { app, doc, logs } = await boot();
  assert.equal(app.currentId, "#language");
  assert.equal(doc.title, "Language \u2013 Aero");
  assert.equal(doc.querySelectorAll(".shell-tab").length, 2);
  assert.equal(doc.querySelectorAll(".nav-item-level-1").length, 12);
  assert.ok(doc.querySelector(".doc-hero .doc-title").textContent === "Aero");
  assert.ok(doc.querySelector(".shell-tab-current").textContent === "Language");
  assert.ok(doc.querySelector(".doc-code-source .doc-tok-keyword"));
  assert.deepEqual(logs.error, []);
  assert.deepEqual(logs.warn, []);
});

test("deep links open the right document and chapter", { skip }, async () => {
  const { app, doc, win } = await boot("#compiler/pipeline_lexer");
  assert.equal(app.currentId, "#compiler");
  assert.equal(doc.querySelector(".doc-title").textContent, "Luft");
  assert.equal(win.__scrolledTo, "pipeline_lexer");
  const current = doc.querySelector(".nav-link-current");
  assert.equal(current.dataset.gid, "#pipeline_lexer");
  assert.ok(current.parentElement.parentElement.parentElement.classList.contains("nav-item-open"));
  assert.equal(doc.title, "Compiler Guide \u2013 Aero");
});

test("unknown locations fall back or are ignored", { skip }, async () => {
  const first = await boot("#nope");
  assert.equal(first.app.currentId, "#language");
  assert.ok(first.logs.warn.some((m) => m.includes("unknown location")));
  first.app.go("#compiler/nope");
  assert.equal(first.app.currentId, "#language");
});

test("clicking links changes location and document", { skip }, async () => {
  const { app, win, doc } = await boot();
  doc.querySelector('.shell-tab[href="#compiler"]').click();
  await tick();
  assert.equal(win.location.hash, "#compiler");
  assert.equal(app.currentId, "#compiler");
  doc.querySelector('.nav-link[data-gid="#roadmap"]').click();
  await tick();
  assert.equal(win.location.hash, "#compiler/roadmap");
  assert.equal(win.__scrolledTo, "roadmap");
  doc.querySelector('.doc-link[href="#language/reference_precedence"]').click();
  await tick();
  assert.equal(app.currentId, "#language");
  assert.equal(win.__scrolledTo, "reference_precedence");
});

test("search finds sections and navigates", { skip }, async () => {
  const { app, win, doc } = await boot();
  const input = doc.querySelector("[data-search]");
  const results = doc.querySelector("[data-results]");
  input.value = "reference counting";
  input.dispatchEvent(new win.Event("input"));
  assert.equal(results.hidden, false);
  const first = results.querySelector("a");
  assert.equal(first.getAttribute("href"), "#language/memory_reference-counting");
  first.click();
  await tick();
  assert.equal(win.location.hash, "#language/memory_reference-counting");
  assert.equal(results.hidden, true);
  assert.equal(input.value, "");
  input.value = "zzzzqq";
  input.dispatchEvent(new win.Event("input"));
  assert.ok(results.textContent.includes("Nothing found"));
  input.dispatchEvent(new win.KeyboardEvent("keydown", { key: "Escape" }));
  assert.equal(results.hidden, true);
  assert.equal(app.currentId, "#language");
});

test("copy button and mobile menu", { skip }, async () => {
  const { win, doc, copied } = await boot();
  const figure = [...doc.querySelectorAll(".doc-code")].find((f) => f.textContent.includes("Hello, Aero!"));
  figure.querySelector("[data-copy]").click();
  await tick();
  assert.ok(copied[0].includes('Print("Hello, Aero!")'));
  assert.equal(figure.querySelector("[data-copy]").textContent, "Copied");
  const menu = doc.querySelector("[data-menu]");
  menu.click();
  assert.ok(doc.querySelector("[data-shell]").classList.contains("shell-nav-open"));
  assert.equal(menu.getAttribute("aria-expanded"), "true");
  doc.querySelector(".nav-link").click();
  assert.ok(!doc.querySelector("[data-shell]").classList.contains("shell-nav-open"));
  assert.ok(win);
});

test("a broken manifest shows an error instead of a blank page", { skip }, async () => {
  const { JSDOM } = jsdom;
  const dom = new JSDOM('<div id="app"></div>', { url: "http://localhost/" });
  const { createApp } = await import("../src/app.js");
  const files = (p) => (p === "site.json" ? Promise.resolve("{") : loadText(p));
  await createApp({ window: dom.window, loadText: files });
  assert.ok(dom.window.document.querySelector(".shell-error"));
});
  
