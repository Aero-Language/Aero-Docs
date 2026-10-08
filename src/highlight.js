import { escapeHtml } from "./render.js";

const KEYWORDS = new Set([
  "val", "var", "const", "fun", "return", "yield", "if", "else", "while", "for", "in", "break", "continue", "match", "case",
  "class", "struct", "record", "trait", "enum", "annotation", "operator", "op", "extension", "extensions", "constructor", "destructor",
  "public", "internal", "protected", "private", "static", "weak", "partial", "unsafe", "virtual", "abstract", "sealed", "impl",
  "ref", "module", "import", "from", "concurrent", "spawn", "true", "false", "null", "self", "it", "get", "set", "init",
  "is", "not", "and", "or",
]);
const TYPES = new Set(["Int", "Float", "Bool", "Byte", "Char", "String", "Void", "Range", "Long", "Double"]);

const TOKEN_RE = /(\/\/[^\n]*|\/\*[\s\S]*?\*\/)|(\$?"""[\s\S]*?"""|\$?"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*')|(@[A-Za-z_]\w*)|(\b0[xX][0-9a-fA-F_]+|\b0[bB][01_]+|\b\d+(?:\.\d+)?)|([A-Za-z_]\w*)/g;

function span(kind, text) {
  return '<span class="doc-tok-' + kind + '">' + escapeHtml(text) + "</span>";
}

export function highlight(lang, code) {
  if (lang !== "aero") return escapeHtml(code);
  let out = "";
  let last = 0;
  for (const m of code.matchAll(TOKEN_RE)) {
    out += escapeHtml(code.slice(last, m.index));
    const text = m[0];
    last = m.index + text.length;
    if (m[1]) out += span("comment", text);
    else if (m[2]) out += span("string", text);
    else if (m[3]) out += span("annotation", text);
    else if (m[4]) out += span("number", text);
    else if (KEYWORDS.has(text)) out += span("keyword", text);
    else if (TYPES.has(text)) out += span("type", text);
    else if (/^\s*\(/.test(code.slice(last))) out += span("function", text);
    else if (/^[A-Z]/.test(text) && /[a-z]/.test(text)) out += span("type", text);
    else out += escapeHtml(text);
  }
  return out + escapeHtml(code.slice(last));
}
