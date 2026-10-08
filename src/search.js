import { sectionToText, inlineToText } from "./parser.js";

export function buildIndex(docs) {
  const entries = [];
  for (const [docId, parsed] of Object.entries(docs)) {
    const doc = parsed.doc;
    if (!doc) continue;
    const intro = doc.description ? inlineToText(doc.description) : "";
    entries.push(entry(docId, null, doc.title, "", intro));
    for (const gid of parsed.order) {
      const section = parsed.index[gid];
      const trail = [];
      for (let cur = section.parent ? parsed.index[section.parent] : null; cur; cur = cur.parent ? parsed.index[cur.parent] : null) {
        trail.unshift(cur.title);
      }
      entries.push(entry(docId, gid, section.title, [doc.title, ...trail].join(" / "), sectionToText(section)));
    }
  }
  return entries;
}

function entry(docId, gid, title, where, text) {
  return { docId, gid, title, where, text, titleLower: title.toLowerCase(), textLower: text.toLowerCase() };
}

function snippet(e, tokens) {
  for (const token of tokens) {
    const at = e.textLower.indexOf(token);
    if (at === -1) continue;
    const start = Math.max(0, at - 40);
    const end = Math.min(e.text.length, at + token.length + 80);
    return {
      before: (start > 0 ? "…" : "") + e.text.slice(start, at),
      match: e.text.slice(at, at + token.length),
      after: e.text.slice(at + token.length, end) + (end < e.text.length ? "…" : ""),
    };
  }
  return { plain: e.text.slice(0, 110) + (e.text.length > 110 ? "…" : "") };
}

export function search(entries, query, limit = 8) {
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  const scored = [];
  entries.forEach((e, order) => {
    const inTitle = tokens.every((t) => e.titleLower.includes(t));
    const inText = tokens.every((t) => e.textLower.includes(t));
    const mixed = tokens.every((t) => e.titleLower.includes(t) || e.textLower.includes(t));
    if (!inTitle && !inText && !mixed) return;
    let score = mixed ? 1 : 0;
    if (inTitle) score += 20 + (e.titleLower.startsWith(tokens[0]) ? 10 : 0);
    if (inText) score += 3 + Math.min(5, e.textLower.split(tokens[0]).length - 1);
    scored.push({ e, score, order });
  });
  scored.sort((a, b) => b.score - a.score || a.order - b.order);
  return scored.slice(0, limit).map(({ e }) => ({
    docId: e.docId,
    gid: e.gid,
    title: e.title,
    where: e.where,
    snippet: snippet(e, tokens),
  }));
}
