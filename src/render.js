import { resolveLink } from "./parser.js";

export const TEMPLATE_NAMES = ["document", "chapter", "footer", "text", "section", "box", "badge", "code", "table", "callout", "inline", "shell", "nav", "search"];

const PART_RE = /<template data-part="([\w-]+)">([\s\S]*?)<\/template>/g;
const SLOT_RE = /\{\{\{(\w+)\}\}\}|\{\{(\w+)\}\}/g;
const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

export function compileTemplate(source) {
  const parts = {};
  const main = source
    .replace(PART_RE, (m, name, body) => {
      parts[name] = body;
      return "";
    })
    .trim();
  return { main, parts };
}

export function compileTemplates(sources) {
  const out = {};
  for (const name of TEMPLATE_NAMES) {
    if (typeof sources[name] !== "string") throw new Error("missing template: " + name);
    out[name] = compileTemplate(sources[name]);
  }
  return out;
}

export async function loadTemplates(readText) {
  const texts = await Promise.all(TEMPLATE_NAMES.map((n) => readText(n + ".html")));
  return compileTemplates(Object.fromEntries(TEMPLATE_NAMES.map((n, i) => [n, texts[i]])));
}

function fill(source, data) {
  return source.replace(SLOT_RE, (m, raw, escaped) => {
    const value = data[raw || escaped];
    if (value === undefined || value === null) return "";
    return raw ? String(value) : escapeHtml(value);
  });
}

function main(ctx, template, data) {
  return fill(ctx.templates[template].main, data);
}

function part(ctx, template, name, data) {
  const source = ctx.templates[template].parts[name];
  if (source === undefined) throw new Error("missing part " + name + " in template " + template);
  return fill(source, data);
}

const heading = (n) => Math.min(Math.max(n, 1), 6);
const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

export const anchorFor = (gid) => gid.slice(1);

export function hashFor(target) {
  return target.docId + (target.gid ? "/" + target.gid.slice(1) : "");
}

function hrefFor(href, ctx) {
  const target = resolveLink(href, ctx.docId, ctx.docs);
  if (!target) return null;
  return target.external ? href : hashFor(target);
}

export function renderInline(nodes, ctx) {
  let out = "";
  for (const node of nodes) {
    if (typeof node === "string") {
      out += escapeHtml(node);
    } else if (node.tag === "br") {
      out += part(ctx, "inline", "br", {});
    } else if (node.tag === "a") {
      const content = renderInline(node.children, ctx);
      const target = resolveLink(node.href, ctx.docId, ctx.docs);
      if (!target) out += part(ctx, "inline", "a-dead", { content });
      else if (target.external) out += part(ctx, "inline", "a-external", { href: node.href, content });
      else out += part(ctx, "inline", "a", { href: hashFor(target), content });
    } else {
      out += part(ctx, "inline", node.tag, { content: renderInline(node.children, ctx) });
    }
  }
  return out;
}

function renderParts(parts, ctx) {
  return parts
    .map((p) => {
      if (p.kind === "p") return part(ctx, "text", "paragraph", { content: renderInline(p.inline, ctx) });
      const items = p.items.map((item) => part(ctx, "text", "item", { content: renderInline(item, ctx) })).join("");
      return part(ctx, "text", "list", { items });
    })
    .join("");
}

function renderBlocks(blocks, ctx, depth) {
  let out = "";
  let i = 0;
  while (i < blocks.length) {
    const type = blocks[i].type;
    if (type === "box" || type === "badge") {
      let items = "";
      while (i < blocks.length && blocks[i].type === type) {
        items += renderBlock(blocks[i], ctx, depth);
        i++;
      }
      out += part(ctx, type, "group", { items });
    } else {
      out += renderBlock(blocks[i], ctx, depth);
      i++;
    }
  }
  return out;
}

function renderBlock(block, ctx, depth) {
  switch (block.type) {
    case "text":
      return main(ctx, "text", { parts: renderParts(block.parts, ctx) });
    case "section":
      return main(ctx, "section", {
        h: heading(depth + 2),
        title: block.title,
        text: block.parts.length ? part(ctx, "section", "text", { parts: renderParts(block.parts, ctx) }) : "",
        content: renderBlocks(block.content, ctx, depth + 1),
      });
    case "box": {
      const h = heading(depth + 2);
      const title = block.title ? part(ctx, "box", "title", { h, text: block.title }) : "";
      const subtitle = block.subtitle ? part(ctx, "box", "subtitle", { text: block.subtitle }) : "";
      return main(ctx, "box", {
        head: title || subtitle ? part(ctx, "box", "head", { title, subtitle }) : "",
        content: renderBlocks(block.content, ctx, depth + 1),
      });
    }
    case "badge":
      return main(ctx, "badge", { variant: block.variant, title: block.title });
    case "code":
      return main(ctx, "code", {
        lang: block.lang,
        langClass: block.lang.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
        title: block.title ? part(ctx, "code", "title", { text: block.title }) : "",
        code: ctx.highlight ? ctx.highlight(block.lang, block.code) : escapeHtml(block.code),
      });
    case "table": {
      const head = block.hasHeaders
        ? part(ctx, "table", "head", { cells: block.headers.map((h) => part(ctx, "table", "head-cell", { text: h })).join("") })
        : "";
      const rows = block.rows
        .map((row) => part(ctx, "table", "row", { cells: row.map((c) => part(ctx, "table", "cell", { content: renderInline(c, ctx) })).join("") }))
        .join("");
      return main(ctx, "table", { kind: block.hasHeaders ? "headed" : "plain", head, rows });
    }
    case "callout":
      return main(ctx, "callout", {
        kind: block.kind,
        title: block.title || capitalize(block.kind),
        content: renderBlocks(block.content, ctx, depth + 1),
      });
    default:
      return "";
  }
}

export function renderChapter(section, ctx) {
  return main(ctx, "chapter", {
    level: section.level,
    h: heading(section.level + 1),
    title: section.title,
    gid: section.gid,
    anchor: section.duplicate ? "" : part(ctx, "chapter", "anchor", { id: anchorFor(section.gid) }),
    tag: section.tag ? part(ctx, "chapter", "tag", { text: section.tag }) : "",
    content: renderBlocks(section.content, ctx, section.level),
    sections: section.sections.map((s) => renderChapter(s, ctx)).join(""),
  });
}

export function renderDocument(parsed, options) {
  const doc = parsed && parsed.doc;
  if (!doc) return "";
  const ctx = {
    templates: options.templates,
    docs: options.docs || { [doc.id]: parsed },
    docId: doc.id,
    highlight: options.highlight || null,
  };
  const buttons = doc.buttons
    .map((b, i) => part(ctx, "document", "button", { kind: i === 0 ? "primary" : "secondary", href: hrefFor(b.link, ctx) || "#", title: b.title }))
    .join("");
  return main(ctx, "document", {
    docId: doc.id,
    title: doc.title,
    badge: doc.badge ? part(ctx, "document", "badge", { text: doc.badge }) : "",
    description: doc.description ? part(ctx, "document", "description", { content: renderInline(doc.description, ctx) }) : "",
    buttons: buttons ? part(ctx, "document", "buttons", { items: buttons }) : "",
    chapters: doc.sections.map((s) => renderChapter(s, ctx)).join(""),
    footer: doc.footer.content.length ? main(ctx, "footer", { content: renderBlocks(doc.footer.content, ctx, 0) }) : "",
  });
}

export function renderTabs(entries, currentId, templates) {
  const ctx = { templates };
  return entries
    .map((e) => part(ctx, "shell", e.id === currentId ? "tab-current" : "tab", { href: hashFor({ docId: e.id }), title: e.title }))
    .join("");
}

export function renderNav(parsed, templates) {
  const ctx = { templates };
  const docId = parsed.doc.id;
  const item = (s) => {
    if (s.duplicate) return "";
    const kids = s.level < 2 ? s.sections.map(item).join("") : "";
    return part(ctx, "nav", "item", {
      level: s.level,
      href: hashFor({ docId, gid: s.gid }),
      gid: s.gid,
      title: s.title,
      tag: s.tag ? part(ctx, "nav", "tag", { text: s.tag }) : "",
      children: kids ? part(ctx, "nav", "children", { items: kids }) : "",
    });
  };
  return main(ctx, "nav", { items: parsed.doc.sections.map(item).join("") });
}

export function renderShell({ templates, site, entries, currentId, homeId, nav, content }) {
  const ctx = { templates };
  return main(ctx, "shell", {
    home: hashFor({ docId: homeId }),
    title: site.title,
    logo: site.icon ? part(ctx, "shell", "logo", { src: site.icon }) : "",
    tabs: renderTabs(entries, currentId, templates),
    nav,
    main: content,
  });
}

export function renderSearchResults(results, query, templates) {
  const ctx = { templates };
  if (!results.length) return part(ctx, "search", "empty", { query: '"' + query + '"' });
  const items = results
    .map((r) =>
      part(ctx, "search", "item", {
        href: hashFor({ docId: r.docId, gid: r.gid }),
        title: r.title,
        where: r.where,
        snippet: r.snippet.match
          ? part(ctx, "search", "snippet", r.snippet)
          : part(ctx, "search", "snippet-plain", { text: r.snippet.plain }),
      }),
    )
    .join("");
  return main(ctx, "search", { items });
}

export function renderError(templates, message) {
  return part({ templates }, "shell", "error", { message });
    }
    
