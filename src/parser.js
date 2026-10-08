const ID_RE = /^#[a-z0-9]+(-[a-z0-9]+)*$/;
const VAR_RE = /\{\{([a-z][a-z-]*)\}\}/g;
const SKIP_KEYS = new Set(["code", "id", "type", "kind", "variant", "lang", "link", "format", "variables"]);
const CALLOUT_KINDS = new Set(["note", "tip", "warning", "planned"]);
const BADGE_VARIANTS = new Set(["accent", "neutral", "outline"]);
const TAGS = new Set(["b", "i", "q", "code"]);

const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const isStr = (v) => typeof v === "string";

export function slugify(text) {
  const s = String(text).toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-+|-+$/g, "");
  return s || "section";
}

function makeReporter() {
  const errors = [];
  const report = (level, path, message) => errors.push({ level, path, message });
  return { errors, error: (p, m) => report("error", p, m), warn: (p, m) => report("warning", p, m) };
}

function substitute(value, vars, path, rep, key) {
  if (key !== undefined && SKIP_KEYS.has(key)) return value;
  if (isStr(value)) {
    return value.replace(VAR_RE, (m, name) => {
      if (Object.prototype.hasOwnProperty.call(vars, name)) return vars[name];
      rep.warn(path, "unknown variable " + name);
      return m;
    });
  }
  if (Array.isArray(value)) return value.map((v, i) => substitute(v, vars, path + "[" + i + "]", rep));
  if (isObj(value)) {
    const out = {};
    for (const k of Object.keys(value)) {
      out[k] = substitute(value[k], vars, path ? path + "." + k : k, rep, k);
    }
    return out;
  }
  return value;
}

function cleanVariables(raw, path, rep) {
  const out = {};
  if (raw === undefined) return out;
  if (!isObj(raw)) {
    rep.error(path, "variables must be an object");
    return out;
  }
  for (const [name, val] of Object.entries(raw)) {
    if (!/^[a-z][a-z-]*$/.test(name)) {
      rep.error(path + "." + name, "variable names use lowercase letters and -");
      continue;
    }
    if (!isStr(val)) {
      rep.error(path + "." + name, "variable values must be strings");
      continue;
    }
    if (val.includes("{{")) rep.warn(path + "." + name, "variables inside variables are not substituted");
    out[name] = val;
  }
  return out;
}

const OPEN_RE = /^<(b|i|q|code)>/;
const CLOSE_RE = /^<\/(b|i|q|code|a)>/;
const A_OPEN_RE = /^<a(\s[^>]*)?>/;
const HREF_RE = /\shref\s*=\s*(?:"([^"]*)"|'([^']*)')/;

function pushText(list, text) {
  if (!text) return;
  const last = list[list.length - 1];
  if (typeof last === "string") list[list.length - 1] = last + text;
  else list.push(text);
}

export function parseInline(input, path = "", rep = null) {
  const warn = (m) => rep && rep.warn(path, m);
  const root = { children: [] };
  const stack = [root];
  const top = () => stack[stack.length - 1];
  const text = String(input);
  let buf = "";
  const flush = () => {
    pushText(top().children, buf);
    buf = "";
  };
  const close = (node) => {
    const parent = stack[stack.length - 1];
    if (node.tag === "a" && node.href === null) {
      for (const c of node.children) {
        if (typeof c === "string") pushText(parent.children, c);
        else parent.children.push(c);
      }
    } else {
      parent.children.push(node);
    }
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch !== "<") {
      buf += ch;
      i++;
      continue;
    }
    const rest = text.slice(i);
    let m = rest.match(OPEN_RE);
    if (m) {
      flush();
      stack.push({ tag: m[1], children: [] });
      i += m[0].length;
      continue;
    }
    m = rest.match(A_OPEN_RE);
    if (m) {
      flush();
      const h = (m[1] || "").match(HREF_RE);
      let href = h ? (h[1] !== undefined ? h[1] : h[2]) : null;
      if (href !== null && !/^(#|https?:\/\/)/.test(href)) {
        warn("link target not allowed: " + href);
        href = null;
      } else if (href === null) {
        warn("link without href");
      }
      stack.push({ tag: "a", href, children: [] });
      i += m[0].length;
      continue;
    }
    m = rest.match(CLOSE_RE);
    if (m) {
      const name = m[1];
      let depth = -1;
      for (let s = stack.length - 1; s > 0; s--) {
        if (stack[s].tag === name) {
          depth = s;
          break;
        }
      }
      if (depth === -1) {
        buf += m[0];
        i += m[0].length;
        continue;
      }
      flush();
      while (stack.length - 1 > depth) {
        warn("unclosed <" + top().tag + ">");
        const inner = stack.pop();
        close(inner);
      }
      const node = stack.pop();
      close(node);
      i += m[0].length;
      continue;
    }
    buf += ch;
    i++;
  }
  flush();
  while (stack.length > 1) {
    warn("unclosed <" + top().tag + ">");
    const node = stack.pop();
    close(node);
  }
  return root.children;
}

export function parseText(input, path = "", rep = null) {
  const lines = String(input).replace(/\r\n?/g, "\n").split("\n");
  const parts = [];
  let para = null;
  let list = null;
  const endPara = () => {
    if (para) {
      const nodes = [];
      para.forEach((line, n) => {
        if (n > 0) nodes.push({ tag: "br", children: [] });
        nodes.push(...parseInline(line, path, rep));
      });
      parts.push({ kind: "p", inline: nodes });
      para = null;
    }
  };
  const endList = () => {
    if (list) {
      parts.push({ kind: "list", items: list.map((l) => parseInline(l, path, rep)) });
      list = null;
    }
  };
  for (const line of lines) {
    if (line.trim() === "") {
      endPara();
      endList();
    } else if (/^\s*-- /.test(line)) {
      endPara();
      if (!list) list = [];
      list.push(line.replace(/^\s*-- /, ""));
    } else {
      endList();
      if (!para) para = [];
      para.push(line);
    }
  }
  endPara();
  endList();
  return parts;
}

function parseContent(raw, path, ctx) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    ctx.rep.error(path, "content must be an array");
    return [];
  }
  const out = [];
  raw.forEach((b, i) => {
    const block = parseBlock(b, path + "[" + i + "]", ctx);
    if (block) out.push(block);
  });
  return out;
}

function parseBlock(raw, path, ctx) {
  const rep = ctx.rep;
  if (isStr(raw)) {
    const parts = parseText(raw, path, rep);
    return parts.length ? { type: "text", parts } : null;
  }
  if (!isObj(raw)) {
    rep.error(path, "a block must be a string or an object");
    return null;
  }
  switch (raw.type) {
    case "text": {
      if (!isStr(raw.text)) {
        rep.error(path, "text block needs a text string");
        return null;
      }
      const parts = parseText(raw.text, path, rep);
      return parts.length ? { type: "text", parts } : null;
    }
    case "section": {
      if (!isStr(raw.title) || !raw.title.trim()) {
        rep.error(path, "section block needs a title");
        return null;
      }
      const parts = isStr(raw.text) ? parseText(raw.text, path, rep) : [];
      return {
        type: "section",
        title: raw.title,
        parts,
        content: parseContent(raw.content, path + ".content", ctx),
      };
    }
    case "box": {
      const content = parseContent(raw.content, path + ".content", ctx);
      const title = isStr(raw.title) ? raw.title : "";
      if (!title && !content.length) return null;
      if (!title) rep.warn(path, "box without a title");
      return {
        type: "box",
        title,
        subtitle: isStr(raw.subtitle) && raw.subtitle ? raw.subtitle : null,
        content,
      };
    }
    case "badge": {
      if (!isStr(raw.title) || !raw.title.trim()) return null;
      let variant = raw.variant === undefined ? "accent" : raw.variant;
      if (!BADGE_VARIANTS.has(variant)) {
        rep.warn(path, "unknown badge variant " + variant);
        variant = "accent";
      }
      return { type: "badge", title: raw.title, variant };
    }
    case "code": {
      if (!isStr(raw.code) || raw.code === "") return null;
      var lang = isStr(raw.lang) && raw.lang ? raw.lang : "text";
      return {
        type: "code",
        lang: lang,
        title: isStr(raw.title) && raw.title ? raw.title : lang,
        code: raw.code,
      };
    }
    case "table": {
      if (!Array.isArray(raw.rows) || raw.rows.length === 0) return null;
      const headers = Array.isArray(raw.headers) ? raw.headers.map(String) : [];
      const width = headers.length;
      const rows = [];
      raw.rows.forEach((r, ri) => {
        const rp = path + ".rows[" + ri + "]";
        if (!Array.isArray(r)) {
          rep.error(rp, "a row must be an array");
          return;
        }
        let cells = r.map(String);
        if (width && cells.length < width) {
          cells = cells.concat(Array(width - cells.length).fill(""));
        } else if (width && cells.length > width) {
          rep.warn(rp, "row has more cells than headers, extra cells dropped");
          cells = cells.slice(0, width);
        }
        rows.push(cells.map((c) => parseInline(c, rp, rep)));
      });
      if (!rows.length) return null;
      return { type: "table", headers, hasHeaders: width > 0, rows };
    }
    case "callout": {
      const content = parseContent(raw.content, path + ".content", ctx);
      if (!content.length) return null;
      let kind = raw.kind === undefined ? "note" : raw.kind;
      if (!CALLOUT_KINDS.has(kind)) {
        rep.warn(path, "unknown callout kind " + kind);
        kind = "note";
      }
      return { type: "callout", kind, title: isStr(raw.title) && raw.title ? raw.title : null, content };
    }
    case undefined:
      rep.warn(path, "block without a type, skipped");
      return null;
    default:
      rep.warn(path, "unknown block type " + raw.type + ", skipped");
      return null;
  }
}

function parseSections(raw, parentGid, level, path, ctx) {
  if (raw === undefined) return [];
  const rep = ctx.rep;
  if (!Array.isArray(raw)) {
    rep.error(path, "sections must be an array");
    return [];
  }
  const out = [];
  raw.forEach((s, i) => {
    const sp = path + "[" + i + "]";
    if (!isObj(s)) {
      rep.error(sp, "a section must be an object");
      return;
    }
    let title = isStr(s.title) && s.title.trim() ? s.title : null;
    if (!title) {
      rep.error(sp, "section needs a title");
      title = "Untitled";
    }
    let id = s.id;
    if (id === undefined) {
      id = "#" + slugify(title);
      rep.warn(sp, "section without id, derived " + id);
    } else if (!isStr(id) || !ID_RE.test(id)) {
      const derived = "#" + slugify(title);
      rep.error(sp, "invalid id " + JSON.stringify(id) + ", derived " + derived);
      id = derived;
    } else if (/[0-9]/.test(id)) {
      rep.warn(sp, "id " + id + " contains digits");
    }
    const gid = parentGid ? parentGid + "_" + id.slice(1) : id;
    let duplicate = false;
    if (Object.prototype.hasOwnProperty.call(ctx.index, gid)) {
      rep.error(sp, "duplicate id " + gid + ", dropped from navigation");
      duplicate = true;
    }
    const node = {
      id,
      gid,
      parent: parentGid || null,
      level,
      title,
      tag: isStr(s.tag) && s.tag ? s.tag : null,
      duplicate,
      content: [],
      sections: [],
    };
    if (!duplicate) {
      ctx.index[gid] = node;
      ctx.order.push(gid);
    }
    node.content = parseContent(s.content, sp + ".content", ctx);
    node.sections = parseSections(s.sections, gid, level + 1, sp + ".sections", ctx);
    out.push(node);
  });
  return out;
}

function parseButtons(raw, rep) {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) {
    rep.error("buttons", "buttons must be an array");
    return [];
  }
  const out = [];
  raw.forEach((b, i) => {
    const p = "buttons[" + i + "]";
    if (!isObj(b) || !isStr(b.title) || !b.title.trim() || !isStr(b.link) || !b.link) {
      rep.error(p, "a button needs a title and a link");
      return;
    }
    out.push({ title: b.title, link: b.link });
  });
  return out;
}

function failed(errors) {
  return { doc: null, index: {}, order: [], errors };
}

export function parse(json, siteVariables = {}) {
  const rep = makeReporter();
  try {
    let input = json;
    if (isStr(input)) {
      try {
        input = JSON.parse(input);
      } catch (e) {
        rep.error("", "invalid JSON: " + e.message);
        return failed(rep.errors);
      }
    }
    if (!isObj(input)) {
      rep.error("", "a document must be an object");
      return failed(rep.errors);
    }

    const vars = { ...cleanVariables(siteVariables, "siteVariables", rep), ...cleanVariables(input.variables, "variables", rep) };
    const src = substitute(input, vars, "", rep);

    if (src.format !== undefined && src.format !== 1) {
      rep.warn("format", "unknown format version " + src.format);
    }
    let title = isStr(src.title) && src.title.trim() ? src.title : null;
    if (!title) {
      rep.error("title", "a document needs a title");
      title = "Untitled";
    }
    let id = src.id;
    if (!isStr(id) || !ID_RE.test(id)) {
      const derived = "#" + slugify(title);
      rep.error("id", (id === undefined ? "missing" : "invalid") + " root id, derived " + derived);
      id = derived;
    }

    const ctx = { rep, index: {}, order: [] };
    const sections = parseSections(src.sections, "", 1, "sections", ctx);

    let footer = { content: [] };
    if (src.footer !== undefined) {
      if (isObj(src.footer)) footer = { content: parseContent(src.footer.content, "footer.content", ctx) };
      else rep.error("footer", "footer must be an object");
    }

    const doc = {
      format: 1,
      id,
      title,
      description: isStr(src.description) && src.description.trim() ? parseInline(src.description.replace(/\s*\n\s*/g, " "), "description", rep) : null,
      badge: isStr(src.badge) && src.badge ? src.badge : null,
      buttons: parseButtons(src.buttons, rep),
      variables: vars,
      sections,
      footer,
    };
    return { doc, index: ctx.index, order: ctx.order, errors: rep.errors };
  } catch (e) {
    rep.error("", "internal parser error: " + (e && e.message));
    return failed(rep.errors);
  }
}

export function parseSite(json) {
  const rep = makeReporter();
  let input = json;
  if (isStr(input)) {
    try {
      input = JSON.parse(input);
    } catch (e) {
      rep.error("", "invalid JSON: " + e.message);
      return { site: null, errors: rep.errors };
    }
  }
  if (!isObj(input)) {
    rep.error("", "the manifest must be an object");
    return { site: null, errors: rep.errors };
  }
  const docs = [];
  if (!Array.isArray(input.docs) || input.docs.length === 0) {
    rep.error("docs", "the manifest needs at least one document");
  } else {
    input.docs.forEach((d, i) => {
      if (!isObj(d) || !isStr(d.file) || !d.file || !isStr(d.title) || !d.title) {
        rep.error("docs[" + i + "]", "a document entry needs a file and a title");
        return;
      }
      docs.push({ file: d.file, title: d.title });
    });
  }
  const site = {
    title: isStr(input.title) && input.title ? input.title : "Docs",
    icon: isStr(input.icon) && input.icon ? input.icon : null,
    default: isStr(input.default) && input.default ? input.default : null,
    variables: cleanVariables(input.variables, "variables", rep),
    docs,
  };
  return { site, errors: rep.errors };
}

export function resolveLink(href, currentDocId, docs) {
  if (/^https?:\/\//.test(href)) return { external: true, href };
  if (!href.startsWith("#")) return null;
  const slash = href.indexOf("/");
  if (slash !== -1) {
    const docId = href.slice(0, slash);
    const gid = "#" + href.slice(slash + 1);
    const target = docs[docId];
    if (!target || !target.index[gid]) return null;
    return { docId, gid };
  }
  const own = docs[currentDocId];
  if (own && own.index[href]) return { docId: currentDocId, gid: href };
  if (docs[href]) return { docId: href, gid: null };
  return null;
}

function inlineLinks(nodes, out) {
  for (const n of nodes) {
    if (typeof n === "string") continue;
    if (n.tag === "a" && n.href) out.push(n.href);
    inlineLinks(n.children, out);
  }
}

function blockLinks(block, out) {
  switch (block.type) {
    case "text":
      for (const p of block.parts) {
        if (p.kind === "p") inlineLinks(p.inline, out);
        else p.items.forEach((it) => inlineLinks(it, out));
      }
      break;
    case "section":
      for (const p of block.parts) {
        if (p.kind === "p") inlineLinks(p.inline, out);
        else p.items.forEach((it) => inlineLinks(it, out));
      }
      block.content.forEach((b) => blockLinks(b, out));
      break;
    case "box":
    case "callout":
      block.content.forEach((b) => blockLinks(b, out));
      break;
    case "table":
      block.rows.forEach((r) => r.forEach((c) => inlineLinks(c, out)));
      break;
    default:
  }
}

function sectionLinks(sections, out) {
  for (const s of sections) {
    const links = [];
    s.content.forEach((b) => blockLinks(b, links));
    links.forEach((href) => out.push({ where: s.gid, href }));
    sectionLinks(s.sections, out);
  }
}

export function validateLinks(docs) {
  const rep = makeReporter();
  const seen = new Map();
  for (const [id, parsed] of Object.entries(docs)) {
    if (seen.has(id)) rep.error(id, "duplicate root id");
    seen.set(id, true);
    const doc = parsed.doc;
    if (!doc) continue;
    const found = [];
    if (doc.description) {
      const l = [];
      inlineLinks(doc.description, l);
      l.forEach((href) => found.push({ where: "description", href }));
    }
    doc.buttons.forEach((b, i) => found.push({ where: "buttons[" + i + "]", href: b.link }));
    sectionLinks(doc.sections, found);
    const fl = [];
    doc.footer.content.forEach((b) => blockLinks(b, fl));
    fl.forEach((href) => found.push({ where: "footer", href }));
    for (const f of found) {
      if (!resolveLink(f.href, id, docs)) rep.error(id + " " + f.where, "dead link " + f.href);
    }
  }
  return rep.errors;
}

export function inlineToText(nodes) {
  let out = "";
  for (const n of nodes) {
    if (typeof n === "string") out += n;
    else if (n.tag === "br") out += " ";
    else out += inlineToText(n.children);
  }
  return out;
}

function partsToText(parts) {
  return parts
    .map((p) => (p.kind === "p" ? inlineToText(p.inline) : p.items.map(inlineToText).join(" ")))
    .join(" ");
}

export function blockToText(block) {
  switch (block.type) {
    case "text":
      return partsToText(block.parts);
    case "section":
      return [block.title, partsToText(block.parts), ...block.content.map(blockToText)].join(" ");
    case "box":
      return [block.title, block.subtitle || "", ...block.content.map(blockToText)].join(" ");
    case "badge":
      return block.title;
    case "code":
      return block.code;
    case "table":
      return [...block.headers, ...block.rows.map((r) => r.map(inlineToText).join(" "))].join(" ");
    case "callout":
      return [block.title || "", ...block.content.map(blockToText)].join(" ");
    default:
      return "";
  }
}

export function sectionToText(section) {
  return section.content.map(blockToText).join(" ").replace(/\s+/g, " ").trim();
}
