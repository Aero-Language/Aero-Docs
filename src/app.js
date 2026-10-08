import { parse, parseSite, resolveLink, validateLinks } from "./parser.js";
import { loadTemplates, renderDocument, renderNav, renderShell, renderTabs, renderSearchResults, renderError, anchorFor } from "./render.js";
import { highlight } from "./highlight.js";
import { buildIndex, search } from "./search.js";

export async function createApp({ window: win, loadText, base = "" }) {
  const document = win.document;
  const root = document.getElementById("app");

  let templates;
  try {
    templates = await loadTemplates((name) => loadText(base + "templates/" + name));
  } catch (e) {
    root.textContent = "Could not load the page templates: " + e.message;
    return null;
  }

  const fail = (message) => {
    root.innerHTML = renderError(templates, message);
    return null;
  };
  const report = (label, errors) => {
    for (const e of errors) {
      const line = "[" + label + "] " + (e.path ? e.path + ": " : "") + e.message;
      if (e.level === "error") win.console.error(line);
      else win.console.warn(line);
    }
  };

  let site;
  const docs = {};
  const entries = [];
  try {
    const manifest = parseSite(await loadText(base + "site.json"));
    report("site.json", manifest.errors);
    if (!manifest.site || !manifest.site.docs.length) return fail("The site manifest has no documents.");
    site = manifest.site;
    for (const d of site.docs) {
      const parsed = parse(await loadText(base + d.file), site.variables);
      report(d.file, parsed.errors);
      if (!parsed.doc) continue;
      docs[parsed.doc.id] = parsed;
      entries.push({ id: parsed.doc.id, title: d.title });
    }
  } catch (e) {
    return fail(e.message);
  }
  if (!entries.length) return fail("None of the documents could be read.");
  report("links", validateLinks(docs));

  const homeId = site.default && docs[site.default] ? site.default : entries[0].id;
  if (site.default && !docs[site.default]) win.console.warn("[site.json] default document " + site.default + " does not exist");

  let currentId = homeId;
  root.innerHTML = renderShell({
    templates,
    site,
    entries,
    currentId,
    homeId,
    nav: renderNav(docs[currentId], templates),
    content: renderDocument(docs[currentId], { templates, docs, highlight }),
  });

  const $ = (selector) => root.querySelector(selector);
  const shell = $("[data-shell]");
  const mainEl = $("[data-main]");
  const navEl = $("[data-nav]");
  const tabsEl = $("[data-tabs]");
  const searchInput = $("[data-search]");
  const resultsEl = $("[data-results]");
  const menuButton = $("[data-menu]");

  let searchIndex = null;
  let observer = null;

  const setTitle = () => {
    const entry = entries.find((e) => e.id === currentId);
    document.title = entry.title + " \u2013 " + site.title;
  };

  const closeMenu = () => {
    shell.classList.remove("shell-nav-open");
    menuButton.setAttribute("aria-expanded", "false");
  };

  const clearSearch = () => {
    searchInput.value = "";
    resultsEl.hidden = true;
    resultsEl.innerHTML = "";
  };

  function markCurrent(gid) {
    const segments = gid.slice(1).split("_");
    const wanted = ["#" + segments.slice(0, 2).join("_"), "#" + segments[0]];
    const links = Array.from(navEl.querySelectorAll(".nav-link"));
    const link = wanted.map((w) => links.find((l) => l.dataset.gid === w)).find(Boolean);
    navEl.querySelectorAll(".nav-link-current").forEach((l) => {
      l.classList.remove("nav-link-current");
      l.removeAttribute("aria-current");
    });
    navEl.querySelectorAll(".nav-item-open").forEach((li) => li.classList.remove("nav-item-open"));
    if (!link) return;
    link.classList.add("nav-link-current");
    link.setAttribute("aria-current", "location");
    const top = links.find((l) => l.dataset.gid === "#" + segments[0]);
    if (top) top.parentElement.classList.add("nav-item-open");
  }

  function watchChapters() {
    if (observer) observer.disconnect();
    if (!win.IntersectionObserver) return;
    observer = new win.IntersectionObserver(
      (items) => {
        for (const item of items) if (item.isIntersecting) markCurrent(item.target.dataset.gid);
      },
      { rootMargin: "-90px 0px -70% 0px", threshold: 0 },
    );
    mainEl.querySelectorAll(".doc-chapter-level-1, .doc-chapter-level-2").forEach((el) => observer.observe(el));
  }

  function showDocument(id) {
    currentId = id;
    mainEl.innerHTML = renderDocument(docs[id], { templates, docs, highlight });
    navEl.innerHTML = renderNav(docs[id], templates);
    tabsEl.innerHTML = renderTabs(entries, id, templates);
    setTitle();
    watchChapters();
  }

  function go(hash, initial = false) {
    if (hash === "#content") return;
    let target = !hash || hash === "#" ? { docId: currentId, gid: null } : resolveLink(hash, currentId, docs);
    if (!target || target.external) {
      win.console.warn("[router] unknown location " + hash);
      if (!initial) return;
      target = { docId: homeId, gid: null };
    }
    if (target.docId !== currentId) showDocument(target.docId);
    const el = target.gid ? document.getElementById(anchorFor(target.gid)) : null;
    if (el && el.scrollIntoView) el.scrollIntoView();
    else if (win.scrollTo) win.scrollTo(0, 0);
    if (target.gid) markCurrent(target.gid);
  }

  root.addEventListener("click", (e) => {
    const copy = e.target.closest("[data-copy]");
    if (copy) {
      const source = copy.closest(".doc-code").querySelector(".doc-code-source");
      const clipboard = win.navigator.clipboard;
      if (clipboard) {
        clipboard.writeText(source.textContent).then(() => {
          copy.textContent = "Copied";
          win.setTimeout(() => {
            copy.textContent = "Copy";
          }, 1200);
        });
      }
      return;
    }
    if (e.target.closest("[data-menu]")) {
      const open = shell.classList.toggle("shell-nav-open");
      menuButton.setAttribute("aria-expanded", String(open));
      return;
    }
    const link = e.target.closest('a[href^="#"]');
    if (!link) return;
    const href = link.getAttribute("href");
    if (href === "#content") return;
    e.preventDefault();
    closeMenu();
    if (link.closest("[data-results]")) clearSearch();
    if (win.location.hash === href) go(href);
    else win.location.hash = href;
  });

  win.addEventListener("hashchange", () => go(win.location.hash));

  searchInput.addEventListener("input", () => {
    const query = searchInput.value.trim();
    if (!query) {
      resultsEl.hidden = true;
      resultsEl.innerHTML = "";
      return;
    }
    if (!searchIndex) searchIndex = buildIndex(docs);
    resultsEl.innerHTML = renderSearchResults(search(searchIndex, query), query, templates);
    resultsEl.hidden = false;
  });

  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      clearSearch();
    } else if (e.key === "Enter") {
      const first = resultsEl.querySelector("a");
      if (first) first.click();
    } else if (e.key === "ArrowDown") {
      const first = resultsEl.querySelector("a");
      if (first) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest("[data-search-box]")) resultsEl.hidden = true;
  });

  setTitle();
  watchChapters();
  go(win.location.hash, true);

  return {
    go,
    docs,
    entries,
    get currentId() {
      return currentId;
    },
  };
}

if (typeof window !== "undefined" && window.document && window.document.getElementById("app")) {
  const loadText = async (path) => {
    const res = await fetch(path);
    if (!res.ok) throw new Error(path + " returned " + res.status);
    return res.text();
  };
  createApp({ window, loadText });
}
  
